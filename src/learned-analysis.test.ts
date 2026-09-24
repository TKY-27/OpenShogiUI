import { describe, expect, it, vi } from "vitest";
import {
  LearnedAnalysisSession,
  analysisRequest,
  readAnalysisPosition,
} from "./learned-analysis";
import { START_SFEN } from "./collection";
import type { PrototypeWorkerClient } from "./core-prototype-client";
import type {
  PrototypeManifest,
  PrototypeReady,
  PrototypeSnapshot,
  PrototypeSelection,
} from "./core-prototype-protocol";
import type { AnalysisResponse } from "./browser-engine";

const modelHash = "a".repeat(64);
function manifest(selection: PrototypeSelection): PrototypeManifest {
  const asset = { url: "/test", sha256: modelHash, size: 1 };
  return {
    schema: "open_shogi_core_prototype_assets/v2",
    selection,
    runId: `test-${selection}`,
    artifacts: {
      "engine.js": asset,
      "engine.wasm": asset,
      "leaf.osaval03": asset,
      "controller.json": null,
    },
  };
}
const snapshot: PrototypeSnapshot = {
  initialSfen: START_SFEN,
  sfen: START_SFEN,
  sideToMove: "black",
  moveNumber: 1,
  board: Array(81).fill(null),
  hands: { black: [], white: [] },
  moves: [],
  terminal: null,
  legalMoves: [],
  leafSha256: modelHash,
};
function ready(m: PrototypeManifest): PrototypeReady {
  return {
    snapshot,
    identity: {
      modelId: m.runId,
      modelFormat: "OSAVAL03",
      leafSha256: modelHash,
      controllerSha256: null,
      jsSha256: modelHash,
      wasmSha256: modelHash,
      expectedHashVerified: true,
      buildClass: "pure-only",
      evaluationMode: "pure-value",
    },
    preparation: {
      fetchMs: 0,
      moduleMs: 0,
      compileMs: 0,
      modelMs: 0,
      totalMs: 0,
    },
  };
}

describe("bounded learned analysis", () => {
  it("parses only bounded local position commands and leaves legality to the Wasm", () => {
    expect(readAnalysisPosition("position startpos moves 7g7f 3c3d")).toEqual({
      initialSfen: START_SFEN,
      moves: ["7g7f", "3c3d"],
    });
    expect(readAnalysisPosition(`position sfen ${START_SFEN}`)).toEqual({
      initialSfen: START_SFEN,
      moves: [],
    });
    expect(() =>
      readAnalysisPosition("position startpos moves illegal"),
    ).toThrow();
    expect(() => readAnalysisPosition("x".repeat(13000))).toThrow();
  });
  it("binds every analysis identity to the runtime, model, root and options", async () => {
    const a = manifest("r4c3");
    const b = structuredClone(a);
    b.artifacts["engine.wasm"].sha256 = "b".repeat(64);
    const first = await analysisRequest(snapshot, a, "balanced", 3);
    const changed = await analysisRequest(snapshot, b, "balanced", 3);
    expect(first.modelHash).toBe(modelHash);
    expect(first.positionSfen).toBe(START_SFEN);
    expect(changed.featureSchemaHash).not.toBe(first.featureSchemaHash);
    expect(changed.searchOptionsHash).not.toBe(first.searchOptionsHash);
  });
  it("model changes dispose old work, preserve the position, and ignore the queued result", async () => {
    let resolve: (value: AnalysisResponse) => void = () => {};
    const clients: {
      dispose: ReturnType<typeof vi.fn>;
      initialize: ReturnType<typeof vi.fn>;
    }[] = [];
    let stepped = false;
    const make = () => {
      const client = {
        initialize: vi.fn(async (m: PrototypeManifest) => ready(m)),
        dispose: vi.fn(),
        analysisStart: vi.fn(async () => ({
          schema: "open_shogi_analysis/v1",
          event: "started",
          updates: [],
        })),
        analysisStep: vi.fn(() => {
          stepped = true;
          return new Promise<AnalysisResponse>((r) => {
            resolve = r;
          });
        }),
        analysisStop: vi.fn(async () => ({
          schema: "open_shogi_analysis/v1",
          event: "stopped",
          updates: [],
        })),
      };
      clients.push(client);
      return client as unknown as PrototypeWorkerClient;
    };
    const session = new LearnedAnalysisSession(
      () => {},
      make,
      async (selection) => manifest(selection!),
    );
    await session.prepare("r4c3");
    const running = session.analyze("balanced", 250, 1);
    await vi.waitFor(() => expect(stepped).toBe(true));
    await session.prepare("r4c1");
    resolve({
      schema: "open_shogi_analysis/v1",
      event: "updates",
      updates: [],
      slice: { depth: 3, nodes: 999, elapsedNs: 100, termination: "completed" },
    });
    await running;
    expect(session.state.selection).toBe("r4c1");
    expect(session.state.snapshot?.sfen).toBe(START_SFEN);
    expect(session.state.progress.nodes).toBe(0);
    expect(session.state.update).toBeNull();
    expect(clients[1].dispose).toHaveBeenCalled();
    session.dispose();
  });
  it("load failure exposes an error and no stale verified identity", async () => {
    const session = new LearnedAnalysisSession(
      () => {},
      () => {
        throw Error("must not initialize");
      },
      async () => {
        throw Error("missing model");
      },
    );
    await session.prepare("r4c4");
    expect(session.state).toMatchObject({
      selection: "r4c4",
      phase: "error",
      identity: null,
      update: null,
      error: "missing model",
    });
    session.dispose();
  });
});
