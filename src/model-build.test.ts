import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  digest,
  parseReleaseSelection,
  loadModelConfiguration,
  readRegisteredFile,
} from "../model-build";

const sha = "a".repeat(64);
const selection = () => ({
  schema: "open_shogi_release_selection/v1",
  model: {
    id: "selected-model-v1",
    format: "OSAVAL03",
    runtimeProfile: "pure_learned-v3",
    controllerEnabled: false,
    artifacts: {
      "engine.js": { path: "local/engine.js", sha256: sha },
      "engine.wasm": { path: "local/engine.wasm", sha256: sha },
      "leaf.osaval03": { path: "local/model.osaval03", sha256: sha },
      "controller.json": null,
    },
  },
});

describe("single release configuration", () => {
  it("accepts one explicit complete configuration", () => {
    expect(parseReleaseSelection(selection()).id).toBe("selected-model-v1");
  });
  it("fails closed for undecided, multiple, incompatible or incomplete selections", () => {
    expect(() =>
      parseReleaseSelection({
        schema: "open_shogi_release_selection/v1",
        model: null,
      }),
    ).toThrow("undecided");
    expect(() =>
      parseReleaseSelection({
        schema: "open_shogi_release_selection/v1",
        model: [selection().model, selection().model],
      }),
    ).toThrow();
    for (const patch of [
      { format: "OSAVAL02" },
      { runtimeProfile: "unknown" },
      { controllerEnabled: true },
      { artifacts: {} },
    ])
      expect(() =>
        parseReleaseSelection({
          ...selection(),
          model: { ...selection().model, ...patch },
        }),
      ).toThrow();
    const value = selection();
    value.model.artifacts["leaf.osaval03"].path = "local/../../other";
    expect(() => parseReleaseSelection(value)).toThrow();
  });
  it("validates actual registered bytes and rejects a hash mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "osui-release-"));
    try {
      await mkdir(join(root, "local"));
      await writeFile(join(root, "local/engine.js"), "wrong bytes");
      await expect(
        loadModelConfiguration(
          root,
          parseReleaseSelection(selection()),
          "release",
          "/model/",
        ),
      ).rejects.toThrow("hash mismatch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not accept correct hashes as proof of the model format", async () => {
    const root = await mkdtemp(join(tmpdir(), "osui-format-"));
    try {
      await mkdir(join(root, "local"));
      const value = selection();
      for (const name of [
        "engine.js",
        "engine.wasm",
        "leaf.osaval03",
      ] as const) {
        const bytes = Buffer.from("malformed but correctly hashed");
        value.model.artifacts[name].sha256 = digest(bytes);
        await writeFile(join(root, value.model.artifacts[name].path), bytes);
      }
      await expect(
        loadModelConfiguration(
          root,
          parseReleaseSelection(value),
          "release",
          "/model/",
        ),
      ).rejects.toThrow("OSAVAL03 format");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects filesystem escape and oversized registered files", async () => {
    const root = await mkdtemp(join(tmpdir(), "osui-containment-"));
    try {
      await mkdir(join(root, "ai"));
      await writeFile(join(root, "outside"), "1234");
      await symlink(join(root, "outside"), join(root, "ai/link"));
      await expect(
        readRegisteredFile(join(root, "ai"), "link", 100),
      ).rejects.toThrow("escapes");
      await writeFile(join(root, "ai/large"), "1234");
      await expect(
        readRegisteredFile(join(root, "ai"), "large", 3),
      ).rejects.toThrow("size");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
