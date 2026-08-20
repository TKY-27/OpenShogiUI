import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const forbiddenRoots = new Set([
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

for (const name of [...forbiddenRoots].sort()) {
  try {
    statSync(join(root, name));
    failures.push(`forbidden UI-root path: ${name}`);
  } catch {
    // The path is correctly absent.
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    const local = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (forbiddenSuffixes.has(extname(entry.name).toLowerCase())) {
      failures.push(`non-UI source or local artifact: ${local}`);
    }
    if (extname(entry.name).toLowerCase() === ".wasm") continue;
    if (local === "scripts/check-boundaries.mjs") continue;
    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    const homeMarker = "/" + "Users" + "/";
    const localUriMarker = "file" + "://";
    if (text.includes(homeMarker) || text.includes(localUriMarker)) {
      failures.push(`machine-local path leaked into versioned text: ${local}`);
    }
  }
}

walk(root);

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
