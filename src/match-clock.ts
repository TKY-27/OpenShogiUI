import type { Side, TimeControl } from "./browser-engine";
import {
  consumeMatchClock,
  initialMatchClock,
  serializeTimeControl,
  type MatchClock,
  type TimeControlSettings,
} from "./play-settings";

/**
 * Match mode offers three presets. The two clocked presets are sudden death
 * (kire-make): no byoyomi, no increment, so running out of main time loses.
 *
 * The UI never allocates thinking time for a move. It forwards the remaining
 * clock in `open_shogi_time_control/v1` and the engine decides its own budget.
 */
export type MatchPreset = "blitz3" | "rapid10" | "unlimited";

export const MATCH_PRESETS: readonly MatchPreset[] = [
  "blitz3",
  "rapid10",
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

export function presetIsClocked(preset: MatchPreset): boolean {
  return preset !== "unlimited";
}

export function initialClockFor(preset: MatchPreset): MatchClock {
  return initialMatchClock(presetSettings(preset));
}

/**
 * Serializes the preset for the engine. For clocked presets this forwards each
 * side's remaining main time; the engine allocates the move budget itself. No
 * `movetimeMs` is emitted, because that would move the allocation decision
 * into the UI.
 */
export function matchTimeControl(
  preset: MatchPreset,
  remaining: MatchClock,
): TimeControl {
  return serializeTimeControl(presetSettings(preset), remaining);
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
  const spent = Math.max(0, nowMs - turnStartedAtMs);
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

export const CLOCK_URGENT_MS = 10_000;

export function clockIsUrgent(remainingMs: number): boolean {
  return remainingMs <= CLOCK_URGENT_MS;
}
