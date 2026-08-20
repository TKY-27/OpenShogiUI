/// <reference types="node" />

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ARENA_GAMES_PAGE_SIZE,
  formatImportStatus,
  gamePageIndexAfterAction,
  Games,
  ReportContent,
  ScrollTableRegion,
} from "./EvaluationLab";
import evaluationLabSource from "./EvaluationLab.tsx?raw";
import {
  ArenaReport,
  ArenaReportValidationError,
  ImportState,
} from "./arena-report";

const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("scrollable table region", () => {
  it("exposes an explicitly labelled keyboard focus boundary", () => {
    const markup = renderToStaticMarkup(
      <ScrollTableRegion labelledBy="metrics-title">
        <table>
          <tbody />
        </table>
      </ScrollTableRegion>,
    );

    expect(markup).toContain('class="table-scroll"');
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-labelledby="metrics-title"');
  });

  it("wraps both wide report tables in labelled focus regions", () => {
    const labels = Array.from(
      evaluationLabSource.matchAll(/<ScrollTableRegion labelledBy="([^"]+)">/g),
      ([, label]) => label,
    );

    expect(labels).toEqual([
      "metrics-title",
      "player-metrics-title",
      "games-title",
    ]);
    expect(styles).toMatch(
      /\.table-scroll:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\);[^}]*outline-offset:\s*2px;/s,
    );
  });
});

describe("report version presentation", () => {
  it("renders v1 without v2 identity-only sections", () => {
    const report: ArenaReport = {
      schema: "phase2_arena_report/v1",
      run: {
        seed: 1,
        gameLimit: 1,
        engine: "OpenShogiAI",
        gitCommit: null,
        startedAt: "2026-08-13T00:00:00Z",
        completedAt: null,
      },
      metrics: {
        games: 0,
        finishedGames: 0,
        searchWins: 0,
        draws: 0,
        nodesPerSecond: 0,
        averageDepth: 0,
        ttHitRate: 0,
        cutoffRate: 0,
        pruningRate: 0,
        millisecondsPerMove: 0.4,
        peakMemoryBytes: null,
        illegalMoves: 0,
      },
      games: [],
    };
    const markup = renderToStaticMarkup(
      <ReportContent locale="en" report={report} />,
    );

    expect(markup).toContain("Run summary");
    expect(markup).not.toContain("A/B player identities");
    expect(markup).not.toContain("A/B search and inference");
    expect(markup).toContain("400 μs");
  });

  it("renders v2 player identity, A/B metrics, and CSA evidence", () => {
    const hash = "a".repeat(64);
    const report: ArenaReport = {
      schema: "phase2_arena_report/v2",
      run: {
        seed: 1,
        gameLimit: 1,
        engine: "OpenShogiAI a=random b=random budget=Nodes(1)",
        gitCommit: null,
        startedAt: "2026-08-13T00:00:00Z",
        completedAt: null,
        initialSfen: "initial",
        maxPlies: 1,
        configSha256: hash,
        budget: { kind: "nodes", value: 1 },
        playerA: {
          label: "search:material:d1:h16:tt-on:book-off",
          evaluatorKind: "material",
          searchDepth: 1,
          hashMegabytes: 16,
          transposition: true,
          modelArtifactSha256: null,
          modelArtifactSize: null,
          modelPayloadSha256: null,
          architectureVersion: null,
          quantization: null,
          openingEnabled: false,
        },
        playerB: {
          label: "random",
          evaluatorKind: "random",
          searchDepth: null,
          hashMegabytes: null,
          transposition: null,
          modelArtifactSha256: null,
          modelArtifactSize: null,
          modelPayloadSha256: null,
          architectureVersion: null,
          quantization: null,
          openingEnabled: false,
        },
        opening: {
          enabled: false,
          artifactSha256: null,
          artifactSize: null,
          maxPlies: null,
        },
      },
      metrics: {
        games: 1,
        finishedGames: 0,
        playerAWins: 0,
        playerBWins: 0,
        searchWins: 0,
        draws: 0,
        nodesPerSecond: 0,
        averageDepth: 0,
        ttHitRate: 0,
        cutoffRate: 0,
        pruningRate: 0,
        millisecondsPerMove: 0,
        neuralInferenceCalls: 0,
        neuralInferenceTimeNs: 0,
        playerASearchNodes: 0,
        playerASearchElapsedMs: 0,
        playerADepthSum: 0,
        playerASearches: 0,
        playerANeuralInferenceCalls: 0,
        playerANeuralInferenceTimeNs: 0,
        playerBSearchNodes: 0,
        playerBSearchElapsedMs: 0,
        playerBDepthSum: 0,
        playerBSearches: 0,
        playerBNeuralInferenceCalls: 0,
        playerBNeuralInferenceTimeNs: 0,
        peakMemoryBytes: null,
        illegalMoves: 0,
      },
      games: [
        {
          id: 0,
          black: "search:material:d1:h16:tt-on:book-off",
          white: "random",
          result: "max_plies",
          moves: 1,
          csaPath: "games/game-000001.csa",
          csaSha256: hash,
          csaSize: 80,
          neuralInferenceCalls: 0,
          neuralInferenceTimeNs: 0,
          playerASearchNodes: 0,
          playerASearchElapsedMs: 0,
          playerADepthSum: 0,
          playerASearches: 0,
          playerANeuralInferenceCalls: 0,
          playerANeuralInferenceTimeNs: 0,
          playerBSearchNodes: 0,
          playerBSearchElapsedMs: 0,
          playerBDepthSum: 0,
          playerBSearches: 0,
          playerBNeuralInferenceCalls: 0,
          playerBNeuralInferenceTimeNs: 0,
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <ReportContent locale="en" report={report} />,
    );

    expect(markup).toContain("A/B player identities");
    expect(markup).toContain("A/B search and inference");
    expect(markup).toContain("CSA SHA-256");
    expect(markup).toContain("a".repeat(64));
    expect(markup).toContain("16 MiB");
    expect(markup).toContain(
      "TT hit, cutoff, and pruning rates are checked only for the 0–100% range.",
    );
  });
});

describe("game pagination", () => {
  const games = Array.from({ length: 10_000 }, (_, id) => ({
    id,
    black: "random",
    white: "random",
    result: "max_plies" as const,
    moves: 0,
    csaPath: null,
  }));
  const report: ArenaReport = {
    schema: "phase2_arena_report/v1",
    run: {
      seed: 1,
      gameLimit: games.length,
      engine: "OpenShogiAI",
      gitCommit: null,
      startedAt: "2026-08-13T00:00:00Z",
      completedAt: null,
    },
    metrics: {
      games: games.length,
      finishedGames: 0,
      searchWins: 0,
      draws: 0,
      nodesPerSecond: 0,
      averageDepth: 0,
      ttHitRate: 0,
      cutoffRate: 0,
      pruningRate: 0,
      millisecondsPerMove: 0,
      peakMemoryBytes: null,
      illegalMoves: 0,
    },
    games,
  };

  it("bounds page transitions at both ends", () => {
    expect(gamePageIndexAfterAction(0, "previous", 100)).toBe(0);
    expect(gamePageIndexAfterAction(0, "next", 100)).toBe(1);
    expect(gamePageIndexAfterAction(99, "next", 100)).toBe(99);
    expect(gamePageIndexAfterAction(120, "previous", 100)).toBe(98);
  });

  it("renders only one accessible page for a 10,000-game report", () => {
    const markup = renderToStaticMarkup(<Games locale="en" report={report} />);
    const renderedElementCount = markup.match(/<[a-z][^>]*>/g)?.length ?? 0;

    expect(ARENA_GAMES_PAGE_SIZE).toBe(100);
    expect(markup.match(/<tr>/g)).toHaveLength(ARENA_GAMES_PAGE_SIZE + 1);
    expect(renderedElementCount).toBeLessThanOrEqual(750);
    expect(markup).toContain("Showing games 1–100 of 10,000");
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Game list pagination"');
    expect(markup).toContain('aria-controls="games-table"');
    expect(markup).toContain('disabled="" type="button"');
    expect(markup).toContain("Page 1 of 100");
    expect(markup).not.toContain(">100</th>");
    expect(styles).toMatch(
      /button:focus-visible,[^{]*\{[^}]*outline:\s*3px solid var\(--focus\);[^}]*outline-offset:\s*2px;/s,
    );
  });

  it("localizes the visible range and pagination controls", () => {
    const markup = renderToStaticMarkup(<Games locale="ja" report={report} />);

    expect(markup).toContain("10,000局中1〜100局を表示");
    expect(markup).toContain("対局一覧のページ移動");
    expect(markup).toContain("100ページ中1ページ");
    expect(markup).toContain("前へ");
    expect(markup).toContain("次へ");
  });
});

describe("localized import states", () => {
  const states: Record<string, ImportState> = {
    idle: { status: "idle" },
    loading: {
      status: "loading",
      requestId: 1,
      fileName: "arena.json",
    },
    ready: {
      status: "ready",
      fileName: "arena.json",
      byteSize: 2048,
      loadedAt: "2026-07-29T00:00:00Z",
      report: {} as ArenaReport,
    },
    invalid: {
      status: "invalid",
      fileName: "arena.json",
      reason: {
        type: "invalid-report",
        error: new ArenaReportValidationError(
          "invalid-json",
          {},
          "The selected file is not valid JSON.",
        ),
      },
    },
  };

  it("formats key states in Japanese", () => {
    expect(formatImportStatus(states.idle, "ja")).toContain("選択してください");
    expect(formatImportStatus(states.loading, "ja")).toContain(
      "読み込んでいます",
    );
    expect(formatImportStatus(states.ready, "ja")).toContain("読み込みました");
    expect(formatImportStatus(states.ready, "ja")).toContain("2 KiB");
    expect(formatImportStatus(states.invalid, "ja")).toContain(
      "有効なJSONではありません",
    );
  });

  it("formats key states in English", () => {
    expect(formatImportStatus(states.idle, "en")).toContain("Select a local");
    expect(formatImportStatus(states.loading, "en")).toContain(
      "Reading arena.json",
    );
    expect(formatImportStatus(states.ready, "en")).toContain(
      "Loaded arena.json",
    );
    expect(formatImportStatus(states.ready, "en")).toContain("2 KiB");
    expect(formatImportStatus(states.invalid, "en")).toContain(
      "not valid JSON",
    );
  });
});
