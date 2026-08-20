import type { PieceKind, Side } from "../browser-engine";

export const PIECE_SET_IDS = [
  "1kanji_3d",
  "intl_colored_3d",
  "intl_colored_2d",
  "intl_monochrome_2d",
  "intl_shadowed",
  "intl_wooden_3d",
  "international",
  "kanji_guide_shadowed",
  "intl_portella",
  "simple_kanji",
  "kanji_red_wood",
  "kanji_light",
  "kanji_brown",
] as const;

export type PieceSetId = (typeof PIECE_SET_IDS)[number];
export type PieceAssetExtension = "png" | "svg";
export type PieceFileCode =
  | "FU"
  | "KY"
  | "KE"
  | "GI"
  | "KI"
  | "KA"
  | "HI"
  | "OU"
  | "TO"
  | "NY"
  | "NK"
  | "NG"
  | "UM"
  | "RY";

export interface PieceSetAsset {
  readonly id: PieceSetId;
  readonly label: string;
  readonly creators: readonly string[];
  readonly license: "CC BY 4.0";
  readonly extension: PieceAssetExtension;
  readonly imageCount: 30;
  readonly directory: `/pieces/standard/${PieceSetId}`;
}

const asset = (
  id: PieceSetId,
  label: string,
  creators: readonly string[],
  extension: PieceAssetExtension = "svg",
): PieceSetAsset => ({
  id,
  label,
  creators,
  license: "CC BY 4.0",
  extension,
  imageCount: 30,
  directory: `/pieces/standard/${id}`,
});

/** The 13 standard-shogi sets explicitly marked CC BY 4.0 in Lishogi COPYING.md. */
export const PIECE_ASSET_CATALOG: readonly PieceSetAsset[] = [
  asset("1kanji_3d", "Kanji 3D", ["Little-Mage", "CouchTomato87"]),
  asset("intl_colored_3d", "International Colored 3D", [
    "Little-Mage",
    "CouchTomato87",
  ]),
  asset("intl_colored_2d", "International Colored 2D", ["CouchTomato87"]),
  asset("intl_monochrome_2d", "International Monochrome 2D", ["CouchTomato87"]),
  asset("intl_shadowed", "International Shadowed", ["CouchTomato87"]),
  asset("intl_wooden_3d", "International Wooden 3D", ["CouchTomato87"]),
  asset("international", "International Variant", ["CouchTomato87"]),
  asset("kanji_guide_shadowed", "Kanji Guide Shadowed", ["CouchTomato87"]),
  asset("intl_portella", "International Portella", ["CouchTomato87"], "png"),
  asset("simple_kanji", "Simple Kanji", ["Ka-hu"]),
  asset("kanji_red_wood", "Kanji Red Wood", ["Ka-hu"]),
  asset("kanji_light", "Kanji Light", ["Ka-hu"]),
  asset("kanji_brown", "Kanji Brown", ["Ka-hu"]),
];

const PIECE_ASSET_BY_ID: ReadonlyMap<PieceSetId, PieceSetAsset> = new Map(
  PIECE_ASSET_CATALOG.map((entry) => [entry.id, entry]),
);

const PIECE_FILE_CODES: Record<PieceKind, PieceFileCode> = {
  pawn: "FU",
  lance: "KY",
  knight: "KE",
  silver: "GI",
  gold: "KI",
  bishop: "KA",
  rook: "HI",
  king: "OU",
  "promoted-pawn": "TO",
  "promoted-lance": "NY",
  "promoted-knight": "NK",
  "promoted-silver": "NG",
  horse: "UM",
  dragon: "RY",
};

/** Return an immutable catalog entry; invalid IDs are programming errors. */
export function pieceAssetSet(id: PieceSetId): PieceSetAsset {
  const entry = PIECE_ASSET_BY_ID.get(id);
  if (entry === undefined) throw new Error(`Unknown piece asset set: ${id}`);
  return entry;
}

/** Map the browser engine's side/kind pair to Lishogi's exact image filename. */
export function pieceAssetPath(
  setId: PieceSetId,
  side: Side,
  kind: PieceKind,
): string {
  const entry = pieceAssetSet(setId);
  const color = side === "black" ? "0" : "1";
  return `${entry.directory}/${color}${PIECE_FILE_CODES[kind]}.${entry.extension}`;
}

export function pieceFileCode(kind: PieceKind): PieceFileCode {
  return PIECE_FILE_CODES[kind];
}
