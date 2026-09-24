import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

// A maintenance command, not part of build/CI. No network or added dependency.
const modulePath =
  process.env.PLAYWRIGHT_MODULE ??
  resolve(
    homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  );
const { chromium } = await import(pathToFileURL(modulePath).href);
const source = await readFile("assets/brand.svg", "utf8");
const mark = source.match(
  /<symbol id="mark" viewBox="0 0 64 64">([\s\S]*?)<\/symbol>/,
)?.[1];
if (!mark || /<script|https?:\/\/(?!www.w3.org)|<foreignObject/.test(source))
  throw Error("Invalid brand source");
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${mark}</svg>\n`;
await writeFile("public/favicon.svg", icon);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route("**/*", (route) => route.abort());
  async function render(svg, size, file) {
    await page.setViewportSize(size);
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file });
  }
  await render(source, { width: 1200, height: 630 }, "public/ogp.png");
  for (const size of [16, 32, 180])
    await render(
      icon,
      { width: size, height: size },
      `public/icon-${size}.png`,
    );
} finally {
  await browser.close();
}
