import { describe, expect, it, vi } from "vitest";
import {
  LearnedAnalysisSession,
  analysisRequest,
  readAnalysisPosition,
} from "./learned-analysis";
import { START_SFEN } from "./collection";
import type { PrototypeWorkerClient } from "./core-prototype-client";
import type {
  PrototypeManifest,
  PrototypeReady,
  PrototypeSnapshot,
  PrototypeSelection,
} from "./core-prototype-protocol";
import type { AnalysisResponse, AnalysisStart } from "./browser-engine";

const modelHash = "a".repeat(64);
function manifest(selection: PrototypeSelection): PrototypeManifest {
  const asset = { url: "/test", sha256: modelHash, size: 1 };
  return {
    schema: "open_shogi_core_prototype_assets/v2",
    selection,
    runId: `test-${selection}`,
    artifacts: {
      "engine.js": asset,
      "engine.wasm": asset,
      "leaf.osaval03": asset,
      "controller.json": null,
    },
  };
}
const snapshot: PrototypeSnapshot = {
  initialSfen: START_SFEN,
  sfen: START_SFEN,
  sideToMove: "black",
  moveNumber: 1,
  board: Array(81).fill(null),
  hands: { black: [], white: [] },
  moves: [],
  terminal: null,
  legalMoves: [],
  leafSha256: modelHash,
};
function ready(m: PrototypeManifest): PrototypeReady {
  return {
    snapshot,
    identity: {
      modelId: m.runId,
      modelFormat: "OSAVAL03",
      leafSha256: modelHash,
      controllerSha256: null,
      jsSha256: modelHash,
      wasmSha256: modelHash,
      expectedHashVerified: true,
      buildClass: "pure-only",
      evaluationMode: "pure-value",
    },
    preparation: {
      fetchMs: 0,
      moduleMs: 0,
      compileMs: 0,
      modelMs: 0,
      totalMs: 0,
    },
  };
}

describe("bounded learned analysis", () => {
  it("parses only bounded local position commands and leaves legality to the Wasm", () => {
    expect(readAnalysisPosition("position startpos moves 7g7f 3c3d")).toEqual({
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    expect(readAnalysisPosition(`position sfen ${START_SFEN}`)).toEqual({
      initialSfen: START_SFEN,
      moves: [],
    });
    expect(() =>
      readAnalysisPosition("position startpos moves illegal"),
    ).toThrow();
    expect(() => readAnalysisPosition("x".repeat(13000))).toThrow();
  });
  it("binds every analysis identity to the runtime, model, root and options", async () => {
    const a = manifest("r4c3");
    const b = structuredClone(a);
    b.artifacts["engine.wasm"].sha256 = "b".repeat(64);
    const first = await analysisRequest(snapshot, a, "balanced", 3);
    const changed = await analysisRequest(snapshot, b, "balanced", 3);
    expect(first.modelHash).toBe(modelHash);
    expect(first.positionSfen).toBe(START_SFEN);
    expect(changed.featureSchemaHash).not.toBe(first.featureSchemaHash);
    expect(changed.searchOptionsHash).not.toBe(first.searchOptionsHash);
  });
  it("model changes dispose old work, preserve the position, and ignore the queued result", async () => {
    let resolve: (value: AnalysisResponse) => void = () => {};
    const clients: {
      dispose: ReturnType<typeof vi.fn>;
      initialize: ReturnType<typeof vi.fn>;
    }[] = [];
    let stepped = false;
    const make = () => {
      const client = {
        initialize: vi.fn(async (m: PrototypeManifest) => ready(m)),
        dispose: vi.fn(),
        analysisStart: vi.fn(async () => ({
          schema: "open_shogi_analysis/v1",
          event: "started",
          updates: [],
        })),
        analysisStep: vi.fn(() => {
          stepped = true;
          return new Promise<AnalysisResponse>((r) => {
            resolve = r;
          });
        }),
        analysisStop: vi.fn(async () => ({
          schema: "open_shogi_analysis/v1",
          event: "stopped",
          updates: [],
        })),
      };
      clients.push(client);
      return client as unknown as PrototypeWorkerClient;
    };
    const session = new LearnedAnalysisSession(
      () => {},
      make,
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    const running = session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(stepped).toBe(true));
    await session.prepare("r4c1");
    resolve({
      schema: "open_shogi_analysis/v1",
      event: "updates",
      updates: [],
      slice: { depth: 3, nodes: 999, elapsedNs: 100, termination: "completed" },
    });
    await running;
    expect(session.state.selection).toBe("r4c1");
    expect(session.state.snapshot?.sfen).toBe(START_SFEN);
    expect(session.state.progress.nodes).toBe(0);
    expect(session.state.update).toBeNull();
    expect(clients[1].dispose).toHaveBeenCalled();
    session.dispose();
  });
  it("load failure exposes an error and no stale verified identity", async () => {
    const session = new LearnedAnalysisSession(
      () => {},
      () => {
        throw Error("must not initialize");
      },
      async () => {
        throw Error("missing model");
      },
    );
    await session.prepare("r4c4");
    expect(session.state).toMatchObject({
      selection: "r4c4",
      phase: "error",
      identity: null,
      update: null,
      error: "missing model",
    });
    session.dispose();
  });
});

describe("kifu navigation and branching", () => {
  /** A replaying mock worker: initialize/move track one position history. */
  function replayingClient(
    positions: string[][],
    clients: { dispose: ReturnType<typeof vi.fn> }[],
  ) {
    let moves: string[] = [];
    return () => {
      const client = {
        initialize: vi.fn(
          async (
            m: PrototypeManifest,
            _enabled: boolean,
            position: { moves: string[] } | null,
          ) => {
            moves = [...(position?.moves ?? [])];
            positions.push(moves);
            const snap = snapFor(moves);
            return {
              ...ready(m),
              snapshot: snap,
            };
          },
        ),
        move: vi.fn(async (movement: string) => {
          moves = [...moves, movement];
          positions.push(moves);
          return snapFor(moves);
        }),
        dispose: vi.fn(() => {
          clients.push({ dispose: vi.fn() });
        }),
      };
      return client as unknown as PrototypeWorkerClient;
    };
  }
  function snapFor(moves: string[]): PrototypeSnapshot {
    return {
      ...snapshot,
      moves,
      sfen: `${START_SFEN}|${moves.join(",")}`,
      sideToMove: moves.length % 2 === 0 ? "black" : "white",
      moveNumber: moves.length + 1,
      legalMoves: [
        {
          usi: "7g7f",
          from: null,
          to: { file: 7, rank: 7 },
          drop: null,
          promote: false,
        },
        {
          usi: "3c3d",
          from: null,
          to: { file: 3, rank: 3 },
          drop: null,
          promote: false,
        },
        {
          usi: "2b8h+",
          from: null,
          to: { file: 8, rank: 2 },
          drop: null,
          promote: true,
        },
      ],
    };
  }

  it("navigates the record without rewriting it and forks a preview branch on a new move", async () => {
    const positions: string[][] = [];
    const disposed: { dispose: ReturnType<typeof vi.fn> }[] = [];
    const session = new LearnedAnalysisSession(
      () => {},
      replayingClient(positions, disposed),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    expect(session.state.cursor).toBe(2);
    await session.goto(0);
    expect(session.state.cursor).toBe(0);
    expect(session.state.snapshot?.moves).toEqual([]);
    await session.goto(1);
    expect(session.state.snapshot?.moves).toEqual(["7g7f"]);
    // A movement at the past forks a branch; the record stays untouched.
    await session.move("2b8h+");
    expect(session.state.line).toEqual(["7g7f", "2b8h+"]);
    expect(session.state.branching).toBe(true);
    expect(session.state.record.moves).toEqual(["7g7f", "3c3d"]);
    session.discardBranch();
    expect(session.state.line).toEqual(["7g7f", "3c3d"]);
    expect(session.state.branching).toBe(false);
    // Replaying the recorded move from ply 1 restores the committed line.
    await session.goto(1);
    await session.move("3c3d");
    expect(session.state.branching).toBe(false);
    expect(session.state.line).toEqual(["7g7f", "3c3d"]);
    // A genuinely new move at the end extends the committed record.
    await session.move("2b8h+");
    expect(session.state.record.moves).toEqual(["7g7f", "3c3d", "2b8h+"]);
    session.dispose();
  });

  it("keeps the previous record when an import fails validation", async () => {
    const failing = new LearnedAnalysisSession(
      () => {},
      () => {
        throw Error("must not initialize");
      },
      async () => {
        throw Error("invalid kifu");
      },
    );
    await failing.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f"],
    });
    const before = failing.state.record;
    await failing.loadPosition({
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    expect(failing.state.phase).toBe("error");
    expect(failing.state.record).toBe(before);
    expect(failing.state.record.moves).toEqual(["7g7f"]);
    failing.dispose();
  });
});

describe("full-record sweep", () => {
  function sweepingClient() {
    const requests: AnalysisStart[] = [];
    let moves: string[] = [];
    let current: AnalysisStart | null = null;
    let stepCount = 0;
    const client = {
      initialize: vi.fn(
        async (
          m: PrototypeManifest,
          _enabled: boolean,
          position: { moves: string[] } | null,
        ) => {
          moves = [...(position?.moves ?? [])];
          return { ...ready(m), snapshot: snapFor(moves) };
        },
      ),
      move: vi.fn(async (movement: string) => {
        moves = [...moves, movement];
        return snapFor(moves);
      }),
      analysisStart: vi.fn(async (request: AnalysisStart) => {
        current = request;
        requests.push(request);
        return {
          schema: "open_shogi_analysis/v1",
          event: "started",
          updates: [],
        } satisfies AnalysisResponse;
      }),
      analysisStep: vi.fn(async (): Promise<AnalysisResponse> => {
        stepCount += 1;
        const request = current!;
        return {
          schema: "open_shogi_analysis/v1",
          event: "updates",
          updates: [
            {
              source: "search" as const,
              canonicalPosition: request.positionSfen,
              positionHash: "0".repeat(64),
              modelHash: request.modelHash,
              evaluatorConfigHash: request.evaluatorConfigHash,
              featureSchemaHash: request.featureSchemaHash,
              evaluationSemanticsHash: request.evaluationSemanticsHash,
              searchOptionsHash: request.searchOptionsHash,
              openingProfileHash: request.openingProfileHash,
              multiPv: request.multiPv,
              depth: 5,
              nodes: 1000,
              nps: 1000,
              score: 120,
              mateScore: null,
              lines: [
                {
                  rank: 1,
                  score: 120,
                  mateScore: null,
                  depth: 5,
                  nodes: 1000,
                  pv: [moves.length % 2 === 0 ? "7g7f" : "3c3d"],
                },
              ],
              rootMoveStatistics: [],
              timestampMs: 0,
              engineVersion: "test",
            },
          ],
          slice: {
            depth: 5,
            nodes: 1000,
            elapsedNs: 1_000_000,
            termination: "completed" as const,
          },
        };
      }),
      analysisStop: vi.fn(
        async () =>
          ({
            schema: "open_shogi_analysis/v1",
            event: "stopped",
            updates: [],
          }) satisfies AnalysisResponse,
      ),
      dispose: vi.fn(),
    };
    return {
      make: () => client as unknown as PrototypeWorkerClient,
      requests,
      steps: () => stepCount,
    };
  }
  function snapFor(moves: string[]): PrototypeSnapshot {
    return {
      ...snapshot,
      moves,
      sfen: `${START_SFEN}|${moves.join(",")}`,
      sideToMove: moves.length % 2 === 0 ? "black" : "white",
      moveNumber: moves.length + 1,
      legalMoves: [
        {
          usi: "7g7f",
          from: null,
          to: { file: 7, rank: 7 },
          drop: null,
          promote: false,
        },
        {
          usi: "3c3d",
          from: null,
          to: { file: 3, rank: 3 },
          drop: null,
          promote: false,
        },
      ],
    };
  }

  it("analyzes every position in order without moving the displayed cursor", async () => {
    const sweep = sweepingClient();
    const session = new LearnedAnalysisSession(
      () => {},
      sweep.make,
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    await session.goto(1);
    await session.sweep("balanced", 250, 1);
    expect(session.state.phase).toBe("ready");
    expect(session.state.sweep).toBeNull();
    // Positions 0, 1 and 2 all carry a recorded evaluation; Sente perspective.
    expect(session.state.graph).toHaveLength(3);
    expect(session.state.graph[0]?.score).toBe(120);
    expect(session.state.graph[1]?.score).toBe(-120);
    expect(session.state.graph[2]?.score).toBe(120);
    // The displayed cursor never moved and never lost its position.
    expect(session.state.cursor).toBe(1);
    expect(session.state.snapshot?.moves).toEqual(["7g7f"]);
    // One analysisStart per position, three in total.
    expect(sweep.requests).toHaveLength(3);
    session.dispose();
  });
});
