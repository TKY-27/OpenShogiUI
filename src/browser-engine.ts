export const WORKER_RESPONSE_SCHEMA = "open_shogi_worker_response/v1";
export const SNAPSHOT_SCHEMA = "open_shogi_browser_snapshot/v1";
export const SEARCH_SCHEMA = "open_shogi_browser_search/v1";
export const MODEL_SCHEMA = "open_shogi_browser_model/v1";
export const OPENING_BOOK_SUMMARY_SCHEMA = "open_shogi_browser_opening_book/v1";
export const ANALYSIS_SCHEMA = "open_shogi_analysis/v1";
export const TIME_CONTROL_SCHEMA = "open_shogi_time_control/v1";
export const RESOURCE_BUDGET_SCHEMA = "open_shogi_resource_budget/v1";
export const MAX_BROWSER_MODEL_BYTES = 16 * 1024 * 1024;
export const MAX_BROWSER_OPENING_BOOK_BYTES = 64 * 1024 * 1024;
export const MAX_GAME_MOVES = 512;

export type Side = "black" | "white";
export type SearchProfile = "eco" | "balanced" | "quality";
export type EvaluatorChoice =
  | "overall-champion"
  | "model"
  | "model-residual"
  | "model-composite";
export type EvaluatorName =
  | Exclude<EvaluatorChoice, "model-composite">
  | "model-composite-50-50";
export type OpeningProfile =
  | "ibisha_strict"
  | "ibisha_preferred"
  | "unrestricted";
export type PieceKind =
  | "pawn"
  | "lance"
  | "knight"
  | "silver"
  | "gold"
  | "bishop"
  | "rook"
  | "king"
  | "promoted-pawn"
  | "promoted-lance"
  | "promoted-knight"
  | "promoted-silver"
  | "horse"
  | "dragon";
export type HandPieceKind = Exclude<
  PieceKind,
  | "king"
  | "promoted-pawn"
  | "promoted-lance"
  | "promoted-knight"
  | "promoted-silver"
  | "horse"
  | "dragon"
>;

export interface SquareSummary {
  file: number;
  rank: number;
}

export interface BoardPiece {
  square: SquareSummary;
  side: Side;
  kind: PieceKind;
}

export interface HandEntry {
  piece: HandPieceKind;
  count: number;
}

export interface MoveSummary {
  usi: string;
  from: SquareSummary | null;
  to: SquareSummary;
  drop: HandPieceKind | null;
  promote: boolean;
}

export interface TerminalSummary {
  kind: string;
  winner: Side | null;
  loser: Side | null;
}

export interface ModelSummary {
  schema: typeof MODEL_SCHEMA;
  artifactSha256: string;
  payloadSha256: string;
  artifactSize: number;
  formatVersion: number;
  architectureVersion: number;
  featureSchemaVersion: number;
  featureFlags: number;
  inputDimension: number;
  hiddenLayers: number;
  hiddenDimension: number;
  activation: "relu";
  quantization: "float32" | "int8";
  layerCount: number;
  outputScaleCp: number;
}

export interface OpeningBookSummary {
  schema: typeof OPENING_BOOK_SUMMARY_SCHEMA;
  artifactSha256: string;
  artifactSize: number;
  positions: number;
  candidates: number;
}

export interface OpeningPolicySummary {
  profile: OpeningProfile;
  maxPlies: number;
  minimumSampleCount: number;
  maximumTeacherLossCp: number;
}

export interface BrowserSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  engine: { name: string; version: string };
  initialSfen: string;
  sfen: string;
  sideToMove: Side;
  moveNumber: number;
  board: Array<BoardPiece | null>;
  hands: { black: HandEntry[]; white: HandEntry[] };
  legalMoves: MoveSummary[];
  moves: string[];
  terminal: TerminalSummary | null;
  evaluator: {
    kind: "handcrafted-only" | "model-available";
    model: ModelSummary | null;
  };
  openingBook: OpeningBookSummary | null;
  openingPolicy: OpeningPolicySummary;
}

export interface TimeControl {
  schema: typeof TIME_CONTROL_SCHEMA;
  blackTimeMs?: number;
  whiteTimeMs?: number;
  byoyomiMs?: number;
  blackIncrementMs?: number;
  whiteIncrementMs?: number;
  movetimeMs?: number;
  nodes?: number;
  depth?: number;
  infinite?: boolean;
  casual?: boolean;
  safetyMarginMs?: number;
}

export interface ResourceBudget {
  schema: typeof RESOURCE_BUDGET_SCHEMA;
  playThreads: 1;
  analysisThreads: 0 | 1;
  playHashMegabytes: number;
  analysisHashMegabytes: number;
  analysisPauseDuringAiTurn: boolean;
  maximumAggregateMemoryMegabytes: number;
}

export interface SearchResponse {
  schema: typeof SEARCH_SCHEMA;
  timeControlSchema: typeof TIME_CONTROL_SCHEMA;
  timeControlMode:
    | "casual"
    | "movetime"
    | "clock"
    | "nodes"
    | "depth"
    | "infinite"
    | "profile-nodes";
  profile: SearchProfile;
  evaluator: EvaluatorName;
  perspective: Side;
  source: "search" | "book";
  bestMove: string | null;
  scoreCp: number;
  depth: number;
  seldepth: number;
  nodes: number;
  elapsedNs: number;
  nps: number;
  pv: string[];
  termination: "completed" | "node-limit" | "time-limit" | "cancelled" | "book";
  lines: Array<{
    rank: number;
    bestMove: string;
    scoreCp: number;
    depth: number;
    seldepth: number;
    nodes: number;
    pv: string[];
  }>;
  stats: {
    ttProbes: number;
    ttHits: number;
    ttCollisions: number;
    betaCutoffs: number;
    candidateMoves: number;
    prunedMoves: number;
    qnodes: number;
    neuralInferenceCalls: number;
    neuralInferenceTimeNs: number;
  };
  openingBookMove?: {
    sampleCount: number;
    teacherScoreCp: number;
    teacherDepth: number;
    teacherNodes: number;
    openingClassification: string;
    provenanceReferences: string[];
  };
}

export interface AnalysisStart {
  schema: typeof ANALYSIS_SCHEMA;
  positionSfen: string;
  modelHash: string;
  evaluatorConfigHash: string;
  featureSchemaHash: string;
  evaluationSemanticsHash: string;
  searchOptionsHash: string;
  openingProfileHash: string;
  multiPv: number;
}

export interface AnalysisStep {
  schema: typeof ANALYSIS_SCHEMA;
  nodes: number;
  maxDepth: number;
  timestampMs: number;
}

export interface AnalysisLine {
  rank: number;
  score: number;
  mateScore: number | null;
  depth: number;
  nodes: number;
  pv: string[];
}

export interface AnalysisUpdate {
  source: "cache" | "search";
  canonicalPosition: string;
  positionHash: string;
  modelHash: string;
  evaluatorConfigHash: string;
  featureSchemaHash: string;
  evaluationSemanticsHash: string;
  searchOptionsHash: string;
  openingProfileHash: string;
  multiPv: number;
  depth: number;
  nodes: number;
  nps: number;
  score: number;
  mateScore: number | null;
  lines: AnalysisLine[];
  rootMoveStatistics: Array<{
    movement: string;
    score: number;
    depth: number;
    nodes: number;
    pv: string[];
  }>;
  timestampMs: number;
  engineVersion: string;
}

export interface AnalysisResponse {
  schema: typeof ANALYSIS_SCHEMA;
  event: "started" | "updates" | "stopped" | "worker-failed" | "restarted";
  updates: AnalysisUpdate[];
  slice?: {
    termination: "completed" | "node-limit" | "time-limit" | "cancelled";
    depth: number;
    nodes: number;
    elapsedNs: number;
  };
}

export type WorkerRequest =
  | {
      id: number;
      kind: "initialize";
      initialSfen: string | null;
      moves: string[];
    }
  | {
      id: number;
      kind: "reset";
      sfen: string | null;
    }
  | {
      id: number;
      kind: "load-model";
      bytes: ArrayBuffer;
      expectedArtifactSha256: string | null;
    }
  | { id: number; kind: "unload-model" }
  | { id: number; kind: "play-move"; movement: string }
  | {
      id: number;
      kind: "search";
      profile: SearchProfile;
      evaluator: EvaluatorChoice;
      multiPv: number;
      timeControl: TimeControl | null;
    }
  | {
      id: number;
      kind: "load-opening-book";
      bytes: ArrayBuffer;
      expectedArtifactSha256: string | null;
    }
  | { id: number; kind: "unload-opening-book" }
  | {
      id: number;
      kind: "configure-opening";
      profile: OpeningProfile;
      maxPlies: number;
      minimumSampleCount: number;
      maximumTeacherLossCp: number;
    }
  | {
      id: number;
      kind: "analysis-start";
      profile: SearchProfile;
      evaluator: EvaluatorChoice;
      request: AnalysisStart;
    }
  | { id: number; kind: "analysis-step"; request: AnalysisStep }
  | { id: number; kind: "analysis-stop" }
  | { id: number; kind: "analysis-worker-failed" }
  | { id: number; kind: "analysis-restart" };

export type WorkerSuccess = {
  schema: typeof WORKER_RESPONSE_SCHEMA;
  id: number;
  ok: true;
  kind: WorkerRequest["kind"];
  data: unknown;
};

export type WorkerFailure = {
  schema: typeof WORKER_RESPONSE_SCHEMA;
  id: number;
  ok: false;
  kind: WorkerRequest["kind"] | "protocol";
  error: { code: "invalid-request" | "engine-error"; message: string };
};

export type WorkerResponse = WorkerSuccess | WorkerFailure;

type JsonRecord = Record<string, unknown>;

const SIDES = new Set<Side>(["black", "white"]);
const SEARCH_PROFILES = new Set<SearchProfile>(["eco", "balanced", "quality"]);
const EVALUATOR_CHOICES = new Set<EvaluatorChoice>([
  "overall-champion",
  "model",
  "model-residual",
  "model-composite",
]);
const EVALUATOR_NAMES = new Set<EvaluatorName>([
  "overall-champion",
  "model",
  "model-residual",
  "model-composite-50-50",
]);
const OPENING_PROFILES = new Set<OpeningProfile>([
  "ibisha_strict",
  "ibisha_preferred",
  "unrestricted",
]);
const WORKER_KINDS = new Set<WorkerRequest["kind"]>([
  "initialize",
  "reset",
  "load-model",
  "unload-model",
  "play-move",
  "search",
  "load-opening-book",
  "unload-opening-book",
  "configure-opening",
  "analysis-start",
  "analysis-step",
  "analysis-stop",
  "analysis-worker-failed",
  "analysis-restart",
]);
const PIECE_KINDS = new Set<PieceKind>([
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
]);
const HAND_PIECES = new Set<HandPieceKind>([
  "pawn",
  "lance",
  "knight",
  "silver",
  "gold",
  "bishop",
  "rook",
]);

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  expected: readonly string[],
  path: string,
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${path} has an unsupported key set`);
  }
}

function stringValue(value: unknown, path: string, maximum = 1_024): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum
  ) {
    throw new Error(`${path} must be a bounded non-empty string`);
  }
  return value;
}

function integer(
  value: unknown,
  path: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${path} must be an integer in range`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be finite`);
  }
  return value;
}

function sha256(value: unknown, path: string): string {
  const parsed = stringValue(value, path, 64);
  if (!/^[0-9a-f]{64}$/.test(parsed)) {
    throw new Error(`${path} must be a lowercase SHA-256`);
  }
  return parsed;
}

function side(value: unknown, path: string): Side {
  const parsed = stringValue(value, path, 8);
  if (!SIDES.has(parsed as Side)) {
    throw new Error(`${path} must be black or white`);
  }
  return parsed as Side;
}

function square(value: unknown, path: string): SquareSummary {
  const parsed = record(value, path);
  exactKeys(parsed, ["file", "rank"], path);
  return {
    file: integer(parsed.file, `${path}.file`, 1, 9),
    rank: integer(parsed.rank, `${path}.rank`, 1, 9),
  };
}

function usiMove(value: unknown, path: string): string {
  const parsed = stringValue(value, path, 8);
  if (!/^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(parsed)) {
    throw new Error(`${path} must be a USI move`);
  }
  return parsed;
}

function pieceKind(value: unknown, path: string): PieceKind {
  const parsed = stringValue(value, path, 24);
  if (!PIECE_KINDS.has(parsed as PieceKind)) {
    throw new Error(`${path} must be a supported piece kind`);
  }
  return parsed as PieceKind;
}

function handPiece(value: unknown, path: string): HandPieceKind {
  const parsed = stringValue(value, path, 8);
  if (!HAND_PIECES.has(parsed as HandPieceKind)) {
    throw new Error(`${path} must be a hand piece`);
  }
  return parsed as HandPieceKind;
}

function modelSummary(value: unknown, path: string): ModelSummary {
  const parsed = record(value, path);
  exactKeys(
    parsed,
    [
      "schema",
      "artifactSha256",
      "payloadSha256",
      "artifactSize",
      "formatVersion",
      "architectureVersion",
      "featureSchemaVersion",
      "featureFlags",
      "inputDimension",
      "hiddenLayers",
      "hiddenDimension",
      "activation",
      "quantization",
      "layerCount",
      "outputScaleCp",
    ],
    path,
  );
  if (parsed.schema !== MODEL_SCHEMA) {
    throw new Error(`${path}.schema is unsupported`);
  }
  if (parsed.activation !== "relu") {
    throw new Error(`${path}.activation is unsupported`);
  }
  if (parsed.quantization !== "float32" && parsed.quantization !== "int8") {
    throw new Error(`${path}.quantization is unsupported`);
  }
  const outputScaleCp = finiteNumber(
    parsed.outputScaleCp,
    `${path}.outputScaleCp`,
  );
  if (outputScaleCp <= 0) {
    throw new Error(`${path}.outputScaleCp must be positive`);
  }
  return {
    schema: MODEL_SCHEMA,
    artifactSha256: sha256(parsed.artifactSha256, `${path}.artifactSha256`),
    payloadSha256: sha256(parsed.payloadSha256, `${path}.payloadSha256`),
    artifactSize: integer(
      parsed.artifactSize,
      `${path}.artifactSize`,
      1,
      MAX_BROWSER_MODEL_BYTES,
    ),
    formatVersion: integer(parsed.formatVersion, `${path}.formatVersion`, 1, 1),
    architectureVersion: integer(
      parsed.architectureVersion,
      `${path}.architectureVersion`,
      1,
      1,
    ),
    featureSchemaVersion: integer(
      parsed.featureSchemaVersion,
      `${path}.featureSchemaVersion`,
      1,
      1,
    ),
    featureFlags: integer(parsed.featureFlags, `${path}.featureFlags`, 1, 31),
    inputDimension: integer(
      parsed.inputDimension,
      `${path}.inputDimension`,
      1,
      4_096,
    ),
    hiddenLayers: integer(parsed.hiddenLayers, `${path}.hiddenLayers`, 1, 16),
    hiddenDimension: integer(
      parsed.hiddenDimension,
      `${path}.hiddenDimension`,
      1,
      8_192,
    ),
    activation: "relu",
    quantization: parsed.quantization,
    layerCount: integer(parsed.layerCount, `${path}.layerCount`, 2, 17),
    outputScaleCp,
  };
}

function openingBookSummary(value: unknown, path: string): OpeningBookSummary {
  const parsed = record(value, path);
  exactKeys(
    parsed,
    ["schema", "artifactSha256", "artifactSize", "positions", "candidates"],
    path,
  );
  if (parsed.schema !== OPENING_BOOK_SUMMARY_SCHEMA) {
    throw new Error(`${path}.schema is unsupported`);
  }
  return {
    schema: OPENING_BOOK_SUMMARY_SCHEMA,
    artifactSha256: sha256(parsed.artifactSha256, `${path}.artifactSha256`),
    artifactSize: integer(
      parsed.artifactSize,
      `${path}.artifactSize`,
      1,
      MAX_BROWSER_OPENING_BOOK_BYTES,
    ),
    positions: integer(parsed.positions, `${path}.positions`, 1),
    candidates: integer(parsed.candidates, `${path}.candidates`, 1),
  };
}

function openingPolicySummary(
  value: unknown,
  path: string,
): OpeningPolicySummary {
  const parsed = record(value, path);
  exactKeys(
    parsed,
    ["profile", "maxPlies", "minimumSampleCount", "maximumTeacherLossCp"],
    path,
  );
  if (!OPENING_PROFILES.has(parsed.profile as OpeningProfile)) {
    throw new Error(`${path}.profile is unsupported`);
  }
  return {
    profile: parsed.profile as OpeningProfile,
    maxPlies: integer(parsed.maxPlies, `${path}.maxPlies`, 1, 40),
    minimumSampleCount: integer(
      parsed.minimumSampleCount,
      `${path}.minimumSampleCount`,
      1,
    ),
    maximumTeacherLossCp: integer(
      parsed.maximumTeacherLossCp,
      `${path}.maximumTeacherLossCp`,
      0,
      32_000,
    ),
  };
}

function moveSummary(value: unknown, path: string): MoveSummary {
  const parsed = record(value, path);
  exactKeys(parsed, ["usi", "from", "to", "drop", "promote"], path);
  if (typeof parsed.promote !== "boolean") {
    throw new Error(`${path}.promote must be boolean`);
  }
  const from =
    parsed.from === null ? null : square(parsed.from, `${path}.from`);
  const drop =
    parsed.drop === null ? null : handPiece(parsed.drop, `${path}.drop`);
  if (
    (from === null) === (drop === null) ||
    (drop !== null && parsed.promote)
  ) {
    throw new Error(`${path} has an invalid normal/drop shape`);
  }
  return {
    usi: usiMove(parsed.usi, `${path}.usi`),
    from,
    to: square(parsed.to, `${path}.to`),
    drop,
    promote: parsed.promote,
  };
}

function handEntries(value: unknown, path: string): HandEntry[] {
  if (!Array.isArray(value) || value.length !== 7) {
    throw new Error(`${path} must contain seven hand counters`);
  }
  const entries = value.map((entry, index) => {
    const parsed = record(entry, `${path}[${index}]`);
    exactKeys(parsed, ["piece", "count"], `${path}[${index}]`);
    return {
      piece: handPiece(parsed.piece, `${path}[${index}].piece`),
      count: integer(parsed.count, `${path}[${index}].count`, 0, 18),
    };
  });
  if (new Set(entries.map(({ piece }) => piece)).size !== 7) {
    throw new Error(`${path} contains duplicate hand pieces`);
  }
  return entries;
}

export function parseBrowserSnapshot(value: unknown): BrowserSnapshot {
  const parsed = record(value, "snapshot");
  exactKeys(
    parsed,
    [
      "schema",
      "engine",
      "initialSfen",
      "sfen",
      "sideToMove",
      "moveNumber",
      "board",
      "hands",
      "legalMoves",
      "moves",
      "terminal",
      "evaluator",
      "openingBook",
      "openingPolicy",
    ],
    "snapshot",
  );
  if (parsed.schema !== SNAPSHOT_SCHEMA) {
    throw new Error("snapshot.schema is unsupported");
  }
  const engine = record(parsed.engine, "snapshot.engine");
  exactKeys(engine, ["name", "version"], "snapshot.engine");
  if (!Array.isArray(parsed.board) || parsed.board.length !== 81) {
    throw new Error("snapshot.board must have 81 squares");
  }
  const board = parsed.board.map((entry, index) => {
    if (entry === null) return null;
    const piece = record(entry, `snapshot.board[${index}]`);
    exactKeys(piece, ["square", "side", "kind"], `snapshot.board[${index}]`);
    const expectedRank = Math.floor(index / 9) + 1;
    const expectedFile = 9 - (index % 9);
    const parsedSquare = square(
      piece.square,
      `snapshot.board[${index}].square`,
    );
    if (
      parsedSquare.file !== expectedFile ||
      parsedSquare.rank !== expectedRank
    ) {
      throw new Error(`snapshot.board[${index}] has the wrong square`);
    }
    return {
      square: parsedSquare,
      side: side(piece.side, `snapshot.board[${index}].side`),
      kind: pieceKind(piece.kind, `snapshot.board[${index}].kind`),
    };
  });
  const hands = record(parsed.hands, "snapshot.hands");
  exactKeys(hands, ["black", "white"], "snapshot.hands");
  if (!Array.isArray(parsed.legalMoves) || parsed.legalMoves.length > 700) {
    throw new Error("snapshot.legalMoves exceeds the bound");
  }
  if (!Array.isArray(parsed.moves) || parsed.moves.length > MAX_GAME_MOVES) {
    throw new Error("snapshot.moves exceeds the bound");
  }
  const terminal =
    parsed.terminal === null
      ? null
      : (() => {
          const terminalRecord = record(parsed.terminal, "snapshot.terminal");
          exactKeys(
            terminalRecord,
            ["kind", "winner", "loser"],
            "snapshot.terminal",
          );
          return {
            kind: stringValue(
              terminalRecord.kind,
              "snapshot.terminal.kind",
              48,
            ),
            winner:
              terminalRecord.winner === null
                ? null
                : side(terminalRecord.winner, "snapshot.terminal.winner"),
            loser:
              terminalRecord.loser === null
                ? null
                : side(terminalRecord.loser, "snapshot.terminal.loser"),
          };
        })();
  const evaluator = record(parsed.evaluator, "snapshot.evaluator");
  exactKeys(evaluator, ["kind", "model"], "snapshot.evaluator");
  if (
    evaluator.kind !== "handcrafted-only" &&
    evaluator.kind !== "model-available"
  ) {
    throw new Error("snapshot.evaluator.kind is unsupported");
  }
  const model =
    evaluator.model === null
      ? null
      : modelSummary(evaluator.model, "snapshot.evaluator.model");
  if ((evaluator.kind === "model-available") !== (model !== null)) {
    throw new Error("snapshot evaluator identity is inconsistent");
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    engine: {
      name: stringValue(engine.name, "snapshot.engine.name", 64),
      version: stringValue(engine.version, "snapshot.engine.version", 64),
    },
    initialSfen: stringValue(parsed.initialSfen, "snapshot.initialSfen", 512),
    sfen: stringValue(parsed.sfen, "snapshot.sfen", 512),
    sideToMove: side(parsed.sideToMove, "snapshot.sideToMove"),
    moveNumber: integer(parsed.moveNumber, "snapshot.moveNumber", 1, 513),
    board,
    hands: {
      black: handEntries(hands.black, "snapshot.hands.black"),
      white: handEntries(hands.white, "snapshot.hands.white"),
    },
    legalMoves: parsed.legalMoves.map((move, index) =>
      moveSummary(move, `snapshot.legalMoves[${index}]`),
    ),
    moves: parsed.moves.map((move, index) =>
      usiMove(move, `snapshot.moves[${index}]`),
    ),
    terminal,
    evaluator: { kind: evaluator.kind, model },
    openingBook:
      parsed.openingBook === null
        ? null
        : openingBookSummary(parsed.openingBook, "snapshot.openingBook"),
    openingPolicy: openingPolicySummary(
      parsed.openingPolicy,
      "snapshot.openingPolicy",
    ),
  };
}

export function parseModelSummary(value: unknown): ModelSummary {
  return modelSummary(value, "model");
}

export function parseOpeningBookSummary(value: unknown): OpeningBookSummary {
  return openingBookSummary(value, "openingBook");
}

export function parseOpeningPolicySummary(
  value: unknown,
): OpeningPolicySummary {
  return openingPolicySummary(value, "openingPolicy");
}

function optionalInteger(
  parsed: JsonRecord,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
): number | undefined {
  return Object.hasOwn(parsed, key)
    ? integer(parsed[key], `${path}.${key}`, minimum, maximum)
    : undefined;
}

export function parseTimeControl(value: unknown): TimeControl {
  const parsed = record(value, "timeControl");
  const allowed = new Set([
    "schema",
    "blackTimeMs",
    "whiteTimeMs",
    "byoyomiMs",
    "blackIncrementMs",
    "whiteIncrementMs",
    "movetimeMs",
    "nodes",
    "depth",
    "infinite",
    "casual",
    "safetyMarginMs",
  ]);
  if (Object.keys(parsed).some((key) => !allowed.has(key))) {
    throw new Error("timeControl has an unsupported key set");
  }
  if (parsed.schema !== TIME_CONTROL_SCHEMA) {
    throw new Error("timeControl.schema is unsupported");
  }
  for (const key of ["infinite", "casual"] as const) {
    if (Object.hasOwn(parsed, key) && typeof parsed[key] !== "boolean") {
      throw new Error(`timeControl.${key} must be boolean`);
    }
  }
  const result: TimeControl = {
    schema: TIME_CONTROL_SCHEMA,
    blackTimeMs: optionalInteger(
      parsed,
      "blackTimeMs",
      "timeControl",
      0,
      604_800_000,
    ),
    whiteTimeMs: optionalInteger(
      parsed,
      "whiteTimeMs",
      "timeControl",
      0,
      604_800_000,
    ),
    byoyomiMs: optionalInteger(
      parsed,
      "byoyomiMs",
      "timeControl",
      0,
      3_600_000,
    ),
    blackIncrementMs: optionalInteger(
      parsed,
      "blackIncrementMs",
      "timeControl",
      0,
      3_600_000,
    ),
    whiteIncrementMs: optionalInteger(
      parsed,
      "whiteIncrementMs",
      "timeControl",
      0,
      3_600_000,
    ),
    movetimeMs: optionalInteger(
      parsed,
      "movetimeMs",
      "timeControl",
      1,
      3_600_000,
    ),
    nodes: optionalInteger(parsed, "nodes", "timeControl", 1, 1_000_000_000),
    depth: optionalInteger(parsed, "depth", "timeControl", 1, 64),
    infinite: Object.hasOwn(parsed, "infinite")
      ? (parsed.infinite as boolean)
      : undefined,
    casual: Object.hasOwn(parsed, "casual")
      ? (parsed.casual as boolean)
      : undefined,
    safetyMarginMs: optionalInteger(
      parsed,
      "safetyMarginMs",
      "timeControl",
      0,
      1_000,
    ),
  };
  const hasClock = [
    result.blackTimeMs,
    result.whiteTimeMs,
    result.byoyomiMs,
    result.blackIncrementMs,
    result.whiteIncrementMs,
  ].some((entry) => entry !== undefined);
  const fixed =
    result.movetimeMs !== undefined ||
    result.nodes !== undefined ||
    result.depth !== undefined ||
    hasClock;
  if ((result.casual || result.infinite) && fixed) {
    throw new Error("timeControl modes are contradictory");
  }
  if (result.casual && result.infinite) {
    throw new Error("timeControl modes are contradictory");
  }
  return Object.fromEntries(
    Object.entries(result).filter(([, entry]) => entry !== undefined),
  ) as unknown as TimeControl;
}

export function parseAnalysisStart(value: unknown): AnalysisStart {
  const parsed = record(value, "analysisStart");
  exactKeys(
    parsed,
    [
      "schema",
      "positionSfen",
      "modelHash",
      "evaluatorConfigHash",
      "featureSchemaHash",
      "evaluationSemanticsHash",
      "searchOptionsHash",
      "openingProfileHash",
      "multiPv",
    ],
    "analysisStart",
  );
  if (parsed.schema !== ANALYSIS_SCHEMA) {
    throw new Error("analysisStart.schema is unsupported");
  }
  return {
    schema: ANALYSIS_SCHEMA,
    positionSfen: stringValue(
      parsed.positionSfen,
      "analysisStart.positionSfen",
      512,
    ),
    modelHash: sha256(parsed.modelHash, "analysisStart.modelHash"),
    evaluatorConfigHash: sha256(
      parsed.evaluatorConfigHash,
      "analysisStart.evaluatorConfigHash",
    ),
    featureSchemaHash: sha256(
      parsed.featureSchemaHash,
      "analysisStart.featureSchemaHash",
    ),
    evaluationSemanticsHash: sha256(
      parsed.evaluationSemanticsHash,
      "analysisStart.evaluationSemanticsHash",
    ),
    searchOptionsHash: sha256(
      parsed.searchOptionsHash,
      "analysisStart.searchOptionsHash",
    ),
    openingProfileHash: sha256(
      parsed.openingProfileHash,
      "analysisStart.openingProfileHash",
    ),
    multiPv: integer(parsed.multiPv, "analysisStart.multiPv", 1, 10),
  };
}

export function parseAnalysisStep(value: unknown): AnalysisStep {
  const parsed = record(value, "analysisStep");
  exactKeys(
    parsed,
    ["schema", "nodes", "maxDepth", "timestampMs"],
    "analysisStep",
  );
  if (parsed.schema !== ANALYSIS_SCHEMA) {
    throw new Error("analysisStep.schema is unsupported");
  }
  return {
    schema: ANALYSIS_SCHEMA,
    nodes: integer(parsed.nodes, "analysisStep.nodes", 1, 10_000_000),
    maxDepth: integer(parsed.maxDepth, "analysisStep.maxDepth", 1, 64),
    timestampMs: integer(parsed.timestampMs, "analysisStep.timestampMs", 0),
  };
}

function nullableScore(value: unknown, path: string): number | null {
  return value === null ? null : integer(value, path, -32_000, 32_000);
}

function moveArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length > 256) {
    throw new Error(`${path} exceeds the bound`);
  }
  return value.map((move, index) => usiMove(move, `${path}[${index}]`));
}

export function parseAnalysisResponse(value: unknown): AnalysisResponse {
  const parsed = record(value, "analysis");
  const hasSlice = Object.hasOwn(parsed, "slice");
  exactKeys(
    parsed,
    ["schema", "event", "updates", ...(hasSlice ? ["slice"] : [])],
    "analysis",
  );
  if (parsed.schema !== ANALYSIS_SCHEMA) {
    throw new Error("analysis.schema is unsupported");
  }
  const events = new Set<AnalysisResponse["event"]>([
    "started",
    "updates",
    "stopped",
    "worker-failed",
    "restarted",
  ]);
  if (!events.has(parsed.event as AnalysisResponse["event"])) {
    throw new Error("analysis.event is unsupported");
  }
  if (!Array.isArray(parsed.updates) || parsed.updates.length > 64) {
    throw new Error("analysis.updates exceeds the bound");
  }
  const updates = parsed.updates.map((value, updateIndex) => {
    const path = `analysis.updates[${updateIndex}]`;
    const update = record(value, path);
    exactKeys(
      update,
      [
        "source",
        "canonicalPosition",
        "positionHash",
        "modelHash",
        "evaluatorConfigHash",
        "featureSchemaHash",
        "evaluationSemanticsHash",
        "searchOptionsHash",
        "openingProfileHash",
        "multiPv",
        "depth",
        "nodes",
        "nps",
        "score",
        "mateScore",
        "lines",
        "rootMoveStatistics",
        "timestampMs",
        "engineVersion",
      ],
      path,
    );
    if (update.source !== "cache" && update.source !== "search") {
      throw new Error(`${path}.source is unsupported`);
    }
    const positionHash = stringValue(
      update.positionHash,
      `${path}.positionHash`,
      16,
    );
    if (!/^[0-9a-f]{16}$/.test(positionHash)) {
      throw new Error(`${path}.positionHash is invalid`);
    }
    if (!Array.isArray(update.lines) || update.lines.length > 10) {
      throw new Error(`${path}.lines exceeds the bound`);
    }
    const lines = update.lines.map((entry, lineIndex) => {
      const linePath = `${path}.lines[${lineIndex}]`;
      const line = record(entry, linePath);
      exactKeys(
        line,
        ["rank", "score", "mateScore", "depth", "nodes", "pv"],
        linePath,
      );
      return {
        rank: integer(
          line.rank,
          `${linePath}.rank`,
          lineIndex + 1,
          lineIndex + 1,
        ),
        score: integer(line.score, `${linePath}.score`, -32_000, 32_000),
        mateScore: nullableScore(line.mateScore, `${linePath}.mateScore`),
        depth: integer(line.depth, `${linePath}.depth`, 0, 64),
        nodes: integer(line.nodes, `${linePath}.nodes`, 0),
        pv: moveArray(line.pv, `${linePath}.pv`),
      };
    });
    if (
      !Array.isArray(update.rootMoveStatistics) ||
      update.rootMoveStatistics.length > 700
    ) {
      throw new Error(`${path}.rootMoveStatistics exceeds the bound`);
    }
    const rootMoveStatistics = update.rootMoveStatistics.map(
      (entry, rootIndex) => {
        const rootPath = `${path}.rootMoveStatistics[${rootIndex}]`;
        const root = record(entry, rootPath);
        exactKeys(
          root,
          ["movement", "score", "depth", "nodes", "pv"],
          rootPath,
        );
        return {
          movement: usiMove(root.movement, `${rootPath}.movement`),
          score: integer(root.score, `${rootPath}.score`, -32_000, 32_000),
          depth: integer(root.depth, `${rootPath}.depth`, 0, 64),
          nodes: integer(root.nodes, `${rootPath}.nodes`, 0),
          pv: moveArray(root.pv, `${rootPath}.pv`),
        };
      },
    );
    return {
      source: update.source,
      canonicalPosition: stringValue(
        update.canonicalPosition,
        `${path}.canonicalPosition`,
        512,
      ),
      positionHash,
      modelHash: sha256(update.modelHash, `${path}.modelHash`),
      evaluatorConfigHash: sha256(
        update.evaluatorConfigHash,
        `${path}.evaluatorConfigHash`,
      ),
      featureSchemaHash: sha256(
        update.featureSchemaHash,
        `${path}.featureSchemaHash`,
      ),
      evaluationSemanticsHash: sha256(
        update.evaluationSemanticsHash,
        `${path}.evaluationSemanticsHash`,
      ),
      searchOptionsHash: sha256(
        update.searchOptionsHash,
        `${path}.searchOptionsHash`,
      ),
      openingProfileHash: sha256(
        update.openingProfileHash,
        `${path}.openingProfileHash`,
      ),
      multiPv: integer(update.multiPv, `${path}.multiPv`, 1, 10),
      depth: integer(update.depth, `${path}.depth`, 0, 64),
      nodes: integer(update.nodes, `${path}.nodes`, 0),
      nps: integer(update.nps, `${path}.nps`, 0),
      score: integer(update.score, `${path}.score`, -32_000, 32_000),
      mateScore: nullableScore(update.mateScore, `${path}.mateScore`),
      lines,
      rootMoveStatistics,
      timestampMs: integer(update.timestampMs, `${path}.timestampMs`, 0),
      engineVersion: stringValue(
        update.engineVersion,
        `${path}.engineVersion`,
        128,
      ),
    } satisfies AnalysisUpdate;
  });
  let slice: AnalysisResponse["slice"];
  if (hasSlice) {
    const rawSlice = record(parsed.slice, "analysis.slice");
    exactKeys(
      rawSlice,
      ["termination", "depth", "nodes", "elapsedNs"],
      "analysis.slice",
    );
    const terminations = new Set<
      NonNullable<AnalysisResponse["slice"]>["termination"]
    >(["completed", "node-limit", "time-limit", "cancelled"]);
    if (
      !terminations.has(
        rawSlice.termination as NonNullable<
          AnalysisResponse["slice"]
        >["termination"],
      )
    ) {
      throw new Error("analysis.slice.termination is unsupported");
    }
    slice = {
      termination: rawSlice.termination as NonNullable<
        AnalysisResponse["slice"]
      >["termination"],
      depth: integer(rawSlice.depth, "analysis.slice.depth", 0, 64),
      nodes: integer(rawSlice.nodes, "analysis.slice.nodes", 0),
      elapsedNs: integer(rawSlice.elapsedNs, "analysis.slice.elapsedNs", 0),
    };
  }
  return {
    schema: ANALYSIS_SCHEMA,
    event: parsed.event as AnalysisResponse["event"],
    updates,
    ...(slice === undefined ? {} : { slice }),
  };
}

export function parseAnalysisUpdate(value: unknown): AnalysisUpdate {
  const response = parseAnalysisResponse({
    schema: ANALYSIS_SCHEMA,
    event: "updates",
    updates: [value],
  });
  const update = response.updates[0];
  if (update === undefined) throw new Error("analysis update is missing");
  return update;
}

export function parseSearchResponse(value: unknown): SearchResponse {
  const parsed = record(value, "search");
  const hasOpeningBookMove = Object.hasOwn(parsed, "openingBookMove");
  exactKeys(
    parsed,
    [
      "schema",
      "timeControlSchema",
      "timeControlMode",
      "profile",
      "evaluator",
      "perspective",
      "source",
      "bestMove",
      "scoreCp",
      "depth",
      "seldepth",
      "nodes",
      "elapsedNs",
      "nps",
      "pv",
      "termination",
      "lines",
      "stats",
      ...(hasOpeningBookMove ? ["openingBookMove"] : []),
    ],
    "search",
  );
  if (parsed.schema !== SEARCH_SCHEMA) {
    throw new Error("search.schema is unsupported");
  }
  if (parsed.timeControlSchema !== TIME_CONTROL_SCHEMA) {
    throw new Error("search.timeControlSchema is unsupported");
  }
  const timeControlModes = new Set<SearchResponse["timeControlMode"]>([
    "casual",
    "movetime",
    "clock",
    "nodes",
    "depth",
    "infinite",
    "profile-nodes",
  ]);
  if (
    !timeControlModes.has(
      parsed.timeControlMode as SearchResponse["timeControlMode"],
    )
  ) {
    throw new Error("search.timeControlMode is unsupported");
  }
  if (!SEARCH_PROFILES.has(parsed.profile as SearchProfile)) {
    throw new Error("search.profile is unsupported");
  }
  if (!EVALUATOR_NAMES.has(parsed.evaluator as EvaluatorName)) {
    throw new Error("search.evaluator is unsupported");
  }
  if (parsed.source !== "search" && parsed.source !== "book") {
    throw new Error("search.source is unsupported");
  }
  const profileMaximumNodes =
    parsed.profile === "eco"
      ? 1_500
      : parsed.profile === "balanced"
        ? 4_000
        : 12_000;
  const maximumNodes =
    parsed.timeControlMode === "profile-nodes"
      ? profileMaximumNodes
      : 1_000_000_000;
  const profileMaximumDepth =
    parsed.profile === "eco" ? 5 : parsed.profile === "balanced" ? 7 : 9;
  const maximumDepth = parsed.source === "book" ? 64 : profileMaximumDepth;
  if (!Array.isArray(parsed.pv) || parsed.pv.length > 256) {
    throw new Error("search.pv exceeds the bound");
  }
  if (
    !Array.isArray(parsed.lines) ||
    parsed.lines.length < 1 ||
    parsed.lines.length > 3
  ) {
    throw new Error("search.lines must contain between one and three lines");
  }
  const lines = parsed.lines.map((value, index) => {
    const line = record(value, `search.lines[${index}]`);
    exactKeys(
      line,
      ["rank", "bestMove", "scoreCp", "depth", "seldepth", "nodes", "pv"],
      `search.lines[${index}]`,
    );
    if (
      !Array.isArray(line.pv) ||
      line.pv.length === 0 ||
      line.pv.length > 256
    ) {
      throw new Error(`search.lines[${index}].pv exceeds the bound`);
    }
    return {
      rank: integer(
        line.rank,
        `search.lines[${index}].rank`,
        index + 1,
        index + 1,
      ),
      bestMove: usiMove(line.bestMove, `search.lines[${index}].bestMove`),
      scoreCp: integer(
        line.scoreCp,
        `search.lines[${index}].scoreCp`,
        -32_000,
        32_000,
      ),
      depth: integer(
        line.depth,
        `search.lines[${index}].depth`,
        0,
        maximumDepth,
      ),
      seldepth: integer(
        line.seldepth,
        `search.lines[${index}].seldepth`,
        0,
        255,
      ),
      nodes: integer(
        line.nodes,
        `search.lines[${index}].nodes`,
        0,
        maximumNodes,
      ),
      pv: line.pv.map((move, moveIndex) =>
        usiMove(move, `search.lines[${index}].pv[${moveIndex}]`),
      ),
    };
  });
  const stats = record(parsed.stats, "search.stats");
  exactKeys(
    stats,
    [
      "ttProbes",
      "ttHits",
      "ttCollisions",
      "betaCutoffs",
      "candidateMoves",
      "prunedMoves",
      "qnodes",
      "neuralInferenceCalls",
      "neuralInferenceTimeNs",
    ],
    "search.stats",
  );
  const counters = Object.fromEntries(
    Object.entries(stats).map(([key, count]) => [
      key,
      integer(count, `search.stats.${key}`),
    ]),
  ) as SearchResponse["stats"];
  const terminationValues = new Set<SearchResponse["termination"]>([
    "completed",
    "node-limit",
    "time-limit",
    "cancelled",
    "book",
  ]);
  if (
    !terminationValues.has(parsed.termination as SearchResponse["termination"])
  ) {
    throw new Error("search.termination is unsupported");
  }
  if ((parsed.source === "book") !== (parsed.termination === "book")) {
    throw new Error("search book source and termination are inconsistent");
  }
  let openingBookMove: SearchResponse["openingBookMove"];
  if (hasOpeningBookMove) {
    const book = record(parsed.openingBookMove, "search.openingBookMove");
    exactKeys(
      book,
      [
        "sampleCount",
        "teacherScoreCp",
        "teacherDepth",
        "teacherNodes",
        "openingClassification",
        "provenanceReferences",
      ],
      "search.openingBookMove",
    );
    if (
      !Array.isArray(book.provenanceReferences) ||
      book.provenanceReferences.length === 0 ||
      book.provenanceReferences.length > 64
    ) {
      throw new Error("search.openingBookMove provenance exceeds the bound");
    }
    openingBookMove = {
      sampleCount: integer(
        book.sampleCount,
        "search.openingBookMove.sampleCount",
        1,
      ),
      teacherScoreCp: integer(
        book.teacherScoreCp,
        "search.openingBookMove.teacherScoreCp",
        -32_000,
        32_000,
      ),
      teacherDepth: integer(
        book.teacherDepth,
        "search.openingBookMove.teacherDepth",
        1,
        64,
      ),
      teacherNodes: integer(
        book.teacherNodes,
        "search.openingBookMove.teacherNodes",
        1,
      ),
      openingClassification: stringValue(
        book.openingClassification,
        "search.openingBookMove.openingClassification",
        64,
      ),
      provenanceReferences: book.provenanceReferences.map((hash, index) =>
        sha256(hash, `search.openingBookMove.provenanceReferences[${index}]`),
      ),
    };
  }
  if ((parsed.source === "book") !== (openingBookMove !== undefined)) {
    throw new Error("search book metadata is inconsistent");
  }
  return {
    schema: SEARCH_SCHEMA,
    timeControlSchema: TIME_CONTROL_SCHEMA,
    timeControlMode:
      parsed.timeControlMode as SearchResponse["timeControlMode"],
    profile: parsed.profile as SearchProfile,
    evaluator: parsed.evaluator as EvaluatorName,
    perspective: side(parsed.perspective, "search.perspective"),
    source: parsed.source,
    bestMove:
      parsed.bestMove === null
        ? null
        : usiMove(parsed.bestMove, "search.bestMove"),
    scoreCp: integer(parsed.scoreCp, "search.scoreCp", -32_000, 32_000),
    depth: integer(parsed.depth, "search.depth", 0, maximumDepth),
    seldepth: integer(parsed.seldepth, "search.seldepth", 0, 255),
    nodes: integer(parsed.nodes, "search.nodes", 0, maximumNodes),
    elapsedNs: integer(parsed.elapsedNs, "search.elapsedNs"),
    nps: integer(parsed.nps, "search.nps"),
    pv: parsed.pv.map((move, index) => usiMove(move, `search.pv[${index}]`)),
    termination: parsed.termination as SearchResponse["termination"],
    lines,
    stats: counters,
    ...(openingBookMove === undefined ? {} : { openingBookMove }),
  };
}

export function parseWorkerRequest(value: unknown): WorkerRequest {
  const parsed = record(value, "request");
  const id = integer(parsed.id, "request.id", 1);
  const kind = stringValue(parsed.kind, "request.kind", 32);
  switch (kind) {
    case "initialize": {
      exactKeys(parsed, ["id", "kind", "initialSfen", "moves"], "request");
      if (
        !Array.isArray(parsed.moves) ||
        parsed.moves.length > MAX_GAME_MOVES
      ) {
        throw new Error("request.moves exceeds the bound");
      }
      return {
        id,
        kind,
        initialSfen:
          parsed.initialSfen === null
            ? null
            : stringValue(parsed.initialSfen, "request.initialSfen", 512),
        moves: parsed.moves.map((move, index) =>
          usiMove(move, `request.moves[${index}]`),
        ),
      };
    }
    case "reset":
      exactKeys(parsed, ["id", "kind", "sfen"], "request");
      return {
        id,
        kind,
        sfen:
          parsed.sfen === null
            ? null
            : stringValue(parsed.sfen, "request.sfen", 512),
      };
    case "load-model":
      exactKeys(
        parsed,
        ["id", "kind", "bytes", "expectedArtifactSha256"],
        "request",
      );
      if (
        !(parsed.bytes instanceof ArrayBuffer) ||
        parsed.bytes.byteLength === 0 ||
        parsed.bytes.byteLength > MAX_BROWSER_MODEL_BYTES
      ) {
        throw new Error("request.bytes exceeds the model bound");
      }
      return {
        id,
        kind,
        bytes: parsed.bytes,
        expectedArtifactSha256:
          parsed.expectedArtifactSha256 === null
            ? null
            : sha256(
                parsed.expectedArtifactSha256,
                "request.expectedArtifactSha256",
              ),
      };
    case "unload-model":
      exactKeys(parsed, ["id", "kind"], "request");
      return { id, kind };
    case "play-move":
      exactKeys(parsed, ["id", "kind", "movement"], "request");
      return {
        id,
        kind,
        movement: usiMove(parsed.movement, "request.movement"),
      };
    case "search": {
      exactKeys(
        parsed,
        ["id", "kind", "profile", "evaluator", "multiPv", "timeControl"],
        "request",
      );
      if (!SEARCH_PROFILES.has(parsed.profile as SearchProfile)) {
        throw new Error("request.profile is unsupported");
      }
      if (!EVALUATOR_CHOICES.has(parsed.evaluator as EvaluatorChoice)) {
        throw new Error("request.evaluator is unsupported");
      }
      return {
        id,
        kind,
        profile: parsed.profile as SearchProfile,
        evaluator: parsed.evaluator as EvaluatorChoice,
        multiPv: integer(parsed.multiPv, "request.multiPv", 1, 3),
        timeControl:
          parsed.timeControl === null
            ? null
            : parseTimeControl(parsed.timeControl),
      };
    }
    case "load-opening-book":
      exactKeys(
        parsed,
        ["id", "kind", "bytes", "expectedArtifactSha256"],
        "request",
      );
      if (
        !(parsed.bytes instanceof ArrayBuffer) ||
        parsed.bytes.byteLength === 0 ||
        parsed.bytes.byteLength > MAX_BROWSER_OPENING_BOOK_BYTES
      ) {
        throw new Error("request.bytes exceeds the opening-book bound");
      }
      return {
        id,
        kind,
        bytes: parsed.bytes,
        expectedArtifactSha256:
          parsed.expectedArtifactSha256 === null
            ? null
            : sha256(
                parsed.expectedArtifactSha256,
                "request.expectedArtifactSha256",
              ),
      };
    case "unload-opening-book":
      exactKeys(parsed, ["id", "kind"], "request");
      return { id, kind };
    case "configure-opening":
      exactKeys(
        parsed,
        [
          "id",
          "kind",
          "profile",
          "maxPlies",
          "minimumSampleCount",
          "maximumTeacherLossCp",
        ],
        "request",
      );
      if (!OPENING_PROFILES.has(parsed.profile as OpeningProfile)) {
        throw new Error("request.profile is unsupported");
      }
      return {
        id,
        kind,
        profile: parsed.profile as OpeningProfile,
        maxPlies: integer(parsed.maxPlies, "request.maxPlies", 1, 40),
        minimumSampleCount: integer(
          parsed.minimumSampleCount,
          "request.minimumSampleCount",
          1,
        ),
        maximumTeacherLossCp: integer(
          parsed.maximumTeacherLossCp,
          "request.maximumTeacherLossCp",
          0,
          32_000,
        ),
      };
    case "analysis-start":
      exactKeys(
        parsed,
        ["id", "kind", "profile", "evaluator", "request"],
        "request",
      );
      if (!SEARCH_PROFILES.has(parsed.profile as SearchProfile)) {
        throw new Error("request.profile is unsupported");
      }
      if (!EVALUATOR_CHOICES.has(parsed.evaluator as EvaluatorChoice)) {
        throw new Error("request.evaluator is unsupported");
      }
      return {
        id,
        kind,
        profile: parsed.profile as SearchProfile,
        evaluator: parsed.evaluator as EvaluatorChoice,
        request: parseAnalysisStart(parsed.request),
      };
    case "analysis-step":
      exactKeys(parsed, ["id", "kind", "request"], "request");
      return { id, kind, request: parseAnalysisStep(parsed.request) };
    case "analysis-stop":
    case "analysis-worker-failed":
    case "analysis-restart":
      exactKeys(parsed, ["id", "kind"], "request");
      return { id, kind };
    default:
      throw new Error("request.kind is unsupported");
  }
}

export function parseWorkerResponse(value: unknown): WorkerResponse {
  const parsed = record(value, "response");
  if (
    parsed.schema !== WORKER_RESPONSE_SCHEMA ||
    typeof parsed.ok !== "boolean"
  ) {
    throw new Error("worker response header is invalid");
  }
  const id = integer(parsed.id, "response.id", 1);
  const rawKind = stringValue(parsed.kind, "response.kind", 32);
  if (parsed.ok) {
    if (!WORKER_KINDS.has(rawKind as WorkerRequest["kind"])) {
      throw new Error("successful worker response kind is unsupported");
    }
    exactKeys(parsed, ["schema", "id", "ok", "kind", "data"], "response");
    return {
      schema: WORKER_RESPONSE_SCHEMA,
      id,
      ok: true,
      kind: rawKind as WorkerRequest["kind"],
      data: parsed.data,
    };
  }
  if (
    rawKind !== "protocol" &&
    !WORKER_KINDS.has(rawKind as WorkerRequest["kind"])
  ) {
    throw new Error("failed worker response kind is unsupported");
  }
  exactKeys(parsed, ["schema", "id", "ok", "kind", "error"], "response");
  const error = record(parsed.error, "response.error");
  exactKeys(error, ["code", "message"], "response.error");
  if (error.code !== "invalid-request" && error.code !== "engine-error") {
    throw new Error("response.error.code is unsupported");
  }
  return {
    schema: WORKER_RESPONSE_SCHEMA,
    id,
    ok: false,
    kind: rawKind as WorkerFailure["kind"],
    error: {
      code: error.code,
      message: stringValue(error.message, "response.error.message", 512),
    },
  };
}

export interface DeviceCapabilities {
  hardwareConcurrency: number;
  deviceMemoryGiB: number | null;
  reducedData: boolean;
}

export function recommendedSearchProfile(
  capabilities: DeviceCapabilities,
): SearchProfile {
  if (
    capabilities.reducedData ||
    capabilities.hardwareConcurrency <= 4 ||
    (capabilities.deviceMemoryGiB !== null && capabilities.deviceMemoryGiB <= 4)
  ) {
    return "eco";
  }
  if (
    capabilities.hardwareConcurrency >= 8 &&
    (capabilities.deviceMemoryGiB === null || capabilities.deviceMemoryGiB >= 8)
  ) {
    return "quality";
  }
  return "balanced";
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
