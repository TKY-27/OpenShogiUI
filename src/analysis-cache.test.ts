import { describe, expect, it } from "vitest";

import type { AnalysisStart, AnalysisUpdate } from "./browser-engine";
import {
  AnalysisSummaryStore,
  analysisCacheIdentity,
  updateMatchesRequest,
} from "./analysis-cache";

function request(overrides: Partial<AnalysisStart> = {}): AnalysisStart {
  return {
    schema: "open_shogi_analysis/v1",
    positionSfen:
      "lnsgkgsnl/1r5b1/p1ppppppp/9/9/9/P1PPPPPPP/1B5R1/LNSGKGSNL b - 1",
    modelHash: "model-hash",
    evaluatorConfigHash: "evaluator-hash",
    featureSchemaHash: "feature-hash",
    evaluationSemanticsHash: "semantics-hash",
    searchOptionsHash: "search-hash",
    openingProfileHash: "opening-hash",
    multiPv: 3,
    ...overrides,
  };
}

function updateFor(
  start: AnalysisStart,
  overrides: Partial<AnalysisUpdate> = {},
): AnalysisUpdate {
  return {
    source: "search",
    canonicalPosition: start.positionSfen,
    positionHash: "0123456789abcdef",
    modelHash: start.modelHash,
    evaluatorConfigHash: start.evaluatorConfigHash,
    featureSchemaHash: start.featureSchemaHash,
    evaluationSemanticsHash: start.evaluationSemanticsHash,
    searchOptionsHash: start.searchOptionsHash,
    openingProfileHash: start.openingProfileHash,
    multiPv: start.multiPv,
    depth: 12,
    nodes: 10_000,
    nps: 100_000,
    score: 35,
    mateScore: null,
    lines: [
      {
        rank: 1,
        score: 35,
        mateScore: null,
        depth: 12,
        nodes: 10_000,
        pv: ["7g7f"],
      },
    ],
    rootMoveStatistics: [],
    timestampMs: 123,
    engineVersion: "test",
    ...overrides,
  };
}

describe("analysis cache identity", () => {
  it("includes every analysis input, including MultiPV", () => {
    const original = request();
    const variants: AnalysisStart[] = [
      request({ positionSfen: `${original.positionSfen} ` }),
      request({ modelHash: "different-model" }),
      request({ evaluatorConfigHash: "different-evaluator" }),
      request({ featureSchemaHash: "different-features" }),
      request({ evaluationSemanticsHash: "different-semantics" }),
      request({ searchOptionsHash: "different-search" }),
      request({ openingProfileHash: "different-opening" }),
      request({ multiPv: 2 }),
    ];

    expect(new Set(variants.map(analysisCacheIdentity)).size).toBe(
      variants.length,
    );
    expect(analysisCacheIdentity(original)).toBe(
      analysisCacheIdentity(request()),
    );
    expect(analysisCacheIdentity(original)).not.toBe(
      analysisCacheIdentity(request({ multiPv: 2 })),
    );
    expect(analysisCacheIdentity(original)).toContain(
      "ac6e26e539a7792cc9d53d3bbbd99e3113d97a65ea76d433c9f8daa6280d131d",
    );
  });
});

describe("analysis summary store", () => {
  it("retrieves a matching completed summary from memory", async () => {
    const start = request();
    const update = updateFor(start);
    const store = new AnalysisSummaryStore();

    await store.put(start, update);

    await expect(store.get(start)).resolves.toMatchObject({
      key: analysisCacheIdentity(start),
      update,
    });
  });

  it("rejects stale updates and incomplete depth-zero summaries", async () => {
    const start = request();
    const stale = updateFor(start, { searchOptionsHash: "stale-search" });
    const incomplete = updateFor(start, { depth: 0 });
    const store = new AnalysisSummaryStore();

    expect(updateMatchesRequest(stale, start)).toBe(false);
    await store.put(start, stale);
    await store.put(start, incomplete);
    await expect(store.get(start)).resolves.toBeNull();
  });

  it("invalidates a cached MultiPV result when the requested line count changes", async () => {
    const oneLine = request({ multiPv: 1 });
    const threeLines = request({ multiPv: 3 });
    const store = new AnalysisSummaryStore();

    await store.put(oneLine, updateFor(oneLine));

    await expect(store.get(oneLine)).resolves.not.toBeNull();
    await expect(store.get(threeLines)).resolves.toBeNull();
    expect(analysisCacheIdentity(oneLine)).not.toBe(
      analysisCacheIdentity(threeLines),
    );
    expect(updateMatchesRequest(updateFor(oneLine), threeLines)).toBe(false);
  });
});
