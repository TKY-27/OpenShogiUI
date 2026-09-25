// Deploy entry for the Cloudflare Workers Build. Runs only the reviewed
// generated configuration. Refuses to deploy when the build was missing the
// required D1 database ID (an empty or fabricated production binding must
// never be sent), but allows an intentional collection stop: a config built
// with OSAI_COLLECTION_MODE=off still carries its D1 binding and cleanup
// cron and deploys with acceptance disabled.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = resolve(root, "wrangler.deploy.jsonc");
if (!existsSync(configPath)) {
  console.error(
    [
      "wrangler.deploy.jsonc not found.",
      "Run `npm run build:cloudflare` first (the Cloudflare Build command does this).",
    ].join("\n"),
  );
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const hasDatabase =
  Array.isArray(config.d1_databases) && config.d1_databases.length > 0;
const explicitOff = config.vars?.COLLECTION_MODE === "off";
const collectionOff = config.vars?.COLLECTION_ENABLED === "false";
if (!hasDatabase && !explicitOff) {
  console.error(
    [
      "Refusing to deploy: the generated configuration has no D1 database",
      "because OSAI_D1_DATABASE_ID was not set at build time.",
      "1. Create the D1 database (see docs/deploy-cloudflare.md) and copy its ID.",
      "2. Add OSAI_D1_DATABASE_ID as a Build variable in the Worker's settings.",
      "3. Retry the build and deploy.",
      "To intentionally deploy a playing-only site without a database, set the",
      "Build variable OSAI_COLLECTION_MODE=off and rebuild.",
    ].join("\n"),
  );
  process.exit(1);
}
if (collectionOff) {
  console.warn(
    [
      hasDatabase
        ? explicitOff
          ? "Deploying with collection intentionally OFF (OSAI_COLLECTION_MODE=off):"
          : "Deploying with COLLECTION_ENABLED=false while a D1 binding exists;"
        : "Deploying with collection OFF and no D1 database:",
      "the Worker refuses /api/games submissions; the client build shows no",
      hasDatabase
        ? "consent dialog. The D1 binding and retention cleanup cron stay active."
        : "consent dialog and no cleanup cron exists.",
    ].join("\n"),
  );
}
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["wrangler", "deploy", "-c", "wrangler.deploy.jsonc"],
  { stdio: "inherit", cwd: root },
);
