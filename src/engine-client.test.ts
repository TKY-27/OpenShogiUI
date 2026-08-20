import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKER_RESPONSE_SCHEMA } from "./browser-engine";
import { WasmEngineAdapter } from "./engine-adapter";
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
    const crashed = vi.fn();
    const client = new EngineWorkerClient("play", crashed);
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
    expect(crashed).toHaveBeenCalledOnce();
  });

  it("keeps disposal terminal and does not create a replacement Worker", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const adapter = new WasmEngineAdapter("analysis");
    adapter.dispose();

    await expect(adapter.initialize()).rejects.toThrow(
      "analysis adapter is disposed",
    );
    await expect(
      adapter.restart({ initialSfen: "startpos", moves: [] }),
    ).rejects.toThrow("analysis adapter is disposed");
    expect(MockWorker.count).toBe(1);
    expect(MockWorker.latest?.terminated).toBe(true);
  });

  it("rejects operations immediately after a physical Worker crash", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const adapter = new WasmEngineAdapter("analysis");
    const initialization = adapter.initialize();
    MockWorker.latest?.emitError("worker failed");

    await expect(initialization).rejects.toThrow("worker failed");
    await expect(adapter.analysisWorkerFailed()).rejects.toThrow(
      "analysis adapter has crashed",
    );
  });
});
