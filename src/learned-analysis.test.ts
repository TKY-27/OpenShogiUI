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
import type {
  AnalysisResponse,
  AnalysisStart,
  AnalysisUpdate,
} from "./browser-engine";

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
      sfen:
        moves.length === 0 ? START_SFEN : `${START_SFEN}|${moves.join(",")}`,
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
      sfen:
        moves.length === 0 ? START_SFEN : `${START_SFEN}|${moves.join(",")}`,
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

describe("position-analysis auto-follow", () => {
  const LEGAL = ["7g7f", "3c3d", "2b8h+"];

  function snapFor(moves: string[]): PrototypeSnapshot {
    return {
      ...snapshot,
      moves,
      sfen:
        moves.length === 0 ? START_SFEN : `${START_SFEN}|${moves.join(",")}`,
      sideToMove: moves.length % 2 === 0 ? "black" : "white",
      moveNumber: moves.length + 1,
      legalMoves: LEGAL.map((usi) => ({
        usi,
        from: null,
        to: { file: 7, rank: 7 },
        drop: null,
        promote: usi.endsWith("+"),
      })),
    };
  }

  function updateFor(request: AnalysisStart, pv0: string): AnalysisUpdate {
    return {
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
      score: 80,
      mateScore: null,
      lines: [
        {
          rank: 1,
          score: 80,
          mateScore: null,
          depth: 5,
          nodes: 1000,
          pv: [pv0],
        },
      ],
      rootMoveStatistics: [],
      timestampMs: 0,
      engineVersion: "test",
    };
  }

  interface FakeSearch {
    requests: AnalysisStart[];
    /** Resolves the currently pending analysisStep of the newest client. */
    settle: () => void;
    created: { dispose: ReturnType<typeof vi.fn> }[];
  }

  /**
   * A replaying worker whose analysisStep parks until the test resolves it.
   * dispose() rejects a pending step exactly like the real client's fail().
   */
  function parkingClient(record: FakeSearch) {
    let moves: string[] = [];
    let parked: ((value: AnalysisResponse) => void) | null = null;
    return () => {
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
          record.requests.push(request);
          return {
            schema: "open_shogi_analysis/v1",
            event: "started",
            updates: [],
          } satisfies AnalysisResponse;
        }),
        analysisStep: vi.fn(
          () =>
            new Promise<AnalysisResponse>((resolve) => {
              parked = resolve;
            }),
        ),
        analysisStop: vi.fn(
          async () =>
            ({
              schema: "open_shogi_analysis/v1",
              event: "stopped",
              updates: [],
            }) satisfies AnalysisResponse,
        ),
        dispose: vi.fn(() => {
          parked?.({
            schema: "open_shogi_analysis/v1",
            event: "updates",
            updates: [],
            slice: {
              depth: 0,
              nodes: 0,
              elapsedNs: 0,
              termination: "cancelled" as const,
            },
          });
          parked = null;
          record.created.push(client as unknown as { dispose: typeof dispose });
        }),
      };
      const dispose = client.dispose;
      record.settle = () => {
        const request = record.requests.at(-1)!;
        parked?.({
          schema: "open_shogi_analysis/v1",
          event: "updates",
          updates: [updateFor(request, "7g7f")],
          slice: {
            depth: 5,
            nodes: 1000,
            elapsedNs: 1_000_000,
            termination: "completed" as const,
          },
        });
        parked = null;
      };
      return client as unknown as PrototypeWorkerClient;
    };
  }

  it("starts the next position automatically after a user move", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    expect(session.state.autoFollow).toBe(true);
    await session.move("7g7f");
    // The move supersedes position A and analyzes position B on its own.
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    expect(record.requests[1]!.positionSfen).toBe(`${START_SFEN}|7g7f`);
    expect(session.state.autoFollow).toBe(true);
    record.settle();
    await vi.waitFor(() =>
      expect(session.state.update?.canonicalPosition).toBe(
        `${START_SFEN}|7g7f`,
      ),
    );
    expect(session.state.phase).toBe("ready");
    // The bounded completion leaves the intent armed, not stopped.
    expect(session.state.autoFollow).toBe(true);
    session.dispose();
  });

  it("drops a move resolved against a board that trails the cursor mid-sync", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    // Hold the first navigation sync so the display trails the cursor the way
    // an uncached reposition does in the real runtime.
    let release: (() => void) | null = null;
    let heldOnce = false;
    const base = parkingClient(record);
    const session = new LearnedAnalysisSession(
      () => {},
      () => {
        const client = base();
        const inner = client.move;
        client.move = ((movement: string) => {
          if (heldOnce) return inner(movement);
          heldOnce = true;
          return new Promise<PrototypeSnapshot>((resolve) => {
            release = () =>
              resolve(inner(movement) as Promise<PrototypeSnapshot>);
          });
        }) as typeof client.move;
        return client;
      },
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    const first = session.move("7g7f");
    await vi.waitFor(() => expect(session.state.cursor).toBe(1));
    // The board still shows the start position while the sync is in flight, so
    // a click there resolves "3c3d". It must not extend the record at cursor 1.
    await session.move("3c3d");
    expect(session.state.record.moves).toEqual(["7g7f"]);
    expect(session.state.line).toEqual(["7g7f"]);
    expect(session.state.cursor).toBe(1);
    // Once the synced board lands, the same move is accepted normally.
    release!();
    await first;
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(["7g7f"]),
    );
    await session.move("3c3d");
    expect(session.state.record.moves).toEqual(["7g7f", "3c3d"]);
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(["7g7f", "3c3d"]),
    );
    session.dispose();
  });

  it("drops a click on a discarded branch board whose depth matches the cursor", async () => {
    // discardBranch keeps the discarded board on display while the committed
    // replacement syncs. When the branch end depth equals the restored cursor,
    // depth alone cannot tell the two apart — the guard must compare position
    // content, or a branch-legal move lands on the committed line and
    // adoptBranch would commit a move the engine would reject.
    const modelHash = "a".repeat(64);
    const asset = { url: "/test", sha256: modelHash, size: 1 };
    const branchManifest: PrototypeManifest = {
      schema: "open_shogi_core_prototype_assets/v2",
      selection: "r4c3",
      runId: "test-r4c3",
      artifacts: {
        "engine.js": asset,
        "engine.wasm": asset,
        "leaf.osaval03": asset,
        "controller.json": null,
      },
    };
    const identity = {
      modelId: branchManifest.runId,
      modelFormat: "OSAVAL03",
      leafSha256: modelHash,
      controllerSha256: null,
      jsSha256: modelHash,
      wasmSha256: modelHash,
      expectedHashVerified: true,
      buildClass: "pure-only",
      evaluationMode: "pure-value",
    } as const;
    const record = ["7g7f", "3c3d", "7g7f", "3c3d", "9i9h", "3c3d"];
    const isRecordPrefix = (moves: string[]) =>
      moves.length <= record.length &&
      record.slice(0, moves.length).join(" ") === moves.join(" ");
    const snapFor = (moves: string[]): PrototypeSnapshot =>
      ({
        initialSfen: START_SFEN,
        sfen:
          moves.length === 0 ? START_SFEN : `${START_SFEN}|${moves.join(",")}`,
        sideToMove: moves.length % 2 === 0 ? "black" : "white",
        moveNumber: moves.length + 1,
        board: Array(81).fill(null),
        hands: { black: [], white: [] },
        moves,
        terminal: null,
        leafSha256: modelHash,
        // A branch position accepts a move the committed line never would.
        legalMoves: (isRecordPrefix(moves)
          ? ["7g7f", "3c3d", "9i9h"]
          : ["2b8h+"]
        ).map((usi) => ({
          usi,
          from: null,
          to: { file: 7, rank: 7 },
          drop: null,
          promote: usi.endsWith("+"),
        })),
      }) as PrototypeSnapshot;
    const replays: string[][] = [];
    let holdFrom = Number.POSITIVE_INFINITY;
    let made = 0;
    const session = new LearnedAnalysisSession(
      () => {},
      () => {
        made += 1;
        let workerMoves: string[] = [];
        const client = {
          dispose: vi.fn(),
          initialize: vi.fn(
            async (
              _m: PrototypeManifest,
              _enabled: boolean,
              position: { moves: string[] } | null,
            ) => {
              workerMoves = [...(position?.moves ?? [])];
              replays.push([...workerMoves]);
              // The real Worker replays and validates: a phantom extension of
              // the committed line is rejected.
              if (!isRecordPrefix(workerMoves))
                throw new Error("illegal position replayed");
              if (holdFrom === made) await new Promise(() => {});
              return {
                snapshot: snapFor(workerMoves),
                identity,
                preparation: {
                  fetchMs: 0,
                  moduleMs: 0,
                  compileMs: 0,
                  modelMs: 0,
                  totalMs: 0,
                },
              };
            },
          ),
          move: vi.fn(async (movement: string) => {
            workerMoves = [...workerMoves, movement];
            return snapFor(workerMoves);
          }),
        };
        return client as unknown as PrototypeWorkerClient;
      },
      async () => branchManifest,
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: record,
    });
    await session.goto(4);
    // Branch from cursor 4 with a move that differs from record[4].
    await session.move("7g7f");
    expect(session.state.branching).toBe(true);
    expect(session.state.cursor).toBe(5);
    // Discard. The committed cursor-5 position is uncached, so the discarded
    // branch board stays on display while the re-sync is held in flight.
    holdFrom = made + 1;
    session.discardBranch();
    expect(session.state.snapshot?.moves).toEqual([
      ...record.slice(0, 4),
      "7g7f",
    ]);
    // A click legal on the discarded branch board must be dropped...
    await session.move("2b8h+");
    expect(session.state.line).toEqual(record);
    expect(session.state.record.moves).toEqual(record);
    expect(session.state.branching).toBe(false);
    // ...and once the committed position lands, normal moves work again.
    await session.goto(5);
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(record.slice(0, 5)),
    );
    session.dispose();
  });

  it("accepts only the newest position during rapid navigation", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    await session.goto(2);
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    // Rapid jumps: each jump supersedes the previous position's search, and
    // each superseded search is dropped without publishing.
    void session.goto(1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    void session.goto(0);
    await vi.waitFor(() => expect(record.requests).toHaveLength(3));
    void session.goto(2);
    await vi.waitFor(() => expect(record.requests).toHaveLength(4));
    expect(record.requests[3]!.positionSfen).toBe(
      `${START_SFEN}|${["7g7f", "3c3d"].join(",")}`,
    );
    record.settle();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    expect(session.state.update?.canonicalPosition).toBe(
      `${START_SFEN}|${["7g7f", "3c3d"].join(",")}`,
    );
    expect(session.state.cursor).toBe(2);
    session.dispose();
  });

  it("never lets a stale position publish over a newer one", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    const staleRequest = record.requests[0]!;
    // The old client's pending step resolves AFTER it was superseded; its
    // update must not surface as the new position's result.
    const staleResolve = record.settle;
    await session.move("7g7f");
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    staleResolve();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    expect(session.state.update?.canonicalPosition).not.toBe(
      staleRequest.positionSfen,
    );
    session.dispose();
  });

  it("keeps display and results coherent when navigation outruns the sync", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    // Jump to an uncached position: the previous board stays on display until
    // the navigation worker syncs, and the old analysis finishes in that gap.
    void session.goto(0);
    await vi.waitFor(() => expect(session.state.cursor).toBe(0));
    record.settle();
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Whatever finished in the gap, the displayed result belongs to the
    // displayed board or there is none.
    const gapUpdate = session.state.update;
    expect(
      gapUpdate === null ||
        gapUpdate.canonicalPosition === session.state.snapshot?.sfen,
    ).toBe(true);
    // When the sync lands, the new position replaces board and result and
    // receives its own analysis.
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    expect(record.requests[1]!.positionSfen).toBe(START_SFEN);
    expect(session.state.snapshot?.sfen).toBe(START_SFEN);
    record.settle();
    await vi.waitFor(() =>
      expect(session.state.update?.canonicalPosition).toBe(START_SFEN),
    );
    session.dispose();
  });

  it("syncs the final position when navigation outruns a reposition", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    await session.goto(2);
    // The first jump starts a fresh-worker sync; the second lands before it
    // settles. The final display must match the newest cursor.
    void session.goto(0);
    void session.goto(1);
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(["7g7f"]),
    );
    expect(session.state.cursor).toBe(1);
    expect(session.state.snapshot?.moves).toEqual(["7g7f"]);
    session.dispose();
  });

  it("keeps analysis stopped after an explicit Stop until Start again", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    session.stop();
    expect(session.state.phase).toBe("stopped");
    expect(session.state.autoFollow).toBe(false);
    const count = record.requests.length;
    await session.move("7g7f");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(record.requests).toHaveLength(count);
    expect(session.state.autoFollow).toBe(false);
    // Start again: the current position analyzes and auto-follow resumes.
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(count + 1));
    expect(record.requests.at(-1)!.positionSfen).toBe(`${START_SFEN}|7g7f`);
    await session.move("3c3d");
    await vi.waitFor(() => expect(record.requests).toHaveLength(count + 2));
    expect(session.state.autoFollow).toBe(true);
    session.dispose();
  });

  it("analyzes loaded records when armed, at the loaded cursor", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", { initialSfen: START_SFEN, moves: [] });
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    record.settle();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    // An imported game opens at the first position; the deferred sync lands
    // first, then the armed intent analyzes that position.
    await session.loadPosition(
      { initialSfen: START_SFEN, moves: ["7g7f", "3c3d"] },
      "start",
    );
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    expect(record.requests[1]!.positionSfen).toBe(START_SFEN);
    expect(session.state.cursor).toBe(0);
    record.settle();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    // A pasted USI line opens at its final position and analyzes it directly.
    await session.loadPosition(
      { initialSfen: START_SFEN, moves: ["7g7f"] },
      "end",
    );
    await vi.waitFor(() => expect(record.requests).toHaveLength(3));
    expect(record.requests[2]!.positionSfen).toBe(`${START_SFEN}|7g7f`);
    session.dispose();
  });

  it("stays stopped when settings, model or records change after Stop", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    session.stop();
    const count = record.requests.length;
    // Every indirect resurrection path must observe the disarmed intent.
    session.applyAnalysisOptions("balanced", 1000, 3);
    expect(session.state.autoFollow).toBe(false);
    await session.prepare("r4c1");
    expect(session.state.autoFollow).toBe(false);
    await session.loadPosition({
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(record.requests).toHaveLength(count);
    expect(session.state.autoFollow).toBe(false);
    // An explicit Start is the only way back into analysis.
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(count + 1));
    session.dispose();
  });

  it("ends a bounded search at its deadline while keeping the intent armed", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    // Never settle the step: the per-position watchdog ends the search.
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"), {
      timeout: 5_000,
    });
    expect(session.state.autoFollow).toBe(true);
    // The next position still receives its own analysis.
    await session.move("7g7f");
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    session.dispose();
  });

  it("repositions the worker after discarding a branch at the branch end", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d", "2b8h+"],
    });
    await session.goto(1);
    // Fork a branch at ply 1; the branch end has the same depth (2) as the
    // committed ply 2, so depth alone cannot tell the worker where it sits.
    await session.move("2b8h+");
    expect(session.state.branching).toBe(true);
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(["7g7f", "2b8h+"]),
    );
    session.discardBranch();
    // The sync after the discard must show the committed ply 2 board.
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(["7g7f", "3c3d"]),
    );
    // A forward step from here must extend the committed line, not replay a
    // discarded branch move on top of a stale worker position.
    await session.goto(3);
    await vi.waitFor(() =>
      expect(session.state.snapshot?.moves).toEqual(["7g7f", "3c3d", "2b8h+"]),
    );
    expect(session.state.line).toEqual(["7g7f", "3c3d", "2b8h+"]);
    expect(session.state.branching).toBe(false);
    session.dispose();
  });

  it("analyzes branch previews and returns to the committed record", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    await session.goto(1);
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    // A divergent move inside the record forks a preview branch; the branch
    // position analyzes without touching the record.
    await session.move("2b8h+");
    expect(session.state.branching).toBe(true);
    expect(session.state.record.moves).toEqual(["7g7f", "3c3d"]);
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    expect(record.requests[1]!.positionSfen).toBe(
      `${START_SFEN}|${["7g7f", "2b8h+"].join(",")}`,
    );
    record.settle();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    // Back to the committed record: the restored display position (record
    // ply 2) analyzes, with the discarded branch snapshot gone.
    session.discardBranch();
    expect(session.state.branching).toBe(false);
    expect(session.state.snapshot?.moves).toEqual(["7g7f", "3c3d"]);
    await vi.waitFor(() => expect(record.requests).toHaveLength(3));
    expect(record.requests[2]!.positionSfen).toBe(
      `${START_SFEN}|${["7g7f", "3c3d"].join(",")}`,
    );
    session.dispose();
  });

  it("restarts the current position when options change while armed", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    session.applyAnalysisOptions("balanced", 250, 3);
    await vi.waitFor(() => expect(record.requests).toHaveLength(2));
    const first = record.requests[0]!;
    const second = record.requests[1]!;
    expect(second.positionSfen).toBe(first.positionSfen);
    expect(second.multiPv).toBe(3);
    expect(second.searchOptionsHash).not.toBe(first.searchOptionsHash);
    expect(session.state.autoFollow).toBe(true);
    session.dispose();
  });

  it("stops cleanly when options change while disarmed", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    // Disarmed: the legacy behavior clears the current view.
    session.applyAnalysisOptions("balanced", 1000, 1);
    expect(session.state.phase).toBe("stopped");
    expect(session.state.autoFollow).toBe(false);
    expect(record.requests).toHaveLength(0);
    session.dispose();
  });

  it("leaves a running sweep and its intent untouched by navigation", async () => {
    const created: string[] = [];
    const sweepRequests: AnalysisStart[] = [];
    let moves: string[] = [];
    let current: AnalysisStart | null = null;
    let release: ((value: AnalysisResponse) => void) | null = null;
    const make = () => {
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
          sweepRequests.push(request);
          return {
            schema: "open_shogi_analysis/v1",
            event: "started",
            updates: [],
          } satisfies AnalysisResponse;
        }),
        analysisStep: vi.fn(
          () =>
            new Promise<AnalysisResponse>((resolve) => {
              release = resolve;
            }),
        ),
        analysisStop: vi.fn(async () => {
          current = null;
          return {
            schema: "open_shogi_analysis/v1",
            event: "stopped",
            updates: [],
          } satisfies AnalysisResponse;
        }),
        dispose: vi.fn(() => {
          created.push("x");
        }),
      };
      return client as unknown as PrototypeWorkerClient;
    };
    const settle = () => {
      const request = current!;
      release?.({
        schema: "open_shogi_analysis/v1",
        event: "updates",
        updates: [updateFor(request, "7g7f")],
        slice: {
          depth: 5,
          nodes: 1000,
          elapsedNs: 1_000_000,
          termination: "completed" as const,
        },
      });
      release = null;
    };
    const session = new LearnedAnalysisSession(
      () => {},
      make,
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    await session.goto(1);
    void session.sweep("balanced", 250, 1);
    await vi.waitFor(() => expect(sweepRequests).toHaveLength(1));
    // Navigating during the sweep must not kill it nor start a race.
    await session.goto(0);
    expect(session.state.phase).toBe("searching");
    expect(session.state.sweep).not.toBeNull();
    settle();
    await vi.waitFor(() => expect(sweepRequests).toHaveLength(2));
    settle();
    await vi.waitFor(() => expect(sweepRequests).toHaveLength(3));
    settle();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    expect(session.state.sweep).toBeNull();
    expect(session.state.autoFollow).toBe(false);
    expect(sweepRequests).toHaveLength(3);
    session.dispose();
  });

  it("keeps mate search one-shot and never auto-follows it", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const session = new LearnedAnalysisSession(
      () => {},
      parkingClient(record),
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1, "mate");
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    expect(session.state.autoFollow).toBe(false);
    record.settle();
    await vi.waitFor(() => expect(session.state.phase).toBe("ready"));
    const count = record.requests.length;
    await session.move("7g7f");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(record.requests).toHaveLength(count);
    expect(session.state.autoFollow).toBe(false);
    session.dispose();
  });

  it("does not resurrect a stale position after a worker failure", async () => {
    let failSteps = false;
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    let moves: string[] = [];
    const make = () => {
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
          record.requests.push(request);
          return {
            schema: "open_shogi_analysis/v1",
            event: "started",
            updates: [],
          } satisfies AnalysisResponse;
        }),
        analysisStep: vi.fn(
          () =>
            new Promise<AnalysisResponse>((_resolve, reject) => {
              if (failSteps) {
                setTimeout(
                  () => reject(new Error("Prototype Worker crashed")),
                  0,
                );
              }
            }),
        ),
        analysisStop: vi.fn(
          async () =>
            ({
              schema: "open_shogi_analysis/v1",
              event: "stopped",
              updates: [],
            }) satisfies AnalysisResponse,
        ),
        dispose: vi.fn(() => {
          record.created.push(client as never);
        }),
      };
      return client as unknown as PrototypeWorkerClient;
    };
    const session = new LearnedAnalysisSession(
      () => {},
      make,
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    void session.analyze("balanced", 250, 1);
    // Fail the very first step so the running search dies mid-position.
    failSteps = true;
    await vi.waitFor(() => expect(session.state.phase).toBe("error"));
    expect(session.state.update).toBeNull();
    expect(session.state.autoFollow).toBe(true);
    // Auto-follow must not auto-restart from the error state.
    const count = record.requests.length;
    await session.move("7g7f");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(record.requests).toHaveLength(count);
    // An explicit Start retries on the new position.
    failSteps = false;
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(count + 1));
    expect(record.requests.at(-1)!.positionSfen).toBe(`${START_SFEN}|7g7f`);
    session.stop();
    session.dispose();
  });

  it("disposes every worker it created across repeated position changes", async () => {
    const record: FakeSearch = { requests: [], settle: () => {}, created: [] };
    const created: number[] = [];
    let disposed = 0;
    let moves: string[] = [];
    let parked: ((value: AnalysisResponse) => void) | null = null;
    const make = () => {
      created.push(created.length);
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
          record.requests.push(request);
          return {
            schema: "open_shogi_analysis/v1",
            event: "started",
            updates: [],
          } satisfies AnalysisResponse;
        }),
        analysisStep: vi.fn(
          () =>
            new Promise<AnalysisResponse>((resolve) => {
              parked = resolve;
            }),
        ),
        analysisStop: vi.fn(
          async () =>
            ({
              schema: "open_shogi_analysis/v1",
              event: "stopped",
              updates: [],
            }) satisfies AnalysisResponse,
        ),
        dispose: vi.fn(() => {
          disposed += 1;
          parked?.({
            schema: "open_shogi_analysis/v1",
            event: "updates",
            updates: [],
            slice: {
              depth: 0,
              nodes: 0,
              elapsedNs: 0,
              termination: "cancelled" as const,
            },
          });
          parked = null;
        }),
      };
      return client as unknown as PrototypeWorkerClient;
    };
    const session = new LearnedAnalysisSession(
      () => {},
      make,
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3", {
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d", "2b8h+"],
    });
    void session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(record.requests).toHaveLength(1));
    for (let cursor = 2; cursor >= 0; cursor--) {
      void session.goto(cursor);
      await vi.waitFor(() => expect(record.requests).toHaveLength(4 - cursor));
    }
    session.stop();
    // Every worker created by navigation and search has been disposed; only
    // the idle navigation worker remains until dispose().
    session.dispose();
    expect(disposed).toBe(created.length);
  });
});
