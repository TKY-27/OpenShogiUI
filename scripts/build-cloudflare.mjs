// Production build entry for the Cloudflare Workers deployment.
//
// Pipeline:
//   1. Fetch the fixed release-model artifacts (GitHub release or local
//      mirror via OPENSHOGI_ASSET_MIRROR) with sha256 verification.
//   2. Run the normal production build with the isolated model mirror and
//      the opt-in collection profile enabled.
//   3. Generate wrangler.deploy.jsonc (account-specific, gitignored) from
//      build variables:
//        OSAI_D1_DATABASE_ID  D1 database ID of "openshogiai-games"
//        PUBLIC_SITE_URL      public origin, e.g. https://openshogiai.<subdomain>.workers.dev
//
// A missing D1 ID or public URL does not stop the local preparation build;
// the deploy step refuses to run without the D1 ID and explains where to
// set it. Cloudflare never interprets these variable names itself — only
// this script reads them.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const d1Id = process.env.OSAI_D1_DATABASE_ID?.trim() || null;
const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim() || null;
const workerName = "openshogiai";
const d1Binding = "DB";
const d1DatabaseName = "openshogiai-games";
// Daily retention cleanup, off-peak Japan time (03:17 UTC = 12:17 JST).
const cleanupCron = "17 3 * * *";

if (publicSiteUrl) {
  const parsed = new URL(publicSiteUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error(
      `PUBLIC_SITE_URL must be a plain HTTPS origin: ${publicSiteUrl}`,
    );
} else {
  console.warn(
    "warning: PUBLIC_SITE_URL is not set; building without canonical/OGP URL (noindex).",
  );
}

execFileSync(
  process.execPath,
  [resolve(root, "scripts/fetch-release-models.mjs")],
  { stdio: "inherit", cwd: root },
);

const buildEnv = {
  ...process.env,
  NODE_ENV: "production",
  OSUI_ISOLATED_MODELS: "1",
  OSUI_COLLECTION_PROFILE: "on",
  ...(publicSiteUrl ? { OSUI_SITE_ORIGIN: publicSiteUrl } : {}),
};
execFileSync("npm", ["run", "build"], {
  stdio: "inherit",
  cwd: root,
  env: buildEnv,
});

// The Worker refuses to accept submissions unless the deployed notice version
// matches the client consent version; read it from the schema source of truth.
const schema = readFileSync(resolve(root, "src/collection-schema.ts"), "utf8");
const consentVersion = /^export const CONSENT_VERSION = "([^"]+)";$/m.exec(
  schema,
)?.[1];
if (!consentVersion)
  throw new Error("Cannot read CONSENT_VERSION from src/collection-schema.ts");

const operator = JSON.parse(
  readFileSync(resolve(root, "project.config.json"), "utf8"),
).operator;
const contact = `${operator.contactLabel} ${operator.contactUrl}`;

const allowlist = JSON.parse(
  readFileSync(resolve(root, "release-model.json"), "utf8"),
);
const collectionModels = allowlist.models
  .filter(
    (entry) =>
      entry.selection === "r4c4" &&
      /^r4-c4[-a-zA-Z0-9._]{0,90}$/.test(entry.model.id),
  )
  .map((entry) => ({
    modelId: entry.model.id,
    modelSha256: entry.model.artifacts["leaf.osaval03"].sha256,
    jsSha256: entry.model.artifacts["engine.js"].sha256,
    wasmSha256: entry.model.artifacts["engine.wasm"].sha256,
  }));
if (!collectionModels.length)
  throw new Error("No collection-eligible model in the release allowlist");

const collectionEnabled = Boolean(d1Id);
const deployConfig = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: workerName,
  main: "worker/index.ts",
  compatibility_date: "2026-09-01",
  workers_dev: true,
  preview_urls: false,
  assets: {
    directory: "./dist",
    run_worker_first: ["/api/*"],
    not_found_handling: "none",
  },
  observability: { enabled: false },
  vars: {
    COLLECTION_ENABLED: collectionEnabled ? "true" : "false",
    COLLECTION_ALLOWLIST: collectionEnabled
      ? JSON.stringify(collectionModels)
      : "[]",
    COLLECTION_NOTICE_VERSION: consentVersion,
    COLLECTION_CONTACT: collectionEnabled ? contact : "",
  },
  ...(collectionEnabled
    ? {
        triggers: { crons: [cleanupCron] },
        d1_databases: [
          {
            binding: d1Binding,
            database_name: d1DatabaseName,
            database_id: d1Id,
            migrations_dir: "worker/migrations",
          },
        ],
      }
    : {}),
};

const destination = resolve(root, "wrangler.deploy.jsonc");
writeFileSync(destination, JSON.stringify(deployConfig, null, 2) + "\n");
JSON.parse(readFileSync(destination, "utf8"));
if (!collectionEnabled) {
  console.warn(
    [
      "warning: OSAI_D1_DATABASE_ID is not set.",
      "The site deploys and plays normally, but game collection stays OFF",
      "(COLLECTION_ENABLED=false, no D1 binding, no cleanup cron).",
      "Create the D1 database, set OSAI_D1_DATABASE_ID as a Cloudflare Build",
      "variable, and rebuild to enable collection. See docs/deploy-cloudflare.md.",
    ].join("\n"),
  );
}
console.log(
  `generated ${destination} (worker ${workerName}, collection ${collectionEnabled ? "ON" : "OFF"})`,
);
