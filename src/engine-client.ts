import {
  BrowserSnapshot,
  EvaluatorChoice,
  ModelSummary,
  parseBrowserSnapshot,
  parseModelSummary,
  parseSearchResponse,
  parseWorkerResponse,
  SearchProfile,
  SearchResponse,
  WorkerRequest,
} from "./browser-engine";

type RequestPayload = WorkerRequest extends infer Request
  ? Request extends WorkerRequest
    ? Omit<Request, "id">
    : never
  : never;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface EngineSession {
  initialSfen: string;
  moves: string[];
}

export interface RestorableModel {
  bytes: ArrayBuffer;
  expectedArtifactSha256: string | null;
}

export class EngineWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor() {
    this.worker = this.createWorker();
  }

  async initialize(session?: EngineSession): Promise<BrowserSnapshot> {
    const data = await this.request({
      kind: "initialize",
      initialSfen: session?.initialSfen ?? null,
      moves: session?.moves ?? [],
    });
    return parseBrowserSnapshot(data);
  }

  async reset(): Promise<BrowserSnapshot> {
    return parseBrowserSnapshot(
      await this.request({ kind: "reset", sfen: null }),
    );
  }

  async loadModel(model: RestorableModel): Promise<ModelSummary> {
    const transferable = model.bytes.slice(0);
    const data = await this.request(
      {
        kind: "load-model",
        bytes: transferable,
        expectedArtifactSha256: model.expectedArtifactSha256,
      },
      [transferable],
    );
    return parseModelSummary(data);
  }

  async unloadModel(): Promise<BrowserSnapshot> {
    return parseBrowserSnapshot(await this.request({ kind: "unload-model" }));
  }

  async playMove(movement: string): Promise<BrowserSnapshot> {
    return parseBrowserSnapshot(
      await this.request({ kind: "play-move", movement }),
    );
  }

  async search(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    multiPv: number,
  ): Promise<SearchResponse> {
    return parseSearchResponse(
      await this.request({ kind: "search", profile, evaluator, multiPv }),
    );
  }

  async cancelAndRestore(
    session: EngineSession,
    model: RestorableModel | null,
  ): Promise<BrowserSnapshot> {
    this.terminatePending("search cancelled");
    this.worker = this.createWorker();
    const snapshot = await this.initialize(session);
    if (model !== null) {
      await this.loadModel(model);
    }
    return snapshot;
  }

  dispose() {
    this.terminatePending("engine worker disposed");
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
      type: "module",
      name: "open-shogi-engine",
    });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      let response;
      try {
        response = parseWorkerResponse(event.data);
      } catch (error) {
        this.terminatePending(
          error instanceof Error ? error.message : "invalid worker response",
        );
        return;
      }
      const pending = this.pending.get(response.id);
      if (pending === undefined) return;
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error.message));
      }
    });
    worker.addEventListener("error", (event) => {
      this.terminatePending(event.message || "engine worker crashed");
    });
    return worker;
  }

  private request(payload: RequestPayload, transfer: Transferable[] = []) {
    const id = this.nextId;
    this.nextId += 1;
    if (!Number.isSafeInteger(this.nextId)) {
      throw new Error("worker request id exhausted");
    }
    const request = { ...payload, id } as WorkerRequest;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request, transfer);
    });
  }

  private terminatePending(message: string) {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}
