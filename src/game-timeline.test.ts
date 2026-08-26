import { describe, expect, it } from "vitest";

import type { BrowserSnapshot } from "./browser-engine";
import {
  appendGameTimeline,
  createGameTimeline,
  redoGameTimeline,
  replaceLiveEntry,
  rewindGameTimeline,
  selectGameTimeline,
  timelineSnapshots,
} from "./game-timeline";

function snapshot(...moves: string[]): BrowserSnapshot {
  return { moves } as BrowserSnapshot;
}

const clock = { blackTimeMs: 1_000, whiteTimeMs: 1_000 };

describe("game timeline", () => {
  it("keeps snapshot metadata in one aligned record", () => {
    let timeline = createGameTimeline<string>(snapshot(), clock);
    timeline = appendGameTimeline(timeline, {
      snapshot: snapshot("7g7f"),
      source: "human",
      clock: { blackTimeMs: 900, whiteTimeMs: 1_000 },
      moveTimeMs: 100,
    });

    expect(timeline.entries[1]).toMatchObject({
      source: "human",
      clock: { blackTimeMs: 900, whiteTimeMs: 1_000 },
      moveTimeMs: 100,
    });
    expect(timeline.displayedIndex).toBe(1);
    expect(timeline.undone).toEqual([]);
  });

  it("separates history browsing from the live position", () => {
    let timeline = createGameTimeline<never>(snapshot(), clock);
    timeline = appendGameTimeline(timeline, {
      snapshot: snapshot("7g7f"),
      source: null,
      clock,
      moveTimeMs: 0,
    });

    expect(selectGameTimeline(timeline, 0).displayedIndex).toBe(0);
    expect(selectGameTimeline(timeline, 99).displayedIndex).toBe(1);
    expect(timeline.entries.at(-1)?.snapshot.moves).toEqual(["7g7f"]);
  });

  it("rewinds and redoes complete entries without desynchronizing metadata", () => {
    let timeline = createGameTimeline<string>(snapshot(), clock);
    for (const [movement, source] of [
      ["7g7f", "human"],
      ["3c3d", "engine"],
    ] as const) {
      timeline = appendGameTimeline(timeline, {
        snapshot: snapshot(
          ...timeline.entries.at(-1)!.snapshot.moves,
          movement,
        ),
        source,
        clock,
        moveTimeMs: source === "human" ? 100 : 200,
      });
    }

    timeline = rewindGameTimeline(timeline, 2, snapshot());
    expect(timelineSnapshots(timeline).at(-1)?.moves).toEqual([]);
    expect(timeline.undone.map(({ source }) => source)).toEqual([
      "human",
      "engine",
    ]);

    timeline = redoGameTimeline(timeline, 2, snapshot("7g7f", "3c3d"));
    expect(timeline.entries.map(({ moveTimeMs }) => moveTimeMs)).toEqual([
      0, 100, 200,
    ]);
    expect(timeline.undone).toEqual([]);
  });

  it("replaces only the canonical live snapshot after Worker restoration", () => {
    let timeline = createGameTimeline<never>(snapshot(), clock);
    timeline = appendGameTimeline(timeline, {
      snapshot: snapshot("7g7f"),
      source: null,
      clock,
      moveTimeMs: 0,
    });
    timeline = selectGameTimeline(timeline, 0);

    const replaced = replaceLiveEntry(timeline, snapshot("canonical"));
    expect(replaced.displayedIndex).toBe(0);
    expect(replaced.entries[0].snapshot.moves).toEqual([]);
    expect(replaced.entries[1].snapshot.moves).toEqual(["canonical"]);
  });
});
