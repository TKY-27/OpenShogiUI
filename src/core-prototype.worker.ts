/// <reference lib="webworker" />
import { parseTimeControl } from "./browser-engine";
import {
  ASSET_PREFIX,
  boundedJson,
  hash,
  LEAF_SHA256,
  moveList,
  movement,
  numeric,
  object,
  parseComputeIdentity,
  parseLeafIdentity,
  parsePrototypeManifest,
  parsePureSearch,
  parsePureSnapshot,
  type PrototypeAsset,
  type PrototypeRequest,
} from "./core-prototype-protocol";

interface PureEngine {
  loadModel(bytes: Uint8Array, expectedHash: string): string;
  loadComputeModel(bytes: Uint8Array, expectedHash: string): string;
  setComputeEnabled(enabled: boolean): unknown;
  restore(initialSfen: string, moves: string): string;
  snapshot(): string;
  playMove(move: string): string;
  searchWithTimeControl(
    profile: string,
    evaluator: string,
    multiPv: number,
    time: string,
  ): string;
}
interface PureModule {
  default(options: { module_or_path: ArrayBuffer }): Promise<unknown>;
  WasmBrowserEngine: new () => PureEngine;
}

let engine: PureEngine | null = null;
let controllerHash = "";
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
        : ["id", "kind", "timeControl"];
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
  if (kind === "search") {
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
    return { id, kind, timeControl };
  }
  throw new Error("Unsupported prototype request");
}

async function execute(request: PrototypeRequest): Promise<unknown> {
  if (!import.meta.env.DEV)
    throw new Error("Prototype is available only in development");
  if (request.kind === "initialize") {
    if (engine !== null)
      throw new Error("Replace the Worker to initialize again");
    const assets = request.manifest.artifacts;
    const [wasm, leaf, controller] = await Promise.all([
      fetchArtifact(assets["engine.wasm"]),
      fetchArtifact(assets["leaf.osaval03"]),
      fetchArtifact(assets["controller.json"]),
    ]);
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
    await module.default({ module_or_path: wasm });
    const loaded = new module.WasmBrowserEngine();
    parseLeafIdentity(
      boundedJson(loaded.loadModel(new Uint8Array(leaf), LEAF_SHA256), 16_384),
    );
    controllerHash = hash(assets["controller.json"].sha256);
    parseComputeIdentity(
      boundedJson(
        loaded.loadComputeModel(new Uint8Array(controller), controllerHash),
        16_384,
      ),
      controllerHash,
    );
    loaded.setComputeEnabled(request.enabled);
    computeEnabled = request.enabled;
    if (request.initialSfen !== null)
      loaded.restore(request.initialSfen, JSON.stringify(request.moves));
    else if (request.moves.length !== 0)
      throw new Error("History requires an initial SFEN");
    const snapshot = parsePureSnapshot(boundedJson(loaded.snapshot()));
    engine = loaded;
    return snapshot;
  }
  if (engine === null) throw new Error("Prototype engine is not initialized");
  if (request.kind === "move")
    return parsePureSnapshot(boundedJson(engine.playMove(request.movement)));
  return parsePureSearch(
    boundedJson(
      engine.searchWithTimeControl(
        "eco",
        "pure_learned",
        1,
        JSON.stringify(request.timeControl),
      ),
    ),
    controllerHash,
    computeEnabled,
  );
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
