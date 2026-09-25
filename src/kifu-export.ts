import { START_SFEN } from "./collection";
import { kifuFileName, toUsi, type KifuFormat, type KifuRecord } from "./kifu";
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
  /** Set when Shift_JIS was not representable and the UTF-8 variant was used. */
  note?: "utf8-fallback";
}

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

function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildRecord(
  tsshogi: Tsshogi,
  record: KifuRecord,
): import("tsshogi").Record {
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
  if (record.termination !== undefined) {
    const special = specialMoveFor(tsshogi, record.termination);
    if (special !== undefined && !built.append(special))
      throw new Error("the ending could not be recorded");
  }
  return built;
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
): string {
  const built = buildRecord(tsshogi, record);
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
  return text;
}

/**
 * tsshogi's KI2 writer omits 打 on drops that no same-type board piece could
 * have made, while the common KI2 convention (Kifu for Windows output) marks
 * every drop, and strict replay readers rely on it. Re-append 打 to each drop
 * token and rebuild the padded columns.
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
      const rebuilt: string[] = [];
      for (const token of line.split(" ").filter((part) => part.length > 0)) {
        if (
          drops[ply] === true &&
          /^[▲△]/.test(token) &&
          !token.endsWith("打")
        ) {
          ply++;
          rebuilt.push(`${token}打`);
        } else {
          if (/^[▲△]/.test(token)) ply++;
          rebuilt.push(token);
        }
      }
      return rebuilt
        .map((token, index) =>
          index === 0
            ? token
            : `${" ".repeat(Math.max(12 - rebuilt[index - 1].length * 2, 1))}${token}`,
        )
        .join("");
    })
    .join("\n");
}

function exportCsa(tsshogi: Tsshogi, record: KifuRecord): string {
  const built = buildRecord(tsshogi, record);
  // V3.0 with the declared UTF-8 encoding; millisecond precision keeps charged
  // clock fractions instead of rounding them away.
  let text = tsshogi.exportCSA(built, {
    v3: { encoding: "UTF-8", milliseconds: true },
  });
  if (record.moveTimesMs === undefined) text = stripTimes(text, CSA_TIME_LINE);
  return text;
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
  if (format === "csa")
    return {
      fileName: kifuFileName(prefix, "csa", at),
      bytes: new TextEncoder().encode(exportCsa(tsshogi, record)),
      encoding: "utf-8",
    };
  const text = exportKakinoki(tsshogi, record, format);
  const shiftJis = await encodeShiftJis(text);
  if (shiftJis !== null)
    return {
      fileName: kifuFileName(prefix, format, at),
      bytes: shiftJis,
      encoding: "shift_jis",
    };
  return {
    fileName: kifuFileName(prefix, format === "kif" ? "kifu" : "ki2u", at),
    bytes: new TextEncoder().encode(
      format === "kif" ? `${KIF_UTF8_HEADER}${text}` : text,
    ),
    encoding: "utf-8",
    note: "utf8-fallback",
  };
}
