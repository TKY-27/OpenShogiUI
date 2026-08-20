import { describe, expect, it } from "vitest";

import {
  ARENA_REPORT_SCHEMA_V1,
  ARENA_REPORT_SCHEMA_V2,
  ArenaReportV1,
  ArenaReportV2,
  importReducer,
  initialImportState,
  parseArenaReport,
} from "./arena-report";

const v1Report: ArenaReportV1 = {
  schema: ARENA_REPORT_SCHEMA_V1,
  run: {
    seed: 42,
    gameLimit: 3,
    engine: "open-shogi-ai 0.1.0",
    gitCommit: null,
    startedAt: "2026-07-29T00:00:00Z",
    completedAt: "2026-07-29T00:01:00Z",
  },
  metrics: {
    games: 3,
    finishedGames: 2,
    searchWins: 1,
    draws: 1,
    nodesPerSecond: 2_845_913,
    averageDepth: 21.37,
    ttHitRate: 0.738,
    cutoffRate: 0.862,
    pruningRate: 0.48,
    millisecondsPerMove: 142,
    peakMemoryBytes: null,
    illegalMoves: 0,
  },
  games: [
    {
      id: 1,
      black: "search:d4:h16:tton",
      white: "random",
      result: "black_win",
      moves: 97,
      csaPath: "games/0001.csa",
    },
    {
      id: 2,
      black: "random",
      white: "search",
      result: "draw",
      moves: 214,
      csaPath: null,
    },
    {
      id: 3,
      black: "search",
      white: "random",
      result: "max_plies",
      moves: 0,
      csaPath: null,
    },
  ],
};

const neuralHash = "a".repeat(64);
const payloadHash = "b".repeat(64);
const configHash = "c".repeat(64);
const csaHashes = ["d".repeat(64), "e".repeat(64)];

const v2Report: ArenaReportV2 = {
  schema: ARENA_REPORT_SCHEMA_V2,
  run: {
    seed: 20260808,
    gameLimit: 2,
    engine:
      "OpenShogiAI 0.0.0 a=search:neural:d4:h16:tt-on:book-off:m-aaaaaaaaaaaa b=search:material:d4:h16:tt-on:book-off budget=Nodes(500)",
    gitCommit: "abcdef0123456789",
    startedAt: "2026-08-13T00:00:00Z",
    completedAt: "2026-08-13T00:00:05Z",
    initialSfen:
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    maxPlies: 4,
    configSha256: configHash,
    budget: { kind: "nodes", value: 500 },
    playerA: {
      label: "search:neural:d4:h16:tt-on:book-off:m-aaaaaaaaaaaa",
      evaluatorKind: "neural",
      searchDepth: 4,
      hashMegabytes: 16,
      transposition: true,
      modelArtifactSha256: neuralHash,
      modelArtifactSize: 602_736,
      modelPayloadSha256: payloadHash,
      architectureVersion: 1,
      quantization: "float32",
      openingEnabled: false,
    },
    playerB: {
      label: "search:material:d4:h16:tt-on:book-off",
      evaluatorKind: "material",
      searchDepth: 4,
      hashMegabytes: 16,
      transposition: true,
      modelArtifactSha256: null,
      modelArtifactSize: null,
      modelPayloadSha256: null,
      architectureVersion: null,
      quantization: null,
      openingEnabled: false,
    },
    opening: {
      enabled: false,
      artifactSha256: null,
      artifactSize: null,
      maxPlies: null,
    },
  },
  metrics: {
    games: 2,
    finishedGames: 2,
    playerAWins: 1,
    playerBWins: 0,
    searchWins: 1,
    draws: 1,
    nodesPerSecond: 125_000,
    averageDepth: 1.25,
    ttHitRate: 0.1,
    cutoffRate: 0.2,
    pruningRate: 0.3,
    millisecondsPerMove: 1.75,
    neuralInferenceCalls: 12,
    neuralInferenceTimeNs: 1_200,
    playerASearchNodes: 1_000,
    playerASearchElapsedMs: 8,
    playerADepthSum: 6,
    playerASearches: 4,
    playerANeuralInferenceCalls: 12,
    playerANeuralInferenceTimeNs: 1_200,
    playerBSearchNodes: 750,
    playerBSearchElapsedMs: 6,
    playerBDepthSum: 4,
    playerBSearches: 4,
    playerBNeuralInferenceCalls: 0,
    playerBNeuralInferenceTimeNs: 0,
    peakMemoryBytes: null,
    illegalMoves: 0,
  },
  games: [
    {
      id: 0,
      black: "search:neural:d4:h16:tt-on:book-off:m-aaaaaaaaaaaa",
      white: "search:material:d4:h16:tt-on:book-off",
      result: "black_win",
      moves: 3,
      csaPath: "games/game-000001.csa",
      csaSha256: csaHashes[0],
      csaSize: 500,
      neuralInferenceCalls: 8,
      neuralInferenceTimeNs: 800,
      playerASearchNodes: 500,
      playerASearchElapsedMs: 4,
      playerADepthSum: 4,
      playerASearches: 2,
      playerANeuralInferenceCalls: 8,
      playerANeuralInferenceTimeNs: 800,
      playerBSearchNodes: 250,
      playerBSearchElapsedMs: 2,
      playerBDepthSum: 2,
      playerBSearches: 2,
      playerBNeuralInferenceCalls: 0,
      playerBNeuralInferenceTimeNs: 0,
    },
    {
      id: 1,
      black: "search:material:d4:h16:tt-on:book-off",
      white: "search:neural:d4:h16:tt-on:book-off:m-aaaaaaaaaaaa",
      result: "draw",
      moves: 4,
      csaPath: "games/game-000002.csa",
      csaSha256: csaHashes[1],
      csaSize: 550,
      neuralInferenceCalls: 4,
      neuralInferenceTimeNs: 400,
      playerASearchNodes: 500,
      playerASearchElapsedMs: 4,
      playerADepthSum: 2,
      playerASearches: 2,
      playerANeuralInferenceCalls: 4,
      playerANeuralInferenceTimeNs: 400,
      playerBSearchNodes: 500,
      playerBSearchElapsedMs: 4,
      playerBDepthSum: 2,
      playerBSearches: 2,
      playerBNeuralInferenceCalls: 0,
      playerBNeuralInferenceTimeNs: 0,
    },
  ],
};

function withV2(mutator: (copy: ArenaReportV2) => void): string {
  const copy = structuredClone(v2Report);
  mutator(copy);
  return JSON.stringify(copy);
}

describe("phase2 arena report parser", () => {
  it("keeps complete and internally consistent v1 artifacts compatible", () => {
    expect(parseArenaReport(JSON.stringify(v1Report))).toEqual(v1Report);
  });

  it("keeps v1 closed-field, outcome, timestamp, and text bounds", () => {
    expect(() =>
      parseArenaReport(JSON.stringify({ ...v1Report, extra: true })),
    ).toThrow("unsupported field");
    expect(() =>
      parseArenaReport(
        JSON.stringify({
          ...v1Report,
          metrics: { ...v1Report.metrics, draws: 0 },
        }),
      ),
    ).toThrow("metrics.draws");
    expect(() =>
      parseArenaReport(
        JSON.stringify({
          ...v1Report,
          run: { ...v1Report.run, startedAt: "2026-02-30T12:00:00Z" },
        }),
      ),
    ).toThrow("run.startedAt");
    expect(() =>
      parseArenaReport(
        JSON.stringify({
          ...v1Report,
          run: { ...v1Report.run, engine: "a".repeat(1025) },
        }),
      ),
    ).toThrow("run.engine");
  });

  it("accepts a complete v2 artifact and preserves all immutable identities", () => {
    const parsed = parseArenaReport(JSON.stringify(v2Report));

    expect(parsed).toEqual(v2Report);
    expect(parsed.schema).toBe(ARENA_REPORT_SCHEMA_V2);
    if (parsed.schema === ARENA_REPORT_SCHEMA_V2) {
      expect(parsed.run.playerA.modelArtifactSha256).toBe(neuralHash);
      expect(parsed.games[0].csaSha256).toBe(csaHashes[0]);
    }
  });

  it("accepts the v2 movetime budget and complete opening identity variants", () => {
    const movetime = parseArenaReport(
      withV2((copy) => {
        copy.run.budget = { kind: "movetime_ms", value: 25 };
        copy.run.engine = copy.run.engine.replace(
          "budget=Nodes(500)",
          "budget=MoveTime(25)",
        );
      }),
    );
    expect(movetime.schema).toBe(ARENA_REPORT_SCHEMA_V2);

    const opening = parseArenaReport(
      withV2((copy) => {
        const oldLabel = copy.run.playerB.label;
        const newLabel = oldLabel.replace("book-off", "book-on");
        copy.run.playerB.openingEnabled = true;
        copy.run.playerB.label = newLabel;
        copy.run.engine = copy.run.engine.replace(oldLabel, newLabel);
        for (const game of copy.games) {
          if (game.black === oldLabel) game.black = newLabel;
          if (game.white === oldLabel) game.white = newLabel;
        }
        copy.run.opening = {
          enabled: true,
          artifactSha256: "f".repeat(64),
          artifactSize: 42_000,
          maxPlies: 24,
        };
      }),
    );
    expect(opening.schema).toBe(ARENA_REPORT_SCHEMA_V2);
    if (opening.schema === ARENA_REPORT_SCHEMA_V2) {
      expect(opening.run.opening.enabled).toBe(true);
    }
  });

  it("rejects unknown fields in every closed v2 level", () => {
    const targets: Array<(copy: ArenaReportV2) => void> = [
      (copy) => Object.assign(copy, { extra: true }),
      (copy) => Object.assign(copy.run, { extra: true }),
      (copy) => Object.assign(copy.run.playerA, { extra: true }),
      (copy) => Object.assign(copy.run.opening, { extra: true }),
      (copy) => Object.assign(copy.metrics, { extra: true }),
      (copy) => Object.assign(copy.games[0], { extra: true }),
    ];
    for (const mutate of targets) {
      expect(() => parseArenaReport(withV2(mutate))).toThrow(
        "unsupported field",
      );
    }
  });

  it("rejects partial or inconsistent model and opening identities", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.playerA.modelPayloadSha256 = null;
        }),
      ),
    ).toThrow("run.playerA.modelPayloadSha256");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.playerB.modelArtifactSha256 = "f".repeat(64);
        }),
      ),
    ).toThrow("run.playerB.modelArtifactSha256");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.opening.enabled = true;
        }),
      ),
    ).toThrow("run.opening.artifactSha256");
  });

  it("rejects player labels, color schedules, and CSA paths that drift from identity", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.playerA.label =
            "search:neural:d4:h16:tt-off:book-off:m-aaaaaaaaaaaa";
        }),
      ),
    ).toThrow("run.playerA.label");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.engine = "OpenShogiAI a=other b=other budget=Nodes(500)";
        }),
      ),
    ).toThrow("run.engine");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.engine = copy.run.engine.replace(
            "OpenShogiAI 0.0.0 ",
            "OpenShogiAI 0.0.0 forged-metadata ",
          );
        }),
      ),
    ).toThrow("run.engine");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          [copy.games[0].black, copy.games[0].white] = [
            copy.games[0].white,
            copy.games[0].black,
          ];
        }),
      ),
    ).toThrow("color schedule");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[0].csaPath = "games/wrong.csa";
        }),
      ),
    ).toThrow("csaPath");
  });

  it("rejects malformed hashes and CSA sizes", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[0].csaSha256 = "A".repeat(64);
        }),
      ),
    ).toThrow("games[0].csaSha256");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[0].csaSize = 0;
        }),
      ),
    ).toThrow("games[0].csaSize");
  });

  it("rejects invalid JSON, missing fields, rates, and game IDs", () => {
    expect(() => parseArenaReport("{")).toThrow("not valid JSON");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          delete (copy.metrics as Partial<typeof copy.metrics>).pruningRate;
        }),
      ),
    ).toThrow('missing required field "pruningRate"');
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.metrics.ttHitRate = 1.01;
        }),
      ),
    ).toThrow("metrics.ttHitRate");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[1].id = 0;
        }),
      ),
    ).toThrow("zero-based position");
  });

  it("rejects A/B win totals and per-player aggregates that do not match games", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.metrics.playerAWins = 0;
        }),
      ),
    ).toThrow("A/B wins");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.metrics.playerASearchNodes += 1;
        }),
      ),
    ).toThrow("metrics.playerASearchNodes");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.metrics.neuralInferenceCalls += 1;
        }),
      ),
    ).toThrow("metrics.neuralInferenceCalls");
  });

  it("rejects derived search metrics that disagree with the exact Rust ratios", () => {
    for (const metric of [
      "nodesPerSecond",
      "averageDepth",
      "millisecondsPerMove",
    ] as const) {
      expect(() =>
        parseArenaReport(
          withV2((copy) => {
            copy.metrics[metric] += 0.000001;
          }),
        ),
      ).toThrow(`metrics.${metric}`);
    }
  });

  it("range-checks report-only rates without claiming unavailable counter derivation", () => {
    const parsed = parseArenaReport(
      withV2((copy) => {
        copy.metrics.ttHitRate = 0.999999;
        copy.metrics.cutoffRate = 0.000001;
        copy.metrics.pruningRate = 0.5;
      }),
    );

    expect(parsed.metrics.ttHitRate).toBe(0.999999);
    expect(parsed.metrics.cutoffRate).toBe(0.000001);
    expect(parsed.metrics.pruningRate).toBe(0.5);
  });

  it("rejects game counters inconsistent with the configured players and budget", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[0].playerBNeuralInferenceCalls = 1;
          copy.games[0].neuralInferenceCalls = 9;
          copy.metrics.playerBNeuralInferenceCalls = 1;
          copy.metrics.neuralInferenceCalls = 13;
        }),
      ),
    ).toThrow("non-neural player");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[0].playerASearchNodes = 1_001;
          copy.metrics.playerASearchNodes = 1_501;
        }),
      ),
    ).toThrow("search counters");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.games[0].playerASearches = 3;
        }),
      ),
    ).toThrow("games[0].searches");
  });

  it("requires a completed v2 run to contain its full game limit", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.gameLimit = 3;
        }),
      ),
    ).toThrow("completed v2 run");
  });

  it("rejects impossible timestamps and unsupported schema drift", () => {
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.startedAt = "2026-02-30T12:00:00Z";
        }),
      ),
    ).toThrow("run.startedAt");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.startedAt = "2026-08-13T08:00:00+08:00";
        }),
      ),
    ).toThrow("canonical UTC");
    expect(() =>
      parseArenaReport(
        withV2((copy) => {
          copy.run.initialSfen = "not-sfen";
        }),
      ),
    ).toThrow("run.initialSfen");
    expect(() =>
      parseArenaReport(
        JSON.stringify({ ...v1Report, schema: "phase2_arena_report/v3" }),
      ),
    ).toThrow("phase2_arena_report/v2");
  });

  it("accepts canonical initial SFEN syntax emitted by the Rust writer", () => {
    for (const sfen of [
      "4k4/9/9/9/9/9/9/4+P4/4K4 b - 1",
      "4k4/9/9/9/9/9/9/9/4K4 w RBGSNLP 1",
      "4k4/9/9/9/9/9/9/9/4K4 b 18P 1",
    ]) {
      const parsed = parseArenaReport(
        withV2((copy) => {
          copy.run.initialSfen = sfen;
        }),
      );
      expect(parsed.schema).toBe(ARENA_REPORT_SCHEMA_V2);
      if (parsed.schema === ARENA_REPORT_SCHEMA_V2) {
        expect(parsed.run.initialSfen).toBe(sfen);
      }
    }
  });

  it("rejects noncanonical or structurally invalid initial SFEN", () => {
    const invalidSfens = [
      "99/9/9/9/9/9/9/9/9 b - 1",
      "9/9/9/9/9/9/9/9/9 b - 1",
      "4k4/9/9/9/9/9/9/9/4K3K b - 1",
      "4k4/9/9/9/9/9/9/9/4+G3K b - 1",
      "4k4/9/9/9/9/9/9/9/45K b - 1",
      "4k4/9/9/9/9/9/9/9/4K4 b PR 1",
      "4k4/9/9/9/9/9/9/9/4K4 b 1P 1",
      "4k4/9/9/9/9/9/9/9/4K4 b 02P 1",
      "4k4/9/9/9/9/9/9/9/4K4 b PP 1",
      "4k4/9/9/9/9/9/9/9/4K4 b K 1",
      "4k4/9/9/9/9/9/9/9/4K4 b 19P 1",
      "4P3k/9/9/9/9/9/9/9/4K4 b - 1",
      "4k4/9/4P4/4P4/9/9/9/9/4K4 b - 1",
      "4k4/9/9/9/9/9/9/9/4K4 b - 2",
    ];
    for (const sfen of invalidSfens) {
      expect(() =>
        parseArenaReport(
          withV2((copy) => {
            copy.run.initialSfen = sfen;
          }),
        ),
      ).toThrow("run.initialSfen");
    }
  });

  it("rejects negative zero before it can reach counters or display", () => {
    const report = JSON.stringify(v2Report);
    expect(() =>
      parseArenaReport(report.replace('"illegalMoves":0', '"illegalMoves":-0')),
    ).toThrow("metrics.illegalMoves");
    expect(() =>
      parseArenaReport(report.replace('"ttHitRate":0.1', '"ttHitRate":-0')),
    ).toThrow("metrics.ttHitRate");
  });
});

describe("arena report import reducer", () => {
  it("suppresses a stale file read after a newer import begins", () => {
    const loadingFirst = importReducer(initialImportState, {
      type: "importStarted",
      requestId: 1,
      fileName: "first.json",
    });
    const loadingSecond = importReducer(loadingFirst, {
      type: "importStarted",
      requestId: 2,
      fileName: "second.json",
    });
    const state = importReducer(loadingSecond, {
      type: "importSucceeded",
      requestId: 1,
      report: v2Report,
      fileName: "first.json",
      byteSize: 12,
      loadedAt: "2026-07-29T00:00:00Z",
    });

    expect(state).toEqual(loadingSecond);
  });
});
