import type { BrowserSnapshot } from "./browser-engine";
import type { MatchClock } from "./play-settings";

export interface GameTimelineEntry<TSource> {
  snapshot: BrowserSnapshot;
  source: TSource | null;
  clock: MatchClock;
  moveTimeMs: number;
}

export interface GameTimeline<TSource> {
  entries: GameTimelineEntry<TSource>[];
  displayedIndex: number;
  undone: GameTimelineEntry<TSource>[];
}

export function createGameTimeline<TSource>(
  snapshot: BrowserSnapshot,
  clock: MatchClock,
): GameTimeline<TSource> {
  return {
    entries: [{ snapshot, source: null, clock, moveTimeMs: 0 }],
    displayedIndex: 0,
    undone: [],
  };
}

export function appendGameTimeline<TSource>(
  timeline: GameTimeline<TSource>,
  entry: GameTimelineEntry<TSource>,
): GameTimeline<TSource> {
  const entries = [...timeline.entries, entry];
  return { entries, displayedIndex: entries.length - 1, undone: [] };
}

export function replaceLiveEntry<TSource>(
  timeline: GameTimeline<TSource>,
  snapshot: BrowserSnapshot,
): GameTimeline<TSource> {
  if (timeline.entries.length === 0) return timeline;
  const entries = timeline.entries.slice();
  const liveIndex = entries.length - 1;
  const live = entries[liveIndex];
  entries[liveIndex] = { ...live, snapshot };
  return { ...timeline, entries };
}

export function selectGameTimeline<TSource>(
  timeline: GameTimeline<TSource>,
  index: number,
): GameTimeline<TSource> {
  const maximum = Math.max(0, timeline.entries.length - 1);
  return {
    ...timeline,
    displayedIndex: Math.max(0, Math.min(Math.round(index), maximum)),
  };
}

export function mapTimelineClocks<TSource>(
  timeline: GameTimeline<TSource>,
  clock: MatchClock,
): GameTimeline<TSource> {
  return {
    ...timeline,
    entries: timeline.entries.map((entry) => ({ ...entry, clock })),
  };
}

export function rewindGameTimeline<TSource>(
  timeline: GameTimeline<TSource>,
  count: number,
  restoredSnapshot: BrowserSnapshot,
): GameTimeline<TSource> {
  const bounded = Math.max(
    0,
    Math.min(Math.round(count), timeline.entries.length - 1),
  );
  if (bounded === 0) return timeline;
  const split = timeline.entries.length - bounded;
  const removed = timeline.entries.slice(split);
  const entries = timeline.entries.slice(0, split);
  const liveIndex = entries.length - 1;
  entries[liveIndex] = { ...entries[liveIndex], snapshot: restoredSnapshot };
  return {
    entries,
    displayedIndex: liveIndex,
    undone: [...timeline.undone, ...removed],
  };
}

export function redoGameTimeline<TSource>(
  timeline: GameTimeline<TSource>,
  count: number,
  restoredSnapshot: BrowserSnapshot,
): GameTimeline<TSource> {
  const bounded = Math.max(
    0,
    Math.min(Math.round(count), timeline.undone.length),
  );
  if (bounded === 0) return timeline;
  const replay = timeline.undone.slice(-bounded);
  const entries = [...timeline.entries, ...replay];
  const liveIndex = entries.length - 1;
  entries[liveIndex] = { ...entries[liveIndex], snapshot: restoredSnapshot };
  return {
    entries,
    displayedIndex: liveIndex,
    undone: timeline.undone.slice(0, -bounded),
  };
}

export function timelineSnapshots<TSource>(
  timeline: GameTimeline<TSource>,
): BrowserSnapshot[] {
  return timeline.entries.map(({ snapshot }) => snapshot);
}
