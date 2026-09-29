import type { Side, TimeControl } from "./browser-engine";
import {
  consumeMatchClock,
  elapsedTurnMs,
  initialMatchClock,
  serializeTimeControl,
  type MatchClock,
  type TimeControlSettings,
} from "./play-settings";

/**
 * Match mode offers four presets. The two sudden-death presets (kire-make)
 * have no byoyomi and no increment, so running out of main time loses.
 *
 * `fixed10` gives each side a fresh 10-second allowance for every move. The
 * allowance never carries between turns, so nothing accumulates and the UI
 * resets the countdown after each legal move. The wall-clock turn timeout is
 * adjudicated by the UI for both players — the engine still receives the
 * per-move request (zero base time plus a 10-second byoyomi period) through
 * `open_shogi_time_control/v1` and keeps control of its own search inside
 * that allowance.
 *
 * The UI never allocates thinking time for an adjudicated move. It forwards
 * the remaining clock in `open_shogi_time_control/v1` and the engine decides
 * its own budget.
 */
export type MatchPreset = "blitz3" | "rapid10" | "fixed10" | "unlimited";

export const MATCH_PRESETS: readonly MatchPreset[] = [
  "blitz3",
  "rapid10",
  "fixed10",
  "unlimited",
] as const;

/** Why a match ended. The protocol reports mate; the rest are UI decisions. */
export type MatchOutcome =
  | { kind: "checkmate"; winner: Side }
  | { kind: "timeout"; winner: Side; loser: Side }
  | { kind: "resignation"; winner: Side; loser: Side };

export function presetSettings(preset: MatchPreset): TimeControlSettings {
  switch (preset) {
    case "blitz3":
      return suddenDeath(3);
    case "rapid10":
      return suddenDeath(10);
    case "fixed10":
      return {
        mode: "clock",
        fixedSeconds: 10,
        mainMinutes: 0,
        byoyomiSeconds: 10,
        incrementSeconds: 0,
        nodes: 4_000,
      };
    case "unlimited":
      return {
        mode: "casual",
        fixedSeconds: 2,
        mainMinutes: 0,
        byoyomiSeconds: 0,
        incrementSeconds: 0,
        nodes: 4_000,
      };
  }
}

function suddenDeath(mainMinutes: number): TimeControlSettings {
  return {
    mode: "clock",
    fixedSeconds: 2,
    mainMinutes,
    byoyomiSeconds: 0,
    incrementSeconds: 0,
    nodes: 4_000,
  };
}

/** Sudden-death presets run one cumulative clock per side for the whole game. */
export function presetIsClocked(preset: MatchPreset): boolean {
  return preset === "blitz3" || preset === "rapid10";
}

/** Fixed per-move allowance in milliseconds, or null when not per-move. */
export function presetTurnAllowanceMs(preset: MatchPreset): number | null {
  return preset === "fixed10" ? 10_000 : null;
}

/**
 * Presets whose wall-clock turn timeout the UI adjudicates for both players.
 * Sudden death flags a side out of main time; `fixed10` flags a side that
 * exceeds its fresh per-move allowance. Unused time never carries for
 * `fixed10`, so its clock is a per-turn budget, not a cumulative one.
 */
export function presetIsAdjudicated(preset: MatchPreset): boolean {
  return presetIsClocked(preset) || presetTurnAllowanceMs(preset) !== null;
}

export function initialClockFor(preset: MatchPreset): MatchClock {
  const allowance = presetTurnAllowanceMs(preset);
  if (allowance !== null) {
    return { blackTimeMs: allowance, whiteTimeMs: allowance };
  }
  return initialMatchClock(presetSettings(preset));
}

/**
 * Serializes the preset for the engine. Clocked presets forward each side's
 * remaining main time; the engine allocates the move budget itself. `fixed10`
 * always forwards zero base time plus the 10-second byoyomi period regardless
 * of the UI's per-turn countdown, which the engine turns into a hard per-move
 * budget that never carries between moves. Callers must therefore omit the
 * remaining clock for `fixed10` (its UI clock is a display-only allowance,
 * never an engine handoff).
 */
export function matchTimeControl(
  preset: MatchPreset,
  remaining?: MatchClock,
): TimeControl {
  return serializeTimeControl(
    presetSettings(preset),
    remaining ?? initialMatchClock(presetSettings(preset)),
  );
}

function clockKey(side: Side): "blackTimeMs" | "whiteTimeMs" {
  return side === "black" ? "blackTimeMs" : "whiteTimeMs";
}

/**
 * Remaining milliseconds for the side to move, counting the time already spent
 * on the current turn.
 *
 * Derived from two wall-clock readings rather than an accumulated tick count.
 * Background tabs have their timers throttled, so an accumulating counter
 * would under-report elapsed time and a player could survive a flag fall by
 * switching tabs.
 */
export function remainingAt(
  clock: MatchClock,
  side: Side,
  turnStartedAtMs: number,
  nowMs: number,
): number {
  const budget = clock[clockKey(side)];
  if (!Number.isFinite(turnStartedAtMs) || !Number.isFinite(nowMs)) {
    return budget;
  }
  const spent = elapsedTurnMs(turnStartedAtMs, nowMs);
  return Math.max(0, budget - spent);
}

export function hasFlagFallen(
  clock: MatchClock,
  side: Side,
  turnStartedAtMs: number,
  nowMs: number,
): boolean {
  return remainingAt(clock, side, turnStartedAtMs, nowMs) <= 0;
}

/** Subtracts the observed time for a completed turn. Increment is always 0. */
export function chargeTurn(
  clock: MatchClock,
  side: Side,
  elapsedMs: number,
): MatchClock {
  return consumeMatchClock(clock, side, elapsedMs, 0);
}

export function opposing(side: Side): Side {
  return side === "black" ? "white" : "black";
}

/** mm:ss above a minute, and tenths inside the final ten seconds. */
export function formatMatchClock(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  if (total < 10_000) {
    return `${seconds}.${Math.floor((total % 1_000) / 100)}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Seconds.tenths readout for per-move allowances (10.0 → 0.0). A fixed
 * allowance spends its whole life under the mm:ss floor, so both the running
 * and the idle panel must use the same scale or the pair reads as two
 * different clocks.
 */
export function formatTurnClock(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds));
  const whole = Math.floor(total / 1_000);
  return `${whole}.${Math.floor((total % 1_000) / 100)}`;
}

export const CLOCK_URGENT_MS = 10_000;

export function clockIsUrgent(remainingMs: number): boolean {
  return remainingMs <= CLOCK_URGENT_MS;
}
