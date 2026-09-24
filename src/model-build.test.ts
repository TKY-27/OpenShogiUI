import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  digest,
  parseReleaseSelection,
  parseReleaseAllowlist,
  runtimeModule,
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

it("allows only explicit representative generations and emits no private registration fields", () => {
  const entry = (id: string, generation: number) => ({
    selection: id,
    generation,
    label: id,
    provenance: { path: "local/rights.json", sha256: sha },
    model: {
      ...selection().model,
      artifacts: {
        ...selection().model.artifacts,
        "leaf.osaval03": {
          path: "local/model.osaval03",
          sha256: String(generation).repeat(64),
        },
      },
    },
  });
  const value = {
    schema: "open_shogi_release_allowlist/v1",
    default: "defense",
    models: [entry("defense", 2), entry("r4c2", 4)],
  };
  expect(parseReleaseAllowlist(value).models.map((m) => m.selection)).toEqual([
    "r4c2",
    "defense",
  ]);
  expect(() => parseReleaseAllowlist({ ...value, models: [] })).toThrow(
    "undecided",
  );
  expect(() =>
    parseReleaseAllowlist({
      ...value,
      models: [
        entry("defense", 2),
        { ...entry("r4c4", 4), model: entry("defense", 2).model },
      ],
    }),
  ).toThrow("Duplicate");
  expect(() =>
    parseReleaseAllowlist({
      ...value,
      models: [entry("defense", 2), entry("defense", 4)],
    }),
  ).toThrow("Ambiguous");
  expect(() =>
    parseReleaseAllowlist({ ...value, models: [entry("checkpoint123", 2)] }),
  ).toThrow();
  const models = [
    {
      manifest: null,
      label: "public label",
      generation: 4,
      config: { privatePath: "local/secret.pt" },
      buffers: { optimizer: "PRIVATE_BYTES" },
    },
  ];
  const plugin = runtimeModule(null, false, models as never);
  const load = plugin.load as (id: string) => string;
  const source = load("\0virtual:shogi-runtime");
  expect(source).toContain("public label");
  expect(source).not.toContain("local/secret");
  expect(source).not.toContain("PRIVATE_BYTES");
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

it("emits identical runtime bytes once at a content-addressed path across models", async () => {
  const { emitRelease } = await import("../model-build");
  const runtime = Buffer.from("shared runtime"),
    a = Buffer.from("model A"),
    b = Buffer.from("model B");
  const model = (selection: string, leaf: Buffer) => ({
    manifest: {
      selection,
      artifacts: Object.fromEntries(
        [
          ["engine.js", runtime],
          ["engine.wasm", runtime],
          ["leaf.osaval03", leaf],
        ].map(([name, source]) => [
          name,
          {
            url: `/model/${digest(source as Buffer)}/${name}${name === "leaf.osaval03" ? ".gz" : ""}`,
          },
        ]),
      ),
    },
    buffers: {
      "engine.js": runtime,
      "engine.wasm": runtime,
      "leaf.osaval03": leaf,
    },
    config: { runtimeProfile: "pure_learned-v3", controllerEnabled: false },
  });
  const models = [model("r4c3", a), model("defense", b)];
  const plugin = emitRelease({ ...models[0], models } as never);
  const files: { fileName: string; source: Buffer | string }[] = [];
  (plugin.generateBundle as () => void).call({
    emitFile: (file: (typeof files)[number]) => files.push(file),
  });
  expect(files.map((f) => f.fileName)).toEqual([
    `model/${digest(runtime)}/engine.js`,
    `model/${digest(runtime)}/engine.wasm`,
    `model/${digest(a)}/leaf.osaval03.gz`,
    `model/${digest(b)}/leaf.osaval03.gz`,
    "model/manifest.json",
  ]);
  expect(gunzipSync(files[2].source as Buffer)).toEqual(a);
  expect(gunzipSync(files[3].source as Buffer)).toEqual(b);
});
