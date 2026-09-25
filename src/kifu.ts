/**
 * Game record export primitives. Pure string and byte handling over data the
 * engine already produced; format serialization lives in ./kifu-export (loaded
 * on demand) and nothing here re-derives shogi rules.
 */

/** Saveable record formats, KIF first because it is the default. */
export type KifuFormat = "kif" | "ki2" | "csa" | "usi";

/**
 * A realized ending with the parties the session reported. The reason alone
 * cannot express every ending: KIF/KI2/CSA attribute a resignation to the side
 * to move, which is wrong when a player resigns out of turn, so the winner
 * travels with the record and serializers keep the result from inverting.
 */
export interface KifuTermination {
  /** Session or engine reason, e.g. "resignation", "timeout", "checkmate". */
  reason: string;
  /** Winner as reported by the session; null for draws, absent when unknown. */
  winner?: "black" | "white" | null;
}

/**
 * One normalized game record: the position the game or analysis line started
 * from, every committed USI movement, and whatever facts (names, clocks,
 * termination) are actually known. Missing facts stay missing; serializers
 * must not invent them.
 */
export interface KifuRecord {
  /** SFEN of the starting position ("startpos" aliases the standard start). */
  initialSfen: string;
  /** Committed movements in USI, ply 1 first. */
  moves: string[];
  blackName: string;
  whiteName: string;
  /** e.g. "3分切れ負け"; omitted when unknown. */
  timeLimit?: string;
  startedAt?: Date;
  /** Milliseconds charged per ply, parallel to moves; omitted when unknown. */
  moveTimesMs?: number[];
  /** Termination as reported by the session; absent while unfinished. */
  termination?: KifuTermination;
}

const KIFU_FORMAT_KEY = "open-shogi-ui/kifu-format";

/** Reads the locally remembered save format; KIF for new, unset or unusable. */
export function readKifuFormat(): KifuFormat {
  try {
    const value = localStorage.getItem(KIFU_FORMAT_KEY);
    return value === "ki2" || value === "csa" || value === "usi"
      ? value
      : "kif";
  } catch {
    return "kif";
  }
}

export function writeKifuFormat(format: KifuFormat): void {
  try {
    localStorage.setItem(KIFU_FORMAT_KEY, format);
  } catch {
    // Private modes and blocked storage keep the in-session choice only.
  }
}

/** `position startpos moves ...`, or the SFEN form for a non-standard start. */
export function toUsi(record: {
  initialSfen: string;
  moves: string[];
}): string {
  const start =
    record.initialSfen === "startpos" || record.initialSfen === "start"
      ? "position startpos"
      : `position sfen ${record.initialSfen}`;
  return record.moves.length === 0
    ? start
    : `${start} moves ${record.moves.join(" ")}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
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
 * Hands bytes to the browser as a local download. Everything stays in the
 * page: an object URL is not a network request, so this does not touch the
 * same-origin connect-src boundary. Revocation is deferred because iOS Safari
 * can abort a download whose object URL is freed before the share sheet
 * finishes with it.
 */
export function downloadBytes(
  fileName: string,
  bytes: BlobPart,
  mime = "application/octet-stream",
): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Text download for the diagnostics JSON. The MIME matches the .json
 * extension and the UTF-8 bytes (JSON is always UTF-8): WebKit derives
 * download names from the MIME type, so a text/plain blob named .json can
 * come back as .json.txt on iOS.
 */
export function downloadText(fileName: string, text: string): void {
  downloadBytes(fileName, new TextEncoder().encode(text), "application/json");
}
