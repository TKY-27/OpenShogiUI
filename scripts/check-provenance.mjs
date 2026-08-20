import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateCommit = "5451e02d35abc3efc1fcc29260cdb89acad1d416";
const analysisProtocolCommit = "1232d015a6b2c3df9abf366137bded245bd14a93";
const requiredProvenance = [
  privateCommit,
  "21bf0c1fbe02250855b66a96f2fe37bd042650d4",
  "aa3eec7afc3bc9dff5a330eb6c3b3a1ee503baa703073281a906bb3753c01731",
  "OpenShogiAI-private-pre-split.bundle",
  "60504e4fe09686f61f3184008c759a2c0ba43182f4538e67bf170b4717715730",
  "2026-08-21",
  "git archive",
  "does not inherit the private repository's Git history",
  analysisProtocolCommit,
  "open_shogi_analysis/v1",
  "open_shogi_time_control/v1",
];
const expectedBindings = new Map([
  [
    "open_shogi_wasm.d.ts",
    "19f8a5a9f786666d2a736daff7cedae9fa9c77a55f6e6ed85950882e0e07eee9",
  ],
  [
    "open_shogi_wasm.js",
    "b0862ea56ee808c2feabe2ab67128d317fdbb824856b47fe6fabd5dbfac40d88",
  ],
  [
    "open_shogi_wasm_bg.wasm",
    "49034d4d1cff1e004eceaf1e62b309d9882516e039457c09a758904217fd3805",
  ],
  [
    "open_shogi_wasm_bg.wasm.d.ts",
    "25de209ae4d389487b6b7db0ae895e935fdd84fa62a9bad0dbadf08ec7c910cd",
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
