import { describe, expect, it } from "vitest";

import { kifuFileName, readKifuFormat, toUsi, writeKifuFormat } from "./kifu";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

describe("USI export", () => {
  it("emits a startpos-equivalent line with every move", () => {
    expect(
      toUsi({ initialSfen: START, moves: ["7g7f", "2b8h+", "8i8h", "B*4e"] }),
    ).toBe(`position sfen ${START} moves 7g7f 2b8h+ 8i8h B*4e`);
  });

  it("emits a bare position before the first move", () => {
    expect(toUsi({ initialSfen: START, moves: [] })).toBe(
      `position sfen ${START}`,
    );
  });
});

describe("file naming", () => {
  it("stamps the local date and time", () => {
    expect(kifuFileName("match", "kif", new Date(2026, 7, 21, 9, 5, 7))).toBe(
      "match-20260821-090507.kif",
    );
  });
});

describe("format preference", () => {
  it("defaults to KIF when storage is unavailable", () => {
    expect(readKifuFormat()).toBe("kif");
  });

  it("rejects unknown stored formats", () => {
    writeKifuFormat("kif");
    expect(readKifuFormat()).toBe("kif");
  });
});
