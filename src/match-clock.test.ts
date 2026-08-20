import { describe, expect, it } from "vitest";

import {
  chargeTurn,
  clockIsUrgent,
  formatMatchClock,
  hasFlagFallen,
  initialClockFor,
  matchTimeControl,
  opposing,
  presetIsClocked,
  presetSettings,
  remainingAt,
} from "./match-clock";

describe("match presets", () => {
  it("makes both clocked presets sudden death", () => {
    for (const [preset, minutes] of [
      ["blitz3", 3],
      ["rapid10", 10],
    ] as const) {
      const settings = presetSettings(preset);
      expect(settings.mode).toBe("clock");
      expect(settings.mainMinutes).toBe(minutes);
      // Sudden death: no byoyomi and no increment, so main time running out
      // is the loss condition.
      expect(settings.byoyomiSeconds).toBe(0);
      expect(settings.incrementSeconds).toBe(0);
    }
  });

  it("gives the unlimited preset no clock at all", () => {
    expect(presetSettings("unlimited").mode).toBe("casual");
    expect(presetIsClocked("unlimited")).toBe(false);
    expect(presetIsClocked("blitz3")).toBe(true);
    expect(presetIsClocked("rapid10")).toBe(true);
  });

  it("starts both sides on the same budget", () => {
    expect(initialClockFor("blitz3")).toEqual({
      blackTimeMs: 180_000,
      whiteTimeMs: 180_000,
    });
    expect(initialClockFor("rapid10")).toEqual({
      blackTimeMs: 600_000,
      whiteTimeMs: 600_000,
    });
    expect(initialClockFor("unlimited")).toEqual({
      blackTimeMs: 0,
      whiteTimeMs: 0,
    });
  });
});

describe("engine time control handoff", () => {
  it("forwards remaining clock and leaves allocation to the engine", () => {
    const control = matchTimeControl("blitz3", {
      blackTimeMs: 91_000,
      whiteTimeMs: 42_500,
    });

    expect(control.schema).toBe("open_shogi_time_control/v1");
    expect(control.blackTimeMs).toBe(91_000);
    expect(control.whiteTimeMs).toBe(42_500);
    expect(control.byoyomiMs).toBe(0);
    expect(control.blackIncrementMs).toBe(0);
    expect(control.whiteIncrementMs).toBe(0);
    // The decisive assertion: the UI must not pick a per-move budget. Emitting
    // movetimeMs (or nodes, or depth) would move that decision out of the
    // engine and break "the AI manages its own time".
    expect(control.movetimeMs).toBeUndefined();
    expect(control.nodes).toBeUndefined();
    expect(control.depth).toBeUndefined();
  });

  it("hands the unlimited preset to the engine as casual", () => {
    const control = matchTimeControl("unlimited", {
      blackTimeMs: 0,
      whiteTimeMs: 0,
    });

    expect(control.casual).toBe(true);
    expect(control.blackTimeMs).toBeUndefined();
    expect(control.whiteTimeMs).toBeUndefined();
    expect(control.movetimeMs).toBeUndefined();
  });
});

describe("wall-clock remaining time", () => {
  const clock = { blackTimeMs: 30_000, whiteTimeMs: 30_000 };

  it("subtracts elapsed wall-clock time from the side to move", () => {
    expect(remainingAt(clock, "black", 1_000, 6_000)).toBe(25_000);
    expect(remainingAt(clock, "white", 1_000, 6_000)).toBe(25_000);
    // The side not to move is unaffected by the same reading.
    expect(remainingAt(clock, "white", 1_000, 1_000)).toBe(30_000);
  });

  it("never reports negative time and never runs backwards", () => {
    expect(remainingAt(clock, "black", 0, 45_000)).toBe(0);
    // A clock that jumps backwards must not refund time.
    expect(remainingAt(clock, "black", 10_000, 5_000)).toBe(30_000);
  });

  it("falls back to the stored budget for non-finite readings", () => {
    expect(remainingAt(clock, "black", Number.NaN, 5_000)).toBe(30_000);
    expect(remainingAt(clock, "black", 0, Number.POSITIVE_INFINITY)).toBe(
      30_000,
    );
  });

  it("treats exactly zero remaining as a flag fall", () => {
    expect(hasFlagFallen(clock, "black", 0, 29_999)).toBe(false);
    expect(hasFlagFallen(clock, "black", 0, 30_000)).toBe(true);
    expect(hasFlagFallen(clock, "black", 0, 30_001)).toBe(true);
  });

  it("flags a side that already has no budget left", () => {
    const empty = { blackTimeMs: 0, whiteTimeMs: 5_000 };
    expect(hasFlagFallen(empty, "black", 1_000, 1_000)).toBe(true);
    expect(hasFlagFallen(empty, "white", 1_000, 1_000)).toBe(false);
  });
});

describe("charging a completed turn", () => {
  it("subtracts observed time without adding increment", () => {
    const next = chargeTurn(
      { blackTimeMs: 30_000, whiteTimeMs: 30_000 },
      "black",
      4_200,
    );
    expect(next).toEqual({ blackTimeMs: 25_800, whiteTimeMs: 30_000 });
  });

  it("floors an overrun at zero rather than going negative", () => {
    const next = chargeTurn(
      { blackTimeMs: 1_000, whiteTimeMs: 30_000 },
      "black",
      9_000,
    );
    expect(next.blackTimeMs).toBe(0);
  });
});

describe("presentation helpers", () => {
  it("shows tenths only inside the final ten seconds", () => {
    expect(formatMatchClock(180_000)).toBe("3:00");
    expect(formatMatchClock(65_400)).toBe("1:05");
    expect(formatMatchClock(10_000)).toBe("0:10");
    expect(formatMatchClock(9_900)).toBe("9.9");
    expect(formatMatchClock(0)).toBe("0.0");
    expect(formatMatchClock(-500)).toBe("0.0");
  });

  it("marks the final ten seconds as urgent", () => {
    expect(clockIsUrgent(10_001)).toBe(false);
    expect(clockIsUrgent(10_000)).toBe(true);
    expect(clockIsUrgent(0)).toBe(true);
  });

  it("swaps sides", () => {
    expect(opposing("black")).toBe("white");
    expect(opposing("white")).toBe("black");
  });
});
