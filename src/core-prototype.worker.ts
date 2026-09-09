/// <reference lib="webworker" />
import { parseTimeControl } from "./browser-engine";
import {
  ASSET_PREFIX,
  boundedJson,
  hash,
  moveList,
  movement,
  numeric,
  object,
  parseComputeIdentity,
  parseLeafIdentity,
  parsePrototypeManifest,
  parsePlayProgress,
  parsePureSnapshot,
  type PrototypeAsset,
  type PrototypeRequest,
  type PrototypeManifest,
} from "./core-prototype-protocol";

interface PureEngine {
  loadModel(bytes: Uint8Array, expectedHash: string): string;
  loadComputeModel(bytes: Uint8Array, expectedHash: string): string;
  setComputeEnabled(enabled: boolean): unknown;
  restore(initialSfen: string, moves: string): string;
  snapshot(): string;
  playMove(move: string): string;
  playStart(
    profile: string,
    evaluator: string,
    multiPv: number,
    time: string,
  ): string;
  playRun(): string;
  playStop(): string;
}
interface PureModule {
  default(options: { module_or_path: ArrayBuffer }): Promise<unknown>;
  WasmBrowserEngine: new () => PureEngine;
}

let engine: PureEngine | null = null;
let manifest: PrototypeManifest | null = null;

let computeEnabled = false;
let executing = false;

async function fetchArtifact(artifact: PrototypeAsset): Promise<ArrayBuffer> {
  const response = await fetch(artifact.url, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  if (
    !response.ok ||
    response.headers.get("content-length") !== String(artifact.size)
  )
    throw new Error("Prototype artifact unavailable or changed");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.size)
    throw new Error("Prototype artifact size mismatch");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== artifact.sha256)
    throw new Error("Prototype artifact hash mismatch");
  return bytes;
}

function parseRequest(value: unknown): PrototypeRequest {
  if (value === null || typeof value !== "object")
    throw new Error("Invalid prototype request");
  const kind = (value as Record<string, unknown>).kind;
  const keys =
    kind === "initialize"
      ? ["id", "kind", "manifest", "enabled", "initialSfen", "moves"]
      : kind === "move"
        ? ["id", "kind", "movement"]
        : kind === "configure"
          ? ["id", "kind", "enabled"]
          : kind === "stop"
            ? ["id", "kind", "searchId"]
            : ["id", "kind", "timeControl", "profile", "cancelBuffer"];
  const request = object(value, keys);
  const id = numeric(request.id);
  if (id === 0) throw new Error("Invalid request id");
  if (kind === "initialize") {
    if (
      typeof request.enabled !== "boolean" ||
      (request.initialSfen !== null &&
        (typeof request.initialSfen !== "string" ||
          request.initialSfen.length > 512))
    )
      throw new Error("Invalid initialization");
    return {
      id,
      kind,
      manifest: parsePrototypeManifest(request.manifest),
      enabled: request.enabled,
      initialSfen: request.initialSfen,
      moves: moveList(request.moves),
    };
  }
  if (kind === "move")
    return { id, kind, movement: movement(request.movement) };
  if (kind === "configure") {
    if (typeof request.enabled !== "boolean")
      throw new Error("Invalid control mode");
    return { id, kind, enabled: request.enabled };
  }
  if (kind === "stop") return { id, kind, searchId: numeric(request.searchId) };
  if (kind === "search") {
    if (!["balanced", "quality"].includes(String(request.profile)))
      throw new Error("Invalid play quality");
    if (
      !self.crossOriginIsolated ||
      !(request.cancelBuffer instanceof SharedArrayBuffer) ||
      request.cancelBuffer.byteLength !== 4
    )
      throw new Error(
        "Cooperative cancellation requires cross-origin isolation",
      );
    const timeControl = parseTimeControl(request.timeControl);
    object(request.timeControl, [
      "schema",
      "blackTimeMs",
      "whiteTimeMs",
      "byoyomiMs",
      "blackIncrementMs",
      "whiteIncrementMs",
      "safetyMarginMs",
    ]);
    if (
      timeControl.byoyomiMs !== 0 ||
      timeControl.blackIncrementMs !== 0 ||
      timeControl.whiteIncrementMs !== 0
    )
      throw new Error("Prototype requires sudden death");
    return {
      id,
      kind,
      timeControl,
      profile: request.profile as "balanced" | "quality",
      cancelBuffer: request.cancelBuffer,
    };
  }
  throw new Error("Unsupported prototype request");
}

async function execute(request: PrototypeRequest): Promise<unknown> {
  if (!import.meta.env.DEV)
    throw new Error("Prototype is available only in development");
  if (request.kind === "initialize") {
    if (!self.crossOriginIsolated || typeof SharedArrayBuffer === "undefined")
      throw new Error(
        "この対局には COOP/COEP が有効な開発サーバーが必要です。ページを再読込してください。",
      );
    if (engine !== null)
      throw new Error("Replace the Worker to initialize again");
    const began = performance.now();
    const assets = request.manifest.artifacts;
    if (request.enabled && assets["controller.json"] === null)
      throw new Error("This candidate has no matching controller");
    const [wasm, leaf, controller] = await Promise.all([
      fetchArtifact(assets["engine.wasm"]),
      fetchArtifact(assets["leaf.osaval03"]),
      assets["controller.json"] === null
        ? null
        : fetchArtifact(assets["controller.json"]),
    ]);
    const fetched = performance.now();
    // The server rehashes this exact JS on every request; its URL is hash-bound.
    const moduleUrl = new URL(assets["engine.js"].url, self.location.origin);
    if (
      moduleUrl.origin !== self.location.origin ||
      !moduleUrl.pathname.startsWith(ASSET_PREFIX)
    )
      throw new Error("Invalid engine module URL");
    const module = (await import(
      /* @vite-ignore */ moduleUrl.href
    )) as PureModule;
    const imported = performance.now();
    await module.default({ module_or_path: wasm });
    const compiled = performance.now();
    const loaded = new module.WasmBrowserEngine();
    const leafHash = assets["leaf.osaval03"].sha256;
    parseLeafIdentity(
      boundedJson(loaded.loadModel(new Uint8Array(leaf), leafHash), 16_384),
      leafHash,
    );
    if (controller !== null && assets["controller.json"] !== null) {
      const controllerHash = hash(assets["controller.json"].sha256);
      parseComputeIdentity(
        boundedJson(
          loaded.loadComputeModel(new Uint8Array(controller), controllerHash),
          16_384,
        ),
        controllerHash,
        leafHash,
      );
    }
    loaded.setComputeEnabled(request.enabled);
    computeEnabled = request.enabled;
    if (request.initialSfen !== null)
      loaded.restore(request.initialSfen, JSON.stringify(request.moves));
    else if (request.moves.length !== 0)
      throw new Error("History requires an initial SFEN");
    const snapshot = parsePureSnapshot(
      boundedJson(loaded.snapshot()),
      leafHash,
    );
    engine = loaded;
    manifest = request.manifest;
    const finished = performance.now();
    return {
      snapshot,
      preparation: {
        fetchMs: fetched - began,
        moduleMs: imported - fetched,
        compileMs: compiled - imported,
        modelMs: finished - compiled,
        totalMs: finished - began,
      },
    };
  }
  if (engine === null || manifest === null)
    throw new Error("Prototype engine is not initialized");
  if (request.kind === "configure") {
    if (request.enabled && manifest.artifacts["controller.json"] === null)
      throw new Error("This candidate has no matching controller");
    engine.setComputeEnabled(request.enabled);
    computeEnabled = request.enabled;
    return null;
  }
  if (request.kind === "move")
    return parsePureSnapshot(
      boundedJson(engine.playMove(request.movement)),
      manifest.artifacts["leaf.osaval03"].sha256,
    );
  if (request.kind !== "search") throw new Error("No active search");
  const flag = new Int32Array(request.cancelBuffer);
  const parse = (raw: string) =>
    parsePlayProgress(
      boundedJson(raw),
      manifest!,
      computeEnabled,
      request.profile,
    );
  const callbacks = self as unknown as {
    __openShogiPlayCancelled?: () => boolean;
    __openShogiPlayProgress?: (raw: string) => void;
  };
  callbacks.__openShogiPlayCancelled = () => Atomics.load(flag, 0) !== 0;
  callbacks.__openShogiPlayProgress = (raw) => {
    self.postMessage({
      id: request.id,
      kind: "progress",
      ok: true,
      data: parse(raw),
    });
  };
  try {
    const initial = parse(
      engine.playStart(
        request.profile,
        "pure_learned",
        1,
        JSON.stringify(request.timeControl),
      ),
    );
    self.postMessage({
      id: request.id,
      kind: "progress",
      ok: true,
      data: initial,
    });
    return initial.done ? initial.result : parse(engine.playRun()).result;
  } finally {
    delete callbacks.__openShogiPlayCancelled;
    delete callbacks.__openShogiPlayProgress;
  }
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  let request: PrototypeRequest;
  try {
    request = parseRequest(event.data);
    if (executing) throw new Error("Prototype Worker is busy");
  } catch {
    self.postMessage({
      id: 0,
      kind: "protocol",
      ok: false,
      error: "Invalid or concurrent prototype request",
    });
    return;
  }
  executing = true;
  void execute(request)
    .then(
      (data) =>
        self.postMessage({
          id: request.id,
          kind: request.kind,
          ok: true,
          data,
        }),
      (error: unknown) =>
        self.postMessage({
          id: request.id,
          kind: request.kind,
          ok: false,
          error:
            error instanceof Error
              ? error.message.slice(0, 512)
              : "Prototype engine failed",
        }),
    )
    .finally(() => {
      executing = false;
    });
});
