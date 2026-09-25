import { describe, expect, it } from "vitest";

import { START_SFEN } from "./collection";
import { buildKifuFile, type KifuFile } from "./kifu-export";
import type { KifuRecord } from "./kifu";

const startedAt = new Date(2026, 8, 26, 10, 5, 0);

function record(overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    initialSfen: START_SFEN,
    moves: ["7g7f", "3c3d", "2g2f", "2b8h+", "8i8h", "B*4e"],
    blackName: "あなた",
    whiteName: "OpenShogiAI r4c4",
    timeLimit: "3分切れ負け",
    startedAt,
    moveTimesMs: [3_000, 8_000, 2_000, 61_000, 1_500, 4_000],
    termination: "resignation",
    ...overrides,
  };
}

async function decode(file: KifuFile): Promise<string> {
  return new TextDecoder(
    file.encoding === "shift_jis" ? "shift_jis" : "utf-8",
  ).decode(file.bytes);
}

describe("KIF files", () => {
  it("writes Shift_JIS bytes with the .kif extension", async () => {
    const file = await buildKifuFile(record(), "kif", "shogi-match");
    expect(file.encoding).toBe("shift_jis");
    expect(file.fileName).toMatch(/^shogi-match-\d{8}-\d{6}\.kif$/);
    const text = await decode(file);
    expect(text).toContain("手合割：平手");
    expect(text).toContain("先手：あなた");
    expect(text).toContain("後手：OpenShogiAI r4c4");
    expect(text).toContain("開始日時：2026/09/26 10:05:00");
    expect(text).toContain("持ち時間：3分切れ負け");
  });

  it("replays moves from the board: captures, promotions, 同 and drops", async () => {
    const text = await decode(await buildKifuFile(record(), "kif"));
    expect(text).toContain("７六歩(77)");
    expect(text).toContain("３四歩(33)");
    expect(text).toContain("８八角成(22)");
    expect(text).toContain("同　桂(89)");
    expect(text).toContain("４五角打");
  });

  it("keeps per-move and per-side cumulative charged time", async () => {
    const text = await decode(await buildKifuFile(record(), "kif"));
    // Black: 3s + 2s = 5s. White: 8s then 61s -> 1:09.
    expect(text).toContain("( 0:03/00:00:03)");
    expect(text).toContain("( 0:08/00:00:08)");
    expect(text).toContain("( 0:02/00:00:05)");
    expect(text).toContain("( 1:01/00:01:09)");
    expect(text).toContain("   7 投了");
  });

  it("omits time columns and the start date when they are unknown", async () => {
    const text = await decode(
      await buildKifuFile(
        record({
          moveTimesMs: undefined,
          startedAt: undefined,
          timeLimit: undefined,
        }),
        "kif",
      ),
    );
    expect(text).not.toMatch(/\d:\d{2}\/\d{2}:\d{2}:\d{2}/);
    expect(text).not.toContain("開始日時");
    expect(text).not.toContain("持ち時間");
    expect(text).toContain("７六歩(77)");
  });

  it("draws a non-standard start from its SFEN instead of claiming 平手", async () => {
    const text = await decode(
      await buildKifuFile(
        record({
          initialSfen:
            "lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
          moves: ["7g7f"],
          moveTimesMs: undefined,
        }),
        "kif",
      ),
    );
    expect(text).toContain("+---------------------------+");
    expect(text).not.toContain("手合割：平手");
    expect(text).toContain("７六歩(77)");
  });

  it("ends after the last move when the game is unfinished", async () => {
    const text = await decode(
      await buildKifuFile(record({ termination: undefined }), "kif"),
    );
    expect(text).not.toContain("投了");
  });

  it("maps realized endings and leaves unknown ones unmapped", async () => {
    expect(
      await decode(
        await buildKifuFile(record({ termination: "timeout" }), "kif"),
      ),
    ).toContain("切れ負け");
    expect(
      await decode(
        await buildKifuFile(record({ termination: "checkmate" }), "kif"),
      ),
    ).toContain("詰み");
    expect(
      await decode(
        await buildKifuFile(record({ termination: "repetition" }), "kif"),
      ),
    ).toContain("千日手");
    const unknown = await decode(
      await buildKifuFile(record({ termination: "warp" }), "kif"),
    );
    expect(unknown).not.toContain("投了");
    expect(unknown).not.toContain("詰み");
    // Perpetual check and failed declarations are fouls by the mover.
    expect(
      await decode(
        await buildKifuFile(record({ termination: "perpetual-check" }), "kif"),
      ),
    ).toContain("反則負け");
  });

  it("draws hands of a custom start and replays drops from them", async () => {
    // White rook lost, black holds one: a non-standard start with a hand.
    const text = await decode(
      await buildKifuFile(
        record({
          initialSfen:
            "lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b R 1",
          moves: ["R*5e"],
          moveTimesMs: undefined,
          termination: undefined,
        }),
        "kif",
      ),
    );
    expect(text).toContain("+---------------------------+");
    expect(text).toContain("先手の持駒：飛");
    expect(text).not.toContain("手合割：平手");
    expect(text).toContain("５五飛打");
  });

  it("falls back to UTF-8 with the .kifu extension for unencodable names", async () => {
    const file = await buildKifuFile(record({ blackName: "あなた🐻" }), "kif");
    expect(file.encoding).toBe("utf-8");
    expect(file.note).toBe("utf8-fallback");
    expect(file.fileName.endsWith(".kifu")).toBe(true);
    const text = await decode(file);
    expect(text).toContain("#KIF version=2.0 encoding=UTF-8");
    expect(text).toContain("先手：あなた🐻");
  });
});

describe("KI2 files", () => {
  it("writes Shift_JIS bytes with the .ki2 extension and wide notation", async () => {
    const file = await buildKifuFile(record(), "ki2");
    expect(file.encoding).toBe("shift_jis");
    expect(file.fileName.endsWith(".ki2")).toBe(true);
    const text = await decode(file);
    expect(text).toContain("手合割：平手");
    expect(text).toContain("▲７六歩");
    expect(text).toContain("△３四歩");
    expect(text).toContain("△８八角成");
    expect(text).toContain("▲同　桂");
    expect(text).toContain("△４五角打");
    expect(text).toContain("まで6手で後手の勝ち");
  });

  it("disambiguates same-type pieces from the moving side's view", async () => {
    // Two black golds on 6i and 4i can both reach 5h; 4i is the right one.
    const golds = "4k4/9/9/9/9/9/9/1R7/3GKG3 b - 1";
    for (const [moves, notation] of [
      [["4i5h"], "▲５八金右"],
      [["6i5h"], "▲５八金左"],
      // White recaptures on the square black just played to.
      [["4i5h", "8h5h"], "△同　飛"],
    ] as const) {
      const text = await decode(
        await buildKifuFile(
          record({
            initialSfen: golds,
            moves: [...moves],
            moveTimesMs: undefined,
            termination: undefined,
          }),
          "ki2",
        ),
      );
      expect(text).toContain(notation);
    }
  });

  it("writes 不成 for a non-promoting move into the promotion zone", async () => {
    const text = await decode(
      await buildKifuFile(
        record({
          initialSfen: "4k4/9/9/4S4/9/9/9/4K4/9 b - 1",
          moves: ["5d5c"],
          moveTimesMs: undefined,
          termination: undefined,
        }),
        "ki2",
      ),
    );
    expect(text).toContain("▲５三銀不成");
    const kif = await decode(
      await buildKifuFile(
        record({
          initialSfen: "4k4/9/9/4S4/9/9/9/4K4/9 b - 1",
          moves: ["5d5c"],
          moveTimesMs: undefined,
          termination: undefined,
        }),
        "kif",
      ),
    );
    expect(kif).toContain("５三銀(54)");
    expect(kif).not.toContain("不成");
  });

  it("explains that charged time is not representable", async () => {
    const text = await decode(await buildKifuFile(record(), "ki2"));
    expect(text).toContain("*消費時間はKI2では保持されません。");
  });

  it("keeps the UTF-8 variant under .ki2u", async () => {
    const file = await buildKifuFile(record({ blackName: "🐻" }), "ki2");
    expect(file.encoding).toBe("utf-8");
    expect(file.fileName.endsWith(".ki2u")).toBe(true);
    expect(await decode(file)).toContain("先手：🐻");
  });
});

describe("CSA files", () => {
  it("declares V3.0 with UTF-8 and writes moves, drops and the ending", async () => {
    const file = await buildKifuFile(record(), "csa");
    expect(file.encoding).toBe("utf-8");
    expect(file.fileName.endsWith(".csa")).toBe(true);
    const text = await decode(file);
    const lines = text.split("\n");
    expect(lines[0]).toBe("'CSA encoding=UTF-8");
    expect(lines[1]).toBe("V3.0");
    expect(text).toContain("N+あなた");
    expect(text).toContain("N-OpenShogiAI r4c4");
    expect(text).toContain("+7776FU");
    expect(text).toContain("-3334FU");
    expect(text).toContain("-2288UM");
    expect(text).toContain("+8988KE");
    expect(text).toContain("-0045KA");
    // Time rows are whole seconds unless the charged clock has a fraction.
    expect(text).toMatch(/^T3$/m);
    expect(text).toMatch(/^T8$/m);
    expect(text).toMatch(/^T61$/m);
    expect(text).toContain("%TORYO");
  });

  it("keeps sub-second charged time with the V3 decimal form", async () => {
    const text = await decode(
      await buildKifuFile(
        record({
          moves: ["7g7f"],
          moveTimesMs: [2_500],
          termination: undefined,
        }),
        "csa",
      ),
    );
    expect(text).toMatch(/^T2\.5$/m);
  });

  it("omits time rows for records without clock data", async () => {
    const text = await decode(
      await buildKifuFile(record({ moveTimesMs: undefined }), "csa"),
    );
    expect(text).not.toMatch(/^T\d+(\.\d+)?$/m);
    expect(text).toContain("%TORYO");
  });

  it("writes %TIME_UP, %SENNICHITE and %TSUMI for the matching endings", async () => {
    for (const [reason, code] of [
      ["timeout", "%TIME_UP"],
      ["repetition", "%SENNICHITE"],
      ["checkmate", "%TSUMI"],
    ] as const) {
      expect(
        await decode(
          await buildKifuFile(record({ termination: reason }), "csa"),
        ),
      ).toContain(code);
    }
  });

  it("keeps the initial position and side to move for a custom start", async () => {
    const text = await decode(
      await buildKifuFile(
        record({
          initialSfen:
            "lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
          moves: [],
          moveTimesMs: undefined,
          termination: undefined,
        }),
        "csa",
      ),
    );
    expect(text).toContain("P1");
    expect(text.split("\n").some((line) => line === "+")).toBe(true);
  });
});

describe("USI files", () => {
  it("keeps the existing position line behaviour", async () => {
    const file = await buildKifuFile(record(), "usi");
    expect(await decode(file)).toBe(
      `position sfen ${START_SFEN} moves 7g7f 3c3d 2g2f 2b8h+ 8i8h B*4e\n`,
    );
  });
});

describe("edge cases", () => {
  it("exports a record with no moves in every format", async () => {
    const bare = record({
      moves: [],
      moveTimesMs: undefined,
      termination: undefined,
    });
    const kif = await decode(await buildKifuFile(bare, "kif"));
    expect(kif).toContain("手合割：平手");
    expect(kif).not.toContain("７六歩");
    const ki2 = await decode(await buildKifuFile(bare, "ki2"));
    expect(ki2).not.toContain("*消費時間");
    const csa = await decode(await buildKifuFile(bare, "csa"));
    expect(csa).toContain("PI");
  });

  it("rejects a record whose moves do not replay", async () => {
    await expect(
      buildKifuFile(record({ moves: ["7g7f", "7g7f"] }), "kif"),
    ).rejects.toThrow();
  });

  it("emits files that tsshogi's independent readers parse back", async () => {
    // Same-vendor round-trip is not proof of spec conformance on its own; the
    // exact notations above are checked against the primary specs. This only
    // guards against structurally malformed output. KI2 uses a 同-free record
    // because tsshogi's own KI2 reader (not the writer) cannot parse 同　 yet.
    const { importCSA, importKIF, importKI2, Record } = await import("tsshogi");
    const kifText = await decode(await buildKifuFile(record(), "kif"));
    const kif = importKIF(kifText);
    expect(kif).toBeInstanceOf(Record);
    expect(kif instanceof Record && kif.length).toBe(record().moves.length + 1);
    const plain = record({
      moves: record().moves.filter((movement) => movement !== "8i8h"),
    });
    const ki2 = importKI2(await decode(await buildKifuFile(plain, "ki2")));
    expect(ki2).toBeInstanceOf(Record);
    expect(ki2 instanceof Record && ki2.length).toBe(plain.moves.length + 1);
    const csa = await decode(await buildKifuFile(record(), "csa"));
    expect(importCSA(csa)).toBeInstanceOf(Record);
  });

  it("keeps drop marks aligned across wrapped KI2 move lines", async () => {
    // Ten plies wrap onto a second KI2 line (six tokens per line) and the
    // seventh ply is a hand drop, so the token/ply mapping must survive the
    // line break and the re-padded columns.
    const moves = [
      "7g7f",
      "3c3d",
      "2g2f",
      "8c8d",
      "8h4h",
      "5a5b",
      "P*4e",
      "3a2b",
      "7i6h",
      "4c4d",
    ];
    const line = record({
      moves,
      moveTimesMs: undefined,
      termination: undefined,
    });
    const text = await decode(await buildKifuFile(line, "ki2"));
    expect(text).toContain("▲４五歩打");
    // tsshogi's KI2 reader cannot resolve every move it writes (plain slides
    // and 同　), so verify the token layout directly instead of round-tripping:
    // one token per ply, the drop ply marked, the line break kept.
    const tokens = text
      .split("\n")
      .flatMap((row) => row.split(" "))
      .filter((token) => /^[▲△]/.test(token));
    expect(tokens).toHaveLength(moves.length);
    expect(tokens[moves.indexOf("P*4e")]).toBe("▲４五歩打");
    expect(text.split("\n").some((row) => row.startsWith("▲４五歩打"))).toBe(
      true,
    );
  });
});
