import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { PieceKind } from "../browser-engine";
import {
  PIECE_ASSET_CATALOG,
  PIECE_SET_IDS,
  pieceAssetPath,
  pieceAssetSet,
  pieceFileCode,
} from "./catalog";

const expectedKinds: PieceKind[] = [
  "pawn",
  "lance",
  "knight",
  "silver",
  "gold",
  "bishop",
  "rook",
  "king",
  "promoted-pawn",
  "promoted-lance",
  "promoted-knight",
  "promoted-silver",
  "horse",
  "dragon",
];

describe("licensed piece asset catalog", () => {
  it("contains exactly the 13 CC BY 4.0 standard sets", () => {
    expect(PIECE_ASSET_CATALOG).toHaveLength(13);
    expect(new Set(PIECE_SET_IDS).size).toBe(13);
    expect(new Set(PIECE_ASSET_CATALOG.map((entry) => entry.id)).size).toBe(13);
    expect(
      PIECE_ASSET_CATALOG.every((entry) => entry.license === "CC BY 4.0"),
    ).toBe(true);
  });

  it("maps every set to exactly 30 checked-in image files", () => {
    for (const entry of PIECE_ASSET_CATALOG) {
      const directory = resolve(
        process.cwd(),
        "public",
        entry.directory.slice(1),
      );
      const files = readdirSync(directory).filter((file) =>
        file.endsWith(`.${entry.extension}`),
      );
      expect(files).toHaveLength(entry.imageCount);
      expect(files.every((file) => existsSync(resolve(directory, file)))).toBe(
        true,
      );
    }
  });

  it("preserves the upstream side and role filename convention", () => {
    expect(pieceAssetPath("kanji_brown", "black", "pawn")).toBe(
      "/pieces/standard/kanji_brown/0FU.svg",
    );
    expect(pieceAssetPath("kanji_brown", "white", "dragon")).toBe(
      "/pieces/standard/kanji_brown/1RY.svg",
    );
    expect(pieceAssetPath("intl_portella", "white", "horse")).toBe(
      "/pieces/standard/intl_portella/1UM.png",
    );
    expect(expectedKinds.map(pieceFileCode)).toEqual([
      "FU",
      "KY",
      "KE",
      "GI",
      "KI",
      "KA",
      "HI",
      "OU",
      "TO",
      "NY",
      "NK",
      "NG",
      "UM",
      "RY",
    ]);
    expect(pieceFileCode("promoted-knight")).toBe("NK");
    expect(pieceAssetSet("simple_kanji").creators).toEqual(["Ka-hu"]);
  });

  it("does not expose an unlicensed set through the typed ID union", () => {
    expect(PIECE_SET_IDS).not.toContain("dobutsu");
    expect(PIECE_SET_IDS).not.toContain("portella");
    expect(PIECE_SET_IDS).not.toContain("2kanji_3d");
  });
});
