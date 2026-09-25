import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenRoots = new Set([
  ".wrangler",
  ".dev.vars",
  "Cargo.lock",
  "Cargo.toml",
  "artifacts",
  "configs",
  "data",
  "engine",
  "local",
  "pyproject.toml",
  "rust-toolchain.toml",
  "target",
  "training",
  "uv.lock",
  "weights",
]);
const forbiddenSuffixes = new Set([
  ".ckpt",
  ".nnue",
  ".onnx",
  ".pt",
  ".pth",
  ".py",
  ".rs",
  ".safetensors",
  ".toml",
  ".yaml",
  ".yml",
]);
const generatedNames = new Set([
  "open_shogi_wasm.d.ts",
  "open_shogi_wasm.js",
  "open_shogi_wasm_bg.wasm",
  "open_shogi_wasm_bg.wasm.d.ts",
]);
const failures = [];

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const local of files) {
  if (
    forbiddenRoots.has(local.split("/")[0]) ||
    /(^|\/)(?:\.env(?:\.|$)|\.dev\.vars|\.qa-)/.test(local) ||
    // The repo's own CI smoke workflow is the one reviewed .yml exception;
    // every other YAML (training/engine configs) stays out of the UI repo.
    (forbiddenSuffixes.has(extname(local).toLowerCase()) &&
      !/^\.github\/workflows\/[a-z0-9-]+\.yml$/.test(local)) ||
    /\.(?:sqlite3?|db|osaval03|jsonl|pem|key)$/.test(local)
  )
    failures.push(`non-UI source or local artifact: ${local}`);
  if (extname(local) === ".wasm" || local === "scripts/check-boundaries.mjs")
    continue;
  let text;
  try {
    text = readFileSync(join(root, local), "utf8");
  } catch {
    continue;
  }
  const homeMarker = "/" + "Users" + "/";
  const localUriMarker = "file" + "://";
  if (text.includes(homeMarker) || text.includes(localUriMarker))
    failures.push(`machine-local path leaked into versioned text: ${local}`);
}

const generatedDirectory = join(root, "src/generated");
let observedGenerated = new Set();
try {
  observedGenerated = new Set(readdirSync(generatedDirectory));
} catch {
  failures.push("missing generated AI interface directory: src/generated");
}
for (const name of generatedNames) {
  if (!observedGenerated.has(name)) {
    failures.push(`missing generated AI interface: src/generated/${name}`);
  }
}
for (const name of observedGenerated) {
  if (!generatedNames.has(name)) {
    failures.push(
      `unexpected generated AI interface file: src/generated/${name}`,
    );
  }
}

for (const entry of readdirSync(join(root, "src"), { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.match(/\.(?:ts|tsx)$/u)) continue;
  const text = readFileSync(join(root, "src", entry.name), "utf8");
  if (text.includes("./generated/") && entry.name !== "engine.worker.ts") {
    failures.push(
      `generated AI interface imported outside engine.worker.ts: src/${entry.name}`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of [...new Set(failures)].sort()) {
    console.error(`FAIL ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("UI repository boundary check passed");
}
