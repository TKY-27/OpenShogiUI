// Fetches the fixed release-model allowlist artifacts into local/model-assets/,
// mirroring the OpenShogiAI repository-relative paths so the release build can
// verify and bundle them without a sibling AI checkout. Every byte is checked
// against the sha256 pinned in release-model.json before it is accepted.
//
// Sources, in order:
//   1. OPENSHOGI_ASSET_MIRROR: a local directory or base URL with the same
//      asset names (pre-publication mirror, e.g. an assembled
//      OpenShogiAI/local/release/models-v1 staging directory).
//   2. The fixed GitHub release download URL recorded in release-assets.json.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mirrorRoot = resolve(root, "local/model-assets");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const [allowlist, assetMap] = await Promise.all([
  readFile(resolve(root, "release-model.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "release-assets.json"), "utf8").then(JSON.parse),
]);
if (
  allowlist.schema !== "open_shogi_release_allowlist/v1" ||
  assetMap.schema !== "open_shogi_release_asset_map/v1" ||
  !Array.isArray(allowlist.models) ||
  !allowlist.models.length
)
  throw new Error("Invalid release allowlist or asset map");

const mirror = process.env.OPENSHOGI_ASSET_MIRROR ?? null;
const mirrorIsDirectory = async (value) => {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
};

async function fetchBytes(assetName) {
  if (mirror) {
    if (await mirrorIsDirectory(mirror)) {
      const path = resolve(mirror, assetName);
      if (!path.startsWith(resolve(mirror) + "/"))
        throw new Error(`Mirror asset escapes mirror: ${assetName}`);
      return { bytes: await readFile(path), source: path };
    }
    const url = `${mirror.replace(/\/$/, "")}/${assetName}`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(
        `Mirror fetch failed (${response.status}) for ${assetName}`,
      );
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      source: url,
    };
  }
  const url = `${assetMap.download_base}/${assetName}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok)
    throw new Error(
      `Asset fetch failed (${response.status}) for ${assetName} — the GitHub release may not be public yet; set ${assetMap.mirror_env} to a local mirror`,
    );
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    source: url,
  };
}

const wanted = new Map();
for (const entry of allowlist.models) {
  for (const [name, artifact] of Object.entries(entry.model.artifacts)) {
    if (artifact)
      wanted.set(artifact.sha256, { path: artifact.path, name, bytes: null });
  }
  const provenance = entry.provenance;
  if (provenance) {
    const spec = assetMap.assets[provenance.sha256];
    if (!spec)
      throw new Error(`Provenance asset missing from map: ${provenance.path}`);
    wanted.set(provenance.sha256, {
      path: provenance.path,
      name: spec.name,
      bytes: spec.bytes,
    });
  }
}
for (const [sha256, spec] of wanted) {
  const mapEntry = assetMap.assets[sha256];
  if (!mapEntry)
    throw new Error(`Artifact missing from asset map: ${spec.path}`);
  if (spec.bytes !== null && spec.bytes !== mapEntry.bytes)
    throw new Error(`Asset map size mismatch: ${spec.path}`);
}

let fetched = 0;
let reused = 0;
const engineAliases = new Map();
for (const [sha256, spec] of wanted) {
  const destination = resolve(mirrorRoot, spec.path);
  if (!destination.startsWith(mirrorRoot + "/"))
    throw new Error(`Artifact path escapes mirror: ${spec.path}`);
  // The loopback development middleware serves the engine runtime from
  // target/pure/bindings; mirror the fetched engine bytes there as well so a
  // pure release mirror also supports `npm run dev:isolated`.
  if (spec.path.endsWith("/runtime/open_shogi_wasm.js"))
    engineAliases.set(sha256, "target/pure/bindings/open_shogi_wasm.js");
  if (spec.path.endsWith("/runtime/open_shogi_wasm_bg.wasm"))
    engineAliases.set(sha256, "target/pure/bindings/open_shogi_wasm_bg.wasm");
  const existing = await readFile(destination).then(
    (bytes) => bytes,
    () => null,
  );
  if (existing && digest(existing) === sha256) {
    reused++;
    continue;
  }
  const mapEntry = assetMap.assets[sha256];
  const { bytes, source } = await fetchBytes(mapEntry.name);
  if (bytes.length !== mapEntry.bytes || digest(bytes) !== sha256)
    throw new Error(
      `Hash or size mismatch for ${mapEntry.name} from ${source}: expected ${sha256}/${mapEntry.bytes}`,
    );
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { mode: 0o644 });
  fetched++;
}
for (const [sha256, alias] of engineAliases) {
  const source = resolve(mirrorRoot, wanted.get(sha256).path);
  const destination = resolve(mirrorRoot, alias);
  if (!destination.startsWith(mirrorRoot + "/"))
    throw new Error(`Engine alias escapes mirror: ${alias}`);
  const existing = await readFile(destination).then(
    (bytes) => bytes,
    () => null,
  );
  if (existing && digest(existing) === sha256) continue;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await readFile(source), { mode: 0o644 });
}
console.log(
  `release models ready: ${reused} reused, ${fetched} fetched into local/model-assets (${wanted.size} artifacts)`,
);
