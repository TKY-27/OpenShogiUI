/// <reference lib="webworker" />

import initWasm, { WasmBrowserEngine } from "./generated/open_shogi_wasm.js";
import wasmUrl from "./generated/open_shogi_wasm_bg.wasm?url";
import {
  parseBrowserSnapshot,
  parseModelSummary,
  parseSearchResponse,
  parseWorkerRequest,
  WORKER_RESPONSE_SCHEMA,
  WorkerFailure,
  WorkerRequest,
  WorkerSuccess,
} from "./browser-engine";

let engine: WasmBrowserEngine | null = null;
let initialization: Promise<void> | null = null;

function initializeWasm(): Promise<void> {
  initialization ??= initWasm({ module_or_path: wasmUrl }).then(
    () => undefined,
  );
  return initialization;
}

function parseJson(raw: string, maximumBytes: number, path: string): unknown {
  if (raw.length === 0 || raw.length > maximumBytes) {
    throw new Error(`${path} exceeded the worker response bound`);
  }
  return JSON.parse(raw) as unknown;
}

function requireEngine(): WasmBrowserEngine {
  if (engine === null) {
    throw new Error("worker engine has not been initialized");
  }
  return engine;
}

async function execute(request: WorkerRequest): Promise<unknown> {
  await initializeWasm();
  switch (request.kind) {
    case "initialize": {
      engine?.free();
      engine = new WasmBrowserEngine();
      const raw =
        request.initialSfen === null
          ? engine.snapshot()
          : engine.restore(request.initialSfen, JSON.stringify(request.moves));
      return parseBrowserSnapshot(parseJson(raw, 256 * 1024, "snapshot"));
    }
    case "reset": {
      const raw = requireEngine().reset(request.sfen ?? undefined);
      return parseBrowserSnapshot(parseJson(raw, 256 * 1024, "snapshot"));
    }
    case "load-model": {
      const raw = requireEngine().loadModel(
        new Uint8Array(request.bytes),
        request.expectedArtifactSha256 ?? undefined,
      );
      return parseModelSummary(parseJson(raw, 16 * 1024, "model"));
    }
    case "unload-model": {
      const raw = requireEngine().unloadModel();
      return parseBrowserSnapshot(parseJson(raw, 256 * 1024, "snapshot"));
    }
    case "play-move": {
      const raw = requireEngine().playMove(request.movement);
      return parseBrowserSnapshot(parseJson(raw, 256 * 1024, "snapshot"));
    }
    case "search": {
      const raw = requireEngine().search(
        request.profile,
        request.evaluator,
        request.multiPv,
      );
      return parseSearchResponse(parseJson(raw, 128 * 1024, "search"));
    }
  }
}

function messageFor(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 512) || "unknown worker failure";
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  let request: WorkerRequest;
  try {
    request = parseWorkerRequest(event.data);
  } catch (error) {
    const candidate = event.data as { id?: unknown } | null;
    const id =
      candidate !== null &&
      typeof candidate === "object" &&
      Number.isSafeInteger(candidate.id) &&
      Number(candidate.id) > 0
        ? Number(candidate.id)
        : 1;
    const failure: WorkerFailure = {
      schema: WORKER_RESPONSE_SCHEMA,
      id,
      ok: false,
      kind: "protocol",
      error: { code: "invalid-request", message: messageFor(error) },
    };
    self.postMessage(failure);
    return;
  }

  void execute(request).then(
    (data) => {
      const success: WorkerSuccess = {
        schema: WORKER_RESPONSE_SCHEMA,
        id: request.id,
        ok: true,
        kind: request.kind,
        data,
      };
      self.postMessage(success);
    },
    (error: unknown) => {
      const failure: WorkerFailure = {
        schema: WORKER_RESPONSE_SCHEMA,
        id: request.id,
        ok: false,
        kind: request.kind,
        error: { code: "engine-error", message: messageFor(error) },
      };
      self.postMessage(failure);
    },
  );
});
