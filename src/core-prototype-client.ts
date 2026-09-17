import type { SearchProfile, Side, TimeControl } from "./browser-engine";
import {
  releaseControllerEnabled,
  releaseManifest,
} from "virtual:shogi-runtime";
import {
  ASSET_PREFIX,
  DEFAULT_SELECTION,
  boundedJson,
  numeric,
  object,
  parsePrototypeManifest,
  parseRuntimeIdentity,
  type PrototypeManifest,
  type PrototypeRequest,
  type PrototypeSearch,
  type PrototypeSnapshot,
  type PrototypeReady,
  type PlayProgress,
  type PrototypeSelection,
} from "./core-prototype-protocol";

type RequestPayload = PrototypeRequest extends infer T
  ? T extends PrototypeRequest
    ? Omit<T, "id">
    : never
  : never;
export interface PrototypeEngineClient {
  initialize(
    manifest: PrototypeManifest,
    enabled: boolean,
    position: PrototypeSnapshot | null,
  ): Promise<PrototypeReady>;
  move(movement: string): Promise<PrototypeSnapshot>;
  configure(enabled: boolean): Promise<void>;
  search(
    timeControl: TimeControl,
    profile: SearchProfile,
  ): Promise<PrototypeSearch>;
  stopSearch(): void;
  dispose(): void;
}

/** Shared cancellation is observable during synchronous Wasm; physical termination is the final watchdog. */
export class PrototypeWorkerClient implements PrototypeEngineClient {
  private nextId = 1;
  private sideToMove: Side = "black";
  private disposed = false;
  private readonly worker: Worker;
  private cancellation: Int32Array | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private latest: PrototypeSearch | null = null;
  private hardDeadline: number | null = null;
  private pending: {
    id: number;
    kind: PrototypeRequest["kind"];
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(
    factory: () => Worker = () =>
      new Worker(new URL("./core-prototype.worker.ts", import.meta.url), {
        type: "module",
        name: "open-shogi-core-prototype",
      }),
  ) {
    this.worker = factory();
    this.worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (this.disposed) return;
      try {
        const success =
          event.data !== null &&
          typeof event.data === "object" &&
          (event.data as Record<string, unknown>).ok === true;
        const response = object(
          event.data,
          success
            ? ["id", "kind", "ok", "data"]
            : ["id", "kind", "ok", "error"],
        );
        const id = numeric(response.id);
        const pending = this.pending;
        if (pending === null || pending.id !== id)
          throw new Error("Prototype response id mismatch");
        if (
          pending.kind === "search" &&
          response.kind === "progress" &&
          success
        ) {
          const progress = response.data as PlayProgress;
          numeric(progress.timing.hardLimitMs, 604_800_000, false);
          numeric(progress.timing.elapsedMs, 604_800_000, false);
          this.latest = progress.result;
          if (this.hardDeadline === null) {
            const remaining = Math.max(
              0,
              progress.timing.hardLimitMs - progress.timing.elapsedMs,
            );
            this.hardDeadline = performance.now() + remaining;
            if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
            this.deadlineTimer = setTimeout(
              () => this.cancelWithWatchdog("host-hard-limit"),
              remaining,
            );
          }
          return;
        }
        if (pending.kind !== response.kind || typeof response.ok !== "boolean")
          throw new Error("Prototype response kind mismatch");
        this.pending = null;
        this.clearSearch();
        if (success) pending.resolve(response.data);
        else {
          const error = new Error(
            typeof response.error === "string"
              ? response.error.slice(0, 512)
              : "Prototype Worker failed",
          );
          pending.reject(error);
          this.dispose();
        }
      } catch (error) {
        this.fail(
          error instanceof Error
            ? error
            : new Error("Invalid prototype response"),
        );
      }
    });
    this.worker.addEventListener("error", () =>
      this.fail(new Error("Prototype Worker crashed")),
    );
    this.worker.addEventListener("messageerror", () =>
      this.fail(new Error("Prototype Worker response could not be decoded")),
    );
  }

  initialize(
    manifest: PrototypeManifest,
    enabled: boolean,
    position: PrototypeSnapshot | null,
  ): Promise<PrototypeReady> {
    return (
      this.request({
        kind: "initialize",
        manifest,
        enabled,
        initialSfen: position?.initialSfen ?? null,
        moves: position?.moves ?? [],
      }) as Promise<PrototypeReady>
    ).then((ready) => {
      try {
        parseRuntimeIdentity(ready.identity, manifest);
        if (ready.snapshot.leafSha256 !== ready.identity.leafSha256)
          throw new Error("Worker snapshot model identity mismatch");
        this.sideToMove = ready.snapshot.sideToMove;
        return ready;
      } catch (error) {
        this.fail(
          error instanceof Error ? error : new Error("Invalid Worker identity"),
        );
        throw error;
      }
    });
  }
  configure(enabled: boolean): Promise<void> {
    if (!import.meta.env.DEV && enabled !== releaseControllerEnabled)
      return Promise.reject(
        new Error("Release controller configuration is fixed"),
      );
    return this.request({ kind: "configure", enabled }) as Promise<void>;
  }
  move(movement: string): Promise<PrototypeSnapshot> {
    return (
      this.request({
        kind: "move",
        movement,
      }) as Promise<PrototypeSnapshot>
    ).then((snapshot) => {
      this.sideToMove = snapshot.sideToMove;
      return snapshot;
    });
  }
  search(
    timeControl: TimeControl,
    profile: SearchProfile,
  ): Promise<PrototypeSearch> {
    if (
      typeof SharedArrayBuffer === "undefined" ||
      !globalThis.crossOriginIsolated
    )
      return Promise.reject(
        new Error(
          "この対局には COOP/COEP が有効なサーバーが必要です。ページを再読込してください。",
        ),
      );
    if (this.pending !== null || this.disposed)
      return Promise.reject(new Error("Prototype Worker unavailable"));
    this.cancellation = new Int32Array(new SharedArrayBuffer(4));
    this.latest = null;
    this.hardDeadline = null;
    const promise = this.request({
      kind: "search",
      timeControl,
      profile,
      cancelBuffer: this.cancellation.buffer as SharedArrayBuffer,
    }) as Promise<PrototypeSearch>;
    // This outer guard already exists before the Worker publishes its own hard budget.
    const remaining = Math.max(
      1,
      this.sideToMove === "black"
        ? (timeControl.blackTimeMs ?? 0)
        : (timeControl.whiteTimeMs ?? 0),
    );
    this.deadlineTimer = setTimeout(
      () => this.cancelWithWatchdog("host-clock-limit"),
      remaining,
    );
    return promise;
  }
  stopSearch(): void {
    this.cancelWithWatchdog("host-cancelled");
  }
  private cancelWithWatchdog(reason: string): void {
    if (this.cancellation === null || this.pending?.kind !== "search") return;
    Atomics.store(this.cancellation, 0, reason === "host-cancelled" ? 1 : 2);
    if (this.watchdogTimer !== null) return;
    this.watchdogTimer = setTimeout(() => {
      const pending = this.pending;
      const latest = this.latest;
      if (pending?.kind !== "search") return;
      this.pending = null;
      this.clearSearch();
      this.disposed = true;
      this.worker.terminate();
      if (latest === null)
        pending.reject(
          new Error("Search did not publish a verified legal response"),
        );
      else
        pending.resolve({
          ...latest,
          termination: reason,
          workerRestartRequired: true,
        });
    }, 100);
  }
  private clearSearch(): void {
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    if (this.watchdogTimer !== null) clearTimeout(this.watchdogTimer);
    this.deadlineTimer = null;
    this.watchdogTimer = null;
    this.cancellation = null;
    this.latest = null;
    this.hardDeadline = null;
  }
  dispose(): void {
    this.fail(new Error("Prototype operation cancelled"));
  }

  private request(payload: RequestPayload): Promise<unknown> {
    if (this.disposed)
      return Promise.reject(new Error("Prototype Worker is disposed"));
    if (this.pending !== null)
      return Promise.reject(new Error("Prototype Worker is busy"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending = { id, kind: payload.kind, resolve, reject };
      try {
        this.worker.postMessage({ ...payload, id });
      } catch {
        this.fail(new Error("Prototype request could not be sent"));
      }
    });
  }
  private fail(error: Error): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cancellation !== null) Atomics.store(this.cancellation, 0, 1);
    this.clearSearch();
    this.worker.terminate();
    this.pending?.reject(error);
    this.pending = null;
  }
}

export async function loadPrototypeManifest(
  selection: PrototypeSelection = DEFAULT_SELECTION,
  signal?: AbortSignal,
): Promise<PrototypeManifest> {
  signal?.throwIfAborted();
  if (!import.meta.env.DEV) {
    if (selection !== "release")
      throw new Error("Development model selection is unavailable");
    return parsePrototypeManifest(releaseManifest);
  }
  if (
    selection !== "baseline" &&
    selection !== "candidate" &&
    selection !== "defense"
  )
    throw new Error("Invalid development model selection");
  const response = await fetch(`${ASSET_PREFIX}${selection}/manifest.json`, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    signal,
  });
  if (!response.ok)
    throw new Error(
      `モデルのローカル資産を準備できません（HTTP ${response.status}）。登録済みのモデルと pure build を確認してください。`,
    );
  const manifest = parsePrototypeManifest(
    boundedJson(await response.text(), 8_192),
  );
  if (manifest.selection !== selection)
    throw new Error("Selected model manifest mismatch");
  return manifest;
}
