import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPrototypeManifest,
  PrototypeWorkerClient,
} from "./core-prototype-client";
import {
  parsePrototypeManifest,
  type PrototypeManifest,
} from "./core-prototype-protocol";

const release = vi.hoisted(() => ({
  manifest: null as PrototypeManifest | null,
  controllerEnabled: false,
}));
vi.mock("virtual:shogi-runtime", () => ({
  assetPrefix: "/model/",
  get releaseManifest() {
    return release.manifest;
  },
  get releaseControllerEnabled() {
    return release.controllerEnabled;
  },
}));

function pinnedManifest(): PrototypeManifest {
  const sha256 = "b".repeat(64);
  const asset = (name: string) => ({
    url: `/model/release/${name}?sha256=${sha256}`,
    size: 3,
    sha256,
  });
  return {
    schema: "open_shogi_core_prototype_assets/v2",
    selection: "release",
    runId: "explicit-local-build-model",
    artifacts: {
      "engine.js": asset("engine.js"),
      "engine.wasm": asset("engine.wasm"),
      "leaf.osaval03": asset("leaf.osaval03"),
      "controller.json": null,
    },
  };
}

beforeEach(() => {
  vi.stubEnv("DEV", false);
  release.manifest = pinnedManifest();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("production runtime manifest pin", () => {
  it("uses only the compiled manifest and rejects development selection before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await loadPrototypeManifest("release")).toEqual(release.manifest);
    await expect(loadPrototypeManifest("baseline")).rejects.toThrow(
      "unavailable",
    );
    await expect(loadPrototypeManifest("candidate")).rejects.toThrow(
      "unavailable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed without a pin and on changed selection, identity, bytes or extra components", () => {
    const expected = pinnedManifest();
    expect(parsePrototypeManifest(expected)).toEqual(expected);
    release.manifest = null;
    expect(() => parsePrototypeManifest(expected)).toThrow("pinned release");
    release.manifest = expected;
    for (const mutate of [
      (value: PrototypeManifest) => {
        value.selection = "candidate";
      },
      (value: PrototypeManifest) => {
        value.runId = "other-model";
      },
      (value: PrototypeManifest) => {
        value.artifacts["leaf.osaval03"].sha256 = "c".repeat(64);
      },
      (value: PrototypeManifest) => {
        value.artifacts["engine.wasm"].size += 1;
      },
      (value: PrototypeManifest) => {
        value.artifacts["engine.js"].url =
          "/__core-prototype/candidate/engine.js";
      },
      (value: PrototypeManifest) => {
        value.artifacts["controller.json"] = {
          ...expected.artifacts["engine.js"],
          url: `/model/release/controller.json?sha256=${"b".repeat(64)}`,
        };
      },
    ]) {
      const changed = structuredClone(expected);
      mutate(changed);
      expect(() => parsePrototypeManifest(changed)).toThrow();
    }
  });

  it("does not permit a runtime controller change from the compiled configuration", async () => {
    const worker = {
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    const client = new PrototypeWorkerClient(() => worker as unknown as Worker);
    await expect(client.configure(true)).rejects.toThrow(
      "configuration is fixed",
    );
    expect(worker.postMessage).not.toHaveBeenCalled();
    client.dispose();
  });
});
