import { describe, expect, it } from "vitest";

import type {
  BoardPiece,
  BrowserSnapshot,
  PieceKind,
  Side,
} from "./browser-engine";
import { kifuFileName, toKif, toUsi, type KifuGame } from "./kifu";
import { boardIndex } from "./play-settings";

function emptyHand() {
  return (
    ["rook", "bishop", "gold", "silver", "knight", "lance", "pawn"] as const
  ).map((piece) => ({ piece, count: 0 }));
}

function snapshot(
  moves: string[],
  sideToMove: Side,
  pieces: Array<[number, number, Side, PieceKind]>,
): BrowserSnapshot {
  const board: Array<BoardPiece | null> = Array.from(
    { length: 81 },
    () => null,
  );
  for (const [file, rank, side, kind] of pieces) {
    board[boardIndex(file, rank)] = { square: { file, rank }, side, kind };
  }
  return {
    schema: "open_shogi_browser_snapshot/v1",
    engine: { name: "OpenShogiAI", version: "test" },
    initialSfen: "startpos",
    sfen: "startpos",
    sideToMove,
    moveNumber: moves.length + 1,
    board,
    hands: { black: emptyHand(), white: emptyHand() },
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
  } as BrowserSnapshot;
}

/**
 * A four-ply game that exercises every notation branch that matters:
 * an ordinary move, a capture on the square just played to (同), a promotion,
 * and a drop.
 */
function game(): KifuGame {
  return {
    snapshots: [
      snapshot([], "black", [
        [7, 7, "black", "pawn"],
        [3, 3, "white", "pawn"],
        [8, 8, "black", "bishop"],
        [2, 2, "white", "bishop"],
      ]),
      snapshot(["7g7f"], "white", [
        [7, 6, "black", "pawn"],
        [3, 3, "white", "pawn"],
        [8, 8, "black", "bishop"],
        [2, 2, "white", "bishop"],
      ]),
      snapshot(["7g7f", "2b8h+"], "black", [
        [7, 6, "black", "pawn"],
        [3, 3, "white", "pawn"],
        [8, 8, "white", "horse"],
        // The silver that recaptures on the next ply must be on the board for
        // the exporter to name it.
        [8, 9, "black", "silver"],
      ]),
      snapshot(["7g7f", "2b8h+", "8i8h"], "white", [
        [7, 6, "black", "pawn"],
        [3, 3, "white", "pawn"],
        [8, 8, "black", "silver"],
      ]),
      snapshot(["7g7f", "2b8h+", "8i8h", "B*4e"], "black", [
        [7, 6, "black", "pawn"],
        [3, 3, "white", "pawn"],
        [8, 8, "black", "silver"],
        [4, 5, "white", "bishop"],
      ]),
    ],
    blackName: "あなた",
    whiteName: "AI",
    timeControl: "3分切れ負け",
    moveTimesMs: [3_000, 8_000, 2_000, 61_000],
    terminationLabel: "投了",
    startedAt: new Date(2026, 7, 21, 9, 5, 0),
  };
}

describe("USI export", () => {
  it("emits a startpos line with every move", () => {
    expect(toUsi(game())).toBe("position startpos moves 7g7f 2b8h+ 8i8h B*4e");
  });

  it("emits a bare startpos before the first move", () => {
    const empty = { ...game(), snapshots: [game().snapshots[0]] };
    expect(toUsi(empty)).toBe("position startpos");
  });

  it("falls back to SFEN for a non-standard starting position", () => {
    const custom = game();
    custom.snapshots = custom.snapshots.map((s) => ({
      ...s,
      initialSfen: "lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/9/LNSGKGSNL b - 1",
    }));
    expect(toUsi(custom)).toContain(
      "position sfen lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/9/LNSGKGSNL b - 1 moves 7g7f",
    );
  });
});

describe("KIF export", () => {
  const text = toKif(game());

  it("writes the standard header block", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("#KIF version=2.0 encoding=UTF-8");
    expect(lines[1]).toBe("開始日時：2026/08/21 09:05:00");
    expect(lines[2]).toBe("手合割：平手");
    expect(lines[3]).toBe("先手：あなた");
    expect(lines[4]).toBe("後手：AI");
    expect(lines[5]).toBe("持ち時間：3分切れ負け");
    expect(lines[6]).toBe("手数----指手---------消費時間--");
  });

  it("names the moved piece from the board, not from the coordinates", () => {
    // 7g7f is a pawn; 2b8h+ is a bishop promoting; 8i8h is a silver.
    expect(text).toContain("７六歩(77)");
    expect(text).toContain("８八角成(22)");
  });

  it("writes 同 for a recapture on the square just played to", () => {
    // 8i8h lands on 8h, where the previous move landed.
    expect(text).toContain("同　銀(89)");
    expect(text).not.toContain("８八銀(89)");
  });

  it("marks drops with 打 and no origin", () => {
    expect(text).toContain("４五角打");
  });

  it("reports per-move and cumulative time per side", () => {
    // Black: 3s then 2s -> cumulative 5s. White: 8s then 61s -> 1:09.
    expect(text).toContain("( 0:03/00:00:03)");
    expect(text).toContain("( 0:08/00:00:08)");
    expect(text).toContain("( 0:02/00:00:05)");
    expect(text).toContain("( 1:01/00:01:09)");
  });

  it("numbers plies and appends the termination", () => {
    const lines = text.trim().split("\n");
    expect(lines[7].startsWith("   1 ")).toBe(true);
    expect(lines.at(-1)?.trim()).toBe("5 投了");
  });

  it("ends with a trailing newline", () => {
    expect(text.endsWith("\n")).toBe(true);
  });

  it("omits the termination line when the game is unfinished", () => {
    const unfinished = { ...game(), terminationLabel: undefined };
    expect(toKif(unfinished)).not.toContain("投了");
  });
});

describe("file naming", () => {
  it("stamps the local date and time", () => {
    expect(kifuFileName("match", "kif", new Date(2026, 7, 21, 9, 5, 7))).toBe(
      "match-20260821-090507.kif",
    );
  });
});
