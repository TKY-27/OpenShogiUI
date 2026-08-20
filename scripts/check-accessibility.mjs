import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserPlay = readFileSync(join(root, "src/BrowserPlay.tsx"), "utf8");
const boardView = readFileSync(join(root, "src/ShogiBoardView.tsx"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const styles = readFileSync(join(root, "src/index.css"), "utf8");
const failures = [];

const requiredBoardEvidence = [
  'role="grid"',
  'role="gridcell"',
  'role="row"',
  "aria-selected={isSelected}",
  "alt={glyph}",
  'type="button"',
];
for (const marker of requiredBoardEvidence) {
  if (!boardView.includes(marker))
    failures.push(`ShogiBoardView is missing ${marker}`);
}

const requiredBrowserEvidence = [
  'role="status"',
  'aria-live="polite"',
  'aria-modal="true"',
  "aria-label={labels.realtime}",
  'aria-current={index === displayedIndex ? "step" : undefined}',
  'type="button"',
];
for (const marker of requiredBrowserEvidence) {
  if (!browserPlay.includes(marker))
    failures.push(`BrowserPlay is missing ${marker}`);
}

for (const marker of [
  "Source Code",
  "AGPL-3.0-only",
  "Third-Party Notices",
  "Piece Credits",
  "Model License",
  'aria-modal="true"',
]) {
  if (!app.includes(marker)) failures.push(`App notices are missing ${marker}`);
}

for (const selector of [
  "button:focus-visible",
  ".board-square--selected",
  ".board-square--destination",
  ".board-square--last-origin",
  ".board-square--last-destination",
  ".board-square--last-capture",
  ".board-square--checked-king",
  ".board-square--pv",
  "@media (prefers-reduced-motion: reduce)",
]) {
  if (!styles.includes(selector)) failures.push(`CSS is missing ${selector}`);
}

if (
  !styles.includes("repeating-linear-gradient") ||
  !styles.includes("double")
) {
  failures.push(
    "board state indicators must use pattern and shape, not color alone",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Static accessibility contract check passed");
}
