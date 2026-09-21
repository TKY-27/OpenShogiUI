import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateCommit = "5451e02d35abc3efc1fcc29260cdb89acad1d416";
const analysisProtocolCommit = "1232d015a6b2c3df9abf366137bded245bd14a93";
const requiredProvenance = [
  "ea7dc1376a30ead0b9571fbe640e24f513198f4c",
  "42e38eef28395aa2935382795c46fc440701c7fb",
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
    "8b899de7246585f5c7ccafe0b5b2dde012eec0af12a8032d5d4e5741be9cf063",
  ],
  [
    "open_shogi_wasm.js",
    "8d36745850bb91e90f93436a9c40d833686cca6c1232ab2c7c9346a59e109023",
  ],
  [
    "open_shogi_wasm_bg.wasm",
    "4e68daf2b9fb2505b25755242b9c9fd2c82f26724cff156f4a61c06b7330ca8a",
  ],
  [
    "open_shogi_wasm_bg.wasm.d.ts",
    "efb20b72f02808e77a8baed92fc80fa2f3e1c9b8ce0709f2cd49ed7259933068",
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
