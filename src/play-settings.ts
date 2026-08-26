import {
  RESOURCE_BUDGET_SCHEMA,
  TIME_CONTROL_SCHEMA,
  type BrowserSnapshot,
  type ResourceBudget,
  type SearchProfile,
  type Side,
  type SquareSummary,
  type TimeControl,
} from "./browser-engine";

export type HumanRole = "sente" | "gote" | "ai-vs-ai" | "analysis-only";
export type BoardOrientation = "sente-bottom" | "gote-bottom";
export type TimeControlMode = "casual" | "fixed" | "clock" | "nodes";

export interface TimeControlSettings {
  mode: TimeControlMode;
  fixedSeconds: 0.5 | 1 | 2 | 5 | 10 | 20;
  mainMinutes: number;
  byoyomiSeconds: number;
  incrementSeconds: number;
  nodes: number;
}

export interface MatchClock {
  blackTimeMs: number;
  whiteTimeMs: number;
}

export const DEFAULT_TIME_CONTROL: TimeControlSettings = {
  mode: "casual",
  fixedSeconds: 2,
  mainMinutes: 10,
  byoyomiSeconds: 30,
  incrementSeconds: 0,
  nodes: 4_000,
};

export function humanControlsSide(role: HumanRole, side: Side): boolean {
  return (
    (role === "sente" && side === "black") ||
    (role === "gote" && side === "white")
  );
}

export function takeOverSide(side: Side): HumanRole {
  return side === "black" ? "sente" : "gote";
}

export function flippedOrientation(
  orientation: BoardOrientation,
): BoardOrientation {
  return orientation === "sente-bottom" ? "gote-bottom" : "sente-bottom";
}

export function serializeTimeControl(
  settings: TimeControlSettings,
  remainingClock: MatchClock = initialMatchClock(settings),
  maximumNodes = 1_000_000_000,
): TimeControl {
  switch (settings.mode) {
    case "casual":
      return {
        schema: TIME_CONTROL_SCHEMA,
        casual: true,
        safetyMarginMs: 50,
      };
    case "fixed":
      return {
        schema: TIME_CONTROL_SCHEMA,
        movetimeMs: Math.round(settings.fixedSeconds * 1_000),
        safetyMarginMs: 50,
      };
    case "clock": {
      const byoyomi = boundedInteger(settings.byoyomiSeconds, 0, 3_600) * 1_000;
      const increment =
        boundedInteger(settings.incrementSeconds, 0, 3_600) * 1_000;
      return {
        schema: TIME_CONTROL_SCHEMA,
        blackTimeMs: boundedInteger(remainingClock.blackTimeMs, 0, 604_800_000),
        whiteTimeMs: boundedInteger(remainingClock.whiteTimeMs, 0, 604_800_000),
        byoyomiMs: byoyomi,
        blackIncrementMs: increment,
        whiteIncrementMs: increment,
        safetyMarginMs: 50,
      };
    }
    case "nodes":
      return {
        schema: TIME_CONTROL_SCHEMA,
        nodes: boundedInteger(settings.nodes, 1, maximumNodes),
        safetyMarginMs: 50,
      };
  }
}

export function initialMatchClock(
  settings: Pick<TimeControlSettings, "mainMinutes">,
): MatchClock {
  const mainTimeMs = boundedInteger(settings.mainMinutes, 0, 10_080) * 60_000;
  return { blackTimeMs: mainTimeMs, whiteTimeMs: mainTimeMs };
}

export function consumeMatchClock(
  clock: MatchClock,
  side: Side,
  elapsedMs: number,
  incrementSeconds: number,
): MatchClock {
  const consumed = clampedInteger(elapsedMs, 0, 604_800_000);
  const increment = boundedInteger(incrementSeconds, 0, 3_600) * 1_000;
  const key = side === "black" ? "blackTimeMs" : "whiteTimeMs";
  return {
    ...clock,
    [key]: Math.min(
      604_800_000,
      Math.max(0, clock[key] - consumed) + increment,
    ),
  };
}

/** Elapsed turn time from two wall-clock readings, clamped for clock jumps. */
export function elapsedTurnMs(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}

export function matchClockExpired(
  clock: MatchClock,
  side: Side,
  elapsedMs: number,
  byoyomiSeconds: number,
): boolean {
  const key = side === "black" ? "blackTimeMs" : "whiteTimeMs";
  const byoyomi = boundedInteger(byoyomiSeconds, 0, 3_600) * 1_000;
  if (!Number.isFinite(elapsedMs)) return true;
  return Math.max(0, Math.round(elapsedMs)) > clock[key] + byoyomi;
}

export function browserProfileNodeLimit(profile: SearchProfile): number {
  return profile === "eco" ? 1_500 : profile === "balanced" ? 4_000 : 12_000;
}

export function browserProfileHashMegabytes(profile: SearchProfile): number {
  return profile === "eco" ? 2 : profile === "balanced" ? 4 : 8;
}

export function resourceBudget(
  playHashMegabytes: number,
  analysisHashMegabytes: number,
  pauseAnalysisDuringAiTurn: boolean,
  analysisActive = analysisHashMegabytes > 0,
): ResourceBudget {
  const playHash = boundedInteger(playHashMegabytes, 1, 1_048_576);
  const analysisHash = boundedInteger(analysisHashMegabytes, 0, 1_048_576);
  return {
    schema: RESOURCE_BUDGET_SCHEMA,
    playThreads: 1,
    analysisThreads: analysisActive ? 1 : 0,
    playHashMegabytes: playHash,
    analysisHashMegabytes: analysisHash,
    analysisPauseDuringAiTurn: pauseAnalysisDuringAiTurn,
    maximumAggregateMemoryMegabytes: playHash + analysisHash + 64,
  };
}

export interface MoveHighlight {
  from: SquareSummary | null;
  to: SquareSummary;
  drop: boolean;
  capture: boolean;
  promotion: boolean;
}

export function lastMoveHighlight(
  history: BrowserSnapshot[],
  displayedIndex: number,
): MoveHighlight | null {
  if (displayedIndex <= 0 || displayedIndex >= history.length) return null;
  const current = history[displayedIndex];
  const previous = history[displayedIndex - 1];
  const movement = current.moves.at(-1);
  if (movement === undefined) return null;
  const shape = parseUsiMoveShape(movement);
  const targetIndex = boardIndex(shape.to.file, shape.to.rank);
  return {
    from: shape.from,
    to: shape.to,
    drop: shape.from === null,
    capture: previous.board[targetIndex] !== null,
    promotion: movement.endsWith("+"),
  };
}

export function parseUsiMoveShape(movement: string): {
  from: SquareSummary | null;
  to: SquareSummary;
} {
  const drop = movement.match(/^[RBGSNLP]\*([1-9])([a-i])$/u);
  if (drop !== null) {
    return { from: null, to: squareFromUsi(drop[1], drop[2]) };
  }
  const normal = movement.match(/^([1-9])([a-i])([1-9])([a-i])\+?$/u);
  if (normal === null) throw new Error("movement must be legal USI notation");
  return {
    from: squareFromUsi(normal[1], normal[2]),
    to: squareFromUsi(normal[3], normal[4]),
  };
}

export function boardIndex(file: number, rank: number): number {
  return (rank - 1) * 9 + (9 - file);
}

function squareFromUsi(file: string, rank: string): SquareSummary {
  return {
    file: Number(file),
    rank: rank.charCodeAt(0) - "a".charCodeAt(0) + 1,
  };
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  const result = Math.round(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`value must be between ${minimum} and ${maximum}`);
  }
  return result;
}

function clampedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
