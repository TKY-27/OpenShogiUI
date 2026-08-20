import {
  AnalysisResponse,
  AnalysisStart,
  AnalysisStep,
  BrowserSnapshot,
  EvaluatorChoice,
  ModelSummary,
  OpeningBookSummary,
  OpeningPolicySummary,
  OpeningProfile,
  parseAnalysisResponse,
  parseBrowserSnapshot,
  parseModelSummary,
  parseOpeningBookSummary,
  parseOpeningPolicySummary,
  parseSearchResponse,
  parseWorkerResponse,
  SearchProfile,
  SearchResponse,
  TimeControl,
  WorkerRequest,
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

export class EngineWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly role: "play" | "analysis" = "play",
    private readonly onCrash?: (message: string) => void,
  ) {
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
    timeControl: TimeControl | null = null,
  ): Promise<SearchResponse> {
    return parseSearchResponse(
      await this.request({
        kind: "search",
        profile,
        evaluator,
        multiPv,
        timeControl,
      }),
    );
  }

  async loadOpeningBook(
    openingBook: RestorableOpeningBook,
  ): Promise<OpeningBookSummary> {
    const transferable = openingBook.bytes.slice(0);
    return parseOpeningBookSummary(
      await this.request(
        {
          kind: "load-opening-book",
          bytes: transferable,
          expectedArtifactSha256: openingBook.expectedArtifactSha256,
        },
        [transferable],
      ),
    );
  }

  async unloadOpeningBook(): Promise<BrowserSnapshot> {
    return parseBrowserSnapshot(
      await this.request({ kind: "unload-opening-book" }),
    );
  }

  async configureOpening(
    profile: OpeningProfile,
    maxPlies = 40,
    minimumSampleCount = 2,
    maximumTeacherLossCp = 80,
  ): Promise<OpeningPolicySummary> {
    return parseOpeningPolicySummary(
      await this.request({
        kind: "configure-opening",
        profile,
        maxPlies,
        minimumSampleCount,
        maximumTeacherLossCp,
      }),
    );
  }

  async analysisStart(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    request: AnalysisStart,
  ): Promise<AnalysisResponse> {
    return parseAnalysisResponse(
      await this.request({
        kind: "analysis-start",
        profile,
        evaluator,
        request,
      }),
    );
  }

  async analysisStep(request: AnalysisStep): Promise<AnalysisResponse> {
    return parseAnalysisResponse(
      await this.request({ kind: "analysis-step", request }),
    );
  }

  async analysisStop(): Promise<AnalysisResponse> {
    return parseAnalysisResponse(await this.request({ kind: "analysis-stop" }));
  }

  async analysisWorkerFailed(): Promise<AnalysisResponse> {
    return parseAnalysisResponse(
      await this.request({ kind: "analysis-worker-failed" }),
    );
  }

  async analysisRestart(): Promise<AnalysisResponse> {
    return parseAnalysisResponse(
      await this.request({ kind: "analysis-restart" }),
    );
  }

  async cancelAndRestore(
    session: EngineSession,
    model: RestorableModel | null,
    openingBook: RestorableOpeningBook | null = null,
  ): Promise<BrowserSnapshot> {
    this.terminatePending("search cancelled");
    this.worker = this.createWorker();
    const snapshot = await this.initialize(session);
    if (model !== null) {
      await this.loadModel(model);
    }
    if (openingBook !== null) {
      await this.loadOpeningBook(openingBook);
    }
    return snapshot;
  }

  dispose() {
    this.terminatePending("engine worker disposed");
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
      type: "module",
      name: `open-shogi-${this.role}`,
    });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      let response;
      try {
        response = parseWorkerResponse(event.data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "invalid worker response";
        this.terminatePending(message);
        this.onCrash?.(message);
        return;
      }
      const pending = this.pending.get(response.id);
      if (pending === undefined) return;
      if (response.kind !== pending.kind) {
        const message = `worker response kind mismatch: expected ${pending.kind}, received ${response.kind}`;
        this.terminatePending(message);
        this.onCrash?.(message);
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
      const message = event.message || `${this.role} engine worker crashed`;
      this.terminatePending(message);
      this.onCrash?.(message);
    });
    worker.addEventListener("messageerror", () => {
      const message = `${this.role} engine worker message could not be decoded`;
      this.terminatePending(message);
      this.onCrash?.(message);
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

  private terminatePending(message: string) {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}
