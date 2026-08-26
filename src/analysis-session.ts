import type { AnalysisSummaryStore } from "./analysis-cache";
import { updateMatchesRequest } from "./analysis-cache";
import {
  accumulateSlice,
  ANALYSIS_MAX_DEPTH,
  analysisSliceNodes,
  displayUpdate,
  emptyProgress,
  type AnalysisProgress,
} from "./analysis-progress";
import {
  ANALYSIS_SCHEMA,
  type AnalysisResponse,
  type AnalysisStart,
  type AnalysisStep,
  type AnalysisUpdate,
  type BrowserSnapshot,
  type EvaluatorChoice,
  type SearchProfile,
} from "./browser-engine";
import type { EngineSession, RestorableModel } from "./engine-client";
import { PublishGate } from "./publish-throttle";

export type AnalysisStatus =
  | "idle"
  | "cached"
  | "live"
  | "stopped"
  | "invalidated"
  | "restarting";

export interface AnalysisView {
  status: AnalysisStatus;
  update: AnalysisUpdate | null;
  progress: AnalysisProgress;
}

export interface AnalysisEngine {
  analysisStart(
    profile: SearchProfile,
    evaluator: EvaluatorChoice,
    request: AnalysisStart,
  ): Promise<AnalysisResponse>;
  analysisStep(request: AnalysisStep): Promise<AnalysisResponse>;
  analysisStop(): Promise<AnalysisResponse>;
  restart(
    session: EngineSession,
    model?: RestorableModel | null,
  ): Promise<BrowserSnapshot>;
}

export interface AnalysisSessionConfig {
  profile: SearchProfile;
  evaluator: EvaluatorChoice;
  model: RestorableModel | null;
  engineSession: EngineSession;
  buildRequest: () => Promise<AnalysisStart>;
}

interface AnalysisStore {
  get: AnalysisSummaryStore["get"];
  put: AnalysisSummaryStore["put"];
}

interface AnalysisRuntime {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const browserRuntime: AnalysisRuntime = {
  now: () => Date.now(),
  sleep: (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
};

/**
 * Owns the complete lifetime of continuous analysis.
 *
 * React supplies immutable session inputs and observes snapshots. Cancellation,
 * stale-result rejection, cache admission, display throttling, and physical
 * Worker recovery all share one generation number here.
 */
export class AnalysisSessionController {
  private generation = 0;
  private switchChain: Promise<void> = Promise.resolve();
  private readonly gate = new PublishGate<AnalysisView>();
  private view: AnalysisView = {
    status: "idle",
    update: null,
    progress: emptyProgress(),
  };

  constructor(
    private readonly engine: AnalysisEngine,
    private readonly store: AnalysisStore,
    private readonly onView: (view: AnalysisView) => void,
    private readonly onError: (error: unknown) => void,
    private readonly runtime: AnalysisRuntime = browserRuntime,
  ) {}

  start(config: AnalysisSessionConfig): () => void {
    const generation = ++this.generation;
    this.switchChain = this.switchChain
      .then(async () => {
        await this.stopEngine();
        if (!this.isCurrent(generation)) return;
        this.gate.reset();
        this.publish({
          status: this.view.update === null ? "idle" : "invalidated",
          update: this.view.update,
          progress: emptyProgress(),
        });
        void this.run(generation, config);
      })
      .catch((error: unknown) => {
        if (this.isCurrent(generation)) this.fail(error);
      });
    return () => this.cancel(generation);
  }

  pause(): void {
    const generation = ++this.generation;
    this.switchChain = this.switchChain
      .then(async () => {
        await this.stopEngine();
        if (!this.isCurrent(generation)) return;
        const due = this.gate.flush(this.runtime.now());
        this.publish({
          status: "stopped",
          update: due?.update ?? this.view.update,
          progress: due?.progress ?? this.view.progress,
        });
      })
      .catch((error: unknown) => {
        if (this.isCurrent(generation)) this.fail(error);
      });
  }

  dispose(): void {
    this.generation += 1;
    void this.stopEngine();
  }

  private cancel(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.pause();
  }

  private async run(
    generation: number,
    config: AnalysisSessionConfig,
  ): Promise<void> {
    let restarted = false;
    while (this.isCurrent(generation)) {
      try {
        await this.runUntilStopped(generation, config);
        return;
      } catch (error) {
        if (!this.isCurrent(generation)) return;
        if (restarted) {
          this.fail(error);
          return;
        }
        this.publish({ ...this.view, status: "restarting" });
        try {
          await this.engine.restart(config.engineSession, config.model);
        } catch (restartError) {
          if (this.isCurrent(generation)) this.fail(restartError ?? error);
          return;
        }
        restarted = true;
      }
    }
  }

  private async runUntilStopped(
    generation: number,
    config: AnalysisSessionConfig,
  ): Promise<void> {
    const request = await config.buildRequest();
    if (!this.isCurrent(generation)) return;
    let progress = emptyProgress();
    const persisted = await this.store.get(request);
    if (!this.isCurrent(generation)) return;
    if (persisted !== null) {
      this.show(generation, persisted.update, request, "cached", progress);
    }

    const started = await this.engine.analysisStart(
      config.profile,
      config.evaluator,
      request,
    );
    for (const update of started.updates) {
      if (!(await this.record(generation, update, request))) return;
    }
    const opening = displayUpdate(started.updates);
    if (opening !== null) {
      this.show(
        generation,
        opening,
        request,
        opening.source === "cache" ? "cached" : "live",
        progress,
      );
    }

    while (this.isCurrent(generation)) {
      const response = await this.engine.analysisStep({
        schema: ANALYSIS_SCHEMA,
        nodes: analysisSliceNodes(config.profile),
        maxDepth: ANALYSIS_MAX_DEPTH,
        timestampMs: this.runtime.now(),
      });
      for (const update of response.updates) {
        if (!(await this.record(generation, update, request))) return;
      }
      progress = accumulateSlice(progress, response.slice);
      const latest = displayUpdate(response.updates);
      if (latest !== null) {
        this.show(generation, latest, request, "live", progress);
      }
      await this.runtime.sleep(30);
    }
  }

  private async record(
    generation: number,
    update: AnalysisUpdate,
    request: AnalysisStart,
  ): Promise<boolean> {
    if (!this.accepts(generation, update, request)) return false;
    await this.store.put(request, update);
    return this.accepts(generation, update, request);
  }

  private show(
    generation: number,
    update: AnalysisUpdate,
    request: AnalysisStart,
    status: AnalysisStatus,
    progress: AnalysisProgress,
  ): void {
    if (!this.accepts(generation, update, request)) return;
    const next = { status, update, progress } satisfies AnalysisView;
    if (status === "live") {
      const due = this.gate.offer(next, this.runtime.now());
      if (due !== null) this.publish(due);
      return;
    }
    this.gate.reset();
    this.publish(next);
  }

  private accepts(
    generation: number,
    update: AnalysisUpdate,
    request: AnalysisStart,
  ): boolean {
    return this.isCurrent(generation) && updateMatchesRequest(update, request);
  }

  private async stopEngine(): Promise<void> {
    try {
      await this.engine.analysisStop();
    } catch {
      // No active analysis or an already-dead Worker requires no further stop.
    }
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private publish(view: AnalysisView): void {
    this.view = view;
    this.onView(view);
  }

  private fail(error: unknown): void {
    this.publish({ ...this.view, status: "stopped" });
    this.onError(error);
  }
}
