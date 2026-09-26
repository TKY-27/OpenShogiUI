import { describe, expect, it } from "vitest";
import { MAX_KIFU_BYTES, parseKifuBytes } from "./kifu-import";
import { START_SFEN } from "./collection";

const utf8 = (text: string) => new TextEncoder().encode(text);

/** Shift_JIS bytes via the same converter the exporter uses. */
async function shiftJis(text: string): Promise<Uint8Array> {
  const encoding = await import("encoding-japanese");
  return new Uint8Array(
    encoding.convert(encoding.stringToCode(text), {
      from: "UNICODE",
      to: "SJIS",
    }),
  );
}

describe("kifu import", () => {
  it("reads USI position commands", async () => {
    const imported = await parseKifuBytes(
      utf8("position startpos moves 7g7f 3c3d"),
    );
    expect(imported.initialSfen).toBe(START_SFEN);
    expect(imported.moves).toEqual(["7g7f", "3c3d"]);
  });

  it("reads bare SFEN", async () => {
    const imported = await parseKifuBytes(utf8(START_SFEN));
    expect(imported.initialSfen).toBe(START_SFEN);
    expect(imported.moves).toEqual([]);
  });

  it("reads a Shift_JIS KIF with names and comments", async () => {
    const kif = [
      "［棋譜１］",
      "手合割：平手",
      "先手：テスト先手",
      "後手：テスト後手",
      "  1 ７六歩(77)",
      "*開局のコメント",
      "  2 ３四歩(33)",
    ].join("\n");
    const imported = await parseKifuBytes(await shiftJis(kif));
    expect(imported.moves).toEqual(["7g7f", "3c3d"]);
    expect(imported.blackName).toBe("テスト先手");
    expect(imported.whiteName).toBe("テスト後手");
    expect(imported.comments[0]).toContain("開局のコメント");
  });

  it("reads a KI2 record", async () => {
    const ki2 = ["▲７六歩", "△３四歩"].join("\n");
    const imported = await parseKifuBytes(utf8(ki2));
    expect(imported.moves).toEqual(["7g7f", "3c3d"]);
  });

  it("reads a CSA V3 record", async () => {
    const csa = [
      "V2.2",
      "N+テスト先手",
      "N-テスト後手",
      "'**テスト対局",
      "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY",
      "P2 * -HI *  *  *  *  * -KA * ",
      "P3-FU-FU-FU-FU-FU-FU-FU-FU-FU",
      "P4 *  *  *  *  *  *  *  *  * ",
      "P5 *  *  *  *  *  *  *  *  * ",
      "P6 *  *  *  *  *  *  *  *  * ",
      "P7+FU+FU+FU+FU+FU+FU+FU+FU+FU",
      "P8 * +KA *  *  *  *  * +HI * ",
      "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY",
      "+",
      "+7776FU",
      "T5",
      "-3334FU",
      "T5",
      "%TORYO",
    ].join("\n");
    const imported = await parseKifuBytes(utf8(csa));
    expect(imported.moves).toEqual(["7g7f", "3c3d"]);
    expect(imported.blackName).toBe("テスト先手");
    // The ending is kept as information, never replayed as a movement.
    expect(imported.moves).toHaveLength(2);
    expect(imported.endingNote).not.toBeNull();
  });

  it("keeps replaying a finished KIF while the ending line stays metadata", async () => {
    const kif = [
      "手合割：平手",
      "  1 ７六歩(77)",
      "  2 ３四歩(33)",
      "まで2手で投了",
    ].join("\n");
    const imported = await parseKifuBytes(utf8(kif));
    expect(imported.moves).toHaveLength(2);
  });

  it("rejects oversized, empty and unparseable files without touching the network", async () => {
    await expect(parseKifuBytes(new Uint8Array(0))).rejects.toThrow(
      "空のファイル",
    );
    await expect(
      parseKifuBytes(new Uint8Array(MAX_KIFU_BYTES + 1)),
    ).rejects.toThrow("128KiB");
    await expect(
      parseKifuBytes(utf8("これは棋譜ではありません")),
    ).rejects.toThrow("読み取れません");
  });
});
