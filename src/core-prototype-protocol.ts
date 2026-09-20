import {
  parseBoardPosition,
  SNAPSHOT_SCHEMA,
  type BoardPosition,
  type Side,
  type TimeControl,
  type SearchProfile,
} from "./browser-engine";
import { assetPrefix, releaseManifest } from "virtual:shogi-runtime";

export const LEAF_SHA256 = import.meta.env.DEV
  ? "859e922b3f503ddeecf0afeb9a05fccac080a9faca3b19fce9d8253c9039c480"
  : (releaseManifest?.artifacts["leaf.osaval03"].sha256 ?? "");
export const ASSET_PREFIX = assetPrefix;
export type PrototypeSelection =
  | "baseline"
  | "candidate"
  | "defense"
  | "r4c1"
  | "release";
export const DEFAULT_SELECTION: PrototypeSelection = import.meta.env.DEV
  ? "defense"
  : "release";
export const ASSET_NAMES = [
  "engine.js",
  "engine.wasm",
  "leaf.osaval03",
  "controller.json",
] as const;
type AssetName = (typeof ASSET_NAMES)[number];
export interface PrototypeAsset {
  url: string;
  sha256: string;
  size: number;
}
export interface PrototypeManifest {
  schema: "open_shogi_core_prototype_assets/v2";
  selection: PrototypeSelection;
  runId: string;
  artifacts: Record<Exclude<AssetName, "controller.json">, PrototypeAsset> & {
    "controller.json": PrototypeAsset | null;
  };
}
export interface ComputeTelemetry {
  modelSha256: string | null;
  enabled: boolean;
  decisions: number;
  predictedRisk: number;
  targetMs: number;
  reorderedMoves: number;
}
export interface PrototypeSnapshot extends BoardPosition {
  leafSha256: string;
}
export interface PrototypeSearch {
  pv: string[];
  bestMove: string | null;
  perspective: Side;
  computeControl: ComputeTelemetry;
  nodes: number;
  depth: number;
  scoreCp: number | null;
  elapsedMs: number;
  termination: string;
  timing: PlayTiming;
  runtimeProof: PureRuntimeProof;
  workerRestartRequired?: boolean;
}
export interface PureRuntimeProof {
  profile: "pure_learned";
  profile_schema: "open_shogiai_pure_learned_v3_profile/v1";
  model_sha256: string;
  evaluator_profile_schema_hash: string;
  learned_eval_calls: number;
  accumulator_updates: number;
  accumulator_refreshes: number;
  handcrafted_eval_calls: number;
  residual_eval_calls: number;
  composite_eval_calls: number;
  book_hits: number;
  teacher_calls: number;
  fallback_count: number;
}
/** Emitted only after byte hashes, Wasm load identities and the first snapshot agree. */
export interface RuntimeIdentity {
  modelId: string;
  modelFormat: "OSAVAL03";
  leafSha256: string;
  controllerSha256: string | null;
  jsSha256: string;
  wasmSha256: string;
  expectedHashVerified: true;
  buildClass: "pure-only";
  evaluationMode: "pure-value";
}
export interface PlayTiming {
  targetMs: number;
  hardLimitMs: number;
  elapsedMs: number;
  searchMs: number;
  updates: number;
  interruption: "shared-atomic-per-node";
}
export interface PlayProgress {
  done: boolean;
  result: PrototypeSearch;
  timing: PlayTiming;
}
export interface PreparationTelemetry {
  fetchMs: number;
  moduleMs: number;
  compileMs: number;
  modelMs: number;
  totalMs: number;
}
export interface PrototypeReady {
  snapshot: PrototypeSnapshot;
  preparation: PreparationTelemetry;
  identity: RuntimeIdentity;
}
export type PrototypeRequest =
  | {
      id: number;
      kind: "initialize";
      manifest: PrototypeManifest;
      enabled: boolean;
      initialSfen: string | null;
      moves: string[];
    }
  | { id: number; kind: "move"; movement: string }
  | { id: number; kind: "configure"; enabled: boolean }
  | {
      id: number;
      kind: "search";
      timeControl: TimeControl;
      profile: SearchProfile;
      cancelBuffer: SharedArrayBuffer;
    }
  | { id: number; kind: "stop"; searchId: number };

export function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid prototype object");
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    throw new Error("Unsupported prototype fields");
  return result;
}
export function numeric(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
  integer = true,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error("Invalid prototype number");
  return value;
}
export function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new Error("Invalid artifact SHA-256");
  return value;
}
export function movement(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(value)
  )
    throw new Error("Invalid USI move");
  return value;
}
function expect(value: unknown, expected: unknown): void {
  if (value !== expected) throw new Error("Prototype identity mismatch");
}

export function parsePrototypeManifest(value: unknown): PrototypeManifest {
  const record = object(value, ["schema", "selection", "runId", "artifacts"]);
  expect(record.schema, "open_shogi_core_prototype_assets/v2");
  if (import.meta.env.DEV) {
    if (
      record.selection !== "baseline" &&
      record.selection !== "candidate" &&
      record.selection !== "defense" &&
      record.selection !== "r4c1"
    )
      throw new Error("Invalid development model selection");
  } else if (record.selection !== "release" || releaseManifest === null) {
    throw new Error("A pinned release model is required");
  }
  if (
    typeof record.runId !== "string" ||
    !/^[a-zA-Z0-9._-]{1,96}$/.test(record.runId)
  )
    throw new Error("Invalid run identity");
  const entries = object(record.artifacts, ASSET_NAMES);
  const maximums = [
    2 * 1024 * 1024,
    32 * 1024 * 1024,
    64 * 1024 * 1024,
    16_384,
  ];
  const artifacts = Object.fromEntries(
    ASSET_NAMES.map((name, index) => {
      if (name === "controller.json" && entries[name] === null)
        return [name, null];
      const artifact = object(entries[name], ["url", "sha256", "size"]);
      const sha256 = hash(artifact.sha256);
      const size = numeric(artifact.size, maximums[index]);
      if (size === 0) throw new Error("Empty prototype artifact");
      expect(
        artifact.url,
        `${ASSET_PREFIX}${record.selection}/${name}?sha256=${sha256}`,
      );
      if (
        import.meta.env.DEV &&
        name === "leaf.osaval03" &&
        record.selection === "baseline"
      )
        expect(sha256, LEAF_SHA256);
      if (!import.meta.env.DEV) {
        const pinned = releaseManifest!.artifacts[name];
        if (pinned === null) throw new Error("Unexpected release artifact");
        expect(artifact.url, pinned.url);
        expect(sha256, pinned.sha256);
        expect(size, pinned.size);
      }
      return [name, { url: artifact.url as string, sha256, size }];
    }),
  ) as PrototypeManifest["artifacts"];
  if (!import.meta.env.DEV) {
    expect(record.runId, releaseManifest!.runId);
    expect(
      artifacts["controller.json"] === null,
      releaseManifest!.artifacts["controller.json"] === null,
    );
  }
  return {
    schema: "open_shogi_core_prototype_assets/v2",
    selection: record.selection as PrototypeSelection,
    runId: record.runId,
    artifacts,
  };
}

export function parseRuntimeIdentity(
  value: unknown,
  manifest: PrototypeManifest,
): RuntimeIdentity {
  const identity = object(value, [
    "modelId",
    "modelFormat",
    "leafSha256",
    "controllerSha256",
    "jsSha256",
    "wasmSha256",
    "expectedHashVerified",
    "buildClass",
    "evaluationMode",
  ]);
  expect(identity.modelId, manifest.runId);
  expect(identity.modelFormat, "OSAVAL03");
  expect(identity.leafSha256, manifest.artifacts["leaf.osaval03"].sha256);
  expect(
    identity.controllerSha256,
    manifest.artifacts["controller.json"]?.sha256 ?? null,
  );
  expect(identity.jsSha256, manifest.artifacts["engine.js"].sha256);
  expect(identity.wasmSha256, manifest.artifacts["engine.wasm"].sha256);
  expect(identity.expectedHashVerified, true);
  expect(identity.buildClass, "pure-only");
  expect(identity.evaluationMode, "pure-value");
  return identity as unknown as RuntimeIdentity;
}

/** Hash exactly the bytes about to be executed/loaded, once per Worker initialization. */
export async function verifyArtifactBytes(
  bytes: ArrayBuffer,
  artifact: PrototypeAsset,
): Promise<string> {
  if (bytes.byteLength !== artifact.size)
    throw new Error("Model artifact size mismatch");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== artifact.sha256)
    throw new Error("Model artifact hash mismatch");
  return digest;
}

export function parseLeafIdentity(
  value: unknown,
  leafSha256 = LEAF_SHA256,
): void {
  const identity = object(value, [
    "schema",
    "modelFormat",
    "artifactSha256",
    "expectedHashVerified",
    "buildClass",
    "evaluationMode",
  ]);
  expect(identity.schema, "open_shogi_browser_model/v1");
  expect(identity.modelFormat, "OSAVAL03");
  expect(identity.artifactSha256, leafSha256);
  expect(identity.expectedHashVerified, true);
  expect(identity.buildClass, "pure-only");
  expect(identity.evaluationMode, "pure-value");
}

export function parseComputeIdentity(
  value: unknown,
  controllerSha256: string,
  leafSha256 = LEAF_SHA256,
): void {
  const identity = object(value, [
    "schema",
    "artifactSha256",
    "leafModelSha256",
    "expectedHashVerified",
  ]);
  expect(identity.schema, "open_shogiai_computation_identity/v1");
  expect(identity.artifactSha256, controllerSha256);
  expect(identity.leafModelSha256, leafSha256);
  expect(identity.expectedHashVerified, true);
}

export function parsePureSnapshot(
  value: unknown,
  leafSha256 = LEAF_SHA256,
): PrototypeSnapshot {
  const snapshot = object(value, [
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
    "buildClass",
    "compiledEvaluators",
  ]);
  expect(snapshot.schema, SNAPSHOT_SCHEMA);
  expect(snapshot.buildClass, "pure-only");
  expect(
    JSON.stringify(snapshot.compiledEvaluators),
    JSON.stringify(["osaval02", "phase10t-a1", "phase10v"]),
  );
  const engine = object(snapshot.engine, ["name", "version"]);
  expect(engine.name, "OpenShogiAI");
  if (typeof engine.version !== "string" || engine.version.length > 64)
    throw new Error("Invalid engine version");
  const evaluator = object(snapshot.evaluator, ["kind", "model"]);
  expect(evaluator.kind, "model-available");
  parseLeafIdentity(evaluator.model, leafSha256);
  expect(snapshot.openingBook, null);
  const opening = object(snapshot.openingPolicy, [
    "profile",
    "maxPlies",
    "minimumSampleCount",
    "maximumTeacherLossCp",
  ]);
  expect(opening.profile, "disabled");
  for (const key of ["maxPlies", "minimumSampleCount", "maximumTeacherLossCp"])
    expect(opening[key], 0);
  const position = parseBoardPosition(snapshot);
  const initial = position.initialSfen.trim().split(/\s+/);
  const initialMove = Number(initial[3]);
  const initialSide = initial[1] === "b" ? "black" : "white";
  const expectedSide =
    position.moves.length % 2 === 0
      ? initialSide
      : initialSide === "black"
        ? "white"
        : "black";
  if (
    initial.length !== 4 ||
    !["b", "w"].includes(initial[1] ?? "") ||
    !/^[1-9][0-9]*$/.test(initial[3] ?? "") ||
    !Number.isSafeInteger(initialMove) ||
    initialMove + position.moves.length !== position.moveNumber ||
    position.sideToMove !== expectedSide ||
    (position.terminal !== null && position.legalMoves.length !== 0)
  )
    throw new Error("Inconsistent prototype position");
  return { ...position, leafSha256 };
}

export function parsePureSearch(
  value: unknown,
  controllerSha256: string | null,
  enabled: boolean,
  leafSha256 = LEAF_SHA256,
  profile: SearchProfile = "eco",
): PrototypeSearch {
  const search = object(value, [
    "schema",
    "timeControlSchema",
    "timeControlMode",
    "profile",
    "evaluator",
    "perspective",
    "source",
    "bestMove",
    "scoreCp",
    "outcome",
    "depth",
    "seldepth",
    "nodes",
    "elapsedNs",
    "nps",
    "pv",
    "termination",
    "lines",
    "stats",
    "runtimeProof",
    "computeControl",
  ]);
  expect(search.schema, "open_shogi_browser_search/v1");
  expect(search.timeControlSchema, "open_shogi_time_control/v1");
  expect(search.timeControlMode, "clock");
  expect(search.profile, profile);
  expect(search.evaluator, "pure_learned");
  expect(search.source, "search");
  if (search.perspective !== "black" && search.perspective !== "white")
    throw new Error("Invalid search perspective");
  const interrupted = [
    "cancelled_before_evaluation",
    "node_limit_before_evaluation",
    "time_limit_before_evaluation",
  ].includes(String(search.outcome));
  const terminal = [
    "checkmate",
    "no_legal_moves",
    "repetition",
    "perpetual_check",
  ].includes(String(search.outcome));
  if (search.outcome !== "evaluated" && !interrupted && !terminal)
    throw new Error("Invalid or failed search outcome");
  if (interrupted) expect(search.scoreCp, null);
  else if (
    typeof search.scoreCp !== "number" ||
    !Number.isSafeInteger(search.scoreCp) ||
    Math.abs(search.scoreCp) > 32_000
  )
    throw new Error("Invalid search score");
  const depth = numeric(search.depth, 128);
  const nodes = numeric(search.nodes, 1_000_000_000);
  for (const key of ["seldepth", "elapsedNs", "nps"]) numeric(search[key]);
  if (
    !["completed", "stable", "node-limit", "time-limit", "cancelled"].includes(
      String(search.termination),
    )
  )
    throw new Error("Invalid search termination");
  const bestMove = search.bestMove === null ? null : movement(search.bestMove);
  const pv = moveList(search.pv, 256);
  if (bestMove !== null && pv[0] !== bestMove)
    throw new Error("Search PV mismatch");
  if (!Array.isArray(search.lines) || search.lines.length > 1)
    throw new Error("Invalid search lines");
  for (const value of search.lines) {
    const line = object(value, [
      "rank",
      "bestMove",
      "scoreCp",
      "depth",
      "seldepth",
      "nodes",
      "pv",
    ]);
    expect(line.rank, 1);
    movement(line.bestMove);
    if (
      typeof line.scoreCp !== "number" ||
      !Number.isSafeInteger(line.scoreCp) ||
      Math.abs(line.scoreCp) > 32_000
    )
      throw new Error("Invalid line score");
    for (const key of ["depth", "seldepth", "nodes"]) numeric(line[key]);
    const linePv = moveList(line.pv, 256);
    expect(linePv[0], line.bestMove);
  }
  const stats = object(search.stats, [
    "ttProbes",
    "ttHits",
    "ttCollisions",
    "betaCutoffs",
    "candidateMoves",
    "prunedMoves",
    "qnodes",
    "neuralInferenceCalls",
    "neuralInferenceTimeNs",
    "osaval02InferenceErrors",
    "learnedEvalCalls",
    "handcraftedEvalCalls",
    "residualEvalCalls",
    "compositeEvalCalls",
    "fallbackCount",
  ]);
  for (const value of Object.values(stats)) numeric(value);
  for (const key of [
    "osaval02InferenceErrors",
    "handcraftedEvalCalls",
    "residualEvalCalls",
    "compositeEvalCalls",
    "fallbackCount",
  ])
    expect(stats[key], 0);
  const proof = object(search.runtimeProof, [
    "profile",
    "profile_schema",
    "learned_eval_calls",
    "accumulator_updates",
    "accumulator_refreshes",
    "handcrafted_eval_calls",
    "residual_eval_calls",
    "composite_eval_calls",
    "book_hits",
    "teacher_calls",
    "fallback_count",
    "model_sha256",
    "evaluator_profile_schema_hash",
  ]);
  expect(proof.profile, "pure_learned");
  expect(proof.model_sha256, leafSha256);
  expect(proof.profile_schema, "open_shogiai_pure_learned_v3_profile/v1");
  expect(
    proof.evaluator_profile_schema_hash,
    "d2eec27887926ccc8a076552815cd54e34b85d6d23e65732ddba4989bf59c1e7",
  );
  for (const key of [
    "learned_eval_calls",
    "accumulator_updates",
    "accumulator_refreshes",
  ])
    numeric(proof[key]);
  expect(proof.learned_eval_calls, stats.learnedEvalCalls);
  for (const key of [
    "handcrafted_eval_calls",
    "residual_eval_calls",
    "composite_eval_calls",
    "book_hits",
    "teacher_calls",
    "fallback_count",
  ])
    expect(proof[key], 0);
  if (search.outcome === "evaluated") {
    if (numeric(proof.learned_eval_calls) === 0 || bestMove === null)
      throw new Error("Evaluated search lacks learned inference");
  } else {
    for (const key of [
      "learned_eval_calls",
      "accumulator_updates",
      "accumulator_refreshes",
    ])
      expect(proof[key], 0);
    expect(stats.neuralInferenceCalls, 0);
    for (const key of ["depth", "seldepth", "nodes"]) expect(search[key], 0);
    expect(search.lines.length, 0);
    if (terminal) {
      expect(bestMove, null);
      expect(pv.length, 0);
      expect(search.termination, "completed");
    } else {
      if (bestMove === null || pv.length !== 1)
        throw new Error("Invalid interrupted search move");
      const termination =
        search.outcome === "cancelled_before_evaluation"
          ? "cancelled"
          : search.outcome === "node_limit_before_evaluation"
            ? "node-limit"
            : "time-limit";
      expect(search.termination, termination);
    }
  }
  if (search.computeControl === null && (enabled || controllerSha256 !== null))
    throw new Error("Missing controller telemetry");
  const compute = object(
    search.computeControl ?? {
      modelSha256: null,
      enabled: false,
      decisions: 0,
      predictedRisk: 0,
      targetMs: 0,
      reorderedMoves: 0,
    },
    [
      "modelSha256",
      "enabled",
      "decisions",
      "predictedRisk",
      "targetMs",
      "reorderedMoves",
    ],
  );
  expect(compute.modelSha256, controllerSha256);
  expect(compute.enabled, enabled);
  const computeControl: ComputeTelemetry = {
    modelSha256: controllerSha256,
    enabled,
    decisions: numeric(compute.decisions),
    predictedRisk: numeric(compute.predictedRisk, 1, false),
    targetMs: numeric(compute.targetMs, Number.MAX_SAFE_INTEGER, false),
    reorderedMoves: numeric(compute.reorderedMoves),
  };
  return {
    bestMove,
    pv,
    perspective: search.perspective,
    computeControl,
    depth,
    nodes,
    scoreCp: search.scoreCp as number | null,
    elapsedMs: numeric(search.elapsedNs) / 1_000_000,
    termination: String(search.termination),
    runtimeProof: proof as unknown as PureRuntimeProof,
    timing: {
      targetMs: computeControl.targetMs,
      hardLimitMs: 0,
      elapsedMs: numeric(search.elapsedNs) / 1_000_000,
      searchMs: numeric(search.elapsedNs) / 1_000_000,
      updates: 0,
      interruption: "shared-atomic-per-node",
    },
  };
}

export function parsePlayProgress(
  value: unknown,
  manifest: PrototypeManifest,
  enabled: boolean,
  profile: SearchProfile,
): PlayProgress {
  const envelope = object(value, ["schema", "done", "result", "timing"]);
  expect(envelope.schema, "open_shogi_play_session/v1");
  if (typeof envelope.done !== "boolean") throw new Error("Invalid play state");
  const raw = object(envelope.timing, [
    "targetMs",
    "hardLimitMs",
    "elapsedMs",
    "searchMs",
    "updates",
    "interruption",
  ]);
  expect(raw.interruption, "shared-atomic-per-node");
  const timing: PlayTiming = {
    targetMs: numeric(raw.targetMs, 604_800_000, false),
    hardLimitMs: numeric(raw.hardLimitMs, 604_800_000, false),
    elapsedMs: numeric(raw.elapsedMs, 604_800_000, false),
    searchMs: numeric(raw.searchMs, 604_800_000, false),
    updates: numeric(raw.updates),
    interruption: "shared-atomic-per-node",
  };
  if (
    timing.targetMs > timing.hardLimitMs ||
    timing.searchMs > timing.elapsedMs + 1
  )
    throw new Error("Invalid play timing");
  const result = parsePureSearch(
    envelope.result,
    manifest.artifacts["controller.json"]?.sha256 ?? null,
    enabled,
    manifest.artifacts["leaf.osaval03"].sha256,
    profile,
  );
  return { done: envelope.done, result: { ...result, timing }, timing };
}

export function moveList(value: unknown, maximum = 512): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error("Invalid move history");
  return value.map(movement);
}

export function boundedJson(raw: string, maximum = 256 * 1024): unknown {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maximum)
    throw new Error("Prototype response exceeds bound");
  return JSON.parse(raw) as unknown;
}
