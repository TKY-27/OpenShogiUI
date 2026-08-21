import { useEffect, useMemo, useState } from "react";

import type {
  BrowserSnapshot,
  HandEntry,
  HandPieceKind,
  MoveSummary,
  PieceKind,
  Side,
} from "./browser-engine";
import type { Messages } from "./localization";
import {
  PIECE_ASSET_CATALOG,
  pieceAssetPath,
  type PieceSetId,
} from "./pieces/catalog";
import {
  boardIndex,
  parseUsiMoveShape,
  type BoardOrientation,
  type MoveHighlight,
} from "./play-settings";

export { boardIndex };

export const DEFAULT_PIECE_SET: PieceSetId = "kanji_brown";
export const PIECE_SET_STORAGE_KEY = "open-shogi-ui/piece-set";

export const BOARD_FILE_LABELS = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
export const BOARD_RANK_LABELS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
] as const;

const PIECE_GLYPHS: Record<PieceKind, string> = {
  pawn: "歩",
  lance: "香",
  knight: "桂",
  silver: "銀",
  gold: "金",
  bishop: "角",
  rook: "飛",
  king: "玉",
  "promoted-pawn": "と",
  "promoted-lance": "杏",
  "promoted-knight": "圭",
  "promoted-silver": "全",
  horse: "馬",
  dragon: "龍",
};

export function pieceFallbackGlyph(kind: PieceKind, side: Side): string {
  return kind === "king" && side === "white" ? "王" : PIECE_GLYPHS[kind];
}

const PROMOTED_KIND: Partial<Record<PieceKind, PieceKind>> = {
  pawn: "promoted-pawn",
  lance: "promoted-lance",
  knight: "promoted-knight",
  silver: "promoted-silver",
  bishop: "horse",
  rook: "dragon",
};

/** The piece a kind becomes on promotion, or itself when it cannot promote. */
export function promotedKind(kind: PieceKind): PieceKind {
  return PROMOTED_KIND[kind] ?? kind;
}

export interface PromotionPrompt {
  moves: MoveSummary[];
  onChoose: (usi: string) => void;
  onCancel: () => void;
}

/** One candidate move drawn over the board, ranked best first. */
export interface AnalysisArrow {
  usi: string;
  rank: number;
  label: string;
}

export type BoardSelection =
  | { kind: "board"; index: number }
  | { kind: "hand"; piece: HandPieceKind }
  | null;

/** Reads the stored piece set, falling back to the default for unknown values. */
export function persistedPieceSet(): PieceSetId {
  if (typeof localStorage === "undefined") return DEFAULT_PIECE_SET;
  const value = localStorage.getItem(PIECE_SET_STORAGE_KEY);
  return PIECE_ASSET_CATALOG.some(({ id }) => id === value)
    ? (value as PieceSetId)
    : DEFAULT_PIECE_SET;
}

export function selectedMoves(
  snapshot: BrowserSnapshot,
  selection: BoardSelection,
): MoveSummary[] {
  if (selection === null) return [];
  if (selection.kind === "hand") {
    return snapshot.legalMoves.filter(
      (movement) => movement.drop === selection.piece,
    );
  }
  const piece = snapshot.board[selection.index];
  if (piece === null) return [];
  return snapshot.legalMoves.filter(
    (movement) =>
      movement.from?.file === piece.square.file &&
      movement.from.rank === piece.square.rank,
  );
}

export function destinationIndex(movement: MoveSummary): number {
  return boardIndex(movement.to.file, movement.to.rank);
}

function squareIndex(square: { file: number; rank: number } | null): number {
  return square === null ? -1 : boardIndex(square.file, square.rank);
}

export function PieceView({
  kind,
  side,
  setId,
  flipped,
}: {
  kind: PieceKind;
  side: Side;
  setId: PieceSetId;
  flipped: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const glyph = pieceFallbackGlyph(kind, side);
  useEffect(() => setFailed(false), [kind, setId, side]);
  return (
    <span
      className={`piece-frame ${flipped ? "piece-frame--flipped" : ""}`}
      lang="ja"
    >
      {failed ? (
        <span className={`shogi-piece shogi-piece--${side}`}>{glyph}</span>
      ) : (
        <img
          alt={glyph}
          className="piece-image"
          draggable={false}
          height="96"
          onError={() => setFailed(true)}
          src={pieceAssetPath(setId, side, kind)}
          width="84"
        />
      )}
    </span>
  );
}

export function HandStand({
  side,
  entries,
  selection,
  legalDrops,
  disabled,
  messages,
  orientation,
  pieceSet,
  onSelect,
}: {
  side: Side;
  entries: HandEntry[];
  selection: BoardSelection;
  legalDrops: ReadonlySet<HandPieceKind>;
  disabled: boolean;
  messages: Messages;
  orientation: BoardOrientation;
  pieceSet: PieceSetId;
  onSelect: (piece: HandPieceKind) => void;
}) {
  const pieces = entries.filter(({ count }) => count > 0);
  return (
    <section className={`hand-stand hand-stand--${side}`}>
      <h2>{messages.play.hand(side)}</h2>
      <div className="hand-stand__pieces">
        {pieces.length === 0 ? (
          <p>{messages.play.emptyHand}</p>
        ) : (
          pieces.map(({ piece, count }) => (
            <button
              aria-pressed={
                selection?.kind === "hand" && selection.piece === piece
              }
              className="hand-piece"
              disabled={disabled || !legalDrops.has(piece)}
              key={piece}
              onClick={() => onSelect(piece)}
              type="button"
            >
              <PieceView
                flipped={orientation === "gote-bottom"}
                kind={piece}
                setId={pieceSet}
                side={side}
              />
              <span aria-label={`${messages.play.pieceName[piece]} ${count}`}>
                ×{count}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

export function ShogiBoard({
  snapshot,
  selection,
  disabled,
  messages,
  orientation = "sente-bottom",
  lastMove = null,
  pv = [],
  pieceSet = DEFAULT_PIECE_SET,
  promotion = null,
  arrows = [],
  onSquare,
}: {
  snapshot: BrowserSnapshot;
  selection: BoardSelection;
  disabled: boolean;
  messages: Messages;
  orientation?: BoardOrientation;
  lastMove?: MoveHighlight | null;
  pv?: string[];
  pieceSet?: PieceSetId;
  promotion?: PromotionPrompt | null;
  arrows?: AnalysisArrow[];
  onSquare: (index: number) => void;
}) {
  const destinations = useMemo(
    () => new Set(selectedMoves(snapshot, selection).map(destinationIndex)),
    [selection, snapshot],
  );
  const pvSquares = useMemo(() => {
    const squares = new Set<number>();
    for (const movement of pv.slice(0, 8)) {
      const parsed = parseUsiMoveShape(movement);
      if (parsed.from !== null) squares.add(squareIndex(parsed.from));
      squares.add(squareIndex(parsed.to));
    }
    return squares;
  }, [pv]);
  const order = Array.from({ length: 81 }, (_, index) =>
    orientation === "sente-bottom" ? index : 80 - index,
  );
  const fileLabels =
    orientation === "sente-bottom"
      ? BOARD_FILE_LABELS
      : [...BOARD_FILE_LABELS].reverse();
  const rankLabels =
    orientation === "sente-bottom"
      ? BOARD_RANK_LABELS
      : [...BOARD_RANK_LABELS].reverse();
  const lastFrom = squareIndex(lastMove?.from ?? null);
  const lastTo = squareIndex(lastMove?.to ?? null);
  const checkedKing =
    snapshot.terminal?.kind === "checkmate"
      ? snapshot.board.findIndex(
          (piece) =>
            piece?.kind === "king" && piece.side === snapshot.sideToMove,
        )
      : -1;

  return (
    <div className="board-coordinate-grid">
      <div aria-hidden="true" className="file-coordinates">
        {fileLabels.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      <div
        aria-label={messages.play.boardLabel}
        className="shogi-board"
        role="grid"
      >
        {Array.from({ length: 9 }, (_, visualRank) => (
          <div className="board-row" key={rankLabels[visualRank]} role="row">
            {order.slice(visualRank * 9, visualRank * 9 + 9).map((index) => {
              const piece = snapshot.board[index];
              const file = piece?.square.file ?? 9 - (index % 9);
              const rankNumber =
                piece?.square.rank ?? Math.floor(index / 9) + 1;
              const rank = BOARD_RANK_LABELS[rankNumber - 1];
              const isSelected =
                selection?.kind === "board" && selection.index === index;
              const isDestination = destinations.has(index);
              const states = [
                isSelected ? messages.play.selected : null,
                isDestination ? messages.play.legalDestination : null,
                index === lastFrom ? "last move origin" : null,
                index === lastTo ? "last move destination" : null,
                index === checkedKing ? "checked king" : null,
                pvSquares.has(index) ? "analysis PV preview" : null,
              ].filter(Boolean);
              const pieceLabel =
                piece === null
                  ? ""
                  : `${piece.side === "black" ? messages.play.black : messages.play.white}${messages.play.pieceName[piece.kind]}`;
              const classes = [
                "board-square",
                isSelected && "board-square--selected",
                isDestination && "board-square--destination",
                index === lastFrom && "board-square--last-origin",
                index === lastTo && "board-square--last-destination",
                index === lastTo && lastMove?.drop && "board-square--last-drop",
                index === lastTo &&
                  lastMove?.capture &&
                  "board-square--last-capture",
                (index === lastFrom || index === lastTo) &&
                  lastMove?.promotion &&
                  "board-square--last-promotion",
                index === checkedKing && "board-square--checked-king",
                pvSquares.has(index) && "board-square--pv",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  aria-label={[
                    messages.play.squareLabel(file, rank),
                    pieceLabel,
                    states.join(", "),
                  ]
                    .filter(Boolean)
                    .join("、")}
                  aria-selected={isSelected}
                  className={classes}
                  data-file={file}
                  data-kind={piece?.kind}
                  data-rank={rankNumber}
                  data-side={piece?.side}
                  disabled={disabled}
                  key={index}
                  onClick={() => onSquare(index)}
                  role="gridcell"
                  type="button"
                >
                  {piece === null ? null : (
                    <PieceView
                      flipped={orientation === "gote-bottom"}
                      kind={piece.kind}
                      setId={pieceSet}
                      side={piece.side}
                    />
                  )}
                  {isDestination ? (
                    <span aria-hidden="true" className="destination-mark" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
        {/*
          Both overlays live inside .shogi-board because they are positioned in
          board coordinates. As siblings they resolved against .board-area, the
          nearest positioned ancestor, and landed off the grid.
        */}
        {arrows.length === 0 ? null : (
          <AnalysisArrows arrows={arrows} orientation={orientation} />
        )}
        {promotion === null ? null : (
          <PromotionPicker
            messages={messages}
            orientation={orientation}
            pieceSet={pieceSet}
            prompt={promotion}
            snapshot={snapshot}
          />
        )}
      </div>
      <div aria-hidden="true" className="rank-coordinates">
        {rankLabels.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Candidate-move overlay.
 *
 * The best move is drawn in the accent colour and the rest in the analysis
 * blue, each carrying its own evaluation. Arrows are translucent so the pieces
 * underneath stay readable; the labels are not, because a number at 40% opacity
 * over a wooden board is unreadable.
 */
function AnalysisArrows({
  arrows,
  orientation,
}: {
  arrows: AnalysisArrow[];
  orientation: BoardOrientation;
}) {
  const centre = (index: number) => {
    const visual = orientation === "sente-bottom" ? index : 80 - index;
    return { x: (visual % 9) + 0.5, y: Math.floor(visual / 9) + 0.5 };
  };

  return (
    <svg
      aria-hidden="true"
      className="analysis-arrows"
      viewBox="0 0 9 9"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {["best", "alt"].map((variant) => (
          <marker
            id={`arrowhead-${variant}`}
            key={variant}
            markerHeight="3"
            markerUnits="strokeWidth"
            markerWidth="3"
            orient="auto"
            refX="2.4"
            refY="1.5"
          >
            <path
              className={`analysis-arrows__head analysis-arrows__head--${variant}`}
              d="M0,0 L3,1.5 L0,3 z"
            />
          </marker>
        ))}
      </defs>
      {arrows.map((arrow) => {
        let shape;
        try {
          shape = parseUsiMoveShape(arrow.usi);
        } catch {
          return null;
        }
        const variant = arrow.rank === 1 ? "best" : "alt";
        const to = centre(boardIndex(shape.to.file, shape.to.rank));
        const from =
          shape.from === null
            ? null
            : centre(boardIndex(shape.from.file, shape.from.rank));
        // Keep the label inside the board at the edges.
        const labelX = Math.min(Math.max(to.x, 0.62), 8.38);
        const labelY = Math.min(Math.max(to.y - 0.34, 0.3), 8.7);
        return (
          <g key={`${arrow.rank}-${arrow.usi}`}>
            {from === null ? (
              <circle
                className={`analysis-arrows__drop analysis-arrows__drop--${variant}`}
                cx={to.x}
                cy={to.y}
                r={0.34}
              />
            ) : (
              <line
                className={`analysis-arrows__line analysis-arrows__line--${variant}`}
                markerEnd={`url(#arrowhead-${variant})`}
                x1={from.x}
                x2={to.x - (to.x - from.x) * 0.28}
                y1={from.y}
                y2={to.y - (to.y - from.y) * 0.28}
              />
            )}
            <text
              className={`analysis-arrows__label analysis-arrows__label--${variant}`}
              x={labelX}
              y={labelY}
            >
              {arrow.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Promotion picker, anchored beside the destination square.
 *
 * A modal dialog for this question stops the board being visible at the moment
 * the answer depends on it. Showing the two resulting pieces next to the square
 * keeps the position in view and makes the choice a direct comparison.
 */
function PromotionPicker({
  prompt,
  snapshot,
  orientation,
  pieceSet,
  messages,
}: {
  prompt: PromotionPrompt;
  snapshot: BrowserSnapshot;
  orientation: BoardOrientation;
  pieceSet: PieceSetId;
  messages: Messages;
}) {
  // Promote first: it is the usual intent, and it matches how shogi clients
  // conventionally order the pair.
  const options = [...prompt.moves].sort(
    (left, right) => Number(right.promote) - Number(left.promote),
  );
  const sample = options[0];
  if (sample === undefined) return null;
  const destination = boardIndex(sample.to.file, sample.to.rank);
  const origin =
    sample.from === null
      ? null
      : boardIndex(sample.from.file, sample.from.rank);
  const moving = origin === null ? null : snapshot.board[origin];
  if (moving === null || moving === undefined) return null;

  const visual =
    orientation === "sente-bottom" ? destination : 80 - destination;
  const column = visual % 9;
  const row = Math.floor(visual / 9);
  // Flip to the left of the square when there is no room on the right.
  const anchorRight = column >= 6;

  return (
    <div
      aria-label={messages.play.promoteQuestion}
      className={`promotion-picker ${anchorRight ? "promotion-picker--left" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          prompt.onCancel();
        }
      }}
      role="group"
      style={{
        insetInlineStart: anchorRight
          ? undefined
          : `calc(${column + 1} * (100% / 9))`,
        insetInlineEnd: anchorRight
          ? `calc(${9 - column} * (100% / 9))`
          : undefined,
        insetBlockStart: `calc(${row} * (100% / 9))`,
      }}
    >
      {options.map((movement, index) => (
        <button
          autoFocus={index === 0}
          key={movement.usi}
          onClick={() => prompt.onChoose(movement.usi)}
          type="button"
        >
          <PieceView
            flipped={orientation === "gote-bottom"}
            kind={movement.promote ? promotedKind(moving.kind) : moving.kind}
            setId={pieceSet}
            side={moving.side}
          />
          <span>
            {movement.promote
              ? messages.play.promote
              : messages.play.doNotPromote}
          </span>
        </button>
      ))}
    </div>
  );
}
