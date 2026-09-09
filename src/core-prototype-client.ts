import type { TimeControl } from "./browser-engine";
import {
  ASSET_PREFIX,
  boundedJson,
  numeric,
  object,
  parsePrototypeManifest,
  type PrototypeManifest,
  type PrototypeRequest,
  type PrototypeSearch,
  type PrototypeSnapshot,
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
  ): Promise<PrototypeSnapshot>;
  move(movement: string): Promise<PrototypeSnapshot>;
  search(timeControl: TimeControl): Promise<PrototypeSearch>;
  dispose(): void;
}

/** Same physical-Worker cancellation rule as EngineWorkerClient, with an isolated protocol. */
export class PrototypeWorkerClient implements PrototypeEngineClient {
  private nextId = 1;
  private disposed = false;
  private readonly worker: Worker;
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
        if (pending.kind !== response.kind || typeof response.ok !== "boolean")
          throw new Error("Prototype response kind mismatch");
        this.pending = null;
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
  ): Promise<PrototypeSnapshot> {
    return this.request({
      kind: "initialize",
      manifest,
      enabled,
      initialSfen: position?.initialSfen ?? null,
      moves: position?.moves ?? [],
    }) as Promise<PrototypeSnapshot>;
  }
  move(movement: string): Promise<PrototypeSnapshot> {
    return this.request({
      kind: "move",
      movement,
    }) as Promise<PrototypeSnapshot>;
  }
  search(timeControl: TimeControl): Promise<PrototypeSearch> {
    return this.request({
      kind: "search",
      timeControl,
    }) as Promise<PrototypeSearch>;
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
    this.worker.terminate();
    this.pending?.reject(error);
    this.pending = null;
  }
}

export async function loadPrototypeManifest(): Promise<PrototypeManifest> {
  const response = await fetch(`${ASSET_PREFIX}manifest.json`, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      "試作のローカル資産を準備できません。pure build と controller の生成を確認してください。",
    );
  return parsePrototypeManifest(boundedJson(await response.text(), 8_192));
}
