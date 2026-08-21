/**
 * Session-cumulative analysis counters.
 *
 * The engine restarts iterative deepening on every slice, reusing the
 * transposition table. Each `AnalysisUpdate` therefore carries the node count
 * and rate of *that slice only*, both of which reset roughly every 200ms. A
 * running session total has to be kept here, or the header ends up quoting a
 * per-slice node count beside a cumulative elapsed time and an instantaneous
 * rate — three numbers from three different clocks.
 */

/**
 * Depth requested per slice: the protocol maximum.
 *
 * This does not raise the depth actually reached today. `analysis_step_json`
 * builds its plan with `profile.max_depth()` as the ceiling, so the pinned Wasm
 * clamps analysis to the play profile's depth (5 eco / 7 balanced / 9 quality)
 * whatever the host asks for. Asking for the protocol maximum simply stops the
 * UI imposing a second, redundant cap of its own, and means the UI needs no
 * change if that engine ceiling is ever lifted.
 */
export const ANALYSIS_MAX_DEPTH = 64;

/**
 * Nodes per slice.
 *
 * Must not exceed `profile.max_nodes()` in the pinned Wasm, which rejects a
 * larger request outright, so this is derived from the profile rather than
 * chosen freely. Measured at roughly 170-210ms of engine time per slice at the
 * quality budget; the worker is single-threaded, so slice length is also the
 * upper bound on how long a stop, a position change, or a play-turn pause takes
 * to take effect.
 */
export function analysisSliceNodes(
  profile: "eco" | "balanced" | "quality",
): number {
  return profile === "eco" ? 1_500 : profile === "balanced" ? 4_000 : 12_000;
}

export interface AnalysisProgress {
  /** Completed depth reached by the most recent slice. */
  depth: number;
  /** Nodes searched since this analysis session started. */
  nodes: number;
  /** Engine search time since this session started. Excludes host idle time. */
  elapsedNs: number;
  slices: number;
}

export interface SliceSummary {
  depth: number;
  nodes: number;
  elapsedNs: number;
}

export function emptyProgress(): AnalysisProgress {
  return { depth: 0, nodes: 0, elapsedNs: 0, slices: 0 };
}

function safeCounter(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Folds one completed slice into the session totals.
 *
 * `depth` is the latest slice's completed depth rather than a running maximum:
 * a genuinely shallower slice is information, not noise to be hidden.
 */
export function accumulateSlice(
  progress: AnalysisProgress,
  slice: SliceSummary | undefined,
): AnalysisProgress {
  if (slice === undefined) return progress;
  const nodes = safeCounter(slice.nodes);
  const elapsedNs = safeCounter(slice.elapsedNs);
  const depth = safeCounter(slice.depth);
  return {
    depth: depth === 0 ? progress.depth : depth,
    nodes: progress.nodes + nodes,
    elapsedNs: progress.elapsedNs + elapsedNs,
    slices: progress.slices + 1,
  };
}

/** Nodes per second derived from the same totals the header displays. */
export function progressNps(progress: AnalysisProgress): number {
  if (progress.elapsedNs <= 0) return 0;
  return Math.round(progress.nodes / (progress.elapsedNs / 1_000_000_000));
}

export function progressElapsedSeconds(progress: AnalysisProgress): number {
  return progress.elapsedNs / 1_000_000_000;
}

/**
 * The snapshot a completed slice contributes to the display.
 *
 * A slice emits every completed depth it reached, so the batch is 1..N of the
 * same ~200ms of work rather than N distinct snapshots. Feeding each one to a
 * 1Hz sampler meant the sample landed on whichever arrived first after the
 * boundary, which was depth 1 nearly every time.
 */
export function displayUpdate<T>(updates: readonly T[]): T | null {
  return updates.at(-1) ?? null;
}
