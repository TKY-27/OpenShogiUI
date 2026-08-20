import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedIdentifier = "AGPL-3.0-only";
const expectedLicenseSha256 =
  "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0";
const failures = [];

const license = readFileSync(join(root, "LICENSE"));
const licenseSha256 = createHash("sha256").update(license).digest("hex");
if (licenseSha256 !== expectedLicenseSha256) {
  failures.push(
    `LICENSE SHA-256 must be ${expectedLicenseSha256}, found ${licenseSha256}`,
  );
}

const packageMetadata = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
if (packageMetadata.license !== expectedIdentifier) {
  failures.push("package.json license must be AGPL-3.0-only");
}

for (const relative of [
  "README.md",
  "LICENSE_SCOPE.md",
  "src/localization.ts",
]) {
  const text = readFileSync(join(root, relative), "utf8");
  if (!text.includes(expectedIdentifier)) {
    failures.push(`${relative} does not identify the project license`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log("UI license scope check passed");
}
