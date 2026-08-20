import { describe, expect, it } from "vitest";

import {
  EVALUATION_PUBLISH_INTERVAL_MS,
  PublishGate,
  shouldPublish,
} from "./publish-throttle";

describe("shouldPublish", () => {
  it("always allows the first value", () => {
    expect(shouldPublish(null, 0)).toBe(true);
    expect(shouldPublish(null, 12_345)).toBe(true);
  });

  it("suppresses anything inside the interval", () => {
    expect(shouldPublish(1_000, 1_001)).toBe(false);
    expect(shouldPublish(1_000, 1_999)).toBe(false);
  });

  it("allows again at exactly the interval", () => {
    expect(shouldPublish(1_000, 2_000)).toBe(true);
    expect(shouldPublish(1_000, 2_001)).toBe(true);
  });

  it("defaults to one second", () => {
    expect(EVALUATION_PUBLISH_INTERVAL_MS).toBe(1_000);
    expect(shouldPublish(0, 999)).toBe(false);
    expect(shouldPublish(0, 1_000)).toBe(true);
  });

  it("honours a custom interval", () => {
    expect(shouldPublish(0, 200, 500)).toBe(false);
    expect(shouldPublish(0, 500, 500)).toBe(true);
  });

  it("does not lock up when the clock jumps backwards", () => {
    expect(shouldPublish(5_000, 1_000)).toBe(true);
  });

  it("does not lock up on a non-finite reading", () => {
    expect(shouldPublish(1_000, Number.NaN)).toBe(true);
    expect(shouldPublish(Number.NaN, 1_000)).toBe(true);
  });
});

describe("PublishGate", () => {
  it("passes the first value and suppresses the rest of the interval", () => {
    const gate = new PublishGate<string>();
    expect(gate.offer("a", 0)).toBe("a");
    expect(gate.offer("b", 300)).toBeNull();
    expect(gate.offer("c", 900)).toBeNull();
    expect(gate.offer("d", 1_000)).toBe("d");
  });

  it("flushes the newest suppressed value when the source stops", () => {
    // Without this the final evaluation of a finished search is never shown
    // and the display keeps a stale number.
    const gate = new PublishGate<string>();
    expect(gate.offer("a", 0)).toBe("a");
    gate.offer("b", 200);
    gate.offer("final", 400);
    expect(gate.flush(400)).toBe("final");
  });

  it("has nothing to flush when the last value was already published", () => {
    const gate = new PublishGate<string>();
    gate.offer("a", 0);
    expect(gate.flush(10)).toBeNull();
  });

  it("does not replay a flushed value twice", () => {
    const gate = new PublishGate<string>();
    gate.offer("a", 0);
    gate.offer("b", 100);
    expect(gate.flush(100)).toBe("b");
    expect(gate.flush(150)).toBeNull();
  });

  it("treats the flushed value as the new interval anchor", () => {
    const gate = new PublishGate<string>();
    gate.offer("a", 0);
    gate.offer("b", 100);
    expect(gate.flush(100)).toBe("b");
    expect(gate.offer("c", 600)).toBeNull();
    expect(gate.offer("d", 1_100)).toBe("d");
  });

  it("starts fresh after a reset", () => {
    const gate = new PublishGate<string>();
    gate.offer("a", 0);
    expect(gate.offer("b", 100)).toBeNull();
    gate.reset();
    expect(gate.offer("c", 110)).toBe("c");
    expect(gate.flush(110)).toBeNull();
  });
});
