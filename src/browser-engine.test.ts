import { describe, expect, it } from "vitest";

import {
  parseAnalysisResponse,
  parseAnalysisStart,
  parseBrowserSnapshot,
  parseSearchResponse,
  parseWorkerRequest,
  parseWorkerResponse,
  recommendedSearchProfile,
} from "./browser-engine";

const hand = [
  "rook",
  "bishop",
  "gold",
  "silver",
  "knight",
  "lance",
  "pawn",
].map((piece) => ({ piece, count: 0 }));

function snapshot() {
  return {
    schema: "open_shogi_browser_snapshot/v1",
    engine: { name: "OpenShogiAI", version: "test" },
    initialSfen: "start",
    sfen: "start",
    sideToMove: "black",
    moveNumber: 1,
    board: Array.from({ length: 81 }, (): unknown => null),
    hands: { black: hand, white: hand },
    legalMoves: [],
    moves: [],
    terminal: null,
    evaluator: { kind: "handcrafted-only", model: null },
    openingBook: null,
    openingPolicy: {
      profile: "ibisha_strict",
      maxPlies: 40,
      minimumSampleCount: 2,
      maximumTeacherLossCp: 80,
    },
  };
}

function search(lineCount: number) {
  const lines = Array.from({ length: lineCount }, (_, index) => ({
    rank: index + 1,
    bestMove: `${7 - index}g${7 - index}f`,
    scoreCp: 20 - index,
    depth: 5,
    seldepth: 5,
    nodes: 100,
    pv: [`${7 - index}g${7 - index}f`],
  }));
  return {
    schema: "open_shogi_browser_search/v1",
    timeControlSchema: "open_shogi_time_control/v1",
    timeControlMode: "profile-nodes",
    profile: "eco",
    evaluator: "overall-champion",
    perspective: "black",
    source: "search",
    bestMove: "7g7f",
    scoreCp: 20,
    depth: 5,
    seldepth: 5,
    nodes: 1_000,
    elapsedNs: 1_000,
    nps: 1_000_000,
    pv: ["7g7f"],
    termination: "node-limit",
    lines,
    stats: {
      ttProbes: 1,
      ttHits: 0,
      ttCollisions: 0,
      betaCutoffs: 0,
      candidateMoves: 30,
      prunedMoves: 0,
      qnodes: 10,
      neuralInferenceCalls: 0,
      neuralInferenceTimeNs: 0,
    },
  };
}

const hash = (digit: string) => digit.repeat(64);

function analysis(lineCount = 3) {
  const lines = Array.from({ length: lineCount }, (_, index) => ({
    rank: index + 1,
    score: 30 - index,
    mateScore: null,
    depth: 4,
    nodes: 500,
    pv: [`${7 - index}g${7 - index}f`],
  }));
  return {
    schema: "open_shogi_analysis/v1",
    event: "updates",
    updates: [
      {
        source: "search",
        canonicalPosition: "startpos",
        positionHash: "0123456789abcdef",
        modelHash: hash("1"),
        evaluatorConfigHash: hash("2"),
        featureSchemaHash: hash("3"),
        evaluationSemanticsHash: hash("4"),
        searchOptionsHash: hash("5"),
        openingProfileHash: hash("6"),
        multiPv: lineCount,
        depth: 4,
        nodes: 1_500,
        nps: 15_000,
        score: 30,
        mateScore: null,
        lines,
        rootMoveStatistics: [
          { movement: "7g7f", score: 30, depth: 4, nodes: 500, pv: ["7g7f"] },
        ],
        timestampMs: 9,
        engineVersion: "test",
      },
    ],
    slice: {
      termination: "node-limit",
      depth: 4,
      nodes: 1_500,
      elapsedNs: 10_000,
    },
  };
}

describe("browser engine protocol", () => {
  it("binds board array positions to their exact shogi squares", () => {
    const valid = snapshot();
    valid.board[0] = {
      square: { file: 9, rank: 1 },
      side: "white",
      kind: "lance",
    };
    expect(parseBrowserSnapshot(valid).board[0]?.square).toEqual({
      file: 9,
      rank: 1,
    });

    const wrong = structuredClone(valid);
    wrong.board[0] = {
      square: { file: 8, rank: 1 },
      side: "white",
      kind: "lance",
    };
    expect(() => parseBrowserSnapshot(wrong)).toThrow("wrong square");
  });

  it("accepts one to three analysis lines and rejects a fourth", () => {
    expect(parseSearchResponse(search(1)).lines).toHaveLength(1);
    expect(parseSearchResponse(search(3)).lines).toHaveLength(3);
    expect(() => parseSearchResponse(search(4))).toThrow(
      "between one and three lines",
    );
  });

  it("does not accept a protocol pseudo-kind as a successful response", () => {
    expect(() =>
      parseWorkerResponse({
        schema: "open_shogi_worker_response/v1",
        id: 1,
        ok: true,
        kind: "protocol",
        data: null,
      }),
    ).toThrow("successful worker response kind is unsupported");
  });

  it("accepts bounded continuous MultiPV updates and rejects unknown fields", () => {
    expect(parseAnalysisResponse(analysis(5)).updates[0].lines).toHaveLength(5);
    expect(() => parseAnalysisResponse(analysis(11))).toThrow(
      "lines exceeds the bound",
    );
    const unexpected = analysis();
    Object.assign(unexpected.updates[0], { staleRequestId: 4 });
    expect(() => parseAnalysisResponse(unexpected)).toThrow(
      "unsupported key set",
    );
  });

  it("binds analysis starts to complete versioned identity", () => {
    const request = {
      schema: "open_shogi_analysis/v1",
      positionSfen: "startpos",
      modelHash: hash("1"),
      evaluatorConfigHash: hash("2"),
      featureSchemaHash: hash("3"),
      evaluationSemanticsHash: hash("4"),
      searchOptionsHash: hash("5"),
      openingProfileHash: hash("6"),
      multiPv: 3,
    };
    expect(parseAnalysisStart(request)).toEqual(request);
    expect(() =>
      parseAnalysisStart({ ...request, modelHash: "not-a-hash" }),
    ).toThrow("lowercase SHA-256");
  });

  it("accepts book provenance while keeping the response source explicit", () => {
    const response = search(1);
    Object.assign(response, {
      source: "book",
      termination: "book",
      depth: 0,
      seldepth: 0,
      nodes: 0,
      elapsedNs: 0,
      nps: 0,
      openingBookMove: {
        sampleCount: 8,
        teacherScoreCp: 12,
        teacherDepth: 18,
        teacherNodes: 50_000,
        openingClassification: "ibisha",
        provenanceReferences: [hash("a")],
      },
    });
    response.lines[0].depth = 0;
    response.lines[0].seldepth = 0;
    response.lines[0].nodes = 0;
    const parsed = parseSearchResponse(response);
    expect(parsed.source).toBe("book");
    expect(parsed.openingBookMove?.teacherDepth).toBe(18);
  });

  it("does not apply the profile-node ceiling to engine-managed casual time", () => {
    const response = search(1);
    response.timeControlMode = "casual";
    response.nodes = 50_000;
    response.lines[0].nodes = 50_000;
    expect(parseSearchResponse(response).nodes).toBe(50_000);

    response.timeControlMode = "profile-nodes";
    expect(() => parseSearchResponse(response)).toThrow(
      "search.lines[0].nodes must be an integer in range",
    );
  });

  it("uses the engine's request name for the composite evaluator", () => {
    const parsed = parseWorkerRequest({
      id: 1,
      kind: "search",
      profile: "eco",
      evaluator: "model-composite",
      multiPv: 1,
      timeControl: null,
    });
    expect(parsed.kind === "search" ? parsed.evaluator : null).toBe(
      "model-composite",
    );
    expect(() =>
      parseWorkerRequest({
        id: 1,
        kind: "search",
        profile: "eco",
        evaluator: "model-composite-50-50",
        multiPv: 1,
        timeControl: null,
      }),
    ).toThrow("request.evaluator is unsupported");
  });
});

describe("bounded device profile", () => {
  it("selects only one of the fixed search budgets", () => {
    expect(
      recommendedSearchProfile({
        hardwareConcurrency: 2,
        deviceMemoryGiB: 4,
        reducedData: false,
      }),
    ).toBe("eco");
    expect(
      recommendedSearchProfile({
        hardwareConcurrency: 8,
        deviceMemoryGiB: 8,
        reducedData: false,
      }),
    ).toBe("quality");
    expect(
      recommendedSearchProfile({
        hardwareConcurrency: 6,
        deviceMemoryGiB: null,
        reducedData: false,
      }),
    ).toBe("balanced");
  });
});
