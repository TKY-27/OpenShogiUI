import { START_SFEN } from "./collection";
import { kifuFileName, toUsi, type KifuFormat, type KifuRecord } from "./kifu";
import type { Side } from "./browser-engine";
import { parseUsiMoveShape } from "./play-settings";

/**
 * KIF / KI2 / CSA serialization boundary. The save control prefetches this
 * module when it mounts and every save reuses it, so the format chunks are
 * fetched once per page and never block the initial bundle. Board replay and
 * move notation come from tsshogi (MIT); the Rust/Wasm runtime stays the sole
 * authority on shogi rules and never depends on this module. tsshogi has no
 * character-code conversion, so Shift_JIS output is produced here with
 * encoding-japanese (MIT) and verified by byte round-trip.
 */

export interface KifuFile {
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
  encoding: "shift_jis" | "utf-8";
  /** Deviations the reader should know about; rendered as a status line. */
  notes?: KifuNote[];
}

export type KifuNote = "utf8-fallback" | "out-of-turn-ending";

type Tsshogi = typeof import("tsshogi");

/**
 * Endings this UI can actually produce (engine GameEnd kinds plus session
 * reasons). An unmapped reason stays unmapped: the record simply ends after
 * the last move instead of claiming an invented winner or draw.
 */
function specialMoveFor(
  tsshogi: Tsshogi,
  termination: string,
): import("tsshogi").SpecialMoveType | undefined {
  const type = tsshogi.SpecialMoveType;
  switch (termination) {
    case "checkmate":
      return type.MATE;
    // Both resignation paths land in records the same way.
    case "resignation":
    case "engine-resignation":
      return type.RESIGN;
    case "timeout":
      return type.TIMEOUT;
    case "repetition":
      return type.REPETITION_DRAW;
    // The side that just moved fouled: perpetual check, or a failed
    // entering-king declaration (the KIF spec files 宣言不成立の負け under
    // 反則負け).
    case "perpetual-check":
    case "entering-king-loss":
    case "impasse-loss":
    case "invalid-material":
      return type.FOUL_LOSE;
    // Jishogi reached without a valid declaration is a draw, not a win.
    case "impasse":
      return type.IMPASS;
    // Ended without any result; 中断 claims no winner.
    case "entering-king-no-contest":
      return type.INTERRUPT;
    default:
      return undefined;
  }
}

function opposing(side: Side): Side {
  return side === "black" ? "white" : "black";
}

/** KIF/KI2/CSA endings name the parties 先手/後手, so do the same. */
function sideName(side: Side): string {
  return side === "black" ? "先手" : "後手";
}

function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

interface BuiltRecord {
  built: import("tsshogi").Record;
  /**
   * Set when the ending cannot be expressed truthfully in the format's
   * standard codes: the resigner was not the side to move, so 投了/勝利
   * renderings would invert the result. The record keeps 中断 plus a comment
   * naming the actual resigner and winner.
   */
  outOfTurnEnding?: { resigner: Side; winner: Side };
}

function buildRecord(tsshogi: Tsshogi, record: KifuRecord): BuiltRecord {
  const standard =
    record.initialSfen === START_SFEN ||
    record.initialSfen === "startpos" ||
    record.initialSfen === "start";
  const usi =
    (standard ? "position startpos" : `position sfen ${record.initialSfen}`) +
    (record.moves.length === 0 ? "" : ` moves ${record.moves.join(" ")}`);
  const built = tsshogi.Record.newByUSI(usi);
  if (!(built instanceof tsshogi.Record))
    throw new Error("the game could not be replayed for export");
  if (built.length !== record.moves.length)
    throw new Error("the game could not be replayed in full");
  built.metadata.setStandardMetadata(
    tsshogi.RecordMetadataKey.BLACK_NAME,
    record.blackName,
  );
  built.metadata.setStandardMetadata(
    tsshogi.RecordMetadataKey.WHITE_NAME,
    record.whiteName,
  );
  if (record.startedAt !== undefined)
    built.metadata.setStandardMetadata(
      tsshogi.RecordMetadataKey.START_DATETIME,
      localDate(record.startedAt),
    );
  if (record.timeLimit !== undefined)
    built.metadata.setStandardMetadata(
      tsshogi.RecordMetadataKey.TIME_LIMIT,
      record.timeLimit,
    );
  if (record.moveTimesMs !== undefined) {
    let node = built.first.next;
    for (const milliseconds of record.moveTimesMs) {
      if (node === null) break;
      // Also recomputes the per-side cumulative total tsshogi renders.
      node.setElapsedMs(Math.max(0, Math.floor(milliseconds)));
      node = node.next;
    }
  }
  const termination = record.termination;
  let outOfTurnEnding: BuiltRecord["outOfTurnEnding"];
  if (termination !== undefined) {
    let special = specialMoveFor(tsshogi, termination.reason);
    // 投了 means the side to move resigned. When the resigner had already
    // moved (resigning while the opponent thinks), appending 投了 after the
    // last move would credit the resignation — and the win — to the wrong
    // side, so fall back to 中断, which claims no result, and record the
    // parties in a comment.
    if (
      special === tsshogi.SpecialMoveType.RESIGN &&
      termination.winner != null
    ) {
      const resigner = opposing(termination.winner);
      if (built.position.color !== resigner) {
        outOfTurnEnding = { resigner, winner: termination.winner };
        special = tsshogi.SpecialMoveType.INTERRUPT;
      }
    }
    if (special !== undefined && !built.append(special))
      throw new Error("the ending could not be recorded");
    if (outOfTurnEnding !== undefined) {
      built.current.comment = `投了：${sideName(outOfTurnEnding.resigner)}（勝者：${sideName(outOfTurnEnding.winner)}）`;
    }
  }
  return { built, outOfTurnEnding };
}

/** KIF move rows always carry a time suffix; analysis records have no clocks. */
const KIF_TIME_SUFFIX = / \(\s*\d+:\d{2}\/\d{2}:\d{2}:\d{2}\)$/gm;
/** CSA time rows are optional; T0 for a clockless analysis would be invented. */
const CSA_TIME_LINE = /^T\d+(?:\.\d+)?$/gm;

function stripTimes(text: string, pattern: RegExp): string {
  return text.replace(pattern, "").replace(/[ \t]+$/gm, "");
}

function exportKakinoki(
  tsshogi: Tsshogi,
  record: KifuRecord,
  format: "kif" | "ki2",
): { text: string; outOfTurnEnding: boolean } {
  const { built, outOfTurnEnding } = buildRecord(tsshogi, record);
  // KI2 has no time columns; say so instead of implying a lossless record.
  if (
    format === "ki2" &&
    record.moveTimesMs !== undefined &&
    record.moves.length > 0
  )
    built.first.comment = "消費時間はKI2では保持されません。";
  let text =
    format === "kif" ? tsshogi.exportKIF(built) : tsshogi.exportKI2(built);
  if (format === "ki2") text = withKi2DropMarks(text, record);
  if (record.moveTimesMs === undefined)
    text = stripTimes(text, KIF_TIME_SUFFIX);
  return { text, outOfTurnEnding: outOfTurnEnding !== undefined };
}

/**
 * tsshogi's KI2 writer omits 打 on drops that no same-type board piece could
 * have made, while the common KI2 convention (Kifu for Windows output) marks
 * every drop and strict replay readers rely on it, so 打 is appended to the
 * drop plies here. A move begins at each ▲/△: the writer emits no padding
 * after a long notation, so whitespace is not a reliable token boundary.
 * Comments and metadata never contain move tokens in this writer's output.
 */
function withKi2DropMarks(text: string, record: KifuRecord): string {
  const drops = record.moves.map(
    (movement) => parseUsiMoveShape(movement).from === null,
  );
  if (!drops.some(Boolean)) return text;
  let ply = 0;
  return text
    .split("\n")
    .map((line) => {
      if (!/^[▲△]/.test(line)) return line;
      const starts: number[] = [];
      for (let index = 0; index < line.length; index++)
        if (line[index] === "▲" || line[index] === "△") starts.push(index);
      let rebuilt = "";
      let cursor = 0;
      for (let position = 0; position < starts.length; position++) {
        const start = starts[position] as number;
        const end =
          position + 1 < starts.length
            ? (starts[position + 1] as number)
            : line.length;
        rebuilt += line.slice(cursor, start);
        const token = line.slice(start, end);
        const trailing = /\s*$/.exec(token)?.[0] ?? "";
        const notation = token.slice(0, token.length - trailing.length);
        // One segment is one ply; a segment past the record stays unmarked.
        const mark =
          drops[ply] === true && !notation.endsWith("打") ? "打" : "";
        ply += 1;
        rebuilt += notation + mark + trailing;
        cursor = end;
      }
      return rebuilt;
    })
    .join("\n");
}

function exportCsa(
  tsshogi: Tsshogi,
  record: KifuRecord,
): { text: string; outOfTurnEnding: boolean } {
  const { built, outOfTurnEnding } = buildRecord(tsshogi, record);
  // V3.0 with the declared UTF-8 encoding; millisecond precision keeps charged
  // clock fractions instead of rounding them away.
  let text = tsshogi.exportCSA(built, {
    v3: { encoding: "UTF-8", milliseconds: true },
  });
  if (record.moveTimesMs === undefined) text = stripTimes(text, CSA_TIME_LINE);
  return { text, outOfTurnEnding: outOfTurnEnding !== undefined };
}

/**
 * Round-trips the text through Shift_JIS and rejects it when any character did
 * not survive, so the bytes never contain silent replacement characters.
 */
async function encodeShiftJis(
  text: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const encoding = await import("encoding-japanese");
  const bytes = encoding.convert(encoding.stringToCode(text), {
    from: "UNICODE",
    to: "SJIS",
  });
  const decoded = new TextDecoder("shift_jis").decode(new Uint8Array(bytes));
  return decoded === text ? new Uint8Array(bytes) : null;
}

const KIF_UTF8_HEADER = "#KIF version=2.0 encoding=UTF-8\n";

/**
 * Serializes one record into downloadable bytes. KIF and KI2 prefer Shift_JIS
 * for compatibility and fall back to the UTF-8 extension (.kifu / .ki2u) when
 * a character is not representable; CSA is always UTF-8 with the V3.0
 * declaration.
 */
export async function buildKifuFile(
  record: KifuRecord,
  format: KifuFormat,
  prefix = "shogi",
  at = new Date(),
): Promise<KifuFile> {
  if (format === "usi")
    return {
      fileName: kifuFileName(prefix, "usi", at),
      bytes: new TextEncoder().encode(`${toUsi(record)}\n`),
      encoding: "utf-8",
    };
  const tsshogi = (await import("tsshogi")) as Tsshogi;
  if (format === "csa") {
    const { text, outOfTurnEnding } = exportCsa(tsshogi, record);
    return {
      fileName: kifuFileName(prefix, "csa", at),
      bytes: new TextEncoder().encode(text),
      encoding: "utf-8",
      ...(outOfTurnEnding
        ? { notes: ["out-of-turn-ending"] as KifuNote[] }
        : {}),
    };
  }
  const { text, outOfTurnEnding } = exportKakinoki(tsshogi, record, format);
  const shiftJis = await encodeShiftJis(text);
  const notes: KifuNote[] = [
    ...(outOfTurnEnding ? (["out-of-turn-ending"] as const) : []),
    ...(shiftJis === null ? (["utf8-fallback"] as const) : []),
  ];
  if (shiftJis !== null)
    return {
      fileName: kifuFileName(prefix, format, at),
      bytes: shiftJis,
      encoding: "shift_jis",
      ...(notes.length > 0 ? { notes } : {}),
    };
  return {
    fileName: kifuFileName(prefix, format === "kif" ? "kifu" : "ki2u", at),
    bytes: new TextEncoder().encode(
      format === "kif" ? `${KIF_UTF8_HEADER}${text}` : text,
    ),
    encoding: "utf-8",
    ...(notes.length > 0 ? { notes } : {}),
  };
}
