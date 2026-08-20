import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provenancePath = join(root, "ASSET_PROVENANCE.json");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const failures = [];
const requiredCommit = "acb3b12286dd41bc88edfa81172e6a5e7f68c52b";
const requiredIds = [
  "1kanji_3d",
  "intl_colored_3d",
  "intl_colored_2d",
  "intl_monochrome_2d",
  "intl_shadowed",
  "intl_wooden_3d",
  "international",
  "kanji_guide_shadowed",
  "intl_portella",
  "simple_kanji",
  "kanji_red_wood",
  "kanji_light",
  "kanji_brown",
];
const prohibitedNames = new Set([
  "2kanji_3d",
  "orangain",
  "shogi_cz",
  "shogi_bnw",
  "ryoko_1kanji",
  "logy_games",
  "vald_opt",
  "valdivia",
  "western",
  "engraved_cz",
  "portella",
  "portella_2kanji",
  "dobutsu",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message) {
  failures.push(message);
}

function filesBelow(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      fail(
        `symlink is not allowed in piece assets: ${relative(root, absolute)}`,
      );
    } else if (stat.isDirectory()) {
      files.push(...filesBelow(absolute));
    } else if (stat.isFile()) {
      files.push(absolute);
    } else {
      fail(
        `unsupported filesystem entry in piece assets: ${relative(root, absolute)}`,
      );
    }
  }
  return files;
}

if (provenance.schema !== "open-shogi-ui/third-party-piece-assets/v1") {
  fail("ASSET_PROVENANCE.json has an unsupported schema");
}
if (provenance.acquiredAt !== "2026-08-21") {
  fail("asset acquisition date must remain 2026-08-21");
}
if (
  provenance.source?.repository !== "https://github.com/WandererXII/lishogi"
) {
  fail("assets must come from the official WandererXII/lishogi repository");
}
if (provenance.source?.commit !== requiredCommit) {
  fail(`source commit must remain ${requiredCommit}`);
}

const evidencePath = join(root, provenance.licenseEvidence?.path ?? "");
if (!evidencePath.startsWith(root) || !lstatSync(evidencePath).isFile()) {
  fail("retained COPYING.md evidence is missing");
} else {
  const evidenceHash = sha256(readFileSync(evidencePath));
  if (evidenceHash !== provenance.licenseEvidence.sha256) {
    fail(`COPYING.md evidence hash mismatch: ${evidenceHash}`);
  }
  if (provenance.licenseEvidence.preservedByteForByte !== true) {
    fail("COPYING.md evidence must be preserved byte-for-byte");
  }
}

const assets = provenance.assets;
if (!Array.isArray(assets) || assets.length !== requiredIds.length) {
  fail(`provenance must contain exactly ${requiredIds.length} retained sets`);
}
const actualIds = Array.isArray(assets) ? assets.map((entry) => entry.id) : [];
if (actualIds.join("\n") !== requiredIds.join("\n")) {
  fail("retained set order or IDs do not match the audited CC BY 4.0 set list");
}

const expectedFiles = new Set();
for (const entry of assets ?? []) {
  if (entry.license !== "CC BY 4.0" || entry.spdxLicenseId !== "CC-BY-4.0") {
    fail(`${entry.id} is not marked CC BY 4.0 in the provenance manifest`);
  }
  if (
    entry.sourceCommit !== requiredCommit ||
    entry.modification?.modified !== false
  ) {
    fail(`${entry.id} has incorrect source commit or modification metadata`);
  }
  if (!Array.isArray(entry.files) || entry.files.length !== 30) {
    fail(`${entry.id} must contain exactly 30 standard piece images`);
    continue;
  }
  const expectedSetFiles = new Set();
  for (const file of entry.files) {
    if (
      file.path.includes("/") ||
      file.path.includes("\\") ||
      file.path.includes("..")
    ) {
      fail(`${entry.id} contains an unsafe manifest path: ${file.path}`);
      continue;
    }
    const local = join(root, entry.localPath, file.path);
    const localRelative = relative(root, local);
    expectedFiles.add(localRelative);
    expectedSetFiles.add(file.path);
    if (!lstatSync(local, { throwIfNoEntry: false })?.isFile()) {
      fail(`missing retained image: ${localRelative}`);
      continue;
    }
    const bytes = readFileSync(local);
    const observed = sha256(bytes);
    if (observed !== file.localSha256 || observed !== file.upstreamSha256) {
      fail(`SHA-256 mismatch for ${localRelative}: ${observed}`);
    }
    if (bytes.length !== file.byteLength) {
      fail(`byte length mismatch for ${localRelative}`);
    }
    const extension = file.path
      .slice(file.path.lastIndexOf(".") + 1)
      .toLowerCase();
    if (!new Set(["png", "svg"]).has(extension)) {
      fail(`non-image extension in retained assets: ${localRelative}`);
    }
  }
  const setDirectory = join(root, entry.localPath);
  const actualSetFiles = new Set(
    readdirSync(setDirectory).filter((name) =>
      lstatSync(join(setDirectory, name)).isFile(),
    ),
  );
  for (const file of actualSetFiles) {
    if (!expectedSetFiles.has(file))
      fail(`unmanifested image: ${relative(root, join(setDirectory, file))}`);
  }
  for (const file of expectedSetFiles) {
    if (!actualSetFiles.has(file))
      fail(`manifested image is not present: ${entry.id}/${file}`);
  }
}

const assetRoot = join(root, "public/pieces");
const actualFiles = filesBelow(assetRoot).map((absolute) =>
  relative(root, absolute),
);
for (const file of actualFiles) {
  if (!expectedFiles.has(file))
    fail(`unexpected file under public/pieces: ${file}`);
  if (
    !new Set(["png", "svg"]).has(
      file.slice(file.lastIndexOf(".") + 1).toLowerCase(),
    )
  ) {
    fail(`non-image file under public/pieces: ${file}`);
  }
  if ([...prohibitedNames].some((name) => file.split("/").includes(name))) {
    fail(`prohibited piece set was copied: ${file}`);
  }
}
for (const file of expectedFiles) {
  if (!actualFiles.includes(file)) fail(`manifested file is absent: ${file}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Piece asset audit passed: ${assets.length} sets, ${actualFiles.length} images, CC BY 4.0 only`,
  );
}
