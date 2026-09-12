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
  promotedKind,
  resolveBoardClick,
  ShogiBoard,
  toggleHandSelection,
} from "./ShogiBoardView";
import { getMessages } from "./localization";
import { BrowserPlay } from "./BrowserPlay";

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
    openingBook: null,
    openingPolicy: {
      profile: "ibisha_strict",
      maxPlies: 40,
      minimumSampleCount: 2,
      maximumTeacherLossCp: 80,
    },
  };
}

describe("book-free development play", () => {
  it("offers ordinary search without book upload or opening profile controls", () => {
    const markup = renderToStaticMarkup(<BrowserPlay locale="en" />);
    expect(markup).toContain("No opening book; ordinary search only");
    expect(markup).not.toContain('id="book-file"');
    expect(markup).not.toContain("Opening profile");
    expect(markup).toContain('id="model-file"');
  });
});

describe("browser shogi board", () => {
  it("shares board and hand selection decisions across both play routes", () => {
    const position = startPosition();
    position.legalMoves = [
      {
        usi: "7g7f",
        from: { file: 7, rank: 7 },
        to: { file: 7, rank: 6 },
        drop: null,
        promote: false,
      },
    ];
    const origin = boardIndex(7, 7);
    const destination = boardIndex(7, 6);
    const selected = resolveBoardClick(position, null, origin);
    expect(selected).toEqual({
      kind: "selection",
      selection: { kind: "board", index: origin },
    });
    expect(
      resolveBoardClick(
        position,
        selected.kind === "selection" ? selected.selection : null,
        destination,
      ),
    ).toMatchObject({ kind: "move", candidates: [{ usi: "7g7f" }] });
    expect(toggleHandSelection(null, "pawn")).toEqual({
      kind: "hand",
      piece: "pawn",
    });
    expect(toggleHandSelection({ kind: "hand", piece: "pawn" }, "pawn")).toBe(
      null,
    );
  });

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
    expect(markup.match(/class="piece-image"/g)).toHaveLength(40);
    expect(markup.match(/src="[^"]+\/0[A-Z]{2}\.svg"/g)).toHaveLength(20);
    expect(markup.match(/src="[^"]+\/1[A-Z]{2}\.svg"/g)).toHaveLength(20);
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

  it("keeps a fixed piece frame and rotates the complete asset orientation on flip", () => {
    const styles = readFileSync(
      new URL("./index.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.piece-frame--flipped\s*\{[^}]*transform:\s*rotate\(180deg\)/s,
    );
    expect(styles).toMatch(
      /\.piece-image\s*\{[^}]*width:\s*90%;[^}]*height:\s*90%/s,
    );
  });

  it("renders orientation-aware highlights and preserves board-square semantics", () => {
    const markup = renderToStaticMarkup(
      <ShogiBoard
        disabled={false}
        lastMove={{
          from: { file: 7, rank: 7 },
          to: { file: 7, rank: 6 },
          drop: false,
          capture: true,
          promotion: true,
        }}
        messages={getMessages("en")}
        onSquare={() => undefined}
        orientation="gote-bottom"
        pieceSet="kanji_brown"
        selection={null}
        snapshot={startPosition()}
      />,
    );

    const firstSquare = markup.match(
      /<button[^>]*class="board-square[^>]*>/,
    )?.[0];
    expect(firstSquare).toContain('data-file="1"');
    expect(firstSquare).toContain('data-rank="9"');
    expect(markup).toMatch(/board-square--last-origin/);
    expect(markup).toMatch(/board-square--last-destination/);
    expect(markup).toMatch(/board-square--last-capture/);
    expect(markup).toMatch(/board-square--last-promotion/);
    expect(markup).toContain("last move origin");
    expect(markup).toContain("last move destination");
  });

  it("keeps image failure fallback and desktop/mobile layout contracts explicit", () => {
    const source = readFileSync(
      new URL("./ShogiBoardView.tsx", import.meta.url),
      "utf8",
    );
    const styles = readFileSync(
      new URL("./index.css", import.meta.url),
      "utf8",
    );
    const desktopLayout = styles.slice(
      styles.lastIndexOf("@media (min-width: 80rem)"),
    );

    expect(source).toContain("const [failed, setFailed] = useState(false);");
    expect(source).toContain("onError={() => setFailed(true)}");
    expect(source).toContain(
      "useEffect(() => setFailed(false), [kind, setId, side]);",
    );
    expect(source).toContain("className={`shogi-piece shogi-piece--${side}`}");
    // Mobile-first: a single stacked column is the base rule, and the rail /
    // board / analysis columns only appear from the desktop breakpoint up.
    expect(styles).toMatch(
      /\.analysis-layout\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    );
    expect(styles).toMatch(
      /\.board-stage\s*\{[^}]*grid-template-areas:\s*\n?\s*"gote"\s*"board"\s*"sente"/s,
    );
    expect(desktopLayout).toMatch(
      /\.analysis-layout\s*\{[^}]*grid-template-columns:\s*\n?\s*minmax\(0, var\(--rail-width\)\) minmax\(0, 1fr\)/s,
    );
    // Hand stands flank the board once there is width for them.
    expect(styles).toMatch(
      /\.board-stage\s*\{[^}]*grid-template-areas:\s*"gote board sente"/s,
    );
  });
});

describe("promotion picker", () => {
  const promotionMoves = [
    {
      usi: "8h2b",
      from: { file: 8, rank: 8 },
      to: { file: 2, rank: 2 },
      drop: null,
      promote: false,
    },
    {
      usi: "8h2b+",
      from: { file: 8, rank: 8 },
      to: { file: 2, rank: 2 },
      drop: null,
      promote: true,
    },
  ];

  function render() {
    return renderToStaticMarkup(
      <ShogiBoard
        disabled={false}
        messages={getMessages("ja")}
        onSquare={() => undefined}
        promotion={{
          moves: promotionMoves,
          onCancel: () => undefined,
          onChoose: () => undefined,
        }}
        selection={null}
        snapshot={startPosition()}
      />,
    );
  }

  it("maps every promotable kind to the piece it becomes", () => {
    expect(promotedKind("pawn")).toBe("promoted-pawn");
    expect(promotedKind("lance")).toBe("promoted-lance");
    expect(promotedKind("knight")).toBe("promoted-knight");
    expect(promotedKind("silver")).toBe("promoted-silver");
    expect(promotedKind("bishop")).toBe("horse");
    expect(promotedKind("rook")).toBe("dragon");
    // A gold or king never promotes and must map to itself.
    expect(promotedKind("gold")).toBe("gold");
    expect(promotedKind("king")).toBe("king");
    expect(promotedKind("horse")).toBe("horse");
  });

  it("shows the resulting piece for each option rather than only words", () => {
    const markup = render();
    // 0KA is the bishop and 0UM the horse it becomes.
    expect(markup).toContain("0KA.svg");
    expect(markup).toContain("0UM.svg");
    expect(markup).toContain("成る");
    expect(markup).toContain("成らない");
  });

  it("offers promotion first", () => {
    const markup = render();
    expect(markup.indexOf("成る")).toBeLessThan(markup.indexOf("成らない"));
  });

  it("stays a labelled, focusable group instead of a modal dialog", () => {
    const markup = render();
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="成りますか？"');
    expect(markup).not.toContain("<dialog");
  });

  it("anchors to the destination square and flips near the right edge", () => {
    // 2b sits in the right-hand columns, so the picker opens leftwards.
    expect(render()).toContain("promotion-picker--left");
  });

  it("opens rightwards and downwards away from the edges", () => {
    // 7c is column 2, row 2: room on both sides.
    const markup = renderToStaticMarkup(
      <ShogiBoard
        disabled={false}
        messages={getMessages("ja")}
        onSquare={() => undefined}
        promotion={{
          moves: [
            {
              usi: "7g7c+",
              from: { file: 7, rank: 7 },
              to: { file: 7, rank: 3 },
              drop: null,
              promote: true,
            },
          ],
          onCancel: () => undefined,
          onChoose: () => undefined,
        }}
        selection={null}
        snapshot={startPosition()}
      />,
    );
    expect(markup).not.toContain("promotion-picker--left");
    expect(markup).not.toContain("promotion-picker--up");
  });

  it("opens upwards on the near ranks so it stays on the board", () => {
    // A drop on 5h is row 7, close enough to the bottom edge to flip.
    const markup = renderToStaticMarkup(
      <ShogiBoard
        disabled={false}
        messages={getMessages("ja")}
        onSquare={() => undefined}
        promotion={{
          moves: [
            {
              usi: "5i5h",
              from: { file: 5, rank: 9 },
              to: { file: 5, rank: 8 },
              drop: null,
              promote: false,
            },
          ],
          onCancel: () => undefined,
          onChoose: () => undefined,
        }}
        selection={null}
        snapshot={startPosition()}
      />,
    );
    expect(markup).toContain("promotion-picker--up");
  });
});

describe("candidate move arrows", () => {
  function render(orientation: "sente-bottom" | "gote-bottom") {
    return renderToStaticMarkup(
      <ShogiBoard
        arrows={[
          { usi: "7g7f", rank: 1, label: "+40" },
          { usi: "2g2f", rank: 2, label: "+38" },
          { usi: "P*5e", rank: 3, label: "-12" },
        ]}
        disabled={false}
        messages={getMessages("ja")}
        onSquare={() => undefined}
        orientation={orientation}
        selection={null}
        snapshot={startPosition()}
      />,
    );
  }

  it("marks the best move apart from the rest", () => {
    const markup = render("sente-bottom");
    expect(markup.match(/analysis-arrows__line--best/g)).toHaveLength(1);
    expect(markup.match(/analysis-arrows__line--alt/g)).toHaveLength(1);
  });

  it("carries the evaluation on every arrow", () => {
    const markup = render("sente-bottom");
    for (const label of ["+40", "+38", "-12"]) {
      expect(markup).toContain(`>${label}</text>`);
    }
  });

  it("draws a drop as a marker, since it has no origin square", () => {
    const markup = render("sente-bottom");
    expect(markup).toContain("analysis-arrows__drop");
    // Two normal moves plus one drop means only two lines.
    expect(markup.match(/<line/g)).toHaveLength(2);
  });

  it("mirrors the arrow coordinates when the board is flipped", () => {
    const coords = (markup: string) => {
      const line =
        markup.match(/<line[^>]*analysis-arrows__line--best[^>]*>/)?.[0] ?? "";
      const read = (name: string) =>
        Number(line.match(new RegExp(`${name}="([-0-9.]+)"`))?.[1]);
      return { x1: read("x1"), y1: read("y1"), x2: read("x2"), y2: read("y2") };
    };
    // 7g7f is a one-square push. Its column is 2 from black's view and 6 when
    // flipped, and the arrow points the opposite way on screen.
    const sente = coords(render("sente-bottom"));
    const gote = coords(render("gote-bottom"));
    expect(sente.x1).toBeCloseTo(2.5, 5);
    expect(gote.x1).toBeCloseTo(6.5, 5);
    expect(sente.y2).toBeLessThan(sente.y1);
    expect(gote.y2).toBeGreaterThan(gote.y1);
  });

  it("leaves a gap at the origin and room for the head at the target", () => {
    const markup = render("sente-bottom");
    const line =
      markup.match(/<line[^>]*analysis-arrows__line--best[^>]*>/)?.[0] ?? "";
    const read = (name: string) =>
      Number(line.match(new RegExp(`${name}="([-0-9.]+)"`))?.[1]);
    // Square centres are 6.5 and 5.5; the shaft must stop short of both so the
    // head sits on the end of the line rather than floating past it.
    expect(read("y1")).toBeLessThan(6.5);
    expect(read("y2")).toBeGreaterThan(5.5);
    // The head is placed by the marker, which must resolve in its own viewBox.
    expect(markup).toContain('viewBox="0 0 10 10"');
    expect(markup).toContain('markerUnits="userSpaceOnUse"');
    expect(markup).toContain('refX="0"');
  });

  it("never intercepts clicks meant for the board", () => {
    const styles = readFileSync(
      new URL("./index.css", import.meta.url),
      "utf8",
    );
    expect(styles).toMatch(
      /\.analysis-arrows\s*\{[^}]*pointer-events:\s*none/s,
    );
  });
});

describe("board state is shown by area colour, not rings", () => {
  const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

  it("fills the selected square instead of outlining it", () => {
    expect(styles).toMatch(
      /\.board-square--selected\s*\{[^}]*background-color:\s*var\(--selected-square\)/s,
    );
    expect(styles).not.toMatch(/\.board-square--selected\s*\{[^}]*outline:/s);
  });

  it("fills both last-move squares, with the origin clearly lighter", () => {
    expect(styles).toMatch(
      /\.board-square--last-origin\s*\{[^}]*background-color:\s*var\(--last-from\)/s,
    );
    expect(styles).toMatch(
      /\.board-square--last-destination\s*\{[^}]*background-color:\s*var\(--last-to\)/s,
    );
    // The stray rule that hung off the side of the destination square.
    expect(styles).not.toMatch(
      /\.board-square--last-destination\s*\{[^}]*border-bottom:/s,
    );
    expect(styles).not.toMatch(
      /\.board-square--last-origin\s*\{[^}]*box-shadow:/s,
    );
  });
});
