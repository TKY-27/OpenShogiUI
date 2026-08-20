import type { BrowserSnapshot, PieceKind, Side } from "./browser-engine";
import { boardIndex, parseUsiMoveShape } from "./play-settings";

/**
 * Game record export. Pure string building over snapshots the engine already
 * produced; nothing here re-derives shogi rules.
 */

export interface KifuGame {
  /** Position history. Index 0 is the initial position. */
  snapshots: BrowserSnapshot[];
  blackName: string;
  whiteName: string;
  timeControl: string;
  /** Milliseconds spent on each ply, parallel to snapshots[1..]. */
  moveTimesMs?: number[];
  terminationLabel?: string;
  startedAt?: Date;
}

const FULL_WIDTH_FILES = ["１", "２", "３", "４", "５", "６", "７", "８", "９"];
const KANJI_RANKS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

const KIF_PIECE_NAMES: Record<PieceKind, string> = {
  pawn: "歩",
  lance: "香",
  knight: "桂",
  silver: "銀",
  gold: "金",
  bishop: "角",
  rook: "飛",
  king: "玉",
  "promoted-pawn": "と",
  "promoted-lance": "成香",
  "promoted-knight": "成桂",
  "promoted-silver": "成銀",
  horse: "馬",
  dragon: "龍",
};

const DROP_PIECE_NAMES: Record<string, string> = {
  P: "歩",
  L: "香",
  N: "桂",
  S: "銀",
  G: "金",
  B: "角",
  R: "飛",
};

/** `position startpos moves ...`, or the SFEN form for a non-standard start. */
export function toUsi(game: KifuGame): string {
  const first = game.snapshots[0];
  const last = game.snapshots.at(-1);
  if (first === undefined || last === undefined) return "position startpos";
  const start =
    first.initialSfen === "startpos" || first.initialSfen === "start"
      ? "position startpos"
      : `position sfen ${first.initialSfen}`;
  return last.moves.length === 0
    ? start
    : `${start} moves ${last.moves.join(" ")}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function moveClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(total / 60)}:${pad(total % 60, 2)}`;
}

function cumulativeClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(total % 60, 2)}`;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1, 2)}/${pad(date.getDate(), 2)} ${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}`;
}

/**
 * Renders one ply in KIF notation, reading the moved piece from the board
 * before the move rather than inferring it from the coordinates.
 */
function kifMove(
  movement: string,
  before: BrowserSnapshot,
  previousDestination: { file: number; rank: number } | null,
): string {
  const shape = parseUsiMoveShape(movement);
  const sameSquare =
    previousDestination !== null &&
    previousDestination.file === shape.to.file &&
    previousDestination.rank === shape.to.rank;
  const square = sameSquare
    ? "同　"
    : `${FULL_WIDTH_FILES[shape.to.file - 1]}${KANJI_RANKS[shape.to.rank - 1]}`;

  if (shape.from === null) {
    const dropped = DROP_PIECE_NAMES[movement[0]] ?? "歩";
    return `${square}${dropped}打`;
  }

  const piece = before.board[boardIndex(shape.from.file, shape.from.rank)];
  const name = piece === null ? "" : KIF_PIECE_NAMES[piece.kind];
  const promotion = movement.endsWith("+") ? "成" : "";
  return `${square}${name}${promotion}(${shape.from.file}${shape.from.rank})`;
}

export function toKif(game: KifuGame): string {
  const start = game.startedAt ?? new Date();
  const lines = [
    "#KIF version=2.0 encoding=UTF-8",
    `開始日時：${localDate(start)}`,
    "手合割：平手",
    `先手：${game.blackName}`,
    `後手：${game.whiteName}`,
    `持ち時間：${game.timeControl}`,
    "手数----指手---------消費時間--",
  ];

  const cumulative: Record<Side, number> = { black: 0, white: 0 };
  let previousDestination: { file: number; rank: number } | null = null;

  const last = game.snapshots.at(-1);
  const moves = last?.moves ?? [];
  moves.forEach((movement, ply) => {
    const before = game.snapshots[ply];
    if (before === undefined) return;
    const side: Side = before.sideToMove;
    const spent = game.moveTimesMs?.[ply] ?? 0;
    cumulative[side] += spent;
    const notation = kifMove(movement, before, previousDestination);
    lines.push(
      `${String(ply + 1).padStart(4, " ")} ${notation.padEnd(14, " ")}(${moveClock(spent).padStart(5, " ")}/${cumulativeClock(cumulative[side])})`,
    );
    previousDestination = parseUsiMoveShape(movement).to;
  });

  if (game.terminationLabel !== undefined) {
    lines.push(
      `${String(moves.length + 1).padStart(4, " ")} ${game.terminationLabel}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function kifuFileName(
  prefix: string,
  extension: string,
  at = new Date(),
) {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1, 2)}${pad(at.getDate(), 2)}-${pad(at.getHours(), 2)}${pad(at.getMinutes(), 2)}${pad(at.getSeconds(), 2)}`;
  return `${prefix}-${stamp}.${extension}`;
}

/**
 * Hands the text to the browser as a local download. Everything stays in the
 * page: an object URL is not a network request, so this does not touch the
 * same-origin connect-src boundary.
 */
export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
