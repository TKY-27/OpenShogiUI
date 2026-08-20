/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getMessages } from "./localization";
import { routeForHash } from "./project";

const source = readFileSync(
  new URL("./MatchPlay.tsx", import.meta.url),
  "utf8",
);

describe("match route", () => {
  it("resolves its own hash and leaves unknown hashes on workspace", () => {
    expect(routeForHash("#/match")).toBe("match");
    expect(routeForHash("#/matchmaking")).toBe("workspace");
  });

  it("offers exactly the three advertised time controls", () => {
    for (const locale of ["ja", "en"] as const) {
      const { preset } = getMessages(locale).match;
      expect(Object.keys(preset).sort()).toEqual([
        "blitz3",
        "rapid10",
        "unlimited",
      ]);
      for (const label of Object.values(preset)) {
        expect(label.length).toBeGreaterThan(0);
      }
    }
    expect(getMessages("ja").match.preset.blitz3).toContain("切れ負け");
    expect(getMessages("ja").match.preset.rapid10).toContain("切れ負け");
  });
});

/**
 * The product requirement for this route is that it shows the board and
 * nothing else. These assertions read the component source rather than a
 * render because the analysis widgets are what must be absent, and absence is
 * only meaningful if the component cannot produce them at all.
 */
describe("match mode shows the board only", () => {
  it("renders no analysis surface", () => {
    for (const forbidden of [
      "analysis-panel",
      "analysis-lines",
      "analysis-results",
      "analysis-metrics",
      "analysis-line__score",
      "analysis-line__pv",
      "last-search-source",
      "highlight-legend",
      "move-list",
      "history-rail",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never reads an evaluation, principal variation, depth, or node count", () => {
    for (const field of [
      "scoreCp",
      "response.pv",
      "response.depth",
      "response.nodes",
      "response.seldepth",
      "response.nps",
      "multiPv",
      ".lines",
    ]) {
      expect(source).not.toContain(field);
    }
    // bestMove is the only part of the search response the route consumes.
    expect(source).toContain("response.bestMove");
  });

  it("does not start continuous analysis", () => {
    for (const call of [
      "analysisStart",
      "analysisStep",
      "analysisStop",
      "analysisRestart",
    ]) {
      expect(source).not.toContain(call);
    }
  });
});

describe("match mode clock and dialog contracts", () => {
  it("drives every clock decision from wall-clock readings", () => {
    // A tick counter would under-report elapsed time in a throttled background
    // tab and let a player survive a flag fall by switching away.
    expect(source).toContain("Date.now()");
    expect(source).toContain("hasFlagFallen");
    expect(source).toContain("const spent = clocked ? Date.now() - startedAt");
  });

  it("forwards the preset to the engine without choosing a move budget", () => {
    expect(source).toContain("matchTimeControl(preset, clockAtTurn)");
    expect(source).not.toContain("movetimeMs");
  });

  it("uses modal dialogs for promotion and for the result", () => {
    // Promotion, resignation confirmation, and the result are all modal.
    expect(source.match(/aria-modal="true"/g)).toHaveLength(3);
    expect(source.match(/showModal\(\)/g)).toHaveLength(3);
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("guards resignation behind a confirmation", () => {
    // Resigning ends the game irreversibly, so a stray click must not do it.
    expect(source).toContain("onClick={() => setConfirmingResign(true)}");
    expect(source).toContain("message={match.resignConfirm}");
  });

  it("confirms resignation copy exists in both locales", () => {
    for (const locale of ["ja", "en"] as const) {
      const { match } = getMessages(locale);
      expect(match.resignConfirm.length).toBeGreaterThan(0);
      expect(Object.keys(match.reason).sort()).toEqual([
        "checkmate",
        "resignation",
        "timeout",
      ]);
    }
  });
});
