import { useEffect, useMemo, useState } from "react";

import type {
  BoardPosition,
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

/** Arrow head length, in board squares. */
const ARROW_HEAD = 0.32;
/** Gap left at the origin so the shaft starts clear of the piece. */
const ARROW_TAIL_GAP = 0.26;

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
  let value: string | null;
  try {
    value = localStorage.getItem(PIECE_SET_STORAGE_KEY);
  } catch {
    return DEFAULT_PIECE_SET;
  }
  return PIECE_ASSET_CATALOG.some(({ id }) => id === value)
    ? (value as PieceSetId)
    : DEFAULT_PIECE_SET;
}

export function selectedMoves(
  snapshot: BoardPosition,
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

export type BoardClickResult =
  | { kind: "move"; candidates: MoveSummary[] }
  | { kind: "selection"; selection: BoardSelection };

export function resolveBoardClick(
  snapshot: BoardPosition,
  selection: BoardSelection,
  index: number,
): BoardClickResult {
  const candidates = selectedMoves(snapshot, selection).filter(
    (movement) => destinationIndex(movement) === index,
  );
  if (candidates.length > 0) return { kind: "move", candidates };
  const piece = snapshot.board[index];
  if (piece?.side !== snapshot.sideToMove) {
    return { kind: "selection", selection: null };
  }
  if (selection?.kind === "board" && selection.index === index)
    return { kind: "selection", selection: null };
  const next = { kind: "board", index } satisfies BoardSelection;
  return {
    kind: "selection",
    selection: selectedMoves(snapshot, next).length > 0 ? next : null,
  };
}

export function toggleHandSelection(
  current: BoardSelection,
  piece: HandPieceKind,
): BoardSelection {
  return current?.kind === "hand" && current.piece === piece
    ? null
    : { kind: "hand", piece };
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
  const pieces = (
    ["rook", "bishop", "gold", "silver", "knight", "lance", "pawn"] as const
  )
    .map((piece) => ({
      piece,
      count: entries.find((entry) => entry.piece === piece)?.count ?? 0,
    }))
    .filter(({ count }) => count > 0);
  return (
    <section className={`hand-stand hand-stand--${side}`}>
      <h2>{messages.play.hand(side)}</h2>
      <div className="hand-stand__pieces">
        {pieces.map(({ piece, count }) => (
          <button
            aria-pressed={
              !disabled &&
              selection?.kind === "hand" &&
              selection.piece === piece
            }
            aria-label={`${messages.play.hand(side)} ${messages.play.pieceName[piece]} ${count}`}
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
        ))}
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
  pieceSet = DEFAULT_PIECE_SET,
  promotion = null,
  arrows = [],
  onSquare,
}: {
  snapshot: BoardPosition;
  selection: BoardSelection;
  disabled: boolean;
  messages: Messages;
  orientation?: BoardOrientation;
  lastMove?: MoveHighlight | null;
  pieceSet?: PieceSetId;
  promotion?: PromotionPrompt | null;
  arrows?: AnalysisArrow[];
  onSquare: (index: number) => void;
}) {
  const destinations = useMemo(
    () => new Set(selectedMoves(snapshot, selection).map(destinationIndex)),
    [selection, snapshot],
  );
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
              ].filter(Boolean);
              const pieceLabel =
                piece === null
                  ? ""
                  : `${piece.side === "black" ? messages.play.black : messages.play.white}${messages.play.pieceName[piece.kind]}`;
              const classes = [
                "board-square",
                isSelected && "board-square--selected",
                isDestination && "board-square--destination",
                isDestination &&
                  piece !== null &&
                  "board-square--capture-target",
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
        {/*
          viewBox plus userSpaceOnUse. Without a viewBox, refX/refY are not in
          the path's own coordinates and the head lands off the shaft; without
          userSpaceOnUse the head is scaled by stroke width instead of board
          squares. refX=0 puts the base of the head at the end of the line, so
          the shaft and the head form one continuous arrow.
        */}
        {["best", "alt"].map((variant) => (
          <marker
            id={`arrowhead-${variant}`}
            key={variant}
            markerHeight={ARROW_HEAD}
            markerUnits="userSpaceOnUse"
            markerWidth={ARROW_HEAD}
            orient="auto"
            refX="0"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path
              className={`analysis-arrows__head analysis-arrows__head--${variant}`}
              d="M0,0 L10,5 L0,10 z"
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
        // Opacity belongs on the group. Fading the line and the marker
        // separately renders them at different effective alphas, which is why
        // the head looked detached from its shaft.

        const to = centre(boardIndex(shape.to.file, shape.to.rank));
        const from =
          shape.from === null
            ? null
            : centre(boardIndex(shape.from.file, shape.from.rank));
        return (
          <g
            className={`analysis-arrows__arrow analysis-arrows__arrow--${variant}`}
            key={`${arrow.rank}-${arrow.usi}`}
          >
            {from === null ? (
              <circle
                className={`analysis-arrows__drop analysis-arrows__drop--${variant}`}
                cx={to.x}
                cy={to.y}
                r={0.34}
              />
            ) : (
              (() => {
                /*
                 * Trim by a fixed distance along the direction, not by a
                 * fraction of it. A percentage leaves the head stranded in the
                 * middle of a one-square move and overshoots a long one.
                 */
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const length = Math.hypot(dx, dy) || 1;
                const ux = dx / length;
                const uy = dy / length;
                return (
                  <line
                    className={`analysis-arrows__line analysis-arrows__line--${variant}`}
                    markerEnd={`url(#arrowhead-${variant})`}
                    x1={from.x + ux * ARROW_TAIL_GAP}
                    x2={to.x - ux * ARROW_HEAD}
                    y1={from.y + uy * ARROW_TAIL_GAP}
                    y2={to.y - uy * ARROW_HEAD}
                  />
                );
              })()
            )}
          </g>
        );
      })}
      {arrows.map((arrow) => {
        let shape;
        try {
          shape = parseUsiMoveShape(arrow.usi);
        } catch {
          return null;
        }
        const to = centre(boardIndex(shape.to.file, shape.to.rank));
        return (
          <text
            className={`analysis-arrows__label analysis-arrows__label--${
              arrow.rank === 1 ? "best" : "alt"
            }`}
            key={`label-${arrow.rank}-${arrow.usi}`}
            x={Math.min(Math.max(to.x, 0.62), 8.38)}
            y={Math.min(Math.max(to.y - 0.34, 0.3), 8.7)}
          >
            {arrow.label}
          </text>
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
  snapshot: BoardPosition;
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
  /*
   * Anchor away from whichever edge is close. The board can be as narrow as
   * 333px on a phone, where the panel is a third of its width, so opening
   * rightwards from column 5 already runs off the board.
   */
  const anchorRight = column >= 5;
  const anchorBottom = row >= 6;

  return (
    <div
      aria-label={messages.play.promoteQuestion}
      className={[
        "promotion-picker",
        anchorRight ? "promotion-picker--left" : "",
        anchorBottom ? "promotion-picker--up" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
        insetBlockStart: anchorBottom ? undefined : `calc(${row} * (100% / 9))`,
        insetBlockEnd: anchorBottom
          ? `calc(${8 - row} * (100% / 9))`
          : undefined,
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
