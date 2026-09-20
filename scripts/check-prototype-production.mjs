import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "model/manifest.json"), "utf8"),
);
if (
  manifest.schema !== "open_shogi_release_assets/v1" ||
  !Array.isArray(manifest.models) ||
  !manifest.models.length ||
  manifest.models.length > 8 ||
  !manifest.models.some((m) => m.selection === manifest.default)
)
  throw new Error("Missing explicit release allowlist");
const expected = new Map();
const selections = new Set();
for (const model of manifest.models) {
  if (
    selections.has(model.selection) ||
    !["release", "baseline", "candidate", "defense", "r4c1", "r4c2"].includes(
      model.selection,
    ) ||
    model.schema !== "open_shogi_core_prototype_assets/v2" ||
    model.runtimeProfile !== "pure_learned-v3"
  )
    throw new Error("Invalid allowlisted model identity");
  selections.add(model.selection);
  for (const [name, asset] of Object.entries(model.artifacts)) {
    if (asset === null) continue;
    if (
      ![
        "engine.js",
        "engine.wasm",
        "leaf.osaval03",
        "controller.json",
      ].includes(name)
    )
      throw new Error("Unexpected model component");
    const path = `model/${model.selection}/${name}`;
    if (asset.url !== `/${path}?sha256=${asset.sha256}`)
      throw new Error("Unbound release URL");
    expected.set(path, asset);
  }
  for (const name of ["engine.js", "engine.wasm", "leaf.osaval03"])
    if (!expected.has(`model/${model.selection}/${name}`))
      throw new Error("Incomplete release model");
}
const observed = [];
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlink in production output");
    if (entry.isDirectory()) {
      inspect(path);
      continue;
    }
    const local = relative(root, path).replaceAll("\\", "/");
    const bytes = readFileSync(path);
    if (/\.(?:map|pt|pth|ckpt|onnx|safetensors|nnue|jsonl)$/u.test(local))
      throw new Error(`Private or source-map artifact emitted: ${local}`);
    if (expected.has(local)) {
      const asset = expected.get(local);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (sha !== asset.sha256 || bytes.length !== asset.size)
        throw new Error(`Release bytes mismatch: ${local}`);
      observed.push(local);
    } else if (
      /\.(?:wasm|osaval03)$/u.test(local) ||
      (local.startsWith("model/") && local !== "model/manifest.json")
    )
      throw new Error(`Unregistered model/runtime emitted: ${local}`);
    if (/\.(js|css|json|html)$/u.test(local)) {
      const content = bytes.toString("utf8");
      for (const marker of [
        "/__core-prototype/",
        "#/core-prototype",
        "open-shogi-core-prototype-selection",
        "serviceWorker.register",
        "precacheAndRoute",
      ])
        if (content.includes(marker))
          throw new Error(
            `Development/comparison code emitted: ${local}: ${marker}`,
          );
      const frozen =
        "859e922b3f503ddeecf0afeb9a05fccac080a9faca3b19fce9d8253c9039c480";
      const r3 =
        "cd07f2a202f6e781afcb6a8af3c7a198c4203373e4505fe089f8c7f05eefd983";
      const defense =
        "8c1c875038b74dc475c356d50c635c2e22dcab7aaa201d7d9aea7188e668b35a";
      const c1 =
        "6b49c3361194011c0c8ac114491dcdb6c67a3b4f4cc6c17262a867572aefb3a6";
      for (const hash of [frozen, r3, defense, c1])
        if (
          !manifest.models.some(
            (m) => m.artifacts["leaf.osaval03"].sha256 === hash,
          ) &&
          content.includes(hash)
        )
          throw new Error(`Unselected model identity emitted: ${local}`);
    }
  }
}
inspect(root);
if (observed.length !== expected.size)
  throw new Error("Missing selected model components");
console.log(
  `Allowlist verified: ${manifest.models.length} models; ${observed.length} components, no unregistered weights/data/source maps`,
);
