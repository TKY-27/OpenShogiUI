// End-to-end browser verification of the opt-in collection flow against a
// local `wrangler dev` deployment of the Cloudflare build (collection ON,
// local D1). Requires:
//   OSAI_D1_DATABASE_ID=<any UUID> npm run build:cloudflare
//   npm run collection:migrate:deploy-local
//   npm run collection:serve-deploy-local   (in another terminal)
// Run: npm run test:collection:browser
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(base));
const output = resolve(process.argv[3] ?? "local/collection-browser");
await mkdir(output, { recursive: true });
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      resolve(
        homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
  ).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function runGame({ agree }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  context.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto(`${base}/#/match`);
  await page
    .waitForFunction(() => !document.querySelector(".match-start")?.disabled)
    .catch(() => {
      throw new Error("match-start never became enabled; model fetch failed?");
    });
  await page.locator(".match-start").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog
    .getByRole("button", {
      name: agree ? "同意（任意）" : "同意しない",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "停止", exact: true }).waitFor();
  await page.screenshot({
    path: resolve(output, `match-${agree ? "on" : "off"}.png`),
  });
  await page.getByRole("button", { name: "投了", exact: true }).click();
  await dialog.getByRole("button", { name: "投了する", exact: true }).click();
  await page
    .getByRole("button", { name: "もう一局", exact: true })
    .waitFor({ timeout: 20000 });
  // The submission is async (2.5 s budget); wait for a terminal status.
  const status = await (async () => {
    if (!agree) {
      await page
        .locator(".collection-status")
        .waitFor({ state: "detached", timeout: 5000 })
        .catch(() => {
          throw new Error("declined game unexpectedly reported a status");
        });
      return "";
    }
    await page
      .waitForFunction(
        () =>
          document.querySelector(".collection-status")?.textContent !==
          "棋譜を提供しています…",
        null,
        { timeout: 20000 },
      )
      .catch(() => {
        throw new Error("collection status stayed in sending state");
      });
    return page.locator(".collection-status").innerText();
  })();
  await context.close();
  return { posts, status, errors };
}
try {
  const agreed = await runGame({ agree: true });
  assert.equal(
    agreed.posts.length,
    1,
    `expected one submission, got ${agreed.posts}`,
  );
  assert.match(agreed.posts[0], /\/api\/games$/);
  assert.match(agreed.status, /棋譜を受け付けました（未検証）/);
  assert.deepEqual(agreed.errors, []);

  const declined = await runGame({ agree: false });
  assert.deepEqual(declined.posts, []);
  assert.deepEqual(declined.errors, []);

  console.log(
    "PASS: consent dialog, agreed game submitted once (accepted), declined game POST 0, no console errors.",
  );
  console.log(`evidence: ${output}`);
} finally {
  await browser.close();
}
