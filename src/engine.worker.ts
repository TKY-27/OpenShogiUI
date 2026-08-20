/// <reference lib="webworker" />

import initWasm, { WasmBrowserEngine } from "./generated/open_shogi_wasm.js";
import wasmUrl from "./generated/open_shogi_wasm_bg.wasm?url";
import {
  parseAnalysisResponse,
  parseBrowserSnapshot,
  parseModelSummary,
  parseOpeningBookSummary,
  parseOpeningPolicySummary,
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
      const raw =
        request.timeControl === null
          ? requireEngine().search(
              request.profile,
              request.evaluator,
              request.multiPv,
            )
          : requireEngine().searchWithTimeControl(
              request.profile,
              request.evaluator,
              request.multiPv,
              JSON.stringify(request.timeControl),
            );
      return parseSearchResponse(parseJson(raw, 128 * 1024, "search"));
    }
    case "load-opening-book": {
      const raw = requireEngine().loadOpeningBook(
        new Uint8Array(request.bytes),
        request.expectedArtifactSha256 ?? undefined,
      );
      return parseOpeningBookSummary(parseJson(raw, 16 * 1024, "openingBook"));
    }
    case "unload-opening-book": {
      const raw = requireEngine().unloadOpeningBook();
      return parseBrowserSnapshot(parseJson(raw, 256 * 1024, "snapshot"));
    }
    case "configure-opening": {
      const raw = requireEngine().configureOpening(
        request.profile,
        request.maxPlies,
        BigInt(request.minimumSampleCount),
        request.maximumTeacherLossCp,
      );
      return parseOpeningPolicySummary(
        parseJson(raw, 16 * 1024, "openingPolicy"),
      );
    }
    case "analysis-start": {
      const raw = requireEngine().analysisStart(
        request.profile,
        request.evaluator,
        JSON.stringify(request.request),
      );
      return parseAnalysisResponse(parseJson(raw, 256 * 1024, "analysis"));
    }
    case "analysis-step": {
      const raw = requireEngine().analysisStep(JSON.stringify(request.request));
      return parseAnalysisResponse(parseJson(raw, 256 * 1024, "analysis"));
    }
    case "analysis-stop": {
      const raw = requireEngine().analysisStop();
      return parseAnalysisResponse(parseJson(raw, 64 * 1024, "analysis"));
    }
    case "analysis-worker-failed": {
      const raw = requireEngine().analysisWorkerFailed();
      return parseAnalysisResponse(parseJson(raw, 256 * 1024, "analysis"));
    }
    case "analysis-restart": {
      const raw = requireEngine().analysisRestart();
      return parseAnalysisResponse(parseJson(raw, 256 * 1024, "analysis"));
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
