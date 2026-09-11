import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "model/manifest.json"), "utf8"),
);
if (
  manifest.schema !== "open_shogi_core_prototype_assets/v2" ||
  manifest.selection !== "release" ||
  manifest.runtimeProfile !== "pure_learned-v3"
)
  throw new Error("Missing single release model manifest");
const expected = new Map();
for (const [name, asset] of Object.entries(manifest.artifacts)) {
  if (asset === null) continue;
  if (
    !["engine.js", "engine.wasm", "leaf.osaval03", "controller.json"].includes(
      name,
    )
  )
    throw new Error("Unexpected model component");
  const path = `model/release/${name}`;
  if (asset.url !== `/${path}?sha256=${asset.sha256}`)
    throw new Error("Unbound release URL");
  expected.set(path, asset);
}
if (
  !expected.has("model/release/leaf.osaval03") ||
  !expected.has("model/release/engine.wasm")
)
  throw new Error("Incomplete release model");
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
        "r3候補",
        "旧基準 (W256)",
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
      for (const hash of [frozen, r3])
        if (
          hash !== manifest.artifacts["leaf.osaval03"].sha256 &&
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
  `Single model verified: ${manifest.runId}; ${observed.length} components, no comparison models/routes/source maps`,
);
