import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateCommit = "5451e02d35abc3efc1fcc29260cdb89acad1d416";
const requiredProvenance = [
  privateCommit,
  "21bf0c1fbe02250855b66a96f2fe37bd042650d4",
  "aa3eec7afc3bc9dff5a330eb6c3b3a1ee503baa703073281a906bb3753c01731",
  "OpenShogiAI-private-pre-split.bundle",
  "60504e4fe09686f61f3184008c759a2c0ba43182f4538e67bf170b4717715730",
  "2026-08-21",
  "git archive",
  "does not inherit the private repository's Git history",
];
const expectedBindings = new Map([
  [
    "open_shogi_wasm.d.ts",
    "be1db38df5cca0a4c55418b1e35bb8107c2a5d2e2a4e834c0ebad270878f7b7a",
  ],
  [
    "open_shogi_wasm.js",
    "165ee2cc0a034216d919baa9f0230ba312f837ce223dd1af71a8739e59dd3d4f",
  ],
  [
    "open_shogi_wasm_bg.wasm",
    "7d3f7f06e0309978eb0f7aa9107721384e14062b724ca00fcee9c626ee8a1caf",
  ],
  [
    "open_shogi_wasm_bg.wasm.d.ts",
    "3c17285e297fbc61c9e3ad306270ecf7361a5f2032582b56a8524b91877d85c8",
  ],
]);
const failures = [];
const provenance = readFileSync(join(root, "PROVENANCE.md"), "utf8");
const normalizedProvenance = provenance.replaceAll(/\s+/gu, " ");

for (const required of requiredProvenance) {
  if (!normalizedProvenance.includes(required)) {
    failures.push(`PROVENANCE.md is missing required evidence: ${required}`);
  }
}

for (const [name, expected] of expectedBindings) {
  const bytes = readFileSync(join(root, "src/generated", name));
  const observed = createHash("sha256").update(bytes).digest("hex");
  if (observed !== expected) {
    failures.push(`binding provenance mismatch for ${name}: ${observed}`);
  }
}

const privateObject = spawnSync(
  "git",
  ["cat-file", "-e", `${privateCommit}^{commit}`],
  { cwd: root, stdio: "ignore" },
);
if (privateObject.status === 0) {
  failures.push(
    "private source commit is present in the clean candidate object database",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log("UI provenance check passed");
}
