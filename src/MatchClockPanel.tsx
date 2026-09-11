import { useEffect, useState } from "react";
import { clockIsUrgent, formatMatchClock } from "./match-clock";

const CLOCK_TICK_MS = 100;

/**
 * Owns its own tick.
 *
 * The countdown used to live in MatchPlay state, so every 100ms repaint
 * re-rendered all 81 squares and 40 piece images. Besides the waste, a
 * re-render landing between mousedown and mouseup drops the click, which is
 * what made pieces intermittently refuse to move. Only this panel repaints now.
 */
export function MatchClockPanel({
  label,
  name,
  baseMs,
  runningSince,
  showClock,
  active,
  remainingLabel,
}: {
  label: string;
  name: string;
  baseMs: number;
  runningSince: number | null;
  showClock: boolean;
  active: boolean;
  remainingLabel: (clock: string) => string;
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (runningSince === null || !showClock) return;
    const timer = window.setInterval(
      () => forceTick((value) => value + 1),
      CLOCK_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [runningSince, showClock]);

  const remainingMs =
    runningSince === null
      ? baseMs
      : Math.max(0, baseMs - Math.max(0, Date.now() - runningSince));
  const urgent = showClock && clockIsUrgent(remainingMs);
  return (
    <div
      className={[
        "match-clock",
        active ? "match-clock--active" : "",
        urgent ? "match-clock--urgent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="match-clock__side">{label}</span>
      <span className="match-clock__name">{name}</span>
      {showClock ? (
        <strong
          aria-label={remainingLabel(formatMatchClock(remainingMs))}
          className="match-clock__time"
        >
          {formatMatchClock(remainingMs)}
        </strong>
      ) : (
        <strong aria-hidden="true" className="match-clock__time">
          —
        </strong>
      )}
    </div>
  );
}
