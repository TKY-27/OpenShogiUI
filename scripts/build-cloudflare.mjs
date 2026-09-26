// Production build entry for the Cloudflare Workers deployment.
//
// Pipeline:
//   1. Fetch the fixed release-model artifacts (GitHub release or local
//      mirror via OPENSHOGI_ASSET_MIRROR) with sha256 verification.
//   2. Run the normal production build with the isolated model mirror and
//      the opt-in collection profile enabled. The isolated mirror
//      (OSUI_ISOLATED_MODELS) is only about asset sourcing; search
//      visibility is decided by PUBLIC_SITE_URL/OSUI_SITE_ORIGIN alone, so
//      the public build is indexable while loopback QA stays noindex. The
//      operator-approved Cloudflare Web Analytics beacon (OSUI_WEB_ANALYTICS)
//      is injected in this build only.
//   3. Generate wrangler.deploy.jsonc (account-specific, gitignored) from
//      build variables:
//        OSAI_D1_DATABASE_ID  D1 database ID of "openshogiai-games"
//        PUBLIC_SITE_URL      public origin, e.g. https://openshogiai.<subdomain>.workers.dev
//        OSAI_COLLECTION_MODE optional collection switch: "auto" (default),
//                             "on", "off".
//
// The switch separates an intentional acceptance stop from a missing required
// setting. "auto" keeps the first-deploy default: collection is ON exactly
// when the D1 ID is set. "on" fails the build without the D1 ID (typo guard).
// "off" deploys a playing-only site: COLLECTION_ENABLED=false and the client
// profile is disabled (no consent dialog, no POST), but with a D1 ID present
// the database binding and the retention cleanup cron stay so already
// accepted rows still expire on schedule. A rebuild never flips an explicit
// "off" back on; the mode is a Cloudflare Build variable, so changing it is
// the documented operator action.
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
const collectionMode = process.env.OSAI_COLLECTION_MODE?.trim() || "auto";
if (!["auto", "on", "off"].includes(collectionMode))
  throw new Error(
    `OSAI_COLLECTION_MODE must be "auto", "on" or "off" (got ${JSON.stringify(collectionMode)})`,
  );
if (collectionMode === "on" && !d1Id)
  throw new Error(
    "OSAI_COLLECTION_MODE=on requires OSAI_D1_DATABASE_ID to be set",
  );
const collectionEnabled = Boolean(d1Id) && collectionMode !== "off";
const keepDatabase = Boolean(d1Id);
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
  // The operator-approved Cloudflare Web Analytics beacon ships with the
  // public build only; plain/local/CI builds never inject it.
  OSUI_WEB_ANALYTICS: "1",
  ...(collectionEnabled ? { OSUI_COLLECTION_PROFILE: "on" } : {}),
  ...(publicSiteUrl ? { OSUI_SITE_ORIGIN: publicSiteUrl } : {}),
};
execFileSync("npm", ["run", "build"], {
  stdio: "inherit",
  cwd: root,
  env: buildEnv,
});

// Verify what the deploy would actually serve: the first-HTTP HTML must be
// search-indexable exactly when a public origin is set, carry the analytics
// beacon exactly once, and ship the Search Console verification file byte for
// byte. JavaScript never removes robots directives after the fact.
{
  const html = readFileSync(resolve(root, "dist/index.html"), "utf8");
  if (publicSiteUrl) {
    const canonical = new RegExp(
      `<link rel="canonical" href="${publicSiteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/">`,
    );
    if (!canonical.test(html))
      throw new Error("dist/index.html is missing the public canonical URL");
    if (html.includes("noindex"))
      throw new Error(
        "dist/index.html claims noindex despite a public origin (check OSUI_LOCAL_SITE/OSUI_SITE_ORIGIN)",
      );
  } else if (!html.includes("noindex")) {
    throw new Error("dist/index.html without a public origin must be noindex");
  }
  const beacons = html.split("cloudflareinsights.com/beacon.min.js").length - 1;
  if (beacons !== 1)
    throw new Error(
      `dist/index.html must contain the analytics beacon exactly once (found ${beacons})`,
    );
  const verification = readFileSync(
    resolve(root, "dist/google1d3d66820bd4068b.html"),
  );
  if (
    !verification.equals(
      readFileSync(resolve(root, "public/google1d3d66820bd4068b.html")),
    )
  )
    throw new Error("dist verification file differs from public source");
}

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
    // Serve stored .html paths (the Search Console verification file) with a
    // direct 200 instead of the default extension-less redirect, while "/"
    // and unknown paths fall back to the SPA document.
    html_handling: "none",
    not_found_handling: "single-page-application",
  },
  observability: { enabled: false },
  vars: {
    COLLECTION_ENABLED: collectionEnabled ? "true" : "false",
    // The operator-requested mode ("auto"/"on"/"off"), read by
    // deploy-cloudflare.mjs to distinguish an intentional stop from a missing
    // D1 ID. The Worker itself ignores it.
    COLLECTION_MODE: collectionMode,
    COLLECTION_ALLOWLIST: keepDatabase
      ? JSON.stringify(collectionModels)
      : "[]",
    COLLECTION_NOTICE_VERSION: consentVersion,
    COLLECTION_CONTACT: keepDatabase ? contact : "",
  },
  ...(keepDatabase
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
if (!keepDatabase && collectionMode !== "off") {
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
if (keepDatabase && !collectionEnabled) {
  console.warn(
    [
      "collection is intentionally OFF (OSAI_COLLECTION_MODE=off).",
      "The client build has no consent dialog and sends no POST; the Worker",
      "refuses submissions, and the D1 binding plus the retention cleanup",
      "cron are kept so accepted rows still expire. Rebuild with",
      "OSAI_COLLECTION_MODE=auto or on to resume collection.",
    ].join("\n"),
  );
}
console.log(
  `generated ${destination} (worker ${workerName}, collection ${collectionEnabled ? "ON" : `OFF (mode ${collectionMode})`})`,
);
