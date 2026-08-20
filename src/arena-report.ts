export const ARENA_REPORT_SCHEMA_V1 = "phase2_arena_report/v1";
export const ARENA_REPORT_SCHEMA_V2 = "phase2_arena_report/v2";
export const ARENA_REPORT_SCHEMA = ARENA_REPORT_SCHEMA_V2;
export const SUPPORTED_ARENA_REPORT_SCHEMAS = [
  ARENA_REPORT_SCHEMA_V2,
  ARENA_REPORT_SCHEMA_V1,
] as const;

export const MAX_ARENA_REPORT_BYTES = 5 * 1024 * 1024;
export const MAX_ARENA_GAMES = 10_000;
export const MAX_METADATA_CHARS = 1024;
export const MAX_PLAYER_CHARS = 256;
export const MAX_CSA_PATH_CHARS = 1024;

const MAX_SEARCH_DEPTH = 64;
const MAX_HASH_MEGABYTES = 1024;
const MAX_NODES_PER_MOVE = 1_000_000_000;
const MAX_MOVETIME_MS = 3_600_000;
const MAX_PLIES = 10_000;
const MAX_SFEN_CHARS = 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
const LOWERCASE_GIT_COMMIT_PATTERN = /^[0-9a-f]{7,64}$/;
const PLAYER_PATTERN = /^(?:random|search(?::[A-Za-z0-9][A-Za-z0-9._-]*)*)$/;
const ENGINE_VERSION_PATTERN =
  /^OpenShogiAI ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?) /;
const SFEN_BOARD_PIECES = "PLNSGBRKplnsgbrk";
const SFEN_PROMOTABLE_PIECES = "PLNSBRplnsbr";
const SFEN_HAND_ORDER = "RBGSNLPrbgsnlp";
const SFEN_MATERIAL_LIMITS: Readonly<Record<string, number>> = {
  P: 18,
  L: 4,
  N: 4,
  S: 4,
  G: 4,
  B: 2,
  R: 2,
  K: 2,
};

export type ArenaReportErrorCode =
  | "invalid-json"
  | "unsupported-field"
  | "missing-field"
  | "expected-object"
  | "expected-boolean"
  | "non-empty-string"
  | "string-too-long"
  | "non-negative-integer"
  | "positive-integer"
  | "non-negative-number"
  | "unit-rate"
  | "invalid-timestamp"
  | "invalid-commit"
  | "invalid-player"
  | "invalid-enum"
  | "invalid-sha256"
  | "invalid-sfen"
  | "game-limit"
  | "completion-before-start"
  | "unsupported-result"
  | "games-array"
  | "schema-mismatch"
  | "games-over-limit"
  | "games-count-mismatch"
  | "finished-games-over-total"
  | "search-wins-over-finished"
  | "draws-over-finished"
  | "outcomes-over-finished"
  | "duplicate-game-id"
  | "non-contiguous-game-id"
  | "finished-games-mismatch"
  | "draws-mismatch"
  | "search-wins-mismatch"
  | "player-wins-mismatch"
  | "identity-mismatch"
  | "schedule-mismatch"
  | "game-invariant"
  | "aggregate-mismatch"
  | "completed-run-incomplete";

export class ArenaReportValidationError extends Error {
  readonly code: ArenaReportErrorCode;
  readonly details: Record<string, string | number>;

  constructor(
    code: ArenaReportErrorCode,
    details: Record<string, string | number>,
    message: string,
  ) {
    super(message);
    this.name = "ArenaReportValidationError";
    this.code = code;
    this.details = details;
  }
}

function fail(
  code: ArenaReportErrorCode,
  details: Record<string, string | number>,
  message: string,
): never {
  throw new ArenaReportValidationError(code, details, message);
}

export type ArenaGameResult = "black_win" | "white_win" | "draw" | "max_plies";
export type ArenaEvaluatorKind =
  | "random"
  | "material"
  | "handcrafted-baseline"
  | "handcrafted-experimental"
  | "neural";
export type ArenaQuantization = "float32" | "int8";
export type ArenaBudgetKind = "nodes" | "movetime_ms";

export interface ArenaGameV1 {
  id: number;
  black: string;
  white: string;
  result: ArenaGameResult;
  moves: number;
  csaPath: string | null;
}

export interface ArenaGameV2 {
  id: number;
  black: string;
  white: string;
  result: ArenaGameResult;
  moves: number;
  csaPath: string;
  csaSha256: string;
  csaSize: number;
  neuralInferenceCalls: number;
  neuralInferenceTimeNs: number;
  playerASearchNodes: number;
  playerASearchElapsedMs: number;
  playerADepthSum: number;
  playerASearches: number;
  playerANeuralInferenceCalls: number;
  playerANeuralInferenceTimeNs: number;
  playerBSearchNodes: number;
  playerBSearchElapsedMs: number;
  playerBDepthSum: number;
  playerBSearches: number;
  playerBNeuralInferenceCalls: number;
  playerBNeuralInferenceTimeNs: number;
}

export type ArenaGame = ArenaGameV1 | ArenaGameV2;

export interface ArenaRunV1 {
  seed: number;
  gameLimit: number;
  engine: string;
  gitCommit: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ArenaBudgetIdentity {
  kind: ArenaBudgetKind;
  value: number;
}

export interface ArenaPlayerIdentity {
  label: string;
  evaluatorKind: ArenaEvaluatorKind;
  searchDepth: number | null;
  hashMegabytes: number | null;
  transposition: boolean | null;
  modelArtifactSha256: string | null;
  modelArtifactSize: number | null;
  modelPayloadSha256: string | null;
  architectureVersion: number | null;
  quantization: ArenaQuantization | null;
  openingEnabled: boolean;
}

export interface ArenaOpeningIdentity {
  enabled: boolean;
  artifactSha256: string | null;
  artifactSize: number | null;
  maxPlies: number | null;
}

export interface ArenaRunV2 extends ArenaRunV1 {
  initialSfen: string;
  maxPlies: number;
  configSha256: string;
  budget: ArenaBudgetIdentity;
  playerA: ArenaPlayerIdentity;
  playerB: ArenaPlayerIdentity;
  opening: ArenaOpeningIdentity;
}

export interface ArenaMetricsV1 {
  games: number;
  finishedGames: number;
  searchWins: number;
  draws: number;
  nodesPerSecond: number;
  averageDepth: number;
  ttHitRate: number;
  cutoffRate: number;
  pruningRate: number;
  millisecondsPerMove: number;
  peakMemoryBytes: number | null;
  illegalMoves: number;
}

export interface ArenaMetricsV2 extends ArenaMetricsV1 {
  playerAWins: number;
  playerBWins: number;
  neuralInferenceCalls: number;
  neuralInferenceTimeNs: number;
  playerASearchNodes: number;
  playerASearchElapsedMs: number;
  playerADepthSum: number;
  playerASearches: number;
  playerANeuralInferenceCalls: number;
  playerANeuralInferenceTimeNs: number;
  playerBSearchNodes: number;
  playerBSearchElapsedMs: number;
  playerBDepthSum: number;
  playerBSearches: number;
  playerBNeuralInferenceCalls: number;
  playerBNeuralInferenceTimeNs: number;
}

export interface ArenaReportV1 {
  schema: typeof ARENA_REPORT_SCHEMA_V1;
  run: ArenaRunV1;
  metrics: ArenaMetricsV1;
  games: ArenaGameV1[];
}

export interface ArenaReportV2 {
  schema: typeof ARENA_REPORT_SCHEMA_V2;
  run: ArenaRunV2;
  metrics: ArenaMetricsV2;
  games: ArenaGameV2[];
}

export type ArenaReport = ArenaReportV1 | ArenaReportV2;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: UnknownRecord,
  expectedKeys: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!expectedKeys.includes(key)) {
      fail(
        "unsupported-field",
        { key, path },
        `${path} contains unsupported field "${key}".`,
      );
    }
  }
  for (const key of expectedKeys) {
    if (!(key in value)) {
      fail(
        "missing-field",
        { key, path },
        `${path} is missing required field "${key}".`,
      );
    }
  }
}

function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) {
    fail("expected-object", { path }, `${path} must be an object.`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail("expected-boolean", { path }, `${path} must be a boolean.`);
  }
  return value;
}

function expectBoundedString(
  value: unknown,
  path: string,
  maximumLength = MAX_METADATA_CHARS,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("non-empty-string", { path }, `${path} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    fail(
      "string-too-long",
      { maximum: maximumLength, path },
      `${path} must not exceed ${maximumLength} characters.`,
    );
  }
  return value;
}

function expectNonNegativeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    fail(
      "non-negative-integer",
      { path },
      `${path} must be a non-negative safe integer.`,
    );
  }
  return value;
}

function expectPositiveInteger(
  value: unknown,
  path: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const integer = expectNonNegativeInteger(value, path);
  if (integer === 0 || integer > maximum) {
    fail(
      "positive-integer",
      { maximum, path },
      `${path} must be between 1 and ${maximum}.`,
    );
  }
  return integer;
}

function expectNonNegativeNumber(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    fail(
      "non-negative-number",
      { path },
      `${path} must be a finite, non-negative number.`,
    );
  }
  return value;
}

function expectRate(value: unknown, path: string): number {
  const rate = expectNonNegativeNumber(value, path);
  if (rate > 1) {
    fail("unit-rate", { path }, `${path} must be between 0 and 1.`);
  }
  return rate;
}

function expectIsoTimestamp(value: unknown, path: string): string {
  const timestamp = expectBoundedString(value, path, 64);
  const match = ISO_TIMESTAMP_PATTERN.exec(timestamp);
  if (match === null || Number.isNaN(Date.parse(timestamp))) {
    fail(
      "invalid-timestamp",
      { path },
      `${path} must be an ISO-8601 timestamp.`,
    );
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    fail(
      "invalid-timestamp",
      { path },
      `${path} must be an ISO-8601 timestamp.`,
    );
  }
  return timestamp;
}

function expectNullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : expectIsoTimestamp(value, path);
}

function expectUtcTimestamp(value: unknown, path: string): string {
  const timestamp = expectIsoTimestamp(value, path);
  if (!UTC_TIMESTAMP_PATTERN.test(timestamp)) {
    fail(
      "invalid-timestamp",
      { path },
      `${path} must be a canonical UTC timestamp.`,
    );
  }
  return timestamp;
}

function expectGitCommit(
  value: unknown,
  path: string,
  lowercaseOnly: boolean,
): string | null {
  if (value === null) {
    return null;
  }
  const commit = expectBoundedString(value, path, 64);
  const pattern = lowercaseOnly
    ? LOWERCASE_GIT_COMMIT_PATTERN
    : GIT_COMMIT_PATTERN;
  if (!pattern.test(commit)) {
    fail(
      "invalid-commit",
      { path },
      `${path} must be a 7 to 64 character hexadecimal object ID or null.`,
    );
  }
  return commit;
}

function expectNullableNonNegativeInteger(
  value: unknown,
  path: string,
): number | null {
  return value === null ? null : expectNonNegativeInteger(value, path);
}

function expectPlayer(value: unknown, path: string): string {
  const player = expectBoundedString(value, path, MAX_PLAYER_CHARS);
  if (!PLAYER_PATTERN.test(player)) {
    fail(
      "invalid-player",
      { path },
      `${path} must identify a random player or search profile.`,
    );
  }
  return player;
}

function expectEnum<T extends string>(
  value: unknown,
  path: string,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(
      "invalid-enum",
      { path, values: values.join(", ") },
      `${path} must be one of: ${values.join(", ")}.`,
    );
  }
  return value as T;
}

function expectSha256(value: unknown, path: string): string {
  const sha256 = expectBoundedString(value, path, 64);
  if (!SHA256_PATTERN.test(sha256)) {
    fail("invalid-sha256", { path }, `${path} must be a lowercase SHA-256.`);
  }
  return sha256;
}

interface SfenMaterialSummary {
  counts: Record<string, number>;
  kings: [number, number];
}

function incrementSfenMaterial(
  counts: Record<string, number>,
  piece: string,
  amount = 1,
): void {
  counts[piece] = (counts[piece] ?? 0) + amount;
}

function parseCanonicalSfenBoard(field: string): SfenMaterialSummary | null {
  const ranks = field.split("/");
  if (ranks.length !== 9) {
    return null;
  }

  const counts: Record<string, number> = {};
  const kings: [number, number] = [0, 0];
  const pawnFiles = [new Set<number>(), new Set<number>()] as const;
  for (const [rankIndex, rank] of ranks.entries()) {
    let fileIndex = 0;
    let previousWasEmptyCount = false;
    for (let index = 0; index < rank.length; index += 1) {
      let character = rank[index];
      if (character >= "1" && character <= "9") {
        if (previousWasEmptyCount) {
          return null;
        }
        fileIndex += Number(character);
        previousWasEmptyCount = true;
        if (fileIndex > 9) {
          return null;
        }
        continue;
      }

      let promoted = false;
      if (character === "+") {
        promoted = true;
        index += 1;
        character = rank[index];
        if (
          character === undefined ||
          !SFEN_PROMOTABLE_PIECES.includes(character)
        ) {
          return null;
        }
      } else if (!SFEN_BOARD_PIECES.includes(character)) {
        return null;
      }

      if (fileIndex >= 9) {
        return null;
      }
      const sideIndex = character === character.toUpperCase() ? 0 : 1;
      const basePiece = character.toUpperCase();
      incrementSfenMaterial(counts, basePiece);
      if (basePiece === "K") {
        kings[sideIndex] += 1;
      }
      if (!promoted && basePiece === "P") {
        if (pawnFiles[sideIndex].has(fileIndex)) {
          return null;
        }
        pawnFiles[sideIndex].add(fileIndex);
      }
      if (!promoted && ["P", "L", "N"].includes(basePiece)) {
        const distanceToLastRank = sideIndex === 0 ? rankIndex : 8 - rankIndex;
        if (
          distanceToLastRank === 0 ||
          (basePiece === "N" && distanceToLastRank === 1)
        ) {
          return null;
        }
      }

      fileIndex += 1;
      previousWasEmptyCount = false;
    }
    if (fileIndex !== 9) {
      return null;
    }
  }
  return { counts, kings };
}

function parseCanonicalSfenHands(field: string): Record<string, number> | null {
  if (field === "-") {
    return {};
  }
  if (field.length === 0) {
    return null;
  }

  const counts: Record<string, number> = {};
  let previousOrder = -1;
  let index = 0;
  while (index < field.length) {
    const countStart = index;
    while (field[index] >= "0" && field[index] <= "9") {
      index += 1;
    }
    const countText = field.slice(countStart, index);
    let count = 1;
    if (countText.length > 0) {
      count = Number(countText);
      if (
        countText.startsWith("0") ||
        !Number.isSafeInteger(count) ||
        count < 2 ||
        count > 255 ||
        String(count) !== countText
      ) {
        return null;
      }
    }

    const character = field[index];
    if (character === undefined) {
      return null;
    }
    const order = SFEN_HAND_ORDER.indexOf(character);
    if (order <= previousOrder) {
      return null;
    }
    previousOrder = order;
    incrementSfenMaterial(counts, character.toUpperCase(), count);
    index += 1;
  }
  return counts;
}

function isCanonicalInitialSfen(sfen: string): boolean {
  const fields = sfen.split(" ");
  if (fields.length !== 4) {
    return false;
  }
  const [boardField, sideField, handField, moveNumberField] = fields;
  if ((sideField !== "b" && sideField !== "w") || moveNumberField !== "1") {
    return false;
  }

  const board = parseCanonicalSfenBoard(boardField);
  const hands = parseCanonicalSfenHands(handField);
  if (
    board === null ||
    hands === null ||
    board.kings.some((count) => count !== 1)
  ) {
    return false;
  }
  return Object.entries(SFEN_MATERIAL_LIMITS).every(
    ([piece, maximum]) =>
      (board.counts[piece] ?? 0) + (hands[piece] ?? 0) <= maximum,
  );
}

function expectInitialSfen(value: unknown, path: string): string {
  const sfen = expectBoundedString(value, path, MAX_SFEN_CHARS);
  if (!isCanonicalInitialSfen(sfen)) {
    fail(
      "invalid-sfen",
      { path },
      `${path} must be a canonical initial-position SFEN.`,
    );
  }
  return sfen;
}

function expectNull(value: unknown, path: string): null {
  if (value !== null) {
    fail(
      "identity-mismatch",
      { path },
      `${path} must be null for this identity.`,
    );
  }
  return null;
}

function parseBaseRun(
  run: UnknownRecord,
  lowercaseCommit: boolean,
): ArenaRunV1 {
  const gameLimit = expectPositiveInteger(
    run.gameLimit,
    "run.gameLimit",
    MAX_ARENA_GAMES,
  );
  const startedAt = expectIsoTimestamp(run.startedAt, "run.startedAt");
  const completedAt = expectNullableTimestamp(
    run.completedAt,
    "run.completedAt",
  );
  if (completedAt !== null && Date.parse(completedAt) < Date.parse(startedAt)) {
    fail(
      "completion-before-start",
      {},
      "run.completedAt must not precede run.startedAt.",
    );
  }
  return {
    seed: expectNonNegativeInteger(run.seed, "run.seed"),
    gameLimit,
    engine: expectBoundedString(run.engine, "run.engine"),
    gitCommit: expectGitCommit(run.gitCommit, "run.gitCommit", lowercaseCommit),
    startedAt,
    completedAt,
  };
}

const METRICS_V1_KEYS = [
  "games",
  "finishedGames",
  "searchWins",
  "draws",
  "nodesPerSecond",
  "averageDepth",
  "ttHitRate",
  "cutoffRate",
  "pruningRate",
  "millisecondsPerMove",
  "peakMemoryBytes",
  "illegalMoves",
] as const;

function parseMetricsV1(value: unknown): ArenaMetricsV1 {
  const metrics = expectRecord(value, "metrics");
  hasOnlyKeys(metrics, METRICS_V1_KEYS, "metrics");
  return {
    games: expectNonNegativeInteger(metrics.games, "metrics.games"),
    finishedGames: expectNonNegativeInteger(
      metrics.finishedGames,
      "metrics.finishedGames",
    ),
    searchWins: expectNonNegativeInteger(
      metrics.searchWins,
      "metrics.searchWins",
    ),
    draws: expectNonNegativeInteger(metrics.draws, "metrics.draws"),
    nodesPerSecond: expectNonNegativeNumber(
      metrics.nodesPerSecond,
      "metrics.nodesPerSecond",
    ),
    averageDepth: expectNonNegativeNumber(
      metrics.averageDepth,
      "metrics.averageDepth",
    ),
    ttHitRate: expectRate(metrics.ttHitRate, "metrics.ttHitRate"),
    cutoffRate: expectRate(metrics.cutoffRate, "metrics.cutoffRate"),
    pruningRate: expectRate(metrics.pruningRate, "metrics.pruningRate"),
    millisecondsPerMove: expectNonNegativeNumber(
      metrics.millisecondsPerMove,
      "metrics.millisecondsPerMove",
    ),
    peakMemoryBytes: expectNullableNonNegativeInteger(
      metrics.peakMemoryBytes,
      "metrics.peakMemoryBytes",
    ),
    illegalMoves: expectNonNegativeInteger(
      metrics.illegalMoves,
      "metrics.illegalMoves",
    ),
  };
}

function parseResult(value: unknown, path: string): ArenaGameResult {
  return expectEnum(value, `${path}.result`, [
    "black_win",
    "white_win",
    "draw",
    "max_plies",
  ] as const);
}

function parseGameV1(value: unknown, index: number): ArenaGameV1 {
  const path = `games[${index}]`;
  const game = expectRecord(value, path);
  hasOnlyKeys(
    game,
    ["id", "black", "white", "result", "moves", "csaPath"],
    path,
  );
  return {
    id: expectNonNegativeInteger(game.id, `${path}.id`),
    black: expectPlayer(game.black, `${path}.black`),
    white: expectPlayer(game.white, `${path}.white`),
    result: parseResult(game.result, path),
    moves: expectNonNegativeInteger(game.moves, `${path}.moves`),
    csaPath:
      game.csaPath === null
        ? null
        : expectBoundedString(
            game.csaPath,
            `${path}.csaPath`,
            MAX_CSA_PATH_CHARS,
          ),
  };
}

function validateBaseConsistency(
  report: ArenaReport,
  searchWins: number,
): void {
  const { games, metrics, run } = report;
  if (games.length > run.gameLimit) {
    fail("games-over-limit", {}, "games must not exceed run.gameLimit.");
  }
  if (metrics.games !== games.length) {
    fail(
      "games-count-mismatch",
      {},
      "metrics.games must equal the number of imported games.",
    );
  }
  if (metrics.finishedGames > metrics.games) {
    fail(
      "finished-games-over-total",
      {},
      "metrics.finishedGames must not exceed metrics.games.",
    );
  }
  if (metrics.searchWins > metrics.finishedGames) {
    fail(
      "search-wins-over-finished",
      {},
      "metrics.searchWins must not exceed metrics.finishedGames.",
    );
  }
  if (metrics.draws > metrics.finishedGames) {
    fail(
      "draws-over-finished",
      {},
      "metrics.draws must not exceed metrics.finishedGames.",
    );
  }
  if (metrics.searchWins + metrics.draws > metrics.finishedGames) {
    fail(
      "outcomes-over-finished",
      {},
      "search wins and draws must not exceed finished games.",
    );
  }
  const uniqueIds = new Set(games.map(({ id }) => id));
  if (uniqueIds.size !== games.length) {
    fail("duplicate-game-id", {}, "games must have unique ids.");
  }
  const finishedGames = games.filter(
    ({ result }) => result !== "max_plies",
  ).length;
  if (metrics.finishedGames !== finishedGames) {
    fail(
      "finished-games-mismatch",
      {},
      "metrics.finishedGames must match the imported game results.",
    );
  }
  const draws = games.filter(({ result }) => result === "draw").length;
  if (metrics.draws !== draws) {
    fail(
      "draws-mismatch",
      {},
      "metrics.draws must match the imported game results.",
    );
  }
  if (metrics.searchWins !== searchWins) {
    fail(
      "search-wins-mismatch",
      {},
      "metrics.searchWins must match search player victories.",
    );
  }
}

function parseReportV1(report: UnknownRecord): ArenaReportV1 {
  const runRecord = expectRecord(report.run, "run");
  hasOnlyKeys(
    runRecord,
    ["seed", "gameLimit", "engine", "gitCommit", "startedAt", "completedAt"],
    "run",
  );
  const games = parseGames(report.games, parseGameV1);
  const parsed: ArenaReportV1 = {
    schema: ARENA_REPORT_SCHEMA_V1,
    run: parseBaseRun(runRecord, false),
    metrics: parseMetricsV1(report.metrics),
    games,
  };
  const searchWins = games.filter(
    ({ black, result, white }) =>
      (result === "black_win" && black.startsWith("search")) ||
      (result === "white_win" && white.startsWith("search")),
  ).length;
  validateBaseConsistency(parsed, searchWins);
  return parsed;
}

function parseBudget(value: unknown): ArenaBudgetIdentity {
  const budget = expectRecord(value, "run.budget");
  hasOnlyKeys(budget, ["kind", "value"], "run.budget");
  const kind = expectEnum(budget.kind, "run.budget.kind", [
    "nodes",
    "movetime_ms",
  ] as const);
  return {
    kind,
    value: expectPositiveInteger(
      budget.value,
      "run.budget.value",
      kind === "nodes" ? MAX_NODES_PER_MOVE : MAX_MOVETIME_MS,
    ),
  };
}

const PLAYER_KEYS = [
  "label",
  "evaluatorKind",
  "searchDepth",
  "hashMegabytes",
  "transposition",
  "modelArtifactSha256",
  "modelArtifactSize",
  "modelPayloadSha256",
  "architectureVersion",
  "quantization",
  "openingEnabled",
] as const;

function parsePlayerIdentity(
  value: unknown,
  path: string,
): ArenaPlayerIdentity {
  const player = expectRecord(value, path);
  hasOnlyKeys(player, PLAYER_KEYS, path);
  const evaluatorKind = expectEnum(
    player.evaluatorKind,
    `${path}.evaluatorKind`,
    [
      "random",
      "material",
      "handcrafted-baseline",
      "handcrafted-experimental",
      "neural",
    ] as const,
  );
  const label = expectPlayer(player.label, `${path}.label`);
  const openingEnabled = expectBoolean(
    player.openingEnabled,
    `${path}.openingEnabled`,
  );

  let searchDepth: number | null;
  let hashMegabytes: number | null;
  let transposition: boolean | null;
  if (evaluatorKind === "random") {
    searchDepth = expectNull(player.searchDepth, `${path}.searchDepth`);
    hashMegabytes = expectNull(player.hashMegabytes, `${path}.hashMegabytes`);
    transposition = expectNull(player.transposition, `${path}.transposition`);
  } else {
    searchDepth = expectPositiveInteger(
      player.searchDepth,
      `${path}.searchDepth`,
      MAX_SEARCH_DEPTH,
    );
    hashMegabytes = expectPositiveInteger(
      player.hashMegabytes,
      `${path}.hashMegabytes`,
      MAX_HASH_MEGABYTES,
    );
    transposition = expectBoolean(
      player.transposition,
      `${path}.transposition`,
    );
  }

  let modelArtifactSha256: string | null;
  let modelArtifactSize: number | null;
  let modelPayloadSha256: string | null;
  let architectureVersion: number | null;
  let quantization: ArenaQuantization | null;
  if (evaluatorKind === "neural") {
    modelArtifactSha256 = expectSha256(
      player.modelArtifactSha256,
      `${path}.modelArtifactSha256`,
    );
    modelArtifactSize = expectPositiveInteger(
      player.modelArtifactSize,
      `${path}.modelArtifactSize`,
    );
    modelPayloadSha256 = expectSha256(
      player.modelPayloadSha256,
      `${path}.modelPayloadSha256`,
    );
    architectureVersion = expectPositiveInteger(
      player.architectureVersion,
      `${path}.architectureVersion`,
    );
    quantization = expectEnum(player.quantization, `${path}.quantization`, [
      "float32",
      "int8",
    ] as const);
  } else {
    modelArtifactSha256 = expectNull(
      player.modelArtifactSha256,
      `${path}.modelArtifactSha256`,
    );
    modelArtifactSize = expectNull(
      player.modelArtifactSize,
      `${path}.modelArtifactSize`,
    );
    modelPayloadSha256 = expectNull(
      player.modelPayloadSha256,
      `${path}.modelPayloadSha256`,
    );
    architectureVersion = expectNull(
      player.architectureVersion,
      `${path}.architectureVersion`,
    );
    quantization = expectNull(player.quantization, `${path}.quantization`);
  }

  const expectedLabel =
    evaluatorKind === "random"
      ? "random"
      : `search:${evaluatorKind}:d${searchDepth}:h${hashMegabytes}:tt-${transposition ? "on" : "off"}:book-${openingEnabled ? "on" : "off"}${
          evaluatorKind === "neural"
            ? `:m-${modelArtifactSha256?.slice(0, 12)}`
            : ""
        }`;
  if (label !== expectedLabel) {
    fail(
      "identity-mismatch",
      { path: `${path}.label` },
      `${path}.label does not match the immutable player identity.`,
    );
  }

  return {
    label,
    evaluatorKind,
    searchDepth,
    hashMegabytes,
    transposition,
    modelArtifactSha256,
    modelArtifactSize,
    modelPayloadSha256,
    architectureVersion,
    quantization,
    openingEnabled,
  };
}

function parseOpening(value: unknown): ArenaOpeningIdentity {
  const opening = expectRecord(value, "run.opening");
  hasOnlyKeys(
    opening,
    ["enabled", "artifactSha256", "artifactSize", "maxPlies"],
    "run.opening",
  );
  const enabled = expectBoolean(opening.enabled, "run.opening.enabled");
  if (!enabled) {
    return {
      enabled,
      artifactSha256: expectNull(
        opening.artifactSha256,
        "run.opening.artifactSha256",
      ),
      artifactSize: expectNull(
        opening.artifactSize,
        "run.opening.artifactSize",
      ),
      maxPlies: expectNull(opening.maxPlies, "run.opening.maxPlies"),
    };
  }
  return {
    enabled,
    artifactSha256: expectSha256(
      opening.artifactSha256,
      "run.opening.artifactSha256",
    ),
    artifactSize: expectPositiveInteger(
      opening.artifactSize,
      "run.opening.artifactSize",
    ),
    maxPlies: expectPositiveInteger(
      opening.maxPlies,
      "run.opening.maxPlies",
      MAX_PLIES,
    ),
  };
}

const RUN_V2_KEYS = [
  "seed",
  "gameLimit",
  "engine",
  "gitCommit",
  "startedAt",
  "completedAt",
  "initialSfen",
  "maxPlies",
  "configSha256",
  "budget",
  "playerA",
  "playerB",
  "opening",
] as const;

function parseRunV2(value: unknown): ArenaRunV2 {
  const run = expectRecord(value, "run");
  hasOnlyKeys(run, RUN_V2_KEYS, "run");
  const playerA = parsePlayerIdentity(run.playerA, "run.playerA");
  const playerB = parsePlayerIdentity(run.playerB, "run.playerB");
  const opening = parseOpening(run.opening);
  if (opening.enabled !== (playerA.openingEnabled || playerB.openingEnabled)) {
    fail(
      "identity-mismatch",
      { path: "run.opening.enabled" },
      "run.opening.enabled must match the A/B opening configuration.",
    );
  }
  const budget = parseBudget(run.budget);
  const budgetKind = budget.kind === "nodes" ? "Nodes" : "MoveTime";
  const engine = expectBoundedString(run.engine, "run.engine");
  const engineConfiguration = ` a=${playerA.label} b=${playerB.label} budget=${budgetKind}(${budget.value})`;
  const engineVersion = ENGINE_VERSION_PATTERN.exec(engine)?.[1];
  const expectedEngine =
    engineVersion === undefined
      ? null
      : `OpenShogiAI ${engineVersion}${engineConfiguration}`;
  if (engine !== expectedEngine) {
    fail(
      "identity-mismatch",
      { path: "run.engine" },
      "run.engine does not match the immutable A/B and budget identity.",
    );
  }
  const base = parseBaseRun(run, true);
  base.startedAt = expectUtcTimestamp(run.startedAt, "run.startedAt");
  base.completedAt =
    run.completedAt === null
      ? null
      : expectUtcTimestamp(run.completedAt, "run.completedAt");
  return {
    ...base,
    engine,
    initialSfen: expectInitialSfen(run.initialSfen, "run.initialSfen"),
    maxPlies: expectPositiveInteger(run.maxPlies, "run.maxPlies", MAX_PLIES),
    configSha256: expectSha256(run.configSha256, "run.configSha256"),
    budget,
    playerA,
    playerB,
    opening,
  };
}

const METRICS_V2_EXTRA_KEYS = [
  "playerAWins",
  "playerBWins",
  "neuralInferenceCalls",
  "neuralInferenceTimeNs",
  "playerASearchNodes",
  "playerASearchElapsedMs",
  "playerADepthSum",
  "playerASearches",
  "playerANeuralInferenceCalls",
  "playerANeuralInferenceTimeNs",
  "playerBSearchNodes",
  "playerBSearchElapsedMs",
  "playerBDepthSum",
  "playerBSearches",
  "playerBNeuralInferenceCalls",
  "playerBNeuralInferenceTimeNs",
] as const;

function parseMetricsV2(value: unknown): ArenaMetricsV2 {
  const metrics = expectRecord(value, "metrics");
  hasOnlyKeys(
    metrics,
    [...METRICS_V1_KEYS, ...METRICS_V2_EXTRA_KEYS],
    "metrics",
  );
  const base = Object.fromEntries(
    METRICS_V1_KEYS.map((key) => [key, metrics[key]]),
  ) as UnknownRecord;
  const parsedBase = parseMetricsV1(base);
  const counter = (key: (typeof METRICS_V2_EXTRA_KEYS)[number]) =>
    expectNonNegativeInteger(metrics[key], `metrics.${key}`);
  return {
    ...parsedBase,
    playerAWins: counter("playerAWins"),
    playerBWins: counter("playerBWins"),
    neuralInferenceCalls: counter("neuralInferenceCalls"),
    neuralInferenceTimeNs: counter("neuralInferenceTimeNs"),
    playerASearchNodes: counter("playerASearchNodes"),
    playerASearchElapsedMs: counter("playerASearchElapsedMs"),
    playerADepthSum: counter("playerADepthSum"),
    playerASearches: counter("playerASearches"),
    playerANeuralInferenceCalls: counter("playerANeuralInferenceCalls"),
    playerANeuralInferenceTimeNs: counter("playerANeuralInferenceTimeNs"),
    playerBSearchNodes: counter("playerBSearchNodes"),
    playerBSearchElapsedMs: counter("playerBSearchElapsedMs"),
    playerBDepthSum: counter("playerBDepthSum"),
    playerBSearches: counter("playerBSearches"),
    playerBNeuralInferenceCalls: counter("playerBNeuralInferenceCalls"),
    playerBNeuralInferenceTimeNs: counter("playerBNeuralInferenceTimeNs"),
  };
}

const GAME_V2_COUNTER_KEYS = [
  "neuralInferenceCalls",
  "neuralInferenceTimeNs",
  "playerASearchNodes",
  "playerASearchElapsedMs",
  "playerADepthSum",
  "playerASearches",
  "playerANeuralInferenceCalls",
  "playerANeuralInferenceTimeNs",
  "playerBSearchNodes",
  "playerBSearchElapsedMs",
  "playerBDepthSum",
  "playerBSearches",
  "playerBNeuralInferenceCalls",
  "playerBNeuralInferenceTimeNs",
] as const;

function parseGameV2(value: unknown, index: number): ArenaGameV2 {
  const path = `games[${index}]`;
  const game = expectRecord(value, path);
  hasOnlyKeys(
    game,
    [
      "id",
      "black",
      "white",
      "result",
      "moves",
      "csaPath",
      "csaSha256",
      "csaSize",
      ...GAME_V2_COUNTER_KEYS,
    ],
    path,
  );
  const counters = Object.fromEntries(
    GAME_V2_COUNTER_KEYS.map((key) => [
      key,
      expectNonNegativeInteger(game[key], `${path}.${key}`),
    ]),
  ) as Pick<ArenaGameV2, (typeof GAME_V2_COUNTER_KEYS)[number]>;
  return {
    id: expectNonNegativeInteger(game.id, `${path}.id`),
    black: expectPlayer(game.black, `${path}.black`),
    white: expectPlayer(game.white, `${path}.white`),
    result: parseResult(game.result, path),
    moves: expectNonNegativeInteger(game.moves, `${path}.moves`),
    csaPath: expectBoundedString(
      game.csaPath,
      `${path}.csaPath`,
      MAX_CSA_PATH_CHARS,
    ),
    csaSha256: expectSha256(game.csaSha256, `${path}.csaSha256`),
    csaSize: expectPositiveInteger(game.csaSize, `${path}.csaSize`),
    ...counters,
  };
}

function safeSum(values: readonly number[], path: string): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isSafeInteger(sum)) {
      fail(
        "aggregate-mismatch",
        { path },
        `${path} exceeds the JSON-safe integer range.`,
      );
    }
  }
  return sum;
}

function requireEqual(actual: number, expected: number, path: string): void {
  if (actual !== expected) {
    fail(
      "aggregate-mismatch",
      { actual, expected, path },
      `${path} does not equal the sum of its game counters.`,
    );
  }
}

function rustDecimalRatio(
  numerator: number,
  multiplier: number,
  denominator: number,
): number {
  if (denominator === 0) {
    return 0;
  }
  const scaled =
    (BigInt(numerator) * BigInt(multiplier) * 1_000_000n) / BigInt(denominator);
  const whole = scaled / 1_000_000n;
  const fraction = (scaled % 1_000_000n).toString().padStart(6, "0");
  return Number(`${whole}.${fraction}`);
}

function requireDerivedMetric(
  actual: number,
  expected: number,
  path: string,
): void {
  if (actual !== expected) {
    fail(
      "aggregate-mismatch",
      { actual, expected, path },
      `${path} does not match the aggregate search counters.`,
    );
  }
}

function validatePlayerGameCounters(
  game: ArenaGameV2,
  player: ArenaPlayerIdentity,
  side: "A" | "B",
  budget: ArenaBudgetIdentity,
  path: string,
): void {
  const prefix = side === "A" ? "playerA" : "playerB";
  const nodes =
    side === "A" ? game.playerASearchNodes : game.playerBSearchNodes;
  const elapsed =
    side === "A" ? game.playerASearchElapsedMs : game.playerBSearchElapsedMs;
  const depth = side === "A" ? game.playerADepthSum : game.playerBDepthSum;
  const searches = side === "A" ? game.playerASearches : game.playerBSearches;
  const neuralCalls =
    side === "A"
      ? game.playerANeuralInferenceCalls
      : game.playerBNeuralInferenceCalls;
  const neuralTime =
    side === "A"
      ? game.playerANeuralInferenceTimeNs
      : game.playerBNeuralInferenceTimeNs;
  if (
    searches > game.moves + 1 ||
    (player.searchDepth !== null && depth > player.searchDepth * searches) ||
    (budget.kind === "nodes" && nodes > budget.value * searches) ||
    (neuralCalls === 0 && neuralTime !== 0)
  ) {
    fail(
      "game-invariant",
      { path: `${path}.${prefix}` },
      `${path}.${prefix} search counters violate the run configuration.`,
    );
  }
  if (
    player.evaluatorKind === "random" &&
    [nodes, elapsed, depth, searches, neuralCalls, neuralTime].some(
      (counter) => counter !== 0,
    )
  ) {
    fail(
      "game-invariant",
      { path: `${path}.${prefix}` },
      `${path}.${prefix} must have zero search counters for a random player.`,
    );
  }
  if (
    player.evaluatorKind !== "neural" &&
    (neuralCalls !== 0 || neuralTime !== 0)
  ) {
    fail(
      "game-invariant",
      { path: `${path}.${prefix}` },
      `${path}.${prefix} must have zero neural counters for a non-neural player.`,
    );
  }
}

function validateGameV2(
  game: ArenaGameV2,
  index: number,
  run: ArenaRunV2,
): void {
  const path = `games[${index}]`;
  if (game.id !== index) {
    fail(
      "non-contiguous-game-id",
      { expected: index, path: `${path}.id` },
      `${path}.id must equal its zero-based position.`,
    );
  }
  const aIsBlack = game.id % 2 === 0;
  const expectedBlack = aIsBlack ? run.playerA.label : run.playerB.label;
  const expectedWhite = aIsBlack ? run.playerB.label : run.playerA.label;
  if (game.black !== expectedBlack || game.white !== expectedWhite) {
    fail(
      "schedule-mismatch",
      { path },
      `${path} does not match the deterministic A/B color schedule.`,
    );
  }
  const expectedCsaPath = `games/game-${String(game.id + 1).padStart(6, "0")}.csa`;
  if (game.csaPath !== expectedCsaPath) {
    fail(
      "identity-mismatch",
      { path: `${path}.csaPath` },
      `${path}.csaPath does not match its deterministic game ID.`,
    );
  }
  if (
    game.moves > run.maxPlies ||
    (game.result === "max_plies" && game.moves !== run.maxPlies)
  ) {
    fail(
      "game-invariant",
      { path: `${path}.moves` },
      `${path}.moves does not match the configured maximum plies.`,
    );
  }
  requireEqual(
    game.neuralInferenceCalls,
    safeSum(
      [game.playerANeuralInferenceCalls, game.playerBNeuralInferenceCalls],
      `${path}.neuralInferenceCalls`,
    ),
    `${path}.neuralInferenceCalls`,
  );
  requireEqual(
    game.neuralInferenceTimeNs,
    safeSum(
      [game.playerANeuralInferenceTimeNs, game.playerBNeuralInferenceTimeNs],
      `${path}.neuralInferenceTimeNs`,
    ),
    `${path}.neuralInferenceTimeNs`,
  );
  const searches = safeSum(
    [game.playerASearches, game.playerBSearches],
    `${path}.searches`,
  );
  if (searches > game.moves + 1) {
    fail(
      "game-invariant",
      { path: `${path}.searches` },
      `${path}.searches exceeds moves plus one.`,
    );
  }
  validatePlayerGameCounters(game, run.playerA, "A", run.budget, path);
  validatePlayerGameCounters(game, run.playerB, "B", run.budget, path);
}

function validateMetricsV2(report: ArenaReportV2): void {
  const { games, metrics, run } = report;
  for (const [index, game] of games.entries()) {
    validateGameV2(game, index, run);
  }
  const playerAWins = games.filter(
    ({ id, result }) =>
      (result === "black_win" && id % 2 === 0) ||
      (result === "white_win" && id % 2 === 1),
  ).length;
  const playerBWins = games.filter(
    ({ id, result }) =>
      (result === "black_win" && id % 2 === 1) ||
      (result === "white_win" && id % 2 === 0),
  ).length;
  if (
    metrics.playerAWins !== playerAWins ||
    metrics.playerBWins !== playerBWins ||
    playerAWins + playerBWins + metrics.draws !== metrics.finishedGames
  ) {
    fail(
      "player-wins-mismatch",
      {},
      "metrics A/B wins must match the imported game results.",
    );
  }
  const searchWins =
    (run.playerA.evaluatorKind === "random" ? 0 : playerAWins) +
    (run.playerB.evaluatorKind === "random" ? 0 : playerBWins);
  validateBaseConsistency(report, searchWins);
  if (metrics.illegalMoves > metrics.games) {
    fail(
      "aggregate-mismatch",
      { path: "metrics.illegalMoves" },
      "metrics.illegalMoves must not exceed the game count.",
    );
  }
  if (run.completedAt !== null && games.length !== run.gameLimit) {
    fail(
      "completed-run-incomplete",
      {},
      "A completed v2 run must contain run.gameLimit games.",
    );
  }

  for (const side of ["A", "B"] as const) {
    const fields = [
      "SearchNodes",
      "SearchElapsedMs",
      "DepthSum",
      "Searches",
      "NeuralInferenceCalls",
      "NeuralInferenceTimeNs",
    ] as const;
    for (const field of fields) {
      const key = `player${side}${field}` as keyof ArenaMetricsV2 &
        keyof ArenaGameV2;
      requireEqual(
        metrics[key] as number,
        safeSum(
          games.map((game) => game[key] as number),
          `metrics.${key}`,
        ),
        `metrics.${key}`,
      );
    }
  }
  requireEqual(
    metrics.neuralInferenceCalls,
    safeSum(
      games.map(({ neuralInferenceCalls }) => neuralInferenceCalls),
      "metrics.neuralInferenceCalls",
    ),
    "metrics.neuralInferenceCalls",
  );
  requireEqual(
    metrics.neuralInferenceTimeNs,
    safeSum(
      games.map(({ neuralInferenceTimeNs }) => neuralInferenceTimeNs),
      "metrics.neuralInferenceTimeNs",
    ),
    "metrics.neuralInferenceTimeNs",
  );
  requireEqual(
    metrics.neuralInferenceCalls,
    safeSum(
      [
        metrics.playerANeuralInferenceCalls,
        metrics.playerBNeuralInferenceCalls,
      ],
      "metrics.neuralInferenceCalls",
    ),
    "metrics.neuralInferenceCalls",
  );
  requireEqual(
    metrics.neuralInferenceTimeNs,
    safeSum(
      [
        metrics.playerANeuralInferenceTimeNs,
        metrics.playerBNeuralInferenceTimeNs,
      ],
      "metrics.neuralInferenceTimeNs",
    ),
    "metrics.neuralInferenceTimeNs",
  );
  const totalNodes = safeSum(
    [metrics.playerASearchNodes, metrics.playerBSearchNodes],
    "metrics.nodesPerSecond",
  );
  const totalElapsedMs = safeSum(
    [metrics.playerASearchElapsedMs, metrics.playerBSearchElapsedMs],
    "metrics.millisecondsPerMove",
  );
  const totalDepth = safeSum(
    [metrics.playerADepthSum, metrics.playerBDepthSum],
    "metrics.averageDepth",
  );
  const totalSearches = safeSum(
    [metrics.playerASearches, metrics.playerBSearches],
    "metrics.averageDepth",
  );
  requireDerivedMetric(
    metrics.nodesPerSecond,
    rustDecimalRatio(totalNodes, 1_000, totalElapsedMs),
    "metrics.nodesPerSecond",
  );
  requireDerivedMetric(
    metrics.averageDepth,
    rustDecimalRatio(totalDepth, 1, totalSearches),
    "metrics.averageDepth",
  );
  requireDerivedMetric(
    metrics.millisecondsPerMove,
    rustDecimalRatio(totalElapsedMs, 1, totalSearches),
    "metrics.millisecondsPerMove",
  );
}

function parseReportV2(report: UnknownRecord): ArenaReportV2 {
  const parsed: ArenaReportV2 = {
    schema: ARENA_REPORT_SCHEMA_V2,
    run: parseRunV2(report.run),
    metrics: parseMetricsV2(report.metrics),
    games: parseGames(report.games, parseGameV2),
  };
  validateMetricsV2(parsed);
  return parsed;
}

function parseGames<T>(
  value: unknown,
  parse: (entry: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value) || value.length > MAX_ARENA_GAMES) {
    fail(
      "games-array",
      { maximum: MAX_ARENA_GAMES },
      `games must be an array with at most ${MAX_ARENA_GAMES} entries.`,
    );
  }
  return value.map(parse);
}

export function parseArenaReport(input: string): ArenaReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    fail("invalid-json", {}, "The selected file is not valid JSON.");
  }
  const report = expectRecord(parsed, "report");
  hasOnlyKeys(report, ["schema", "run", "metrics", "games"], "report");
  if (report.schema === ARENA_REPORT_SCHEMA_V2) {
    return parseReportV2(report);
  }
  if (report.schema === ARENA_REPORT_SCHEMA_V1) {
    return parseReportV1(report);
  }
  fail(
    "schema-mismatch",
    { schema: SUPPORTED_ARENA_REPORT_SCHEMAS.join(", ") },
    `report.schema must be one of: ${SUPPORTED_ARENA_REPORT_SCHEMAS.join(", ")}.`,
  );
}

export type ImportState =
  | { status: "idle" }
  | { status: "loading"; requestId: number; fileName: string }
  | {
      status: "ready";
      report: ArenaReport;
      fileName: string;
      byteSize: number;
      loadedAt: string;
    }
  | { status: "invalid"; fileName: string; reason: ImportFailureReason };

export type ImportFailureReason =
  | { type: "file-too-large"; maximumBytes: number }
  | { type: "invalid-report"; error: ArenaReportValidationError }
  | { type: "unknown" };

export type ImportAction =
  | { type: "importStarted"; requestId: number; fileName: string }
  | {
      type: "importSucceeded";
      requestId: number;
      report: ArenaReport;
      fileName: string;
      byteSize: number;
      loadedAt: string;
    }
  | {
      type: "importFailed";
      requestId: number;
      fileName: string;
      reason: ImportFailureReason;
    };

export const initialImportState: ImportState = { status: "idle" };

export function importReducer(
  state: ImportState,
  action: ImportAction,
): ImportState {
  switch (action.type) {
    case "importStarted":
      return {
        status: "loading",
        requestId: action.requestId,
        fileName: action.fileName,
      };
    case "importSucceeded":
      if (state.status !== "loading" || state.requestId !== action.requestId) {
        return state;
      }
      return {
        status: "ready",
        report: action.report,
        fileName: action.fileName,
        byteSize: action.byteSize,
        loadedAt: action.loadedAt,
      };
    case "importFailed":
      if (state.status !== "loading" || state.requestId !== action.requestId) {
        return state;
      }
      return {
        status: "invalid",
        fileName: action.fileName,
        reason: action.reason,
      };
  }
}
