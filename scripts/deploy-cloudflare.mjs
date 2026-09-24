// Deploy entry for the Cloudflare Workers Build. Runs only the reviewed
// generated configuration; refuses to deploy without a verified D1 database
// ID so an empty or fabricated production binding is never sent.
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
if (config.vars?.COLLECTION_ENABLED === "false") {
  console.error(
    [
      "Refusing to deploy: the generated configuration has collection disabled",
      "because OSAI_D1_DATABASE_ID was not set at build time.",
      "1. Create the D1 database (see docs/deploy-cloudflare.md) and copy its ID.",
      "2. Add OSAI_D1_DATABASE_ID as a Build variable in the Worker's settings.",
      "3. Retry the build and deploy.",
    ].join("\n"),
  );
  process.exit(1);
}
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["wrangler", "deploy", "-c", "wrangler.deploy.jsonc"],
  { stdio: "inherit", cwd: root },
);
