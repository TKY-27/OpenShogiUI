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
      </div>
      <div aria-hidden="true" className="rank-coordinates">
        {rankLabels.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
    </div>
  );
}
