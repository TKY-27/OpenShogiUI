import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  prototypeRequestAllowed,
  readPrototypeArtifact,
} from "../core-prototype-dev";
import {
  PrototypeWorkerClient,
  type PrototypeEngineClient,
} from "./core-prototype-client";
import {
  ASSET_NAMES,
  ASSET_PREFIX,
  LEAF_SHA256,
  parseComputeIdentity,
  parseLeafIdentity,
  parsePrototypeManifest,
  parsePureSearch,
  parsePureSnapshot,
  type PrototypeManifest,
  type PrototypeSearch,
  type PrototypeSnapshot,
} from "./core-prototype-protocol";
import { PrototypeMatchSession } from "./core-prototype-session";
import { routeForHash } from "./project";

const controllerHash = "a".repeat(64);
const manifest = parsePrototypeManifest({
  schema: "open_shogi_core_prototype_assets/v1",
  artifacts: Object.fromEntries(
    ASSET_NAMES.map((name) => {
      const sha256 = name === "leaf.osaval03" ? LEAF_SHA256 : controllerHash;
      return [
        name,
        { url: `${ASSET_PREFIX}${name}?sha256=${sha256}`, sha256, size: 1 },
      ];
    }),
  ),
});
const leafIdentity = {
  schema: "open_shogi_browser_model/v1",
  modelFormat: "OSAVAL03",
  artifactSha256: LEAF_SHA256,
  expectedHashVerified: true,
  buildClass: "pure-only",
  evaluationMode: "pure-value",
};

function position(moves: string[] = []): PrototypeSnapshot {
  const sideToMove = moves.length % 2 === 0 ? "black" : "white";
  return {
    initialSfen: "start",
    sfen: `position-${moves.length}`,
    sideToMove,
    moveNumber: moves.length + 1,
    board: Array(81).fill(null),
    hands: {
      black: (
        ["pawn", "lance", "knight", "silver", "gold", "bishop", "rook"] as const
      ).map((piece) => ({ piece, count: 0 })),
      white: (
        ["pawn", "lance", "knight", "silver", "gold", "bishop", "rook"] as const
      ).map((piece) => ({ piece, count: 0 })),
    },
    legalMoves: [
      {
        usi: sideToMove === "black" ? "7g7f" : "3c3d",
        from: { file: 7, rank: 7 },
        to: { file: 7, rank: 6 },
        drop: null,
        promote: false,
      },
    ],
    moves,
    terminal: null,
    leafSha256: LEAF_SHA256,
  };
}
function pureSnapshot() {
  const { leafSha256: _, ...board } = position();
  return {
    ...board,
    schema: "open_shogi_browser_snapshot/v1",
    engine: { name: "OpenShogiAI", version: "test" },
    evaluator: { kind: "model-available", model: leafIdentity },
    openingBook: null,
    openingPolicy: {
      profile: "disabled",
      maxPlies: 0,
      minimumSampleCount: 0,
      maximumTeacherLossCp: 0,
    },
    buildClass: "pure-only",
    compiledEvaluators: ["osaval02", "phase10t-a1", "phase10v"],
  };
}
function telemetry(enabled = true) {
  return {
    modelSha256: controllerHash,
    enabled,
    decisions: enabled ? 1 : 0,
    predictedRisk: 0.3,
    targetMs: 200,
    reorderedMoves: 0,
  };
}
function searchResult(side: "black" | "white" = "white"): PrototypeSearch {
  return {
    bestMove: side === "black" ? "7g7f" : "3c3d",
    perspective: side,
    computeControl: telemetry(),
    depth: 1,
    nodes: 3,
  };
}
function rawSearch() {
  return {
    schema: "open_shogi_browser_search/v1",
    timeControlSchema: "open_shogi_time_control/v1",
    timeControlMode: "clock",
    profile: "eco",
    evaluator: "pure_learned",
    perspective: "white",
    source: "search",
    bestMove: "3c3d",
    scoreCp: 2 as number | null,
    outcome: "evaluated",
    depth: 1,
    seldepth: 1,
    nodes: 3,
    elapsedNs: 1000,
    nps: 1,
    pv: ["3c3d"],
    termination: "completed",
    lines: [] as unknown[],
    stats: {
      ttProbes: 0,
      ttHits: 0,
      ttCollisions: 0,
      betaCutoffs: 0,
      candidateMoves: 1,
      prunedMoves: 0,
      qnodes: 0,
      neuralInferenceCalls: 1,
      neuralInferenceTimeNs: 1,
      osaval02InferenceErrors: 0,
      learnedEvalCalls: 1,
      handcraftedEvalCalls: 0,
      residualEvalCalls: 0,
      compositeEvalCalls: 0,
      fallbackCount: 0,
    },
    runtimeProof: {
      profile: "pure_learned",
      profile_schema: "open_shogiai_pure_learned_v3_profile/v1",
      learned_eval_calls: 1,
      accumulator_updates: 0,
      accumulator_refreshes: 0,
      handcrafted_eval_calls: 0,
      residual_eval_calls: 0,
      composite_eval_calls: 0,
      book_hits: 0,
      teacher_calls: 0,
      fallback_count: 0,
      model_sha256: LEAF_SHA256,
      evaluator_profile_schema_hash:
        "d2eec27887926ccc8a076552815cd54e34b85d6d23e65732ddba4989bf59c1e7",
    },
    computeControl: telemetry(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class FakeEngine implements PrototypeEngineClient {
  position = position();
  result = deferred<PrototypeSearch>();
  initialize = vi.fn(
    async (
      _manifest: PrototypeManifest,
      _enabled: boolean,
      restored: PrototypeSnapshot | null,
    ) => {
      this.position = restored ?? position();
      return this.position;
    },
  );
  move = vi.fn(async (move: string) => {
    this.position = position([...this.position.moves, move]);
    return this.position;
  });
  search = vi.fn(() => this.result.promise);
  dispose = vi.fn();
}
function harness() {
  let now = 100;
  const clients: FakeEngine[] = [];
  const changes = vi.fn();
  const session = new PrototypeMatchSession(
    changes,
    () => {
      const client = new FakeEngine();
      clients.push(client);
      return client;
    },
    async () => manifest,
    () => now,
  );
  return {
    session,
    clients,
    changes,
    at: (value: number) => {
      now = value;
    },
  };
}

describe("isolated prototype protocol", () => {
  it("keeps the route explicit and development-only", () => {
    expect(routeForHash("#/core-prototype")).toBe("workspace");
    expect(routeForHash("#/core-prototype", true)).toBe("core-prototype");
    expect(routeForHash("#/match", true)).toBe("match");
  });
  it("rejects foreign asset URLs, missing artifacts, and a different frozen leaf", () => {
    const foreign = structuredClone(manifest);
    foreign.artifacts["controller.json"].url = "https://example.com/model";
    expect(() => parsePrototypeManifest(foreign)).toThrow();
    const wrong = structuredClone(manifest);
    wrong.artifacts["leaf.osaval03"].sha256 = controllerHash;
    expect(() => parsePrototypeManifest(wrong)).toThrow();
    expect(() =>
      parsePrototypeManifest({ ...manifest, artifacts: {} }),
    ).toThrow();
  });
  it("validates the actual pure identities without the legacy MLP schema", () => {
    expect(() => parseLeafIdentity(leafIdentity)).not.toThrow();
    expect(() =>
      parseLeafIdentity({ ...leafIdentity, hiddenLayers: 1 }),
    ).toThrow();
    expect(() =>
      parseLeafIdentity({ ...leafIdentity, modelFormat: "OSAVAL01" }),
    ).toThrow();
    const identity = {
      schema: "open_shogiai_computation_identity/v1",
      artifactSha256: controllerHash,
      leafModelSha256: LEAF_SHA256,
      expectedHashVerified: true,
    };
    expect(() => parseComputeIdentity(identity, controllerHash)).not.toThrow();
    expect(() =>
      parseComputeIdentity(
        { ...identity, leafModelSha256: controllerHash },
        controllerHash,
      ),
    ).toThrow();
  });
  it("validates pure build, disabled opening, and board geometry", () => {
    expect(parsePureSnapshot(pureSnapshot()).leafSha256).toBe(LEAF_SHA256);
    expect(() =>
      parsePureSnapshot({
        ...pureSnapshot(),
        compiledEvaluators: ["handcrafted"],
      }),
    ).toThrow();
    expect(() =>
      parsePureSnapshot({ ...pureSnapshot(), openingBook: {} }),
    ).toThrow();
    expect(() => parsePureSnapshot({ ...pureSnapshot(), board: [] })).toThrow();
  });
  it("checks controller identity, enabled state, bounds and prohibited runtime counters", () => {
    expect(
      parsePureSearch(rawSearch(), controllerHash, true).computeControl.enabled,
    ).toBe(true);
    const wrong = rawSearch();
    wrong.runtimeProof.handcrafted_eval_calls = 1;
    expect(() => parsePureSearch(wrong, controllerHash, true)).toThrow();
    expect(() => parsePureSearch(rawSearch(), "b".repeat(64), true)).toThrow();
    expect(() => parsePureSearch(rawSearch(), controllerHash, false)).toThrow();
    const off = rawSearch();
    off.computeControl = telemetry(false);
    expect(
      parsePureSearch(off, controllerHash, false).computeControl.modelSha256,
    ).toBe(controllerHash);
    off.computeControl.predictedRisk = Number.NaN;
    expect(() => parsePureSearch(off, controllerHash, false)).toThrow();
  });
  it("accepts learned stable termination but rejects evaluation failures", () => {
    const stable = { ...rawSearch(), termination: "stable" };
    expect(parsePureSearch(stable, controllerHash, true).bestMove).toBe("3c3d");
    expect(() =>
      parsePureSearch(
        { ...stable, termination: "evaluation-error" },
        controllerHash,
        true,
      ),
    ).toThrow();
    expect(() =>
      parsePureSearch(
        { ...stable, outcome: "evaluation_error" },
        controllerHash,
        true,
      ),
    ).toThrow();
  });
  it("admits explicit zero-work interruptions without inventing an evaluation", () => {
    const interrupted = rawSearch();
    Object.assign(interrupted, {
      outcome: "time_limit_before_evaluation",
      termination: "time-limit",
      scoreCp: null,
      depth: 0,
      seldepth: 0,
      nodes: 0,
    });
    interrupted.stats.learnedEvalCalls = 0;
    interrupted.stats.neuralInferenceCalls = 0;
    interrupted.runtimeProof.learned_eval_calls = 0;
    expect(parsePureSearch(interrupted, controllerHash, true).bestMove).toBe(
      "3c3d",
    );
    interrupted.scoreCp = 0;
    expect(() => parsePureSearch(interrupted, controllerHash, true)).toThrow();
  });
});

describe("prototype game clock and cancellation", () => {
  it("charges real elapsed milliseconds to each side and forwards the full remaining clock", async () => {
    const h = harness();
    await h.session.start("black", true);
    h.at(1600);
    const move = h.session.move("7g7f");
    await vi.waitFor(() => expect(h.clients[0].search).toHaveBeenCalledOnce());
    expect(h.clients[0].search.mock.calls[0]).toEqual([
      {
        schema: "open_shogi_time_control/v1",
        blackTimeMs: 178500,
        whiteTimeMs: 180000,
        byoyomiMs: 0,
        blackIncrementMs: 0,
        whiteIncrementMs: 0,
        safetyMarginMs: 50,
      },
    ]);
    expect(h.session.state.telemetry).toBeNull();
    const applied = deferred<PrototypeSnapshot>();
    h.clients[0].move.mockReturnValueOnce(applied.promise);
    h.at(4600);
    h.clients[0].result.resolve(searchResult());
    await vi.waitFor(() => expect(h.clients[0].move).toHaveBeenCalledTimes(2));
    h.at(4800);
    applied.resolve(position(["7g7f", "3c3d"]));
    await move;
    expect(h.session.state.clock).toEqual({
      blackTimeMs: 178500,
      whiteTimeMs: 176800,
    });
    expect(h.session.state.telemetry).toEqual({
      ...telemetry(),
      elapsedMs: 3200,
    });
    expect(h.session.state.telemetry?.elapsedMs).toBe(
      180000 - h.session.state.clock.whiteTimeMs,
    );
    expect(h.session.state.snapshot?.moves).toEqual(["7g7f", "3c3d"]);
    expect(h.session.state.snapshot?.sideToMove).toBe("black");
  });
  it("starts the AI as black when the human selects gote", async () => {
    const h = harness();
    const started = h.session.start("white", false);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    expect(h.clients[0].initialize.mock.calls[0][1]).toBe(false);
    h.clients[0].result.resolve({
      ...searchResult("black"),
      computeControl: telemetry(false),
    });
    await started;
    expect(h.session.state.snapshot?.sideToMove).toBe("white");
    expect(h.session.state.telemetry?.enabled).toBe(false);
    expect(h.session.state.telemetry?.elapsedMs).toBe(
      180000 - h.session.state.clock.blackTimeMs,
    );
    await h.session.start("black", true);
    expect(h.session.state.telemetry).toBeNull();
  });
  it("rejects a human move exactly at flag fall before changing the Worker", async () => {
    const h = harness();
    await h.session.start("black", true);
    h.at(180100);
    await h.session.move("7g7f");
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.result).toEqual({
      reason: "timeout",
      winner: "white",
    });
    expect(h.clients[0].dispose).toHaveBeenCalledOnce();
  });
  it("physically stops overdue search and ignores its later result", async () => {
    const h = harness();
    const started = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    h.at(180100);
    expect(h.session.tick()).toBe(true);
    h.clients[0].result.resolve(searchResult("black"));
    await started;
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.snapshot?.moves).toEqual([]);
    expect(h.session.state.result).toEqual({
      reason: "timeout",
      winner: "white",
    });
  });
  it("checks flag fall again when a search returns without a timer tick", async () => {
    const h = harness();
    const started = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    h.at(180100);
    h.clients[0].result.resolve(searchResult("black"));
    await started;
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.result?.reason).toBe("timeout");
  });
  it("does not commit an AI move whose application completes after flag fall", async () => {
    const h = harness();
    const started = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    const moved = deferred<PrototypeSnapshot>();
    h.clients[0].move.mockReturnValueOnce(moved.promise);
    h.clients[0].result.resolve(searchResult("black"));
    await vi.waitFor(() => expect(h.clients[0].move).toHaveBeenCalledOnce());
    h.at(180100);
    moved.resolve(position(["7g7f"]));
    await started;
    expect(h.session.state.snapshot?.moves).toEqual([]);
    expect(h.session.state.result?.reason).toBe("timeout");
  });
  it("preserves confirmed position, time and artifact identity through physical stop/resume", async () => {
    const h = harness();
    await h.session.start("black", true);
    h.at(2100);
    h.session.stop();
    expect(h.session.state.phase).toBe("stopped");
    expect(h.session.state.clock.blackTimeMs).toBe(178000);
    h.at(502100);
    await h.session.resume();
    expect(h.clients[1].initialize.mock.calls[0]).toEqual([
      manifest,
      true,
      position(),
    ]);
    expect(h.session.state.clock.blackTimeMs).toBe(178000);
    expect(h.session.state.turnStartedAt).toBe(502100);
  });
  it("rejects stale search after a new match selects the other controller mode", async () => {
    const h = harness();
    const old = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    await h.session.start("black", false);
    h.clients[0].result.resolve(searchResult("black"));
    await old;
    expect(h.clients[0].dispose).toHaveBeenCalledOnce();
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.enabled).toBe(false);
    expect(h.session.state.snapshot?.moves).toEqual([]);
  });
  it("does not create a Worker for superseded asset initialization", async () => {
    const stale = deferred<PrototypeManifest>();
    const loader = vi
      .fn()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(manifest);
    const factory = vi.fn(() => new FakeEngine());
    const session = new PrototypeMatchSession(vi.fn(), factory, loader);
    const old = session.start("white", true);
    await session.start("black", false);
    stale.resolve(manifest);
    await old;
    expect(factory).toHaveBeenCalledOnce();
    expect(session.state.enabled).toBe(false);
    expect(session.state.snapshot?.moves).toEqual([]);
  });
  it("resignation and rule-terminal positions forbid later moves", async () => {
    const h = harness();
    await h.session.start("black", true);
    h.session.resign();
    await h.session.move("7g7f");
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.result?.reason).toBe("resignation");
    await h.session.start("black", true);
    const terminal = {
      ...position(["7g7f"]),
      terminal: {
        kind: "no-legal-moves",
        winner: "black" as const,
        loser: "white" as const,
      },
      legalMoves: [],
    };
    h.clients[1].move.mockResolvedValueOnce(terminal);
    await h.session.move("7g7f");
    expect(h.clients[1].search).not.toHaveBeenCalled();
    expect(h.clients[1].dispose).toHaveBeenCalledOnce();
    expect(h.session.state.result?.winner).toBe("black");
  });
  it("fails closed on illegal AI replies and missing assets", async () => {
    const h = harness();
    const started = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    h.clients[0].result.resolve({ ...searchResult("black"), bestMove: "1a1b" });
    await started;
    expect(h.session.state.phase).toBe("error");
    expect(h.clients[0].move).not.toHaveBeenCalled();
    const factory = vi.fn();
    const session = new PrototypeMatchSession(vi.fn(), factory, async () => {
      throw new Error("missing controller");
    });
    await session.start("black", true);
    expect(factory).not.toHaveBeenCalled();
    expect(session.state.phase).toBe("error");
  });
});

describe("prototype Worker transport", () => {
  it("terminates pending work, ignores late events, and rejects response kind mismatch", async () => {
    const listeners: Record<string, (event: { data?: unknown }) => void> = {};
    const worker = {
      addEventListener: vi.fn((name, listener) => {
        listeners[name] = listener;
      }),
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    const client = new PrototypeWorkerClient(() => worker as unknown as Worker);
    const pending = client.initialize(manifest, true, null);
    const rejection = expect(pending).rejects.toThrow("kind mismatch");
    listeners.message({ data: { id: 1, kind: "search", ok: true, data: {} } });
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    listeners.error({});
    listeners.message({
      data: { id: 1, kind: "initialize", ok: true, data: position() },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(client.move("7g7f")).rejects.toThrow("disposed");
  });
});

describe("local artifact serving boundary", () => {
  it("rejects non-loopback, cross-site, foreign host and non-read requests", () => {
    const request = {
      method: "GET",
      headers: { host: "127.0.0.1:5173" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    expect(prototypeRequestAllowed(request)).toBe(true);
    expect(prototypeRequestAllowed({ ...request, method: "POST" })).toBe(false);
    expect(
      prototypeRequestAllowed({
        ...request,
        socket: { remoteAddress: "192.168.1.2" },
      }),
    ).toBe(false);
    expect(
      prototypeRequestAllowed({
        ...request,
        headers: { host: "evil.example:5173" },
      }),
    ).toBe(false);
    expect(
      prototypeRequestAllowed({
        ...request,
        headers: { ...request.headers, origin: "https://evil.example" },
      }),
    ).toBe(false);
    expect(
      prototypeRequestAllowed({
        ...request,
        headers: { ...request.headers, "sec-fetch-site": "cross-site" },
      }),
    ).toBe(false);
  });
  it("allows same-checkout controller links, rejects escaping links and unknown paths", async () => {
    const base = await mkdtemp(join(tmpdir(), "osui-prototype-"));
    try {
      const root = join(base, "ai");
      await mkdir(join(root, "local/core-prototype/trained"), {
        recursive: true,
      });
      await writeFile(
        join(root, "local/core-prototype/trained/controller.json"),
        "{}",
      );
      const link = join(root, "local/core-prototype/controller.json");
      await symlink("trained/controller.json", link);
      expect(
        (await readPrototypeArtifact(root, "controller.json")).bytes.toString(),
      ).toBe("{}");
      await expect(readPrototypeArtifact(root, "../secret")).rejects.toThrow();
      await rm(link);
      await writeFile(join(base, "outside.json"), "{}");
      await symlink(join(base, "outside.json"), link);
      await expect(
        readPrototypeArtifact(root, "controller.json"),
      ).rejects.toThrow("escapes");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
