import { MAX_GAME_MOVES } from "./browser-engine";
import { START_SFEN } from "./collection";

/**
 * Kifu import boundary for the analysis workspace. Parsing and move notation
 * come from tsshogi (MIT, lazily imported); the bytes are decoded locally and
 * nothing is sent anywhere. Every returned record is later replayed and
 * validated by the existing Wasm runtime before it is displayed, so a parser
 * that accepts an illegal sequence still fails safely.
 */

/** Imported files stay small: kifu are a few KiB, comments included. */
export const MAX_KIFU_BYTES = 128 * 1024;

export interface ImportedKifu {
  initialSfen: string;
  /** Replayable USI movements, ply 1 first. */
  moves: string[];
  blackName: string | null;
  whiteName: string | null;
  /** Free-text comments parallel to moves (index 0 = ply 1). */
  comments: string[];
  /** Ending noted in the file but not replayable as a movement, if any. */
  endingNote: string | null;
}

type Tsshogi = typeof import("tsshogi");

async function decodeKifuBytes(bytes: Uint8Array): Promise<string> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Most Japanese kifu are Shift_JIS; a round trip through TextDecoder keeps
    // the file's own bytes authoritative without any character guessing.
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

function recordMoves(
  tsshogi: Tsshogi,
  record: import("tsshogi").Record,
): { moves: string[]; comments: string[]; endingNote: string | null } {
  const moves: string[] = [];
  const comments: string[] = [];
  let endingNote: string | null = null;
  // record.moves starts with the pseudo start node (ply 0); a special move
  // after ply 0 is a real ending note, not something to replay.
  for (const node of record.moves) {
    if (node.ply === 0) continue;
    if (!(node.move instanceof tsshogi.Move)) {
      endingNote = node.displayText;
      break;
    }
    if (moves.length >= MAX_GAME_MOVES) break;
    moves.push(node.move.usi);
    comments.push(node.comment);
  }
  return { moves, comments, endingNote };
}

function parseWith(
  tsshogi: Tsshogi,
  text: string,
  parse: (data: string) => import("tsshogi").Record | Error,
): import("tsshogi").Record | null {
  try {
    const record = parse(text);
    return record instanceof tsshogi.Record ? record : null;
  } catch {
    return null;
  }
}

/** Detects the format by its discriminating markers; bare SFEN gets its own shape check. */
const SFEN_SHAPE =
  /^\s*(?:[1-9a-zA-Z*+]+\/){8}[1-9a-zA-Z*+]+ [bw] (?:-|[1-9a-zA-Z]+) \d+\s*$/;
type ParserAttempt = {
  run: (tsshogi: Tsshogi) => import("tsshogi").Record | null;
  /** Unmarked text must produce at least one movement to count as a record. */
  requireMoves: boolean;
};
function orderedParsers(text: string): ParserAttempt[] {
  const trimmed = text.trimStart();
  const attempt = (
    run: (tsshogi: Tsshogi) => import("tsshogi").Record | null,
    requireMoves = false,
  ): ParserAttempt => ({ run, requireMoves });
  const usiParser = (raw: string) => (tsshogi: Tsshogi) =>
    parseWith(tsshogi, raw, tsshogi.Record.newByUSI);
  if (/^(V\d|'[^%]|P[1-9]|\$EVENT)/.test(trimmed))
    return [attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importCSA))];
  if (/^(position\b|sfen\b|startpos\b)/.test(trimmed))
    return [attempt(usiParser(text))];
  if (SFEN_SHAPE.test(trimmed))
    return [attempt(usiParser(`position sfen ${trimmed}`))];
  if (/(?:^|\n)\s*(?:手合割|開始日付|\[)/.test(text))
    return [
      attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importKIF)),
      attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importKI2), true),
    ];
  if (/(?:^|\n)\s*[▲△☗☖]/.test(text))
    return [
      attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importKI2)),
      attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importKIF), true),
    ];
  // Unrecognized shape: still try KIF/KI2, but their results are only
  // accepted with at least one movement so garbage never imports as a
  // valid empty record.
  return [
    attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importKIF), true),
    attempt((tsshogi) => parseWith(tsshogi, text, tsshogi.importKI2), true),
  ];
}

export async function parseKifuBytes(bytes: Uint8Array): Promise<ImportedKifu> {
  if (bytes.byteLength === 0) throw new Error("空のファイルです。");
  if (bytes.byteLength > MAX_KIFU_BYTES)
    throw new Error("棋譜ファイルは128KiB以内で指定してください。");
  const tsshogi = (await import("tsshogi")) as Tsshogi;
  const text = await decodeKifuBytes(bytes);
  let parsed: import("tsshogi").Record | null = null;
  for (const { run, requireMoves } of orderedParsers(text)) {
    const record = run(tsshogi);
    if (record === null) continue;
    if (!requireMoves || record.length > 0) {
      parsed = record;
      break;
    }
  }
  if (parsed === null)
    throw new Error(
      "KIF・KI2・CSA・USI/SFENのいずれの形式でも読み取れませんでした。",
    );
  const { moves, comments, endingNote } = recordMoves(tsshogi, parsed);
  // The engine treats the standard start canonically; tsshogi renders the
  // same position, so alias it to keep records and caches comparable.
  const initialSfen =
    parsed.initialPosition.sfen.split(" ").slice(0, 3).join(" ") ===
    START_SFEN.split(" ").slice(0, 3).join(" ")
      ? START_SFEN
      : parsed.initialPosition.sfen;
  return {
    initialSfen,
    moves,
    comments,
    endingNote,
    blackName:
      parsed.metadata.getStandardMetadata(
        tsshogi.RecordMetadataKey.BLACK_NAME,
      ) ?? null,
    whiteName:
      parsed.metadata.getStandardMetadata(
        tsshogi.RecordMetadataKey.WHITE_NAME,
      ) ?? null,
  };
}
