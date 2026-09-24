import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_VERSION,
  parseSubmission,
  type CollectionIdentity,
} from "./collection-schema";
import type { PrototypeState } from "./core-prototype-session";
import { initialPrototypeState } from "./core-prototype-session";

export const fixtureIdentity: CollectionIdentity = {
  modelId: "r4-c4-local-fixture",
  modelSha256: "1".repeat(64),
  jsSha256: "2".repeat(64),
  wasmSha256: "3".repeat(64),
};
export const fixturePayload = () => ({
  schema: "open_shogi_submission/v1",
  gameId: "12345678-1234-4123-8123-123456789abc",
  consentVersion: CONSENT_VERSION,
  model: fixtureIdentity,
  humanSide: "black",
  winner: "white",
  reason: "resignation",
  settings: {
    preset: "blitz3",
    profile: "balanced",
    controller: false,
    ponder: false,
  },
  moves: ["7g7f", "3c3d"],
});

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function states(startSfen: string) {
  const setup: PrototypeState = {
    ...initialPrototypeState(),
    selection: "r4c4",
    phase: "setup",
    identity: {
      modelId: fixtureIdentity.modelId,
      leafSha256: fixtureIdentity.modelSha256,
      jsSha256: fixtureIdentity.jsSha256,
      wasmSha256: fixtureIdentity.wasmSha256,
      modelFormat: "OSAVAL03",
      controllerSha256: null,
      expectedHashVerified: true,
      buildClass: "pure-only",
      evaluationMode: "pure-value",
    },
    snapshot: {
      initialSfen: startSfen,
      sfen: startSfen,
      sideToMove: "black",
      moveNumber: 1,
      board: Array(81).fill(null),
      hands: { black: [], white: [] },
      legalMoves: [],
      moves: [],
      terminal: null,
      leafSha256: fixtureIdentity.modelSha256,
    },
  };
  const ended: PrototypeState = {
    ...setup,
    phase: "finished",
    result: { reason: "resignation", winner: "white" },
    snapshot: { ...setup.snapshot!, moves: ["7g7f", "3c3d"], moveNumber: 3 },
  };
  return { setup, ended };
}

describe("voluntary collection", () => {
  it("defaults closed and keeps storage failure closed; old refusal stays refused", async () => {
    const c = await import("./collection");
    expect(c.getConsent().allowed).toBe(false);
    expect(c.getConsent().decided).toBe(false);
    c.setConsent(true);
    expect(c.getConsent().allowed).toBe(true);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw Error("blocked");
      },
    });
    c.setConsent(true);
    expect(c.getConsent().allowed).toBe(false);
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ allowed: false, version: "old" }),
    });
    const old = await import("./collection");
    expect(old.getConsent()).toMatchObject({ allowed: false, decided: true });
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ allowed: true, version: "old" }),
    });
    expect((await import("./collection")).getConsent()).toMatchObject({
      allowed: false,
      decided: false,
    });
  });
  it("posts exactly once from a fresh allowlisted fixture, with only closed fields", async () => {
    const c = await import("./collection");
    c.setConsent(true);
    const { setup, ended } = states(c.START_SFEN);
    const send = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ status: "accepted" }, { status: 201 }),
    );
    const report = vi.fn();
    const collector = new c.GameCollection(
      report,
      { enabled: true, models: [fixtureIdentity] },
      c.getConsent,
      send,
    );
    collector.begin(setup);
    await collector.finish(ended);
    await collector.finish(ended);
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(send.mock.calls[0]?.[1]?.body));
    expect(parseSubmission(body, [fixtureIdentity]).moves).toEqual(
      ended.snapshot!.moves,
    );
    expect(Object.keys(body).sort()).toEqual(
      Object.keys(fixturePayload()).sort(),
    );
    expect(report).toHaveBeenLastCalledWith("accepted");
    collector.dispose();
  });
  it.each([
    "undecided",
    "refused",
    "late-consent",
    "revoked",
    "re-enabled",
    "old-model",
    "imported",
    "analysis",
    "timeout",
    "repetition",
    "abandoned",
    "fake-mate",
    "model-changed",
    "controller",
    "production-off",
  ])("sends nothing for %s", async (scenario) => {
    const c = await import("./collection");
    const { setup, ended } = states(c.START_SFEN);
    const send = vi.fn();
    if (!["undecided", "refused", "late-consent"].includes(scenario))
      c.setConsent(true);
    if (scenario === "refused") c.setConsent(false);
    if (scenario === "old-model") setup.selection = "r4c3";
    if (scenario === "imported") setup.snapshot!.initialSfen = "custom";
    if (scenario === "analysis") setup.phase = "stopped";
    const collector = new c.GameCollection(
      () => {},
      { enabled: scenario !== "production-off", models: [fixtureIdentity] },
      c.getConsent,
      send,
    );
    collector.begin(setup);
    if (scenario === "late-consent") c.setConsent(true);
    if (["revoked", "re-enabled"].includes(scenario)) c.setConsent(false);
    if (scenario === "re-enabled") c.setConsent(true);
    if (["timeout", "repetition"].includes(scenario))
      ended.result!.reason = scenario;
    if (scenario === "abandoned") ended.phase = "stopped";
    if (scenario === "fake-mate") ended.result!.reason = "checkmate";
    if (scenario === "model-changed")
      ended.identity = { ...ended.identity!, wasmSha256: "4".repeat(64) };
    if (scenario === "controller") ended.enabled = true;
    await collector.finish(ended);
    expect(send).not.toHaveBeenCalled();
    collector.dispose();
  });
  it.each([429, 500, 503, 1102, "html", "network", "timeout"])(
    "abandons collection on %s without changing final game",
    async (failure) => {
      const c = await import("./collection");
      c.setConsent(true);
      const { setup, ended } = states(c.START_SFEN);
      const report = vi.fn();
      const send = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        if (failure === "timeout")
          return new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(Error("timeout")),
            ),
          );
        if (failure === "network") return Promise.reject(Error("offline"));
        return Promise.resolve(
          new Response(
            failure === "html" || failure === 1102
              ? "<html>limit</html>"
              : "{}",
            {
              status:
                typeof failure === "number" && failure <= 599 ? failure : 200,
              headers: {
                "Content-Type":
                  failure === "html" || failure === 1102
                    ? "text/html"
                    : "application/json",
              },
            },
          ),
        );
      });
      const collector = new c.GameCollection(
        report,
        { enabled: true, models: [fixtureIdentity] },
        c.getConsent,
        send,
        5,
      );
      collector.begin(setup);
      await collector.finish(ended);
      expect(report).toHaveBeenLastCalledWith("unavailable");
      expect(ended.phase).toBe("finished");
      expect(send).toHaveBeenCalledTimes(1);
      collector.dispose();
    },
  );
  it("retries one network failure with the same payload, and cancels a pending retry on revocation", async () => {
    const c = await import("./collection");
    c.setConsent(true);
    const { setup, ended } = states(c.START_SFEN);
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValue(Response.json({ status: "duplicate" }));
    const report = vi.fn();
    const collector = new c.GameCollection(
      report,
      { enabled: true, models: [fixtureIdentity] },
      c.getConsent,
      send,
    );
    collector.begin(setup);
    await collector.finish(ended);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[1]?.body).toBe(send.mock.calls[1]?.[1]?.body);
    expect(report).toHaveBeenLastCalledWith("accepted");
    send.mockReset().mockRejectedValue(new TypeError("network"));
    collector.begin(setup);
    const pending = collector.finish(ended);
    await Promise.resolve();
    c.setConsent(false);
    await pending;
    expect(send).toHaveBeenCalledTimes(1);
    collector.dispose();
  });
  it("revocation aborts an in-flight request and cannot announce success", async () => {
    const c = await import("./collection");
    c.setConsent(true);
    const { setup, ended } = states(c.START_SFEN);
    const report = vi.fn();
    let resolve: (value: Response) => void = () => {};
    let signal: AbortSignal | null | undefined;
    const send = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>((r) => {
        resolve = r;
      });
    });
    const collector = new c.GameCollection(
      report,
      { enabled: true, models: [fixtureIdentity] },
      c.getConsent,
      send,
    );
    collector.begin(setup);
    const pending = collector.finish(ended);
    c.setConsent(false);
    expect(signal?.aborted).toBe(true);
    resolve(Response.json({ status: "accepted" }));
    await pending;
    expect(report).not.toHaveBeenCalledWith("accepted");
    collector.dispose();
  });
});
