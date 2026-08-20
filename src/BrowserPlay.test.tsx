/// <reference types="node" />

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  BoardPiece,
  BrowserSnapshot,
  HandPieceKind,
  PieceKind,
  Side,
} from "./browser-engine";
import {
  BOARD_FILE_LABELS,
  BOARD_RANK_LABELS,
  boardIndex,
  isBoardOnlyMode,
  ShogiBoard,
} from "./BrowserPlay";
import { getMessages } from "./localization";

const handOrder: HandPieceKind[] = [
  "rook",
  "bishop",
  "gold",
  "silver",
  "knight",
  "lance",
  "pawn",
];

function piece(index: number, side: Side, kind: PieceKind): BoardPiece {
  return {
    square: { file: 9 - (index % 9), rank: Math.floor(index / 9) + 1 },
    side,
    kind,
  };
}

function startPosition(): BrowserSnapshot {
  const board: Array<BoardPiece | null> = Array.from(
    { length: 81 },
    () => null,
  );
  const backRank: PieceKind[] = [
    "lance",
    "knight",
    "silver",
    "gold",
    "king",
    "gold",
    "silver",
    "knight",
    "lance",
  ];
  backRank.forEach((kind, column) => {
    board[column] = piece(column, "white", kind);
    board[72 + column] = piece(72 + column, "black", kind);
  });
  board[boardIndex(8, 2)] = piece(boardIndex(8, 2), "white", "rook");
  board[boardIndex(2, 2)] = piece(boardIndex(2, 2), "white", "bishop");
  board[boardIndex(8, 8)] = piece(boardIndex(8, 8), "black", "bishop");
  board[boardIndex(2, 8)] = piece(boardIndex(2, 8), "black", "rook");
  for (const file of BOARD_FILE_LABELS) {
    board[boardIndex(file, 3)] = piece(boardIndex(file, 3), "white", "pawn");
    board[boardIndex(file, 7)] = piece(boardIndex(file, 7), "black", "pawn");
  }
  const emptyHand = handOrder.map((handPiece) => ({
    piece: handPiece,
    count: 0,
  }));
  return {
    schema: "open_shogi_browser_snapshot/v1",
    engine: { name: "OpenShogiAI", version: "test" },
    initialSfen: "start",
    sfen: "start",
    sideToMove: "black",
    moveNumber: 1,
    board,
    hands: { black: emptyHand, white: emptyHand },
    legalMoves: [],
    moves: [],
    terminal: null,
    evaluator: { kind: "handcrafted-only", model: null },
  };
}

describe("browser shogi board", () => {
  it("renders all coordinates and the canonical 40-piece start geometry", () => {
    const markup = renderToStaticMarkup(
      <ShogiBoard
        disabled={false}
        messages={getMessages("ja")}
        onSquare={() => undefined}
        selection={null}
        snapshot={startPosition()}
      />,
    );

    expect(BOARD_FILE_LABELS).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(BOARD_RANK_LABELS).toEqual([
      "一",
      "二",
      "三",
      "四",
      "五",
      "六",
      "七",
      "八",
      "九",
    ]);
    expect(markup.match(/role="row"/g)).toHaveLength(9);
    expect(markup.match(/role="gridcell"/g)).toHaveLength(81);
    expect(markup.match(/class="shogi-piece/g)).toHaveLength(40);
    expect(markup.match(/shogi-piece--white/g)).toHaveLength(20);
    expect(markup.match(/shogi-piece--black/g)).toHaveLength(20);
    expect(
      markup.match(/data-kind="pawn" data-rank="3" data-side="white"/g),
    ).toHaveLength(9);
    expect(
      markup.match(/data-kind="pawn" data-rank="7" data-side="black"/g),
    ).toHaveLength(9);
    expect(markup).toContain(
      'data-file="8" data-kind="rook" data-rank="2" data-side="white"',
    );
    expect(markup).toContain(
      'data-file="2" data-kind="bishop" data-rank="2" data-side="white"',
    );
    expect(markup).toContain(
      'data-file="8" data-kind="bishop" data-rank="8" data-side="black"',
    );
    expect(markup).toContain(
      'data-file="2" data-kind="rook" data-rank="8" data-side="black"',
    );
  });

  it("rotates only white pieces and preserves equal-width hand columns", () => {
    const styles = readFileSync(
      new URL("./index.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.shogi-piece--white\s*\{[^}]*transform:\s*rotate\(180deg\)/s,
    );
    expect(styles).toMatch(
      /\.board-stage\s*\{[^}]*grid-template-columns:\s*minmax\(6\.7rem, 8\.5rem\)[^;]*minmax\(\s*6\.7rem,\s*8\.5rem\s*\)/s,
    );
  });
});

describe("serious match presentation", () => {
  it("becomes board-only only after the serious match starts", () => {
    expect(isBoardOnlyMode("analysis", false)).toBe(false);
    expect(isBoardOnlyMode("match", false)).toBe(false);
    expect(isBoardOnlyMode("match", true)).toBe(true);
  });
});
