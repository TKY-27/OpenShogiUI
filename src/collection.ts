import { collectionPolicy as policy } from "virtual:shogi-runtime";
import {
  CONSENT_VERSION,
  parseSubmission,
  sameCollectionIdentity,
  type CollectionIdentity,
  type GameSubmission,
} from "./collection-schema";
import type { PrototypeState } from "./core-prototype-session";

export const CONSENT_KEY = "open-shogi-ui/collection-consent";
export const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
export interface Consent {
  version: string;
  allowed: boolean;
  decided: boolean;
  revision: number;
}
let memory: Consent | null = null;
const listeners = new Set<() => void>();
export function getConsent(): Consent {
  if (memory) return memory;
  memory = {
    version: CONSENT_VERSION,
    allowed: false,
    decided: false,
    revision: 0,
  };
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(CONSENT_KEY) ?? "null",
    );
    if (
      saved &&
      typeof saved === "object" &&
      "version" in saved &&
      "allowed" in saved &&
      typeof saved.version === "string" &&
      typeof saved.allowed === "boolean"
    ) {
      memory = {
        ...memory,
        version: saved.version,
        allowed: saved.allowed && saved.version === CONSENT_VERSION,
        decided: !saved.allowed || saved.version === CONSENT_VERSION,
      };
    }
  } catch {
    /* No storage means no permission. */
  }
  return memory;
}
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setConsent(allowed: boolean): void {
  const revision = getConsent().revision + 1;
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ version: CONSENT_VERSION, allowed }),
    );
  } catch {
    allowed = false;
  }
  memory = { version: CONSENT_VERSION, allowed, decided: true, revision };
  listeners.forEach((listener) => listener());
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== CONSENT_KEY && event.key !== null) return;
    const revision = getConsent().revision + 1;
    memory = null;
    memory = { ...getConsent(), revision };
    listeners.forEach((listener) => listener());
  });

export type CollectionStatus = "idle" | "sending" | "accepted" | "unavailable";
/** One in-memory game; one network-only retry within the same deadline, no historical replay. */
export class GameCollection {
  private started: {
    id: string;
    revision: number;
    model: CollectionIdentity;
  } | null = null;
  private attempt: AbortController | null = null;
  private unsubscribe: () => void;
  constructor(
    private readonly report: (status: CollectionStatus) => void,
    private readonly configuration: {
      enabled: boolean;
      models: readonly CollectionIdentity[];
    } = policy,
    private readonly consent = getConsent,
    private readonly send: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 2500,
  ) {
    this.unsubscribe = subscribeConsent(() => this.cancel());
  }
  begin(state: PrototypeState): void {
    this.cancel();
    const consent = this.consent();
    const id = state.identity;
    if (
      !this.configuration.enabled ||
      !consent.allowed ||
      consent.version !== CONSENT_VERSION ||
      state.phase !== "setup" ||
      state.busy ||
      state.selection !== "r4c4" ||
      !id?.expectedHashVerified ||
      state.snapshot?.initialSfen !== START_SFEN ||
      state.snapshot.sfen !== START_SFEN ||
      state.snapshot.moves.length !== 0 ||
      state.snapshot.leafSha256 !== id.leafSha256
    )
      return;
    const model = {
      modelId: id.modelId,
      modelSha256: id.leafSha256,
      jsSha256: id.jsSha256,
      wasmSha256: id.wasmSha256,
    };
    if (
      !this.configuration.models.some((entry) =>
        sameCollectionIdentity(entry, model),
      )
    )
      return;
    this.started = {
      id: crypto.randomUUID(),
      revision: consent.revision,
      model,
    };
  }
  async finish(state: PrototypeState): Promise<void> {
    const game = this.started;
    this.started = null;
    const consent = this.consent();
    if (
      !game ||
      !consent.allowed ||
      consent.version !== CONSENT_VERSION ||
      consent.revision !== game.revision ||
      state.phase !== "finished" ||
      !state.result ||
      !state.snapshot ||
      !state.identity ||
      state.selection !== "r4c4" ||
      state.enabled ||
      state.snapshot.initialSfen !== START_SFEN ||
      state.snapshot.leafSha256 !== game.model.modelSha256 ||
      !sameCollectionIdentity(game.model, {
        modelId: state.identity.modelId,
        modelSha256: state.identity.leafSha256,
        jsSha256: state.identity.jsSha256,
        wasmSha256: state.identity.wasmSha256,
      }) ||
      (state.result.reason === "checkmate" &&
        (state.snapshot.terminal?.kind !== "checkmate" ||
          state.snapshot.legalMoves.length !== 0 ||
          state.snapshot.terminal.winner !== state.result.winner))
    )
      return;
    let payload: GameSubmission;
    try {
      payload = parseSubmission(
        {
          schema: "open_shogi_submission/v1",
          gameId: game.id,
          consentVersion: CONSENT_VERSION,
          model: game.model,
          humanSide: state.humanSide,
          winner: state.result.winner,
          reason: state.result.reason,
          settings: {
            preset: state.preset,
            profile: state.profile,
            controller: false,
            ponder: false,
          },
          moves: state.snapshot.moves,
        },
        this.configuration.models,
      );
    } catch {
      return;
    }
    const abort = new AbortController();
    this.attempt = abort;
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    this.report("sending");
    try {
      const request: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abort.signal,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      };
      let response: Response;
      try {
        response = await this.send("/api/games", request);
      } catch (error) {
        // HTTP/quota failures are never retried. A lost response can reuse the same UUID.
        if (!(error instanceof TypeError) || abort.signal.aborted) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150));
        const current = this.consent();
        if (
          this.attempt !== abort ||
          abort.signal.aborted ||
          !current.allowed ||
          current.version !== CONSENT_VERSION ||
          current.revision !== game.revision
        )
          throw error;
        response = await this.send("/api/games", request);
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("application/json")
      )
        throw new Error("unavailable");
      const raw = await response.text();
      if (raw.length > 256) throw new Error("unavailable");
      const result: unknown = JSON.parse(raw);
      if (
        !result ||
        typeof result !== "object" ||
        !("status" in result) ||
        !["accepted", "duplicate"].includes(String(result.status))
      )
        throw new Error("unavailable");
      if (this.attempt === abort && !abort.signal.aborted)
        this.report("accepted");
    } catch {
      if (this.attempt === abort) this.report("unavailable");
    } finally {
      clearTimeout(timer);
      if (this.attempt === abort) this.attempt = null;
    }
  }
  cancel(): void {
    this.started = null;
    const pending = this.attempt;
    this.attempt = null;
    pending?.abort();
    this.report("idle");
  }
  dispose(): void {
    this.cancel();
    this.unsubscribe();
  }
}
