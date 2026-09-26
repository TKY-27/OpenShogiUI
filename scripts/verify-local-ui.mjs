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
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name === "delayed-fixture.usi")
        return new Promise((resolve) => {
          window.releaseFixture = () =>
            resolve(new TextEncoder().encode("position startpos").buffer);
        });
      return original.call(this);
    };
  });
  await page.goto(`${base}/#/workspace`);
  await page
    .getByRole("heading", { name: "オープンな将棋のAI", exact: true })
    .waitFor();
  assert.match(await page.title(), /OpenShogiAI/);
  assert.doesNotMatch(await page.title(), /OpenShogiUI/);
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
  // Settings live in a dialog; the model picker and imports run through it.
  await page.getByRole("button", { name: "解析設定", exact: true }).click();
  const settings = page.getByRole("dialog", {
    name: "解析設定",
    exact: true,
  });
  await settings.waitFor();
  // The model picker shows all six candidates as an even grid in its pane.
  const pickerButtons = page.locator(".model-picker__options button");
  assert.equal(await pickerButtons.count(), 6);
  const pickerBox = await page.locator(".model-picker__options").boundingBox();
  assert(pickerBox !== null && pickerBox.height > 0);
  await settings.locator('input[type="file"]').setInputFiles({
    name: "delayed-fixture.usi",
    mimeType: "text/plain",
    buffer: Buffer.from("position startpos"),
  });
  await page.waitForFunction(() => !!window.releaseFixture);
  await settings.locator("textarea").fill("position startpos moves 7g7f");
  await settings
    .getByRole("button", { name: "局面を読み込む", exact: true })
    .click();
  await settings
    .getByRole("combobox", { name: "解析予算" })
    .selectOption("250");
  await ready();
  await page.evaluate(() => window.releaseFixture());
  // Redundant model presses must not rebuild the Worker or refetch the manifest.
  const workers = page.workers();
  const defense = settings.getByRole("button", {
    name: "防御強化 best1536",
    exact: true,
  });
  await defense.dblclick();
  assert.deepEqual(page.workers(), workers);
  await page.keyboard.press("Escape");
  await settings.waitFor({ state: "detached" });
  await start.click();
  await page.waitForFunction(
    () =>
      document.querySelector('.learned-analysis__result [role="status"]')
        ?.textContent !== "解析中…",
  );
  assert.equal(await page.locator('[role="alert"]').count(), 0);
  // Navigation across the record: back to the start, forward one ply.
  const nav = page.locator(".kifu-nav");
  await nav.getByRole("button", { name: "最初の局面へ", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".kifu-nav__label")
      ?.textContent?.includes("開始局面"),
  );
  await nav.getByRole("button", { name: "最後の局面へ", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".kifu-nav__label")?.textContent?.includes("1"),
  );
  // The kifu tab lists the recorded move in Japanese notation.
  await page.getByRole("button", { name: "棋譜", exact: true }).click();
  await page.locator(".kifu-list").getByText("☗７六歩").waitFor();
  await page.getByRole("button", { name: "評価値", exact: true }).click();
  // Every save format downloads real bytes; a repeat save refetches no chunk.
  const kifuChunks = async () =>
    page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) =>
            /kifu-export|assets\/esm-|encoding|tsshogi/.test(name),
          ).length,
    );
  const usiDownload = page.waitForEvent("download");
  await page
    .getByRole("combobox", { name: "棋譜形式" })
    .selectOption({ label: "USI" });
  await page.getByRole("button", { name: "棋譜を保存", exact: true }).click();
  assert.match(
    await readFile(await (await usiDownload).path(), "utf8"),
    /7g7f/,
  );
  const kifDownload = page.waitForEvent("download");
  await page
    .getByRole("combobox", { name: "棋譜形式" })
    .selectOption({ label: "KIF" });
  await page.getByRole("button", { name: "棋譜を保存", exact: true }).click();
  const kifFile = await kifDownload;
  assert.match(kifFile.suggestedFilename(), /\.kif$/);
  const kifText = new TextDecoder("shift_jis").decode(
    await readFile(await kifFile.path()),
  );
  assert.match(kifText, /７六歩\(77\)/);
  assert.match(kifText, /手合割：平手/);
  // The format chunks load once; saving again must not refetch any of them.
  const chunksAfterKifSave = await kifuChunks();
  const ki2Download = page.waitForEvent("download");
  await page
    .getByRole("combobox", { name: "棋譜形式" })
    .selectOption({ label: "KI2" });
  await page.getByRole("button", { name: "棋譜を保存", exact: true }).click();
  const ki2File = await ki2Download;
  assert.match(ki2File.suggestedFilename(), /\.ki2$/);
  assert.equal(await kifuChunks(), chunksAfterKifSave);
  // The analysis pane must stay usable at phone sizes: no horizontal overflow,
  // a square board, and screenshots for the layout record.
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
      `horizontal overflow at ${width}x${height}`,
    );
    const board = await page.getByRole("grid").boundingBox();
    assert(
      board && board.width >= 210 && Math.abs(board.width - board.height) < 2,
      `board size at ${width}x${height}`,
    );
    await page.screenshot({ path: resolve(output, `analysis-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
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
  // Play one move, then save the unfinished game mid-play in two formats.
  await page.getByRole("gridcell", { name: /^7七、/ }).click();
  await page.getByRole("gridcell", { name: /^7六(?:、|$)/ }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".match-move-number strong")].some(
      (node) => Number.parseInt(node.textContent ?? "0", 10) >= 2,
    ),
  );
  await page.getByText("棋譜保存・設定", { exact: true }).click();
  const midGameKif = page.waitForEvent("download");
  await page
    .getByRole("combobox", { name: "棋譜形式" })
    .selectOption({ label: "KIF" });
  await page.getByRole("button", { name: "棋譜を保存", exact: true }).click();
  const midGameText = new TextDecoder("shift_jis").decode(
    await readFile(await (await midGameKif).path()),
  );
  assert.match(midGameText, /７六歩\(77\)/);
  assert.match(midGameText, /\( 0:0\d\/00:00:0\d\)/);
  assert.doesNotMatch(midGameText, /投了/);
  const midGameCsa = page.waitForEvent("download");
  await page
    .getByRole("combobox", { name: "棋譜形式" })
    .selectOption({ label: "CSA" });
  await page.getByRole("button", { name: "棋譜を保存", exact: true }).click();
  const midGameCsaText = await readFile(
    await (await midGameCsa).path(),
    "utf8",
  );
  assert.match(midGameCsaText, /\+7776FU/);
  assert.doesNotMatch(midGameCsaText, /%TORYO/);
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
  // Resign while the engine is thinking (out of turn): the record must not
  // credit the resignation — and the win — to the engine.
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
