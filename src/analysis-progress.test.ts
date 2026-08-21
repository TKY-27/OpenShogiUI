import { describe, expect, it } from "vitest";

import {
  accumulateSlice,
  analysisSliceNodes,
  displayUpdate,
  ANALYSIS_MAX_DEPTH,
  emptyProgress,
  type AnalysisProgress,
} from "./analysis-progress";
import { PublishGate } from "./publish-throttle";

/**
 * Measured on the pre-fix tree, 20.3s of live analysis at 1440x900:
 *
 *   22 slices, every one terminating at node-limit with nodes: 12000
 *   118 updates produced, 18 reached the screen
 *   depths shown: 7,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,2,2
 *   header read: depth 1, nodes 32, NPS 80,000, elapsed 8.59s
 *
 * The engine was correct at every point: each slice emitted completed depths
 * 1..N with per-slice nodes rising monotonically. Everything below pins the
 * parts that were not.
 */

describe("analysis slice bounds", () => {
  it("asks for the protocol depth rather than imposing a second cap", () => {
    // The pinned Wasm clamps analysis to the play profile's depth ceiling
    // regardless, so this does not deepen anything today. It keeps the UI from
    // adding a cap of its own on top of the engine's.
    expect(ANALYSIS_MAX_DEPTH).toBe(64);
  });

  it("never requests more nodes than the engine profile accepts", () => {
    // analysis_step_json rejects nodes above profile.max_nodes() outright, so
    // a fixed budget would break analysis on eco and balanced.
    expect(analysisSliceNodes("eco")).toBe(1_500);
    expect(analysisSliceNodes("balanced")).toBe(4_000);
    expect(analysisSliceNodes("quality")).toBe(12_000);
    for (const profile of ["eco", "balanced", "quality"] as const) {
      expect(analysisSliceNodes(profile)).toBeGreaterThanOrEqual(1);
      expect(analysisSliceNodes(profile)).toBeLessThanOrEqual(10_000_000);
    }
  });
});

describe("session progress accumulation", () => {
  it("starts empty", () => {
    expect(emptyProgress()).toEqual({
      depth: 0,
      nodes: 0,
      elapsedNs: 0,
      slices: 0,
    });
  });

  it("accumulates nodes across slices instead of showing one slice", () => {
    // The engine restarts iterative deepening every slice, so update.nodes is
    // a per-slice figure. Displaying it as a total read 32 nodes after 8.59s.
    let progress = emptyProgress();
    for (const slice of [
      { depth: 4, nodes: 12_000, elapsedNs: 211_700_000 },
      { depth: 5, nodes: 12_000, elapsedNs: 201_600_000 },
      { depth: 6, nodes: 12_000, elapsedNs: 169_000_000 },
    ]) {
      progress = accumulateSlice(progress, slice);
    }
    expect(progress.nodes).toBe(36_000);
    expect(progress.slices).toBe(3);
    expect(progress.depth).toBe(6);
    expect(progress.elapsedNs).toBe(582_300_000);
  });

  it("keeps nodes monotonically increasing", () => {
    let progress = emptyProgress();
    const seen: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      progress = accumulateSlice(progress, {
        depth: 3 + (i % 4),
        nodes: 12_000,
        elapsedNs: 200_000_000,
      });
      seen.push(progress.nodes);
    }
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
  });

  it("reports the depth of the most recent completed slice", () => {
    let progress = emptyProgress();
    progress = accumulateSlice(progress, {
      depth: 9,
      nodes: 100,
      elapsedNs: 1,
    });
    progress = accumulateSlice(progress, {
      depth: 4,
      nodes: 100,
      elapsedNs: 1,
    });
    // Not a running maximum: a genuine shallower slice must be visible.
    expect(progress.depth).toBe(4);
  });

  it("tolerates a missing slice summary", () => {
    const progress = accumulateSlice(emptyProgress(), undefined);
    expect(progress).toEqual(emptyProgress());
  });

  it("ignores a slice that reports negative or non-finite counters", () => {
    const progress = accumulateSlice(emptyProgress(), {
      depth: -1,
      nodes: Number.NaN,
      elapsedNs: -5,
    });
    expect(progress.nodes).toBe(0);
    expect(progress.elapsedNs).toBe(0);
    expect(progress.depth).toBe(0);
  });
});

describe("metric consistency", () => {
  const nps = (p: AnalysisProgress) =>
    p.elapsedNs === 0 ? 0 : Math.round(p.nodes / (p.elapsedNs / 1_000_000_000));

  it("derives NPS from the same totals it displays", () => {
    // The header showed 32 nodes, 80,000 NPS and 8.59s together: three numbers
    // from three different clocks.
    const progress = accumulateSlice(emptyProgress(), {
      depth: 6,
      nodes: 12_000,
      elapsedNs: 200_000_000,
    });
    expect(nps(progress)).toBe(60_000);
    expect(progress.nodes / (progress.elapsedNs / 1e9)).toBeCloseTo(60_000, 5);
  });

  it("does not divide by zero before the first slice", () => {
    expect(nps(emptyProgress())).toBe(0);
  });
});

describe("display throttle keeps the newest snapshot", () => {
  it("publishes the newest value at the interval, not the first one", () => {
    /*
     * The reason depth froze at 1. Each slice restarts iterative deepening, so
     * the first update after a boundary is almost always depth 1; the deeper
     * updates were buffered and only surfaced by flush() at stop.
     */
    const gate = new PublishGate<number>();
    expect(gate.offer(1, 0)).toBe(1);
    expect(gate.offer(2, 100)).toBeNull();
    expect(gate.offer(3, 200)).toBeNull();
    expect(gate.offer(4, 300)).toBeNull();
    // One second later the newest value must win, not the next arrival.
    expect(gate.offer(9, 1_000)).toBe(9);
  });

  it("never republishes a value already shown", () => {
    const gate = new PublishGate<number>();
    expect(gate.offer(1, 0)).toBe(1);
    expect(gate.flush(10)).toBeNull();
  });

  it("surfaces the final value when the source stops", () => {
    const gate = new PublishGate<number>();
    gate.offer(1, 0);
    gate.offer(5, 300);
    gate.offer(7, 600);
    expect(gate.flush(600)).toBe(7);
  });

  it("samples the deepest update of a burst, not the first arrival", () => {
    /*
     * Replays the measured pattern: each slice emits completed depths 1..6
     * inside ~200ms, then a ~30ms gap, forever. Sampling "the next arrival
     * after the boundary" lands on depth 1 almost every time, which is exactly
     * the 7,1,1,2,1,1,2,1,1,... that reached the screen.
     *
     * Offering one snapshot per slice - the deepest completed depth - is what
     * makes a 1Hz sample meaningful.
     */
    const gate = new PublishGate<number>();
    const shown: number[] = [];
    let now = 0;
    for (let slice = 0; slice < 40; slice += 1) {
      const reached = 4 + Math.floor(slice / 8);
      now += 200 + 30;
      const due = gate.offer(reached, now);
      if (due !== null) shown.push(due);
    }
    expect(shown.length).toBeGreaterThanOrEqual(8);
    expect(shown.filter((depth) => depth <= 1)).toHaveLength(0);
    expect(shown.at(-1)).toBeGreaterThan(shown[0]);
  });

  it("cannot suppress progress indefinitely", () => {
    // Simulate 30 seconds of bursts and assert the screen keeps advancing.
    const gate = new PublishGate<number>();
    const shown: number[] = [];
    let depth = 0;
    for (let ms = 0; ms <= 30_000; ms += 50) {
      depth += 1;
      const due = gate.offer(depth, ms);
      if (due !== null) shown.push(due);
    }
    expect(shown.length).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < shown.length; i += 1) {
      expect(shown[i]).toBeGreaterThan(shown[i - 1]);
    }
    // And the last thing shown is close to the newest value produced.
    expect(shown.at(-1)).toBeGreaterThan(depth - 25);
  });
});

describe("what the loop feeds the display", () => {
  it("offers one snapshot per slice, the deepest completed depth", () => {
    // Intermediate depths inside a single ~200ms slice are not distinct
    // snapshots; the last update of the batch is the slice result.
    const batch = [
      { depth: 1, nodes: 33 },
      { depth: 2, nodes: 95 },
      { depth: 3, nodes: 126 },
      { depth: 6, nodes: 219 },
    ];
    expect(displayUpdate(batch)).toEqual({ depth: 6, nodes: 219 });
    expect(displayUpdate([])).toBeNull();
  });
});
