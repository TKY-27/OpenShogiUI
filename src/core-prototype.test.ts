import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  prototypeRequestAllowed,
  readPrototypeArtifact,
  readCandidateDescriptor,
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
  parsePlayProgress,
  parseRuntimeIdentity,
  verifyArtifactBytes,
  type PrototypeManifest,
  type PrototypeSearch,
  type PrototypeSnapshot,
  type PureRuntimeProof,
} from "./core-prototype-protocol";
import { PrototypeMatchSession } from "./core-prototype-session";
import { routeForHash } from "./project";

const controllerHash = "a".repeat(64);
const manifest = parsePrototypeManifest({
  schema: "open_shogi_core_prototype_assets/v2",
  selection: "baseline",
  runId: "frozen-w256-hard2",
  artifacts: Object.fromEntries(
    ASSET_NAMES.map((name) => {
      const sha256 = name === "leaf.osaval03" ? LEAF_SHA256 : controllerHash;
      return [
        name,
        {
          url: `${ASSET_PREFIX}baseline/${name}?sha256=${sha256}`,
          sha256,
          size: 1,
        },
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
    initialSfen:
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
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
it("preserves the initial SFEN move number and side through restored history", () => {
  const snapshot = pureSnapshot();
  snapshot.initialSfen = "4k4/9/9/9/9/9/9/9/4K4 w - 121";
  snapshot.moveNumber = 121;
  snapshot.sideToMove = "white";
  expect(parsePureSnapshot(snapshot).moveNumber).toBe(121);
  snapshot.moves = ["5a6a"];
  snapshot.moveNumber = 122;
  snapshot.sideToMove = "black";
  expect(parsePureSnapshot(snapshot).moveNumber).toBe(122);
  expect(() => parsePureSnapshot({ ...snapshot, moveNumber: 2 })).toThrow();
  expect(() =>
    parsePureSnapshot({ ...snapshot, sideToMove: "white" }),
  ).toThrow();
  expect(() =>
    parsePureSnapshot({ ...snapshot, initialSfen: "invalid" }),
  ).toThrow();
});
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
const preparation = {
  fetchMs: 1,
  moduleMs: 2,
  compileMs: 3,
  modelMs: 4,
  totalMs: 10,
};
const timing = {
  targetMs: 200,
  hardLimitMs: 600,
  elapsedMs: 100,
  searchMs: 98,
  updates: 1,
  interruption: "shared-atomic-per-node" as const,
};
function searchResult(side: "black" | "white" = "white"): PrototypeSearch {
  return {
    bestMove: side === "black" ? "7g7f" : "3c3d",
    pv: [side === "black" ? "7g7f" : "3c3d"],
    perspective: side,
    computeControl: telemetry(),
    depth: 1,
    nodes: 3,
    scoreCp: 2,
    elapsedMs: 98,
    termination: "stable",
    timing,
    runtimeProof: rawSearch().runtimeProof as PureRuntimeProof,
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

function runtimeIdentity(selected: PrototypeManifest = manifest) {
  return parseRuntimeIdentity(
    {
      modelId: selected.runId,
      modelFormat: "OSAVAL03",
      leafSha256: selected.artifacts["leaf.osaval03"].sha256,
      controllerSha256: selected.artifacts["controller.json"]?.sha256 ?? null,
      jsSha256: selected.artifacts["engine.js"].sha256,
      wasmSha256: selected.artifacts["engine.wasm"].sha256,
      expectedHashVerified: true,
      buildClass: "pure-only",
      evaluationMode: "pure-value",
    },
    selected,
  );
}
function candidateManifest(
  selection: "candidate" | "defense" = "candidate",
): PrototypeManifest {
  const candidate = structuredClone(manifest);
  candidate.selection = selection;
  candidate.runId =
    selection === "defense" ? "defense-best-step1536" : "r3-best-step6144";
  candidate.artifacts["leaf.osaval03"].sha256 = (
    selection === "defense" ? "c" : "b"
  ).repeat(64);
  candidate.artifacts["controller.json"] = null;
  for (const [name, asset] of Object.entries(candidate.artifacts)) {
    if (asset)
      asset.url = `${ASSET_PREFIX}${selection}/${name}?sha256=${asset.sha256}`;
  }
  return parsePrototypeManifest(candidate);
}

class FakeEngine implements PrototypeEngineClient {
  position = position();
  result = deferred<PrototypeSearch>();
  initialize = vi.fn(
    async (
      selected: PrototypeManifest,
      _enabled: boolean,
      restored: PrototypeSnapshot | null,
    ) => {
      this.position = restored ?? {
        ...position(),
        leafSha256: selected.artifacts["leaf.osaval03"].sha256,
      };
      return {
        snapshot: this.position,
        preparation,
        identity: runtimeIdentity(selected),
      };
    },
  );
  configure = vi.fn(async (_enabled: boolean) => {});
  stopSearch = vi.fn();
  move = vi.fn(async (move: string) => {
    this.position = position([...this.position.moves, move]);
    return this.position;
  });
  search = vi.fn(() => this.result.promise);
  dispose = vi.fn();
}
async function harness() {
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
  await session.prepare("baseline");
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
  it("checks actual bytes once and retains the verified inference proof", async () => {
    const bytes = new TextEncoder().encode("abc").buffer;
    const artifact = {
      url: "/registered-artifact",
      size: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    };
    expect(await verifyArtifactBytes(bytes, artifact)).toBe(artifact.sha256);
    await expect(
      verifyArtifactBytes(new TextEncoder().encode("abd").buffer, artifact),
    ).rejects.toThrow("hash mismatch");
    await expect(
      verifyArtifactBytes(new ArrayBuffer(4), artifact),
    ).rejects.toThrow("size mismatch");
    const raw = rawSearch();
    expect(parsePureSearch(raw, controllerHash, true).runtimeProof).toEqual(
      raw.runtimeProof,
    );
    expect(() =>
      parseRuntimeIdentity(
        { ...runtimeIdentity(), jsSha256: "b".repeat(64) },
        manifest,
      ),
    ).toThrow("identity mismatch");
  });
  it("validates play deadlines and candidate-specific pure proof without reusing the old controller", () => {
    const raw = { ...rawSearch(), profile: "balanced" };
    expect(
      parsePlayProgress(
        {
          schema: "open_shogi_play_session/v1",
          done: false,
          result: raw,
          timing,
        },
        manifest,
        true,
        "balanced",
      ).result.depth,
    ).toBe(1);
    expect(() =>
      parsePlayProgress(
        {
          schema: "open_shogi_play_session/v1",
          done: false,
          result: raw,
          timing: { ...timing, targetMs: 700 },
        },
        manifest,
        true,
        "balanced",
      ),
    ).toThrow();
    const selected = structuredClone(manifest);
    selected.selection = "candidate";
    selected.runId = "new-run";
    for (const [name, artifact] of Object.entries(selected.artifacts))
      if (artifact)
        artifact.url = `${ASSET_PREFIX}candidate/${name}?sha256=${artifact.sha256}`;
    selected.artifacts["controller.json"] = null;
    const parsed = parsePrototypeManifest(selected);
    const off = { ...raw, computeControl: null };
    expect(
      parsePlayProgress(
        {
          schema: "open_shogi_play_session/v1",
          done: true,
          result: off,
          timing,
        },
        parsed,
        false,
        "balanced",
      ).result.computeControl.modelSha256,
    ).toBeNull();
    expect(() =>
      parsePlayProgress(
        {
          schema: "open_shogi_play_session/v1",
          done: true,
          result: raw,
          timing,
        },
        parsed,
        false,
        "balanced",
      ),
    ).toThrow();
  });

  it("keeps the route explicit and development-only", () => {
    expect(routeForHash("#/core-prototype")).toBe("workspace");
    expect(routeForHash("#/core-prototype", true)).toBe("core-prototype");
    expect(routeForHash("#/match", true)).toBe("match");
  });
  it("rejects foreign asset URLs, missing artifacts, and a different frozen leaf", () => {
    const foreign = structuredClone(manifest);
    foreign.artifacts["controller.json"]!.url = "https://example.com/model";
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
  it("does not start before verified preparation, while loading, or during a match", async () => {
    const pending = deferred<PrototypeManifest>();
    const factory = vi.fn(() => new FakeEngine());
    const session = new PrototypeMatchSession(
      vi.fn(),
      factory,
      () => pending.promise,
    );
    await session.start("black", false);
    expect(factory).not.toHaveBeenCalled();
    const preparing = session.prepare("baseline");
    await session.start("white", false);
    expect(factory).not.toHaveBeenCalled();
    pending.resolve(manifest);
    await preparing;
    await session.start("black", false);
    const playing = session.state;
    await session.start("white", true);
    await session.prepare("candidate");
    expect(session.state).toBe(playing);
    session.stop();
    const stopped = session.state;
    await session.prepare("candidate");
    expect(session.state).toBe(stopped);
    await session.configure();
    expect(session.state.phase).toBe("setup");
    expect(factory).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("disposes a superseded initializing Worker and ignores its late identity", async () => {
    const ready = deferred<Awaited<ReturnType<FakeEngine["initialize"]>>>();
    const oldClient = new FakeEngine();
    oldClient.initialize.mockReturnValueOnce(ready.promise);
    const currentClient = new FakeEngine();
    const factory = vi
      .fn()
      .mockReturnValueOnce(oldClient)
      .mockReturnValueOnce(currentClient);
    const loader = vi.fn(async (selection) =>
      selection === "candidate" ? candidateManifest() : manifest,
    );
    const session = new PrototypeMatchSession(vi.fn(), factory, loader);
    const old = session.prepare("baseline");
    await vi.waitFor(() => expect(oldClient.initialize).toHaveBeenCalledOnce());
    await session.prepare("candidate");
    expect(oldClient.dispose).toHaveBeenCalledOnce();
    expect(session.state.identity?.leafSha256).toBe("b".repeat(64));
    ready.resolve({
      snapshot: position(),
      preparation,
      identity: runtimeIdentity(),
    });
    await old;
    expect(session.state.selection).toBe("candidate");
    expect(session.state.identity?.leafSha256).toBe("b".repeat(64));
    session.dispose();
  });

  it("recreates one Worker for reload and baseline/r3/defense changes without retaining state", async () => {
    const clients: FakeEngine[] = [];
    const session = new PrototypeMatchSession(
      vi.fn(),
      () => {
        const client = new FakeEngine();
        clients.push(client);
        return client;
      },
      async (selection) =>
        selection === "candidate" || selection === "defense"
          ? candidateManifest(selection)
          : manifest,
    );
    for (const selection of [
      "baseline",
      "baseline",
      "candidate",
      "defense",
      "candidate",
      "baseline",
    ] as const) {
      await session.prepare(selection);
      const expected =
        selection === "baseline" ? manifest : candidateManifest(selection);
      expect(session.state.selection).toBe(selection);
      expect(session.state.identity?.modelId).toBe(expected.runId);
      expect(session.state.snapshot?.leafSha256).toBe(
        expected.artifacts["leaf.osaval03"].sha256,
      );
      expect(session.state.snapshot?.moves).toEqual([]);
      expect(session.state.diagnostics).toEqual([]);
    }
    expect(clients).toHaveLength(6);
    for (const client of clients.slice(0, -1))
      expect(client.dispose).toHaveBeenCalledOnce();
    expect(clients[5].dispose).not.toHaveBeenCalled();
    session.dispose();
  });

  it("keeps a failed selection explicit, requires retry and rejects mismatched loaded identity", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("registered model missing"))
      .mockResolvedValue(candidateManifest());
    const client = new FakeEngine();
    const factory = vi.fn(() => client);
    const session = new PrototypeMatchSession(vi.fn(), factory, loader);
    await session.prepare("candidate");
    expect(session.state).toMatchObject({
      phase: "error",
      selection: "candidate",
      manifest: null,
      identity: null,
      error: "registered model missing",
    });
    await session.start("black", false);
    expect(factory).not.toHaveBeenCalled();
    await session.prepare(session.state.selection);
    expect(session.state.phase).toBe("setup");
    expect(session.state.identity?.leafSha256).toBe("b".repeat(64));
    client.initialize.mockResolvedValueOnce({
      snapshot: position(),
      preparation,
      identity: runtimeIdentity(),
    });
    await session.prepare("candidate");
    expect(session.state.phase).toBe("error");
    expect(session.state.error).toContain("identity mismatch");
    session.dispose();
  });
  it.each(["blitz3", "rapid10"] as const)(
    "forwards %s clocks equally for both qualities and AI colors",
    async (preset) => {
      for (const profile of ["balanced", "quality"] as const) {
        for (const humanSide of ["black", "white"] as const) {
          const h = await harness();
          const total = preset === "blitz3" ? 180000 : 600000;
          let playing = h.session.start(humanSide, false, preset, profile);
          if (humanSide === "black") {
            await playing;
            h.at(10100);
            playing = h.session.move("7g7f");
          }
          await vi.waitFor(() =>
            expect(h.clients[0]?.search).toHaveBeenCalledOnce(),
          );
          expect(h.clients[0].search.mock.calls[0]).toEqual([
            {
              schema: "open_shogi_time_control/v1",
              blackTimeMs: total - (humanSide === "black" ? 10000 : 0),
              whiteTimeMs: total,
              byoyomiMs: 0,
              blackIncrementMs: 0,
              whiteIncrementMs: 0,
              safetyMarginMs: 50,
            },
            profile,
          ]);
          h.at(humanSide === "black" ? 11100 : 1100);
          h.clients[0].result.resolve({
            ...searchResult(humanSide === "black" ? "white" : "black"),
            computeControl: telemetry(false),
          });
          await playing;
          expect(h.session.state.telemetry).toMatchObject({
            profile,
            preset,
            elapsedMs: 1000,
            searchMs: 98,
          });
          expect(
            h.session.state.clock[
              humanSide === "black" ? "whiteTimeMs" : "blackTimeMs"
            ],
          ).toBe(total - 1000);
          h.session.dispose();
        }
      }
    },
  );
  it("prepares before play and charges human response-delivery time", async () => {
    const h = await harness();
    h.at(20100);
    expect(h.session.state.turnStartedAt).toBeNull();
    await h.session.start("black", false);
    expect(h.clients[0].initialize).toHaveBeenCalledOnce();
    const applied = deferred<PrototypeSnapshot>();
    h.clients[0].move.mockReturnValueOnce(applied.promise);
    h.at(21100);
    const play = h.session.move("7g7f");
    h.at(21600);
    applied.resolve(position(["7g7f"]));
    await vi.waitFor(() => expect(h.clients[0].search).toHaveBeenCalledOnce());
    expect(h.session.state.clock.blackTimeMs).toBe(178500);
    h.clients[0].result.resolve(searchResult());
    await play;
  });
  it("cooperatively stops with a verified candidate, preserving the committed board and charging cancellation latency", async () => {
    const h = await harness();
    const start = h.session.start("white", false);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    h.at(1100);
    h.session.stop();
    expect(h.clients[0].stopSearch).toHaveBeenCalledOnce();
    expect(h.clients[0].dispose).not.toHaveBeenCalled();
    expect(h.session.state.phase).toBe("stopping");
    h.at(1140);
    h.clients[0].result.resolve({
      ...searchResult("black"),
      termination: "cancelled",
    });
    await start;
    expect(h.session.state.phase).toBe("stopped");
    expect(h.session.state.snapshot?.moves).toEqual([]);
    expect(h.session.state.clock.blackTimeMs).toBe(178960);
    expect(h.session.state.telemetry?.movement).toBe("7g7f");
    expect(h.clients[0].move).not.toHaveBeenCalled();
  });
  it("rejects a human move whose Worker validation finishes at flag fall", async () => {
    const h = await harness();
    await h.session.start("black", false);
    const applied = deferred<PrototypeSnapshot>();
    h.clients[0].move.mockReturnValueOnce(applied.promise);
    h.at(180000);
    const play = h.session.move("7g7f");
    h.at(180100);
    applied.resolve(position(["7g7f"]));
    await play;
    expect(h.session.state.result?.reason).toBe("timeout");
    expect(h.session.state.snapshot?.moves).toEqual([]);
  });

  it("charges real elapsed milliseconds to each side and forwards the full remaining clock", async () => {
    const h = await harness();
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
      "balanced",
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
    expect(h.session.state.telemetry).toMatchObject({
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
    const h = await harness();
    const started = h.session.start("white", false);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    expect(h.clients[0].configure).toHaveBeenCalledWith(false);
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
    await h.session.configure();
    await h.session.start("black", true);
    expect(h.session.state.telemetry).toBeNull();
  });
  it("rejects a human move exactly at flag fall before changing the Worker", async () => {
    const h = await harness();
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
    const h = await harness();
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
    const h = await harness();
    const started = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    h.at(180100);
    h.clients[0].result.resolve(searchResult("black"));
    await started;
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.result?.reason).toBe("timeout");
  });
  it("does not commit an AI move whose application completes after flag fall", async () => {
    const h = await harness();
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
    const h = await harness();
    await h.session.start("black", true);
    h.at(2100);
    h.session.stop();
    expect(h.session.state.phase).toBe("stopped");
    expect(h.session.state.clock.blackTimeMs).toBe(178000);
    h.at(502100);
    await h.session.resume();
    expect(h.clients).toHaveLength(1);
    expect(h.clients[0].initialize).toHaveBeenCalledOnce();
    expect(h.session.state.clock.blackTimeMs).toBe(178000);
    expect(h.session.state.turnStartedAt).toBe(502100);
  });
  it("rejects stale search after a new match selects the other controller mode", async () => {
    const h = await harness();
    const old = h.session.start("white", true);
    await vi.waitFor(() => expect(h.clients[0]?.search).toHaveBeenCalledOnce());
    await h.session.configure();
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
    const old = session.prepare("candidate");
    const oldSignal = loader.mock.calls[0][1] as AbortSignal;
    await session.prepare("baseline");
    expect(oldSignal.aborted).toBe(true);
    stale.resolve(manifest);
    await old;
    expect(factory).toHaveBeenCalledOnce();
    expect(session.state.enabled).toBe(false);
    expect(session.state.snapshot?.moves).toEqual([]);
  });
  it("resignation and rule-terminal positions forbid later moves", async () => {
    const h = await harness();
    await h.session.start("black", true);
    h.session.resign();
    await h.session.move("7g7f");
    expect(h.clients[0].move).not.toHaveBeenCalled();
    expect(h.session.state.result?.reason).toBe("resignation");
    await h.session.configure();
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
    const h = await harness();
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
    await session.prepare("baseline");
    await session.start("black", true);
    expect(factory).not.toHaveBeenCalled();
    expect(session.state.phase).toBe("error");
  });
});

describe("prototype Worker transport", () => {
  it("shares a cancellation flag while synchronous Worker work is pending and physically bounds an unresponsive Worker", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("crossOriginIsolated", true);
    try {
      const listeners: Record<string, (event: { data?: unknown }) => void> = {};
      const worker = {
        addEventListener: vi.fn((name, listener) => {
          listeners[name] = listener;
        }),
        postMessage: vi.fn(),
        terminate: vi.fn(),
      };
      const client = new PrototypeWorkerClient(
        () => worker as unknown as Worker,
      );
      const pending = client.search(
        {
          schema: "open_shogi_time_control/v1",
          blackTimeMs: 180000,
          whiteTimeMs: 180000,
        },
        "quality",
      );
      const flag = new Int32Array(
        worker.postMessage.mock.calls[0][0].cancelBuffer,
      );
      listeners.message({
        data: {
          id: 1,
          kind: "progress",
          ok: true,
          data: { done: false, result: searchResult("black"), timing },
        },
      });
      expect(Atomics.load(flag, 0)).toBe(0);
      client.stopSearch();
      expect(Atomics.load(flag, 0)).toBe(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(await pending).toMatchObject({
        bestMove: "7g7f",
        termination: "host-cancelled",
        workerRestartRequired: true,
      });
      listeners.message({
        data: { id: 1, kind: "search", ok: true, data: searchResult("black") },
      });
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

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
  it.each(["candidate", "defense"] as const)(
    "requires an explicit %s descriptor and binds the actual leaf bytes without a controller fallback",
    async (selection) => {
      const root = await mkdtemp(join(tmpdir(), "osui-candidate-"));
      try {
        await mkdir(join(root, "local/core-prototype"), { recursive: true });
        const descriptor = {
          schema: "open_shogi_development_candidate/v1",
          runId: "test-run",
          leaf: { path: "local/model.osaval03", sha256: "a".repeat(64) },
          controller: null,
        };
        await writeFile(
          join(root, `local/core-prototype/${selection}.json`),
          JSON.stringify(descriptor),
        );
        expect(
          (await readCandidateDescriptor(root, selection)).controller,
        ).toBeNull();
        await writeFile(join(root, "local/model.osaval03"), "changed-model");
        await expect(
          readPrototypeArtifact(root, "leaf.osaval03", selection),
        ).rejects.toThrow("hash mismatch");
        await expect(
          readPrototypeArtifact(root, "controller.json", selection),
        ).rejects.toThrow("no matching controller");
        descriptor.leaf.path = "local/../outside";
        await writeFile(
          join(root, `local/core-prototype/${selection}.json`),
          JSON.stringify(descriptor),
        );
        await expect(readCandidateDescriptor(root, selection)).rejects.toThrow(
          "Invalid candidate artifact",
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

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
