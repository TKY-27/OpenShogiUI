import type {
  AnalysisResponse,
  AnalysisStart,
  AnalysisStep,
  BrowserSnapshot,
  EvaluatorChoice,
  ModelSummary,
  OpeningBookSummary,
  OpeningPolicySummary,
  OpeningProfile,
  SearchProfile,
  SearchResponse,
  TimeControl,
} from "./browser-engine";
import {
  EngineWorkerClient,
  type EngineSession,
  type RestorableModel,
  type RestorableOpeningBook,
} from "./engine-client";

export type EngineRole = "play" | "analysis";
export type EngineReadyState =
  | "new"
  | "initializing"
  | "ready"
  | "busy"
  | "crashed"
  | "disposed";

export interface EngineAdapter {
  readonly role: EngineRole;
  readonly readyState: EngineReadyState;
  initialize(session?: EngineSession): Promise<BrowserSnapshot>;
  restart(
    session: EngineSession,
    model?: RestorableModel | null,
    openingBook?: RestorableOpeningBook | null,
  ): Promise<BrowserSnapshot>;
  reset(): Promise<BrowserSnapshot>;
  playMove(movement: string): Promise<BrowserSnapshot>;
  search(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    multiPv: number,
    timeControl: TimeControl,
  ): Promise<SearchResponse>;
  loadModel(model: RestorableModel): Promise<ModelSummary>;
  unloadModel(): Promise<BrowserSnapshot>;
  loadOpeningBook(
    openingBook: RestorableOpeningBook,
  ): Promise<OpeningBookSummary>;
  unloadOpeningBook(): Promise<BrowserSnapshot>;
  configureOpening(profile: OpeningProfile): Promise<OpeningPolicySummary>;
  analysisStart(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    request: AnalysisStart,
  ): Promise<AnalysisResponse>;
  analysisStep(request: AnalysisStep): Promise<AnalysisResponse>;
  analysisStop(): Promise<AnalysisResponse>;
  analysisWorkerFailed(): Promise<AnalysisResponse>;
  analysisRestart(): Promise<AnalysisResponse>;
  dispose(): void;
}

/**
 * Worker-backed adapter for the pinned generated OpenShogiAI Wasm interface.
 * Each instance owns exactly one logical worker; callers create separate play and
 * analysis adapters so play search never shares a SearchEngine with continuous analysis.
 */
export class WasmEngineAdapter implements EngineAdapter {
  private client: EngineWorkerClient;
  private state: EngineReadyState = "new";

  constructor(
    readonly role: EngineRole,
    private readonly onStateChange?: (
      state: EngineReadyState,
      message?: string,
    ) => void,
  ) {
    this.client = this.createClient();
  }

  get readyState(): EngineReadyState {
    return this.state;
  }

  async initialize(session?: EngineSession): Promise<BrowserSnapshot> {
    this.assertNotDisposed();
    this.transition("initializing");
    try {
      const snapshot = await this.client.initialize(session);
      if (this.state !== "disposed") this.transition("ready");
      return snapshot;
    } catch (error) {
      if (this.state !== "disposed")
        this.transition("crashed", messageFor(error));
      throw error;
    }
  }

  async restart(
    session: EngineSession,
    model: RestorableModel | null = null,
    openingBook: RestorableOpeningBook | null = null,
  ): Promise<BrowserSnapshot> {
    this.assertNotDisposed();
    this.transition("initializing");
    try {
      const snapshot = await this.client.cancelAndRestore(
        session,
        model,
        openingBook,
      );
      if (this.state !== "disposed") this.transition("ready");
      return snapshot;
    } catch (error) {
      if (this.state !== "disposed")
        this.transition("crashed", messageFor(error));
      throw error;
    }
  }

  reset(): Promise<BrowserSnapshot> {
    return this.run(() => this.client.reset());
  }

  playMove(movement: string): Promise<BrowserSnapshot> {
    return this.run(() => this.client.playMove(movement));
  }

  search(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    multiPv: number,
    timeControl: TimeControl,
  ): Promise<SearchResponse> {
    return this.run(() =>
      this.client.search(profile, evaluator, multiPv, timeControl),
    );
  }

  loadModel(model: RestorableModel): Promise<ModelSummary> {
    return this.run(() => this.client.loadModel(model));
  }

  unloadModel(): Promise<BrowserSnapshot> {
    return this.run(() => this.client.unloadModel());
  }

  loadOpeningBook(
    openingBook: RestorableOpeningBook,
  ): Promise<OpeningBookSummary> {
    return this.run(() => this.client.loadOpeningBook(openingBook));
  }

  unloadOpeningBook(): Promise<BrowserSnapshot> {
    return this.run(() => this.client.unloadOpeningBook());
  }

  configureOpening(profile: OpeningProfile): Promise<OpeningPolicySummary> {
    return this.run(() => this.client.configureOpening(profile));
  }

  analysisStart(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    request: AnalysisStart,
  ): Promise<AnalysisResponse> {
    return this.run(() =>
      this.client.analysisStart(profile, evaluator, request),
    );
  }

  analysisStep(request: AnalysisStep): Promise<AnalysisResponse> {
    return this.run(() => this.client.analysisStep(request));
  }

  analysisStop(): Promise<AnalysisResponse> {
    return this.run(() => this.client.analysisStop());
  }

  analysisWorkerFailed(): Promise<AnalysisResponse> {
    return this.run(() => this.client.analysisWorkerFailed());
  }

  analysisRestart(): Promise<AnalysisResponse> {
    return this.run(() => this.client.analysisRestart());
  }

  dispose(): void {
    this.client.dispose();
    this.transition("disposed");
  }

  private createClient(): EngineWorkerClient {
    return new EngineWorkerClient(this.role, (message) => {
      if (!this.isDisposed()) this.transition("crashed", message);
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertNotDisposed();
    if (this.state === "crashed") {
      throw new Error(`${this.role} adapter has crashed`);
    }
    this.transition("busy");
    try {
      const result = await operation();
      if (!this.isDisposed()) this.transition("ready");
      return result;
    } catch (error) {
      if (!this.isCrashed() && !this.isDisposed()) this.transition("ready");
      throw error;
    }
  }

  private isDisposed(): boolean {
    return this.state === "disposed";
  }

  private isCrashed(): boolean {
    return this.state === "crashed";
  }

  private assertNotDisposed(): void {
    if (this.isDisposed()) throw new Error(`${this.role} adapter is disposed`);
  }

  private transition(state: EngineReadyState, message?: string): void {
    this.state = state;
    this.onStateChange?.(state, message);
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
