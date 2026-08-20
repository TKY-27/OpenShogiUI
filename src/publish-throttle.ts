/**
 * Rate limiting for evaluation display updates.
 *
 * The search emits a slice every few tens of milliseconds. Repainting the
 * evaluation that often makes the number unreadable, so the display is limited
 * to one update per second. The search itself is untouched: this only decides
 * when an already-computed value reaches the screen.
 */

export const EVALUATION_PUBLISH_INTERVAL_MS = 1_000;

/**
 * @param lastPublishedAtMs Reading from the previous publish, or null if none.
 * @param nowMs Current reading.
 * @param intervalMs Minimum gap between publishes.
 */
export function shouldPublish(
  lastPublishedAtMs: number | null,
  nowMs: number,
  intervalMs: number = EVALUATION_PUBLISH_INTERVAL_MS,
): boolean {
  if (lastPublishedAtMs === null) return true;
  if (!Number.isFinite(nowMs) || !Number.isFinite(lastPublishedAtMs)) {
    return true;
  }
  // A clock that jumped backwards must not suppress updates indefinitely.
  if (nowMs < lastPublishedAtMs) return true;
  return nowMs - lastPublishedAtMs >= intervalMs;
}

/**
 * Holds the most recent suppressed value so it can still be shown once the
 * source stops producing.
 *
 * Without this the last value of a search is dropped whenever it lands inside
 * the interval, and the display keeps showing a stale evaluation for a search
 * that has already finished.
 */
export class PublishGate<T> {
  private lastPublishedAtMs: number | null = null;
  private pending: T | null = null;

  /** Returns the value to display now, or null to keep the current one. */
  offer(value: T, nowMs: number, intervalMs?: number): T | null {
    if (shouldPublish(this.lastPublishedAtMs, nowMs, intervalMs)) {
      this.lastPublishedAtMs = nowMs;
      this.pending = null;
      return value;
    }
    this.pending = value;
    return null;
  }

  /** Returns any suppressed value, bypassing the interval. */
  flush(nowMs: number): T | null {
    const value = this.pending;
    this.pending = null;
    if (value !== null) this.lastPublishedAtMs = nowMs;
    return value;
  }

  reset(): void {
    this.lastPublishedAtMs = null;
    this.pending = null;
  }
}
