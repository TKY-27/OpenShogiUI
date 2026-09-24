import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Bounded browser regression; needs the isolated dev server, no Arena or collection.
const base = process.argv[2] ?? "http://127.0.0.1:5186";
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(base));
const output = resolve(process.argv[3] ?? "local/ui-check");
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
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [],
    posts = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (e) => {
    if (["error", "warning"].includes(e.type())) errors.push(e.text());
  });
  context.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.addInitScript(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name === "delayed-fixture.usi")
        return new Promise((resolve) => {
          window.releaseFixture = () => resolve("position startpos");
        });
      return original.call(this);
    };
  });
  await page.goto(`${base}/#/workspace`);
  await page
    .getByRole("heading", { name: "オープンな将棋のAI", exact: true })
    .waitFor();
  assert.match(await page.title(), /OpenShogiUI/);
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  const license = page.getByRole("button", {
    name: "AGPL-3.0-only",
    exact: true,
  });
  await license.focus();
  await page.keyboard.press("Enter");
  const notice = page.getByRole("dialog");
  await notice.waitFor();
  assert(
    await notice.evaluate((dialog) => dialog.contains(document.activeElement)),
  );
  await page.keyboard.press("Escape");
  await notice.waitFor({ state: "detached" });
  assert(await license.evaluate((button) => document.activeElement === button));
  await page.screenshot({ path: resolve(output, "home.png") });
  await page.locator('.start-action[href="#/analysis"]').click();
  const start = page.getByRole("button", { name: "解析開始", exact: true });
  const ready = () =>
    page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "解析開始" && !b.disabled,
      ),
    );
  await ready();
  assert.equal(await page.locator('.app-nav [aria-current="page"]').count(), 1);
  assert.equal(
    await page.locator('.app-nav [aria-current="page"]').getAttribute("href"),
    "#/analysis",
  );
  await page.locator(".learned-analysis__settings details summary").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "delayed-fixture.usi",
    mimeType: "text/plain",
    buffer: Buffer.from("position startpos"),
  });
  await page.waitForFunction(() => !!window.releaseFixture);
  await page.locator("textarea").fill("position startpos moves 7g7f");
  await page
    .getByRole("button", { name: "局面を読み込む", exact: true })
    .click();
  await ready();
  await page.evaluate(() => window.releaseFixture());
  const record = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "棋譜を保存 (USI)", exact: true })
    .click();
  assert.match(await readFile(await (await record).path(), "utf8"), /7g7f/);
  // Redundant model presses must not rebuild the Worker or refetch the manifest.
  const workers = page.workers();
  await page
    .getByRole("button", { name: "防御学習候補", exact: true })
    .dblclick();
  assert.deepEqual(page.workers(), workers);
  await page.getByRole("combobox", { name: "解析予算" }).selectOption("250");
  await start.click();
  await page.waitForFunction(
    () =>
      document.querySelector('.learned-analysis__result [role="status"]')
        ?.textContent !== "解析中…",
  );
  assert.equal(await page.locator('[role="alert"]').count(), 0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", { name: "Start analysis", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Collection and privacy", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Game collection and privacy", exact: true })
    .waitFor();
  assert.match(await page.locator("main").innerText(), /30 days/);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("link", { name: "対局へ戻る", exact: true }).click();
  await page.locator(".match-start").waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".match-start").disabled,
  );
  await page.locator(".match-start").click();
  // Collection is disabled in local development builds, so no consent dialog
  // may appear and no consent toggle may be offered.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "同意しない", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await page.getByRole("region", { name: "棋譜提供の設定" }).count(),
    0,
  );
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page.getByRole("button", { name: "再開", exact: true }).waitFor();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const box = await page.getByRole("grid").boundingBox();
    assert(box && box.width >= 210 && Math.abs(box.width - box.height) < 2);
    await page.screenshot({ path: resolve(output, `match-${width}.png`) });
  }
  await page.getByRole("button", { name: "投了", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "投了する", exact: true })
    .click();
  await page.getByRole("button", { name: "もう一局", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector(".match-start").disabled,
  );
  assert.deepEqual(posts, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: initial HTML/app, navigation, delayed import, repeated model press, analysis, Japanese/English privacy, refusal, resize, resignation, rematch; POST 0; Chromium viewport emulation only.",
  );
} finally {
  await browser.close();
}
