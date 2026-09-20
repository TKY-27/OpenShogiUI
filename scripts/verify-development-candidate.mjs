import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [url, selection, expectedHash, output] = process.argv.slice(2);
assert(/^http:\/\/127\.0\.0\.1:\d+\/#\/match$/.test(url));
assert(
  ["r4c1", "r4c2", "defense", "candidate", "baseline"].includes(selection),
);
assert(/^[a-f0-9]{64}$/.test(expectedHash));
await mkdir(output, { recursive: true });
const modulePath =
  process.env.PLAYWRIGHT_MODULE ??
  resolve(
    homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  );
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  schema: "open_shogi_development_browser/v1",
  url,
  selection,
  expectedHash,
  status: "FAIL",
  errors: [],
  games: [],
  requestedModels: [],
};
try {
  const page = await browser.newPage({
    locale: "ja-JP",
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (e) => report.errors.push(String(e)));
  page.on("console", (e) => {
    if (e.type() === "error") report.errors.push(e.text());
  });
  page.on("request", (r) => {
    if (r.url().includes("leaf.osaval03")) report.requestedModels.push(r.url());
  });
  await page.goto(url);
  report.title = await page.title();
  assert(report.title.length > 0);
  const labels = {
    r4c2: /^R4-C2/,
    r4c1: /^R4-C1/,
    defense: /^防御学習候補$/,
    candidate: /^r3候補$/,
    baseline: /^旧基準/,
  };
  const modelButton = page.getByRole("button", { name: labels[selection] });
  await modelButton.click();
  await page.waitForFunction(
    (hash) =>
      document
        .querySelector(".prototype-model__status")
        ?.textContent?.includes(hash.slice(0, 12)),
    expectedHash,
  );
  assert.equal(
    await page
      .locator("legend")
      .filter({ hasText: /^最新←→開発初期$/ })
      .count(),
    1,
  );
  const diagnostics = async (name) => {
    const details = page.locator("details.prototype-artifacts");
    if ((await details.getAttribute("open")) === null)
      await details.locator("summary").click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "診断ログを保存", exact: true })
      .click();
    const file = resolve(output, name + ".json");
    await (await download).saveAs(file);
    return JSON.parse(await readFile(file, "utf8"));
  };
  for (const side of ["black", "white"]) {
    await page.getByRole("button", { name: "高品質", exact: true }).click();
    await page
      .getByRole("button", {
        name: side === "black" ? "先手" : "後手",
        exact: true,
      })
      .click();
    await page.locator(".match-start").click();
    await page.getByRole("gridcell").first().waitFor();
    assert.equal(await page.getByRole("gridcell").count(), 81);
    assert((await page.locator('[role="gridcell"][data-kind]').count()) > 0);
    assert(await modelButton.isDisabled());
    if (side === "black") {
      await page
        .locator('[role="gridcell"][data-file="7"][data-rank="7"]')
        .click();
      await page
        .locator('[role="gridcell"][data-file="7"][data-rank="6"]')
        .click();
    }
    await page.waitForFunction(
      (ply) =>
        Number(
          document
            .querySelector(".match-move-number strong")
            ?.textContent?.replace(/\D/g, ""),
        ) >= ply,
      side === "black" ? 3 : 2,
      { timeout: 90000 },
    );
    await page.getByRole("button", { name: "停止", exact: true }).click();
    await page.getByRole("button", { name: "再開", exact: true }).waitFor();
    const result = await diagnostics(side);
    assert.equal(result.identity.leafSha256, expectedHash);
    assert.equal(
      result.manifest.artifacts["leaf.osaval03"].sha256,
      expectedHash,
    );
    assert.equal(result.game.humanSide, side);
    assert.equal(result.game.profile, "quality");
    assert(result.searches.length >= 1);
    for (const search of result.searches) {
      assert.equal(search.leafSha256, expectedHash);
      assert.equal(search.runtimeProof.model_sha256, expectedHash);
      assert(
        search.sfen &&
          search.movement &&
          search.termination &&
          search.hardLimitMs > 0,
      );
      for (const key of [
        "book_hits",
        "teacher_calls",
        "fallback_count",
        "handcrafted_eval_calls",
      ])
        assert.equal(search.runtimeProof[key], 0);
    }
    const board = await page.getByRole("grid").boundingBox();
    assert(
      board.width >= 240 && board.height >= 240,
      "rendered board collapsed",
    );
    report.games.push({
      side,
      moves: result.game.moves,
      identity: result.identity,
      preparation: result.preparation,
      searches: result.searches,
    });
    const gameDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "棋譜を保存 (USI)", exact: true })
      .click();
    const gamePath = resolve(output, side + ".usi");
    await (await gameDownload).saveAs(gamePath);
    assert(
      (await readFile(gamePath, "utf8")).endsWith(result.game.moves.join(" ")),
    );
    await page.locator("details.prototype-artifacts summary").click();
    await page.locator(".prototype-heading").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(output, side + ".png"),
      fullPage: true,
    });
    if (side === "white") {
      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await page.getByRole("grid").boundingBox();
      assert(mobile.width >= 240 && mobile.height >= 240);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: resolve(output, "mobile-board.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page
      .getByRole("button", { name: "対局を終了して設定へ", exact: true })
      .click();
    await page.getByRole("button", { name: "終了する", exact: true }).click();
    await page.locator(".match-start").waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(output, "mobile-setup.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  assert.equal(report.errors.length, 0);
  assert(
    report.requestedModels.every(
      (u) => u.includes("/defense/") || u.includes(`/${selection}/`),
    ),
  );
  report.status = "PASS";
} finally {
  await writeFile(
    resolve(output, "browser.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify({ status: report.status, url, output }));
