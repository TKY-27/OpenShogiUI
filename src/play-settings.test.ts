import { describe, expect, it } from "vitest";

import type {
  BoardPiece,
  BrowserSnapshot,
  HandPieceKind,
  TimeControl,
} from "./browser-engine";
import {
  boardIndex,
  browserProfileHashMegabytes,
  browserProfileNodeLimit,
  consumeMatchClock,
  DEFAULT_TIME_CONTROL,
  elapsedTurnMs,
  flippedOrientation,
  humanControlsSide,
  initialMatchClock,
  lastMoveHighlight,
  matchClockExpired,
  parseUsiMoveShape,
  resourceBudget,
  serializeTimeControl,
  takeOverSide,
  type TimeControlSettings,
} from "./play-settings";

const handPieces: HandPieceKind[] = [
  "rook",
  "bishop",
  "gold",
  "silver",
  "knight",
  "lance",
  "pawn",
];

function emptyBoard(): Array<BoardPiece | null> {
  return Array.from({ length: 81 }, () => null);
}

function snapshot(
  moves: string[] = [],
  board: Array<BoardPiece | null> = emptyBoard(),
): BrowserSnapshot {
  return {
    schema: "open_shogi_browser_snapshot/v1",
    engine: { name: "OpenShogiAI", version: "test" },
    initialSfen: "startpos",
    sfen: "startpos",
    sideToMove: "black",
    moveNumber: moves.length + 1,
    board,
    hands: {
      black: handPieces.map((piece) => ({ piece, count: 0 })),
      white: handPieces.map((piece) => ({ piece, count: 0 })),
    },
    legalMoves: [],
    moves,
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

function timeSettings(
  overrides: Partial<TimeControlSettings> = {},
): TimeControlSettings {
  return { ...DEFAULT_TIME_CONTROL, ...overrides };
}

describe("play settings", () => {
  it("maps each human role to exactly the side it controls", () => {
    expect(humanControlsSide("sente", "black")).toBe(true);
    expect(humanControlsSide("sente", "white")).toBe(false);
    expect(humanControlsSide("gote", "black")).toBe(false);
    expect(humanControlsSide("gote", "white")).toBe(true);
    expect(humanControlsSide("ai-vs-ai", "black")).toBe(false);
    expect(humanControlsSide("ai-vs-ai", "white")).toBe(false);
    expect(humanControlsSide("analysis-only", "black")).toBe(false);
    expect(humanControlsSide("analysis-only", "white")).toBe(false);
  });

  it("flips orientation and chooses takeover from the side to move", () => {
    expect(flippedOrientation("sente-bottom")).toBe("gote-bottom");
    expect(flippedOrientation("gote-bottom")).toBe("sente-bottom");
    expect(takeOverSide("black")).toBe("sente");
    expect(takeOverSide("white")).toBe("gote");
  });

  it("serializes casual, fixed, clock, and node controls without losing units", () => {
    const casual: TimeControl = serializeTimeControl(
      timeSettings({ mode: "casual" }),
    );
    expect(casual).toEqual({
      schema: "open_shogi_time_control/v1",
      casual: true,
      safetyMarginMs: 50,
    });

    expect(
      serializeTimeControl(timeSettings({ mode: "fixed", fixedSeconds: 5 })),
    ).toEqual({
      schema: "open_shogi_time_control/v1",
      movetimeMs: 5_000,
      safetyMarginMs: 50,
    });

    expect(
      serializeTimeControl(
        timeSettings({
          mode: "clock",
          mainMinutes: 3,
          byoyomiSeconds: 12,
          incrementSeconds: 2,
        }),
        { blackTimeMs: 120_000, whiteTimeMs: 90_000 },
      ),
    ).toEqual({
      schema: "open_shogi_time_control/v1",
      blackTimeMs: 120_000,
      whiteTimeMs: 90_000,
      byoyomiMs: 12_000,
      blackIncrementMs: 2_000,
      whiteIncrementMs: 2_000,
      safetyMarginMs: 50,
    });

    expect(
      serializeTimeControl(timeSettings({ mode: "nodes", nodes: 12_345 })),
    ).toEqual({
      schema: "open_shogi_time_control/v1",
      nodes: 12_345,
      safetyMarginMs: 50,
    });
  });

  it("maintains remaining match clocks without allocating search time", () => {
    expect(elapsedTurnMs(1_000, 3_500)).toBe(2_500);
    expect(elapsedTurnMs(3_500, 1_000)).toBe(0);
    expect(elapsedTurnMs(Number.NaN, 1_000)).toBe(0);
    expect(initialMatchClock(timeSettings({ mainMinutes: 3 }))).toEqual({
      blackTimeMs: 180_000,
      whiteTimeMs: 180_000,
    });
    expect(
      consumeMatchClock(
        { blackTimeMs: 120_000, whiteTimeMs: 90_000 },
        "black",
        12_500,
        2,
      ),
    ).toEqual({ blackTimeMs: 109_500, whiteTimeMs: 90_000 });
    expect(
      consumeMatchClock(
        { blackTimeMs: 0, whiteTimeMs: 900 },
        "white",
        1_200,
        1,
      ),
    ).toEqual({ blackTimeMs: 0, whiteTimeMs: 1_000 });
    expect(
      matchClockExpired(
        { blackTimeMs: 1_000, whiteTimeMs: 0 },
        "black",
        31_000,
        30,
      ),
    ).toBe(false);
    expect(
      matchClockExpired(
        { blackTimeMs: 1_000, whiteTimeMs: 0 },
        "black",
        31_001,
        30,
      ),
    ).toBe(true);
    expect(
      matchClockExpired(
        { blackTimeMs: 604_800_000, whiteTimeMs: 0 },
        "black",
        604_800_001,
        0,
      ),
    ).toBe(true);
  });

  it("uses the frozen browser profile node and hash bounds", () => {
    const profiles = ["eco", "balanced", "quality"] as const;
    expect(profiles.map(browserProfileNodeLimit)).toEqual([
      1_500, 4_000, 12_000,
    ]);
    expect(profiles.map(browserProfileHashMegabytes)).toEqual([2, 4, 8]);
    expect(() =>
      serializeTimeControl(
        timeSettings({ mode: "nodes", nodes: 1_501 }),
        undefined,
        browserProfileNodeLimit("eco"),
      ),
    ).toThrow("value must be between 1 and 1500");
  });

  it("keeps play and analysis memory budgets explicit and bounded", () => {
    expect(resourceBudget(256, 128, true)).toEqual({
      schema: "open_shogi_resource_budget/v1",
      playThreads: 1,
      analysisThreads: 1,
      playHashMegabytes: 256,
      analysisHashMegabytes: 128,
      analysisPauseDuringAiTurn: true,
      maximumAggregateMemoryMegabytes: 448,
    });
    expect(resourceBudget(256, 0, false).analysisThreads).toBe(0);
    expect(resourceBudget(8, 8, true, false)).toMatchObject({
      analysisThreads: 0,
      analysisHashMegabytes: 8,
    });
  });
});

describe("USI move shape and last-move presentation", () => {
  it("parses normal, promoted, and drop notation into board coordinates", () => {
    expect(parseUsiMoveShape("7g7f")).toEqual({
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
    });
    expect(parseUsiMoveShape("2b3c+")).toEqual({
      from: { file: 2, rank: 2 },
      to: { file: 3, rank: 3 },
    });
    expect(parseUsiMoveShape("P*5e")).toEqual({
      from: null,
      to: { file: 5, rank: 5 },
    });
    expect(() => parseUsiMoveShape("7g7")).toThrow(
      "movement must be legal USI notation",
    );
    expect(() => parseUsiMoveShape("p*5e")).toThrow(
      "movement must be legal USI notation",
    );
  });

  it("marks the origin, destination, capture, and promotion of a normal move", () => {
    const previousBoard = emptyBoard();
    previousBoard[boardIndex(7, 6)] = {
      square: { file: 7, rank: 6 },
      side: "white",
      kind: "pawn",
    };
    const history = [snapshot(), snapshot(["7g7f+"])];

    expect(lastMoveHighlight(history, 1)).toEqual({
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      drop: false,
      capture: false,
      promotion: true,
    });

    history[0] = snapshot([], previousBoard);
    expect(lastMoveHighlight(history, 1)).toEqual({
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      drop: false,
      capture: true,
      promotion: true,
    });
  });

  it("marks a drop and has no highlight for the initial or out-of-range snapshot", () => {
    const history = [snapshot(), snapshot(["P*5e"])];
    expect(lastMoveHighlight(history, 1)).toEqual({
      from: null,
      to: { file: 5, rank: 5 },
      drop: true,
      capture: false,
      promotion: false,
    });
    expect(lastMoveHighlight(history, 0)).toBeNull();
    expect(lastMoveHighlight(history, 2)).toBeNull();
    expect(lastMoveHighlight([snapshot(), snapshot()], 1)).toBeNull();
  });
});
