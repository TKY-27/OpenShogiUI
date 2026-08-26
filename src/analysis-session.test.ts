import { describe, expect, it, vi } from "vitest";

import {
  AnalysisSessionController,
  type AnalysisEngine,
  type AnalysisView,
} from "./analysis-session";
import type {
  AnalysisResponse,
  AnalysisStart,
  AnalysisUpdate,
} from "./browser-engine";

const hash = (digit: string) => digit.repeat(64);

function request(positionSfen = "startpos"): AnalysisStart {
  return {
    schema: "open_shogi_analysis/v1",
    positionSfen,
    modelHash: hash("1"),
    evaluatorConfigHash: hash("2"),
    featureSchemaHash: hash("3"),
    evaluationSemanticsHash: hash("4"),
    searchOptionsHash: hash("5"),
    openingProfileHash: hash("6"),
    multiPv: 1,
  };
}

function updateFor(start: AnalysisStart): AnalysisUpdate {
  return {
    source: "search",
    canonicalPosition: start.positionSfen,
    positionHash: "0123456789abcdef",
    modelHash: start.modelHash,
    evaluatorConfigHash: start.evaluatorConfigHash,
    featureSchemaHash: start.featureSchemaHash,
    evaluationSemanticsHash: start.evaluationSemanticsHash,
    searchOptionsHash: start.searchOptionsHash,
    openingProfileHash: start.openingProfileHash,
    multiPv: start.multiPv,
    depth: 4,
    nodes: 1_500,
    nps: 15_000,
    score: 30,
    mateScore: null,
    lines: [
      {
        rank: 1,
        score: 30,
        mateScore: null,
        depth: 4,
        nodes: 1_500,
        pv: ["7g7f"],
      },
    ],
    rootMoveStatistics: [],
    timestampMs: 9,
    engineVersion: "test",
  };
}

function response(
  event: AnalysisResponse["event"],
  updates: AnalysisUpdate[] = [],
): AnalysisResponse {
  return {
    schema: "open_shogi_analysis/v1",
    event,
    updates,
    ...(event === "updates"
      ? {
          slice: {
            termination: "node-limit" as const,
            depth: 4,
            nodes: 1_500,
            elapsedNs: 100_000_000,
          },
        }
      : {}),
  };
}

function engineFor(start: AnalysisStart): AnalysisEngine & {
  restart: ReturnType<typeof vi.fn>;
} {
  return {
    analysisStart: vi.fn(async () => response("started")),
    analysisStep: vi.fn(async () => response("updates", [updateFor(start)])),
    analysisStop: vi.fn(async () => response("stopped")),
    restart: vi.fn(async () => ({}) as never),
  };
}

const runtime = {
  now: () => 1_000,
  sleep: () => new Promise<void>(() => undefined),
};

function config(start: AnalysisStart) {
  return {
    profile: "eco" as const,
    evaluator: "overall-champion" as const,
    model: null,
    engineSession: { initialSfen: start.positionSfen, moves: [] },
    buildRequest: async () => start,
  };
}

describe("AnalysisSessionController", () => {
  it("owns progress, cache admission, and display publication", async () => {
    const start = request();
    const engine = engineFor(start);
    const put = vi.fn(async () => undefined);
    const views: AnalysisView[] = [];
    const controller = new AnalysisSessionController(
      engine,
      { get: vi.fn(async () => null), put },
      (view) => views.push(view),
      vi.fn(),
      runtime,
    );

    const cancel = controller.start(config(start));
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());

    expect(views.at(-1)).toMatchObject({
      status: "live",
      progress: { depth: 4, nodes: 1_500, slices: 1 },
    });
    cancel();
  });

  it("uses one physical restart path after an analysis failure", async () => {
    const start = request();
    const engine = engineFor(start);
    vi.mocked(engine.analysisStart)
      .mockRejectedValueOnce(new Error("analysis failed"))
      .mockResolvedValue(response("started"));
    const views: AnalysisView[] = [];
    const onError = vi.fn();
    const controller = new AnalysisSessionController(
      engine,
      { get: vi.fn(async () => null), put: vi.fn(async () => undefined) },
      (view) => views.push(view),
      onError,
      runtime,
    );

    const cancel = controller.start(config(start));
    await vi.waitFor(() => expect(engine.restart).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(views.some(({ status }) => status === "live")).toBe(true),
    );

    expect(views.some(({ status }) => status === "restarting")).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    cancel();
  });

  it("stops instead of entering an unbounded restart loop", async () => {
    const start = request();
    const engine = engineFor(start);
    vi.mocked(engine.analysisStart).mockRejectedValue(
      new Error("persistent failure"),
    );
    const onError = vi.fn();
    const controller = new AnalysisSessionController(
      engine,
      { get: vi.fn(async () => null), put: vi.fn(async () => undefined) },
      vi.fn(),
      onError,
      runtime,
    );

    controller.start(config(start));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(engine.restart).toHaveBeenCalledOnce();
    expect(engine.analysisStart).toHaveBeenCalledTimes(2);
  });

  it("rejects a superseded request with the shared generation", async () => {
    const first = request("first");
    const second = request("second");
    let resolveFirst: ((value: AnalysisStart) => void) | undefined;
    const firstRequest = new Promise<AnalysisStart>((resolve) => {
      resolveFirst = resolve;
    });
    const engine = engineFor(second);
    const controller = new AnalysisSessionController(
      engine,
      { get: vi.fn(async () => null), put: vi.fn(async () => undefined) },
      vi.fn(),
      vi.fn(),
      runtime,
    );

    controller.start({ ...config(first), buildRequest: () => firstRequest });
    controller.start(config(second));
    resolveFirst?.(first);

    await vi.waitFor(() =>
      expect(engine.analysisStart).toHaveBeenCalledWith(
        "eco",
        "overall-champion",
        second,
      ),
    );
    expect(engine.analysisStart).not.toHaveBeenCalledWith(
      "eco",
      "overall-champion",
      first,
    );
  });
});
