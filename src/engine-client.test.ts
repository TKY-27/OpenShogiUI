import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKER_RESPONSE_SCHEMA } from "./browser-engine";
import { EngineWorkerClient } from "./engine-client";

class MockWorker {
  static latest: MockWorker | null = null;
  static count = 0;

  readonly listeners = new Map<string, (event: Event) => void>();
  terminated = false;
  posted: unknown = null;

  constructor() {
    MockWorker.latest = this;
    MockWorker.count += 1;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(type, listener as (event: Event) => void);
  }

  postMessage(value: unknown) {
    this.posted = value;
  }

  terminate() {
    this.terminated = true;
  }

  emitMessage(data: unknown) {
    this.listeners.get("message")?.({ data } as MessageEvent<unknown>);
  }

  emitError(message: string) {
    this.listeners.get("error")?.({ message } as ErrorEvent);
  }
}

describe("EngineWorkerClient response correlation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockWorker.latest = null;
    MockWorker.count = 0;
  });

  it("fails closed when a response id has the wrong operation kind", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const onStateChange = vi.fn();
    const client = new EngineWorkerClient("play", onStateChange);
    const initialization = client.initialize();
    const worker = MockWorker.latest;
    expect(worker?.posted).toMatchObject({ id: 1, kind: "initialize" });

    worker?.emitMessage({
      schema: WORKER_RESPONSE_SCHEMA,
      id: 1,
      ok: true,
      kind: "reset",
      data: null,
    });

    await expect(initialization).rejects.toThrow(
      "worker response kind mismatch: expected initialize, received reset",
    );
    expect(worker?.terminated).toBe(true);
    expect(onStateChange).toHaveBeenLastCalledWith(
      "crashed",
      "worker response kind mismatch: expected initialize, received reset",
    );
  });

  it("keeps disposal terminal and does not create a replacement Worker", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const adapter = new EngineWorkerClient("analysis");
    adapter.dispose();

    await expect(adapter.initialize()).rejects.toThrow(
      "analysis engine is disposed",
    );
    await expect(
      adapter.restart({ initialSfen: "startpos", moves: [] }),
    ).rejects.toThrow("analysis engine is disposed");
    expect(MockWorker.count).toBe(1);
    expect(MockWorker.latest?.terminated).toBe(true);
  });

  it("rejects operations immediately after a physical Worker crash", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const adapter = new EngineWorkerClient("analysis");
    const initialization = adapter.initialize();
    MockWorker.latest?.emitError("worker failed");

    await expect(initialization).rejects.toThrow("worker failed");
    await expect(adapter.analysisStop()).rejects.toThrow(
      "analysis engine has crashed",
    );
  });

  it("keeps a replacement Worker authoritative over cancelled operations", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const onStateChange = vi.fn();
    const client = new EngineWorkerClient("analysis", onStateChange);
    const initialization = client.initialize();
    MockWorker.latest?.emitMessage({
      schema: WORKER_RESPONSE_SCHEMA,
      id: 1,
      ok: true,
      kind: "initialize",
      data: null,
    });
    await initialization;

    const oldWorker = MockWorker.latest;
    const pending = client.analysisStop();
    const replacement = client.restart({ initialSfen: "startpos", moves: [] });

    await expect(pending).rejects.toThrow("search cancelled");
    expect(oldWorker?.terminated).toBe(true);
    expect(client.readyState).toBe("initializing");
    expect(MockWorker.count).toBe(2);

    oldWorker?.emitError("late failure from replaced worker");
    expect(client.readyState).toBe("initializing");
    expect(MockWorker.latest?.terminated).toBe(false);

    MockWorker.latest?.emitMessage({
      schema: WORKER_RESPONSE_SCHEMA,
      id: 3,
      ok: true,
      kind: "initialize",
      data: null,
    });
    await replacement;
    expect(client.readyState).toBe("ready");
    expect(onStateChange).not.toHaveBeenCalledWith(
      "crashed",
      "search cancelled",
    );
  });
});
