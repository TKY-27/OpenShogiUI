export const WORKER_RESPONSE_SCHEMA = "open_shogi_worker_response/v1";
export const SNAPSHOT_SCHEMA = "open_shogi_browser_snapshot/v1";
export const SEARCH_SCHEMA = "open_shogi_browser_search/v1";
export const MODEL_SCHEMA = "open_shogi_browser_model/v1";
export const MAX_BROWSER_MODEL_BYTES = 16 * 1024 * 1024;
export const MAX_GAME_MOVES = 512;

export type Side = "black" | "white";
export type SearchProfile = "eco" | "balanced" | "quality";
export type EvaluatorChoice = "handcrafted" | "model";
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
}

export interface SearchResponse {
  schema: typeof SEARCH_SCHEMA;
  profile: SearchProfile;
  evaluator: EvaluatorChoice;
  perspective: Side;
  bestMove: string | null;
  scoreCp: number;
  depth: number;
  seldepth: number;
  nodes: number;
  elapsedNs: number;
  nps: number;
  pv: string[];
  termination: "completed" | "node-limit" | "time-limit" | "cancelled";
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
    };

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
const EVALUATORS = new Set<EvaluatorChoice>(["handcrafted", "model"]);
const WORKER_KINDS = new Set<WorkerRequest["kind"]>([
  "initialize",
  "reset",
  "load-model",
  "unload-model",
  "play-move",
  "search",
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
  };
}

export function parseModelSummary(value: unknown): ModelSummary {
  return modelSummary(value, "model");
}

export function parseSearchResponse(value: unknown): SearchResponse {
  const parsed = record(value, "search");
  exactKeys(
    parsed,
    [
      "schema",
      "profile",
      "evaluator",
      "perspective",
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
    ],
    "search",
  );
  if (parsed.schema !== SEARCH_SCHEMA) {
    throw new Error("search.schema is unsupported");
  }
  if (!SEARCH_PROFILES.has(parsed.profile as SearchProfile)) {
    throw new Error("search.profile is unsupported");
  }
  if (!EVALUATORS.has(parsed.evaluator as EvaluatorChoice)) {
    throw new Error("search.evaluator is unsupported");
  }
  const maximumNodes =
    parsed.profile === "eco"
      ? 1_500
      : parsed.profile === "balanced"
        ? 4_000
        : 12_000;
  const maximumDepth =
    parsed.profile === "eco" ? 5 : parsed.profile === "balanced" ? 7 : 9;
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
  ]);
  if (
    !terminationValues.has(parsed.termination as SearchResponse["termination"])
  ) {
    throw new Error("search.termination is unsupported");
  }
  return {
    schema: SEARCH_SCHEMA,
    profile: parsed.profile as SearchProfile,
    evaluator: parsed.evaluator as EvaluatorChoice,
    perspective: side(parsed.perspective, "search.perspective"),
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
        ["id", "kind", "profile", "evaluator", "multiPv"],
        "request",
      );
      if (!SEARCH_PROFILES.has(parsed.profile as SearchProfile)) {
        throw new Error("request.profile is unsupported");
      }
      if (!EVALUATORS.has(parsed.evaluator as EvaluatorChoice)) {
        throw new Error("request.evaluator is unsupported");
      }
      return {
        id,
        kind,
        profile: parsed.profile as SearchProfile,
        evaluator: parsed.evaluator as EvaluatorChoice,
        multiPv: integer(parsed.multiPv, "request.multiPv", 1, 3),
      };
    }
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
