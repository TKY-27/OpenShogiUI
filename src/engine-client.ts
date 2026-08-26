import {
  type AnalysisResponse,
  type AnalysisStart,
  type AnalysisStep,
  type BrowserSnapshot,
  type EvaluatorChoice,
  type ModelSummary,
  type OpeningBookSummary,
  type OpeningPolicySummary,
  type OpeningProfile,
  parseWorkerResponse,
  type SearchProfile,
  type SearchResponse,
  type TimeControl,
  type WorkerRequest,
} from "./browser-engine";

type RequestPayload = WorkerRequest extends infer Request
  ? Request extends WorkerRequest
    ? Omit<Request, "id">
    : never
  : never;

interface PendingRequest {
  kind: WorkerRequest["kind"];
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

export interface RestorableOpeningBook {
  bytes: ArrayBuffer;
  expectedArtifactSha256: string | null;
}

export type EngineRole = "play" | "analysis";
export type EngineReadyState =
  | "new"
  | "initializing"
  | "ready"
  | "crashed"
  | "disposed";

export type EngineStateListener = (
  state: EngineReadyState,
  message?: string,
) => void;

export class EngineWorkerClient {
  private worker: Worker;
  private workerGeneration = 0;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private state: EngineReadyState = "new";

  constructor(
    readonly role: EngineRole = "play",
    private readonly onStateChange?: EngineStateListener,
  ) {
    this.worker = this.createWorker();
  }

  get readyState(): EngineReadyState {
    return this.state;
  }

  async initialize(session?: EngineSession): Promise<BrowserSnapshot> {
    this.assertNotDisposed();
    const generation = this.workerGeneration;
    this.transition("initializing");
    try {
      const data = await this.request({
        kind: "initialize",
        initialSfen: session?.initialSfen ?? null,
        moves: session?.moves ?? [],
      });
      if (this.isCurrentWorker(generation) && !this.isDisposed()) {
        this.transition("ready");
      }
      return data as BrowserSnapshot;
    } catch (error) {
      if (
        this.isCurrentWorker(generation) &&
        !this.isDisposed() &&
        this.readyState !== "crashed"
      ) {
        this.transition("crashed", messageFor(error));
      }
      throw error;
    }
  }

  async reset(): Promise<BrowserSnapshot> {
    return this.run(
      async () =>
        (await this.request({ kind: "reset", sfen: null })) as BrowserSnapshot,
    );
  }

  async loadModel(model: RestorableModel): Promise<ModelSummary> {
    return this.run(() => this.requestModelLoad(model));
  }

  async unloadModel(): Promise<BrowserSnapshot> {
    return this.run(
      async () =>
        (await this.request({ kind: "unload-model" })) as BrowserSnapshot,
    );
  }

  async playMove(movement: string): Promise<BrowserSnapshot> {
    return this.run(
      async () =>
        (await this.request({
          kind: "play-move",
          movement,
        })) as BrowserSnapshot,
    );
  }

  async search(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    multiPv: number,
    timeControl: TimeControl | null = null,
  ): Promise<SearchResponse> {
    return this.run(
      async () =>
        (await this.request({
          kind: "search",
          profile,
          evaluator,
          multiPv,
          timeControl,
        })) as SearchResponse,
    );
  }

  async loadOpeningBook(
    openingBook: RestorableOpeningBook,
  ): Promise<OpeningBookSummary> {
    return this.run(() => this.requestOpeningBookLoad(openingBook));
  }

  async unloadOpeningBook(): Promise<BrowserSnapshot> {
    return this.run(
      async () =>
        (await this.request({
          kind: "unload-opening-book",
        })) as BrowserSnapshot,
    );
  }

  async configureOpening(
    profile: OpeningProfile,
    maxPlies = 40,
    minimumSampleCount = 2,
    maximumTeacherLossCp = 80,
  ): Promise<OpeningPolicySummary> {
    return this.run(
      async () =>
        (await this.request({
          kind: "configure-opening",
          profile,
          maxPlies,
          minimumSampleCount,
          maximumTeacherLossCp,
        })) as OpeningPolicySummary,
    );
  }

  async analysisStart(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    request: AnalysisStart,
  ): Promise<AnalysisResponse> {
    return this.run(
      async () =>
        (await this.request({
          kind: "analysis-start",
          profile,
          evaluator,
          request,
        })) as AnalysisResponse,
    );
  }

  async analysisStep(request: AnalysisStep): Promise<AnalysisResponse> {
    return this.run(
      async () =>
        (await this.request({
          kind: "analysis-step",
          request,
        })) as AnalysisResponse,
    );
  }

  async analysisStop(): Promise<AnalysisResponse> {
    return this.run(
      async () =>
        (await this.request({ kind: "analysis-stop" })) as AnalysisResponse,
    );
  }

  async restart(
    session: EngineSession,
    model: RestorableModel | null = null,
    openingBook: RestorableOpeningBook | null = null,
  ): Promise<BrowserSnapshot> {
    this.assertNotDisposed();
    this.transition("initializing");
    this.terminatePending("search cancelled");
    this.worker = this.createWorker();
    const generation = this.workerGeneration;
    try {
      const snapshot = (await this.request({
        kind: "initialize",
        initialSfen: session.initialSfen,
        moves: session.moves,
      })) as BrowserSnapshot;
      if (model !== null) await this.requestModelLoad(model);
      if (openingBook !== null) {
        await this.requestOpeningBookLoad(openingBook);
      }
      if (this.isCurrentWorker(generation) && !this.isDisposed()) {
        this.transition("ready");
      }
      return snapshot;
    } catch (error) {
      if (
        this.isCurrentWorker(generation) &&
        !this.isDisposed() &&
        this.readyState !== "crashed"
      ) {
        this.transition("crashed", messageFor(error));
      }
      throw error;
    }
  }

  dispose() {
    this.terminatePending("engine worker disposed");
    this.transition("disposed");
  }

  private createWorker(): Worker {
    const generation = this.workerGeneration;
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
      type: "module",
      name: `open-shogi-${this.role}`,
    });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!this.isCurrentWorker(generation)) return;
      let response;
      try {
        response = parseWorkerResponse(event.data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "invalid worker response";
        this.terminatePending(message);
        this.transition("crashed", message);
        return;
      }
      const pending = this.pending.get(response.id);
      if (pending === undefined) return;
      if (response.kind !== pending.kind) {
        const message = `worker response kind mismatch: expected ${pending.kind}, received ${response.kind}`;
        this.terminatePending(message);
        this.transition("crashed", message);
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error.message));
      }
    });
    worker.addEventListener("error", (event) => {
      if (!this.isCurrentWorker(generation)) return;
      const message = event.message || `${this.role} engine worker crashed`;
      this.terminatePending(message);
      this.transition("crashed", message);
    });
    worker.addEventListener("messageerror", () => {
      if (!this.isCurrentWorker(generation)) return;
      const message = `${this.role} engine worker message could not be decoded`;
      this.terminatePending(message);
      this.transition("crashed", message);
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
      this.pending.set(id, { kind: request.kind, resolve, reject });
      this.worker.postMessage(request, transfer);
    });
  }

  private async requestModelLoad(
    model: RestorableModel,
  ): Promise<ModelSummary> {
    const transferable = model.bytes.slice(0);
    return (await this.request(
      {
        kind: "load-model",
        bytes: transferable,
        expectedArtifactSha256: model.expectedArtifactSha256,
      },
      [transferable],
    )) as ModelSummary;
  }

  private async requestOpeningBookLoad(
    openingBook: RestorableOpeningBook,
  ): Promise<OpeningBookSummary> {
    const transferable = openingBook.bytes.slice(0);
    return (await this.request(
      {
        kind: "load-opening-book",
        bytes: transferable,
        expectedArtifactSha256: openingBook.expectedArtifactSha256,
      },
      [transferable],
    )) as OpeningBookSummary;
  }

  private terminatePending(message: string) {
    this.worker.terminate();
    this.workerGeneration += 1;
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertNotDisposed();
    if (this.state === "crashed") {
      throw new Error(`${this.role} engine has crashed`);
    }
    return operation();
  }

  private assertNotDisposed(): void {
    if (this.isDisposed()) throw new Error(`${this.role} engine is disposed`);
  }

  private isDisposed(): boolean {
    return this.state === "disposed";
  }

  private isCurrentWorker(generation: number): boolean {
    return generation === this.workerGeneration;
  }

  private transition(state: EngineReadyState, message?: string): void {
    this.state = state;
    this.onStateChange?.(state, message);
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
