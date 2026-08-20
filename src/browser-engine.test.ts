import { describe, expect, it } from "vitest";

import {
  parseBrowserSnapshot,
  parseSearchResponse,
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
    profile: "eco",
    evaluator: "handcrafted",
    perspective: "black",
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
