import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const assets = fileURLToPath(new URL("../dist/assets/", import.meta.url));
for (const name of readdirSync(assets)) {
  if (/core-prototype|CorePrototype/u.test(name))
    throw new Error(`Development prototype emitted: ${name}`);
  if (!/\.(js|css)$/u.test(name)) continue;
  const content = readFileSync(join(assets, name), "utf8");
  for (const marker of [
    "/__core-prototype/",
    "leaf.osaval03",
    "open_shogi_core_prototype_assets/v1",
  ]) {
    if (content.includes(marker))
      throw new Error(`Development artifact code emitted: ${name}`);
  }
}
console.log("Production build excludes local prototype code and artifacts");
