/** Closed, compact wire format. No kifu metadata or diagnostics enter this boundary. */
export const CONSENT_VERSION = "2026-09-21-v1";
export const MAX_COLLECTION_BYTES = 12_288;
export const MAX_COLLECTION_MOVES = 512;
export const RETENTION_DAYS = 30;
export interface CollectionIdentity {
  modelId: string;
  modelSha256: string;
  jsSha256: string;
  wasmSha256: string;
}
export interface GameSubmission {
  schema: "open_shogi_submission/v1";
  gameId: string;
  consentVersion: typeof CONSENT_VERSION;
  model: CollectionIdentity;
  humanSide: "black" | "white";
  winner: "black" | "white";
  reason: "resignation" | "engine-resignation" | "checkmate";
  settings: {
    preset: "blitz3" | "rapid10";
    profile: "balanced" | "quality";
    controller: false;
    ponder: false;
  };
  moves: string[];
}
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !Object.keys(value).every((key) => keys.includes(key))
  )
    throw new Error("schema");
}
export function parseCollectionIdentity(value: unknown): CollectionIdentity {
  exact(value, ["modelId", "modelSha256", "jsSha256", "wasmSha256"]);
  if (
    typeof value.modelId !== "string" ||
    !/^r4-c4[-a-zA-Z0-9._]{0,90}$/.test(value.modelId)
  )
    throw new Error("model");
  for (const key of ["modelSha256", "jsSha256", "wasmSha256"])
    if (typeof value[key] !== "string" || !/^[a-f0-9]{64}$/.test(value[key]))
      throw new Error("model");
  return {
    modelId: value.modelId,
    modelSha256: value.modelSha256 as string,
    jsSha256: value.jsSha256 as string,
    wasmSha256: value.wasmSha256 as string,
  };
}
export function sameCollectionIdentity(
  a: CollectionIdentity,
  b: CollectionIdentity,
): boolean {
  return (
    a.modelId === b.modelId &&
    a.modelSha256 === b.modelSha256 &&
    a.jsSha256 === b.jsSha256 &&
    a.wasmSha256 === b.wasmSha256
  );
}
export function parseSubmission(
  value: unknown,
  allowlist: readonly CollectionIdentity[],
): GameSubmission {
  exact(value, [
    "schema",
    "gameId",
    "consentVersion",
    "model",
    "humanSide",
    "winner",
    "reason",
    "settings",
    "moves",
  ]);
  if (
    value.schema !== "open_shogi_submission/v1" ||
    value.consentVersion !== CONSENT_VERSION ||
    typeof value.gameId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value.gameId,
    )
  )
    throw new Error("schema");
  const model = parseCollectionIdentity(value.model);
  if (!allowlist.some((entry) => sameCollectionIdentity(entry, model)))
    throw new Error("model");
  if (
    typeof value.humanSide !== "string" ||
    !["black", "white"].includes(value.humanSide) ||
    typeof value.winner !== "string" ||
    !["black", "white"].includes(value.winner) ||
    typeof value.reason !== "string" ||
    !["resignation", "engine-resignation", "checkmate"].includes(value.reason)
  )
    throw new Error("result");
  if (
    (value.reason === "resignation" && value.winner === value.humanSide) ||
    (value.reason === "engine-resignation" && value.winner !== value.humanSide)
  )
    throw new Error("result");
  exact(value.settings, ["preset", "profile", "controller", "ponder"]);
  if (
    typeof value.settings.preset !== "string" ||
    !["blitz3", "rapid10"].includes(value.settings.preset) ||
    typeof value.settings.profile !== "string" ||
    !["balanced", "quality"].includes(value.settings.profile) ||
    value.settings.controller !== false ||
    value.settings.ponder !== false
  )
    throw new Error("settings");
  if (
    !Array.isArray(value.moves) ||
    value.moves.length > MAX_COLLECTION_MOVES ||
    !value.moves.every(
      (move) =>
        typeof move === "string" &&
        /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(move),
    )
  )
    throw new Error("moves");
  if (
    value.reason === "checkmate" &&
    (!value.moves.length ||
      value.winner !== (value.moves.length % 2 ? "black" : "white"))
  )
    throw new Error("result");
  return {
    schema: "open_shogi_submission/v1",
    gameId: value.gameId,
    consentVersion: CONSENT_VERSION,
    model,
    humanSide: value.humanSide as GameSubmission["humanSide"],
    winner: value.winner as GameSubmission["winner"],
    reason: value.reason as GameSubmission["reason"],
    settings: {
      preset: value.settings.preset as GameSubmission["settings"]["preset"],
      profile: value.settings.profile as GameSubmission["settings"]["profile"],
      controller: false,
      ponder: false,
    },
    moves: [...value.moves],
  };
}
