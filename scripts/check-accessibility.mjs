import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserPlay = readFileSync(join(root, "src/BrowserPlay.tsx"), "utf8");
const boardView = readFileSync(join(root, "src/ShogiBoardView.tsx"), "utf8");
const matchPlay = readFileSync(join(root, "src/MatchPlay.tsx"), "utf8");
const clockPanel = readFileSync(join(root, "src/MatchClockPanel.tsx"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const noticeDialog = readFileSync(join(root, "src/NoticeDialog.tsx"), "utf8");
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

const requiredMatchEvidence = [
  'role="status"',
  'aria-live="polite"',
  'aria-modal="true"',
  "showModal()",
  'type="button"',
];
if (
  !clockPanel.includes(
    "aria-label={remainingLabel(formatMatchClock(remainingMs))}",
  )
) {
  failures.push("MatchClockPanel is missing the accessible remaining time");
}

// The promotion picker is inline, not modal, so it must still be labelled and
// focusable and must still handle Escape.
for (const marker of [
  'role="group"',
  "aria-label={messages.play.promoteQuestion}",
  "autoFocus={index === 0}",
  'event.key === "Escape"',
]) {
  if (!boardView.includes(marker)) {
    failures.push(`ShogiBoardView promotion picker is missing ${marker}`);
  }
}
for (const marker of requiredMatchEvidence) {
  if (!matchPlay.includes(marker))
    failures.push(`MatchPlay is missing ${marker}`);
}

// The match route must not be able to render an analysis surface at all.
for (const forbidden of ["analysis-panel", "analysis-lines", "scoreCp"]) {
  if (matchPlay.includes(forbidden)) {
    failures.push(`MatchPlay must not reference ${forbidden}`);
  }
}

for (const marker of [
  "Source Code",
  "AGPL-3.0-only",
  "Third-Party Notices",
  "Piece Credits",
  "Model License",
  'aria-modal="true"',
]) {
  const source =
    marker === 'aria-modal="true"' ? noticeDialog : app + noticeDialog;
  if (!source.includes(marker))
    failures.push(`App notices are missing ${marker}`);
}

for (const selector of [
  "button:focus-visible",
  ".board-square--selected",
  ".board-square--destination",
  ".board-square--last-origin",
  ".board-square--last-destination",
  ".board-square--last-capture",
  ".board-square--checked-king",
  "@media (prefers-reduced-motion: reduce)",
]) {
  if (!styles.includes(selector)) failures.push(`CSS is missing ${selector}`);
}

for (const selector of [".match-clock--active", ".match-clock--urgent"]) {
  if (!styles.includes(selector)) failures.push(`CSS is missing ${selector}`);
}

/*
 * Selection and last-move are area fills by product decision: rings on a 9x9
 * grid sit on the 1px rules and read as broken borders. The states a player
 * must act on keep a non-colour channel, and that is what is enforced here.
 *
 *   legal destination  -> a drawn mark inside the square
 *   capture            -> hatching
 *   drop, checked king -> a rotated square mark
 *   promotion          -> a corner triangle
 *   analysis PV        -> a dot pattern
 */
const shapeChannels = [
  [".board-square--destination .destination-mark", "border-radius"],
  [".board-square--last-capture", "repeating-linear-gradient"],
  [".board-square--last-drop::after", "rotate("],
  [".board-square--last-promotion::before", "border-top"],
];
for (const [selector, property] of shapeChannels) {
  const at = styles.indexOf(selector);
  if (at === -1) {
    failures.push(`CSS is missing ${selector}`);
    continue;
  }
  const block = styles.slice(at, styles.indexOf("}", at));
  if (!block.includes(property)) {
    failures.push(
      `${selector} must convey state with shape or pattern, not colour alone`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Static accessibility contract check passed");
}
