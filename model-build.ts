import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile, realpath, readdir, lstat } from "node:fs/promises";
import { resolve, sep, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { PrototypeManifest } from "./src/core-prototype-protocol";

export const MODEL_NAMES = [
  "engine.js",
  "engine.wasm",
  "leaf.osaval03",
  "controller.json",
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];
export interface ModelConfiguration {
  id: string;
  format: "OSAVAL03";
  runtimeProfile: "pure_learned-v3";
  controllerEnabled: boolean;
  artifacts: Record<
    Exclude<ModelName, "controller.json">,
    { path: string; sha256: string }
  > & {
    "controller.json": { path: string; sha256: string } | null;
  };
}
export const MODEL_LIMITS = [
  2 * 1024 ** 2,
  32 * 1024 ** 2,
  64 * 1024 ** 2,
  16384,
];
export const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== keys.sort().join()
  )
    throw new Error("Invalid model configuration fields");
}
export function parseReleaseSelection(value: unknown): ModelConfiguration {
  exact(value, ["schema", "model"]);
  if (value.schema !== "open_shogi_release_selection/v1")
    throw new Error("Unsupported release selection schema");
  if (value.model === null)
    throw new Error(
      "Release model is undecided; explicitly select one local configuration with OPENSHOGI_RELEASE_CONFIG",
    );
  const model = value.model;
  exact(model, [
    "id",
    "format",
    "runtimeProfile",
    "controllerEnabled",
    "artifacts",
  ]);
  if (
    typeof model.id !== "string" ||
    !/^[a-zA-Z0-9._-]{1,96}$/.test(model.id) ||
    model.format !== "OSAVAL03" ||
    model.runtimeProfile !== "pure_learned-v3" ||
    typeof model.controllerEnabled !== "boolean"
  )
    throw new Error("Invalid model identity, format or runtime profile");
  exact(model.artifacts, [...MODEL_NAMES]);
  for (const name of MODEL_NAMES) {
    const artifact = model.artifacts[name];
    if (name === "controller.json" && artifact === null) {
      if (model.controllerEnabled)
        throw new Error("Enabled controller requires matching artifact");
      continue;
    }
    exact(artifact, ["path", "sha256"]);
    if (
      typeof artifact.path !== "string" ||
      !/^(local|target)\/[a-zA-Z0-9._/-]+$/.test(artifact.path) ||
      artifact.path.split("/").some((x) => x === "." || x === "..") ||
      typeof artifact.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    )
      throw new Error("Invalid registered model artifact");
  }
  return model as unknown as ModelConfiguration;
}

export function parseReleaseAllowlist(value: unknown) {
  exact(value, ["schema", "default", "models"]);
  if (
    value.schema !== "open_shogi_release_allowlist/v1" ||
    !Array.isArray(value.models)
  )
    throw new Error("Invalid release allowlist");
  if (!value.models.length)
    throw new Error(
      "Release allowlist is undecided; explicit publication GO required",
    );
  if (value.models.length > 8)
    throw new Error("Only representative models may be distributed");
  const models = value.models
    .map((entry) => {
      exact(entry, ["selection", "label", "generation", "provenance", "model"]);
      if (
        ![
          "baseline",
          "candidate",
          "defense",
          "r4c1",
          "r4c2",
          "r4c3",
          "r4c4",
        ].includes(String(entry.selection)) ||
        typeof entry.label !== "string" ||
        !entry.label.length ||
        entry.label.length > 96 ||
        !Number.isInteger(entry.generation) ||
        Number(entry.generation) < 0
      )
        throw new Error("Invalid release generation/selection");
      exact(entry.provenance, ["path", "sha256"]);
      if (
        typeof entry.provenance.path !== "string" ||
        !/^local\/[a-zA-Z0-9._/-]+\.json$/.test(entry.provenance.path) ||
        entry.provenance.path.split("/").includes("..") ||
        typeof entry.provenance.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry.provenance.sha256)
      )
        throw new Error("Invalid release provenance");
      const config = parseReleaseSelection({
        schema: "open_shogi_release_selection/v1",
        model: entry.model,
      });
      if (
        config.controllerEnabled ||
        config.artifacts["controller.json"] !== null
      )
        throw new Error(
          "Representative release models use the reviewed controller-off configuration",
        );
      return {
        selection: entry.selection as PrototypeManifest["selection"],
        label: entry.label,
        generation: Number(entry.generation),
        provenance: entry.provenance as { path: string; sha256: string },
        config,
      };
    })
    .sort((a, b) => b.generation - a.generation);
  if (
    new Set(models.map((m) => m.selection)).size !== models.length ||
    new Set(models.map((m) => m.generation)).size !== models.length ||
    !models.some((m) => m.selection === value.default)
  )
    throw new Error("Ambiguous release allowlist");
  const configurations = models.map(({ config }) =>
    JSON.stringify([
      config.format,
      config.runtimeProfile,
      config.controllerEnabled,
      config.artifacts["leaf.osaval03"].sha256,
      config.artifacts["engine.js"].sha256,
      config.artifacts["engine.wasm"].sha256,
      config.artifacts["controller.json"]?.sha256 ?? null,
    ]),
  );
  if (new Set(configurations).size !== models.length)
    throw new Error(
      "Duplicate model/runtime configuration in release allowlist",
    );
  return { default: value.default as PrototypeManifest["selection"], models };
}
export async function readRegisteredFile(
  root: string,
  path: string,
  maximum: number,
): Promise<Buffer> {
  const base = await realpath(root);
  const absolute = await realpath(resolve(base, path));
  if (!absolute.startsWith(base + sep))
    throw new Error("Model artifact escapes AI checkout");
  const info = await lstat(absolute);
  if (!info.isFile() || info.size <= 0 || info.size > maximum)
    throw new Error("Invalid model artifact size");
  const bytes = await readFile(absolute);
  if (bytes.length !== info.size)
    throw new Error("Model artifact changed while reading");
  return bytes;
}
export async function loadModelConfiguration(
  root: string,
  config: ModelConfiguration,
  selection: PrototypeManifest["selection"],
  prefix: string,
) {
  const buffers: Partial<Record<ModelName, Buffer>> = {};
  const entries = [];
  for (const [index, name] of MODEL_NAMES.entries()) {
    const spec = config.artifacts[name];
    if (spec === null) {
      entries.push([name, null]);
      continue;
    }
    const bytes = await readRegisteredFile(
      root,
      spec.path,
      MODEL_LIMITS[index],
    );
    if (digest(bytes) !== spec.sha256)
      throw new Error(`Model artifact hash mismatch: ${name}`);
    buffers[name] = bytes;
    entries.push([
      name,
      {
        url: `${prefix}${spec.sha256}/${name}${name === "leaf.osaval03" ? ".gz" : ""}`,
        sha256: spec.sha256,
        size: bytes.length,
      },
    ]);
  }
  const leaf = buffers["leaf.osaval03"]!;
  if (
    leaf.length < 76 ||
    leaf.subarray(0, 8).toString() !== "OSAVAL03" ||
    digest(leaf.subarray(0, -32)) !== leaf.subarray(-32).toString("hex")
  )
    throw new Error("Invalid OSAVAL03 format or internal checksum");
  const wasm = buffers["engine.wasm"]!;
  if (!wasm.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
    throw new Error("Invalid Wasm format");
  const module = buffers["engine.js"]!.toString();
  if (
    !module.includes("WasmBrowserEngine") ||
    !module.includes("loadModel") ||
    !module.includes("playStart")
  )
    throw new Error("Incompatible browser engine module");
  if (buffers["controller.json"]) {
    const controller = JSON.parse(buffers["controller.json"]!.toString());
    if (
      controller.schema !== "open_shogiai_computation/v1" ||
      controller.leaf_model_sha256 !== config.artifacts["leaf.osaval03"].sha256
    )
      throw new Error("Controller/evaluator configuration mismatch");
  }
  const manifest: PrototypeManifest = {
    schema: "open_shogi_core_prototype_assets/v2",
    selection,
    runId: config.id,
    artifacts: Object.fromEntries(entries) as PrototypeManifest["artifacts"],
  };
  return { manifest, buffers };
}

const uiRoot = dirname(fileURLToPath(import.meta.url));
export const aiRoot =
  process.env.OSUI_ISOLATED_MODELS === "1"
    ? resolve(uiRoot, "local/model-assets")
    : resolve(uiRoot, "../OpenShogiAI");
const virtualId = "virtual:shogi-runtime";
const resolvedId = "\0" + virtualId;
export function runtimeModule(
  manifest: PrototypeManifest | null,
  controllerEnabled = false,
  models: {
    manifest: PrototypeManifest;
    label: string;
    generation: number;
  }[] = [],
  collection: {
    enabled: boolean;
    models: {
      modelId: string;
      modelSha256: string;
      jsSha256: string;
      wasmSha256: string;
    }[];
  } = { enabled: false, models: [] },
): Plugin {
  return {
    name: "shogi-runtime-identity",
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId)
        return `export const assetPrefix = ${JSON.stringify(manifest ? "/model/" : "/__core-prototype/")}; export const releaseManifest = ${JSON.stringify(manifest)}; export const releaseControllerEnabled = ${JSON.stringify(controllerEnabled)}; export const releaseModels = ${JSON.stringify(models.map(({ manifest, label, generation }) => ({ manifest, label, generation })))}; export const collectionPolicy = ${JSON.stringify(collection)};`;
    },
  };
}
export async function releaseBuild() {
  const override = process.env.OPENSHOGI_RELEASE_CONFIG;
  const path = override
    ? resolve(aiRoot, override)
    : resolve(uiRoot, "release-model.json");
  if (
    override &&
    (!path.startsWith(aiRoot + sep) ||
      !(await realpath(path)).startsWith((await realpath(aiRoot)) + sep))
  )
    throw new Error("Local release selection must stay inside AI checkout");
  const bytes = await readFile(path);
  if (bytes.length > 65536) throw new Error("Release configuration too large");
  const value = JSON.parse(bytes.toString());
  const allowlist =
    value.schema === "open_shogi_release_selection/v1"
      ? {
          default: "release",
          models: [
            {
              selection: "release" as const,
              label: value.model?.id ?? "OSAI",
              generation: 0,
              provenance: null,
              config: parseReleaseSelection(value),
            },
          ],
        }
      : parseReleaseAllowlist(value);
  const models = [];
  for (const entry of allowlist.models) {
    const { config } = entry;
    if (entry.provenance) {
      const bytes = await readRegisteredFile(
        aiRoot,
        entry.provenance.path,
        65536,
      );
      if (digest(bytes) !== entry.provenance.sha256)
        throw new Error("Release provenance hash mismatch");
      const rights = JSON.parse(bytes.toString());
      if (
        rights.schema !== "open_shogi_model_distribution/v1" ||
        rights.modelSha256 !== config.artifacts["leaf.osaval03"].sha256 ||
        rights.trainingAllowed !== true ||
        rights.derivedWeightsAllowed !== true ||
        !Array.isArray(rights.sources) ||
        !rights.sources.length ||
        rights.sources.some((s: unknown) => typeof s !== "string" || !s.length)
      )
        throw new Error("Model distribution conditions are not verified");
    }
    const result = await loadModelConfiguration(
      aiRoot,
      config,
      entry.selection,
      "/model/",
    );
    // Use the selected, hash-verified runtime to reject incompatible models before emitting.
    const module = await import(
      `data:text/javascript;base64,${result.buffers["engine.js"]!.toString("base64")}#wasm=${config.artifacts["engine.wasm"].sha256}`
    );
    await module.default({ module_or_path: result.buffers["engine.wasm"] });
    const engine = new module.WasmBrowserEngine();
    try {
      const identity = JSON.parse(
        engine.loadModel(
          result.buffers["leaf.osaval03"],
          config.artifacts["leaf.osaval03"].sha256,
        ),
      );
      if (
        identity.modelFormat !== config.format ||
        identity.artifactSha256 !== config.artifacts["leaf.osaval03"].sha256 ||
        identity.expectedHashVerified !== true ||
        identity.buildClass !== "pure-only" ||
        identity.evaluationMode !== "pure-value"
      )
        throw new Error("Release runtime identity mismatch");
      if (result.buffers["controller.json"])
        engine.loadComputeModel(
          result.buffers["controller.json"],
          config.artifacts["controller.json"]!.sha256,
        );
      engine.setComputeEnabled(config.controllerEnabled);
    } finally {
      engine.free();
    }
    models.push({
      ...result,
      config,
      label: entry.label,
      generation: entry.generation,
    });
  }
  return {
    ...models.find((m) => m.manifest.selection === allowlist.default)!,
    models,
  };
}
export function emitRelease(
  model: Awaited<ReturnType<typeof releaseBuild>>,
): Plugin {
  return {
    name: "allowlisted-shogi-models",
    configResolved(config) {
      if (
        !config.isProduction ||
        config.build.sourcemap ||
        config.build.copyPublicDir ||
        resolve(config.root, config.build.outDir) !== resolve(uiRoot, "dist")
      )
        throw new Error(
          "Allowlisted production requires production mode, dist output, no source maps and explicit public assets",
        );
    },
    async buildStart() {
      const emitStatic = (name: string, source: Buffer) =>
        this.emitFile({ type: "asset", fileName: name, source });
      // Vite copies public verbatim. Permit only the existing static UI assets.
      async function check(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = resolve(directory, entry.name);
          if (entry.name === ".DS_Store") continue;
          if (entry.isSymbolicLink())
            throw new Error("Public symlinks are not allowed");
          if (entry.isDirectory()) {
            await check(path);
            continue;
          }
          const local = relative(resolve(uiRoot, "public"), path).replaceAll(
            "\\",
            "/",
          );
          if (
            !(
              [
                "favicon.svg",
                "ogp.png",
                "icon-16.png",
                "icon-32.png",
                "icon-180.png",
                // Search Console ownership verification; exact file only, so
                // no formatter or future edit can smuggle in other HTML.
                "google1d3d66820bd4068b.html",
              ].includes(local) ||
              local === "_headers" ||
              /^pieces\/[a-zA-Z0-9_/-]+\.(svg|png)$/.test(local) ||
              /^licenses\/[a-zA-Z0-9_.-]+\.md$/.test(local)
            )
          )
            throw new Error(`Unregistered public asset: ${local}`);
          emitStatic(local, await readFile(path));
        }
      }
      await check(resolve(uiRoot, "public"));
    },
    generateBundle() {
      const emitted = new Set<string>();
      for (const selected of model.models) {
        for (const name of MODEL_NAMES) {
          const source = selected.buffers[name];
          const asset = selected.manifest.artifacts[name];
          if (source && asset && !emitted.has(asset.url)) {
            emitted.add(asset.url);
            this.emitFile({
              type: "asset",
              fileName: asset.url.slice(1),
              // Static gzip avoids relying on the CDN's binary MIME compression list.
              source: name === "leaf.osaval03" ? gzipSync(source) : source,
            });
          }
        }
      }
      this.emitFile({
        type: "asset",
        fileName: "model/manifest.json",
        source: JSON.stringify({
          schema: "open_shogi_release_assets/v1",
          default: model.manifest.selection,
          models: model.models.map((m) => ({
            ...m.manifest,
            label: m.label,
            generation: m.generation,
            runtimeProfile: m.config.runtimeProfile,
            controllerEnabled: m.config.controllerEnabled,
          })),
        }),
      });
    },
  };
}
