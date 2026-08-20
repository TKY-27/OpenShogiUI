# Phase 2 Report — Layout Rebuild, Match Mode, and Interaction

Date: 2026-08-21 JST
Branch: `claude/ui-match-mode-20260821`, from `claude/ui-bugfixes-20260821` (`56c753e`)

This phase rebuilds the interface layout, adds a board-only match route, and adds record export,
keyboard control, and takeback. The OpenShogiAI repository was not modified and the pinned Wasm
interface is byte-identical.

## 1. Root causes

Measured on the Phase 1 tree before any change:

| Viewport | Document height | Vertical page scroll |
| --- | ---: | ---: |
| 1440x900 | 1686px | +786px |
| 1280x800 | 2358px | +1558px |
| 375x812 | 2935px | +2123px |

Six defects produced this.

1. `.history-rail { min-height: 48rem }` set a 768px floor independent of the viewport, which
   alone exceeds the usable height of a 1440x900 laptop.
2. The board derived its size from width only. Viewport height was never an input, so the board
   could not shrink to fit.
3. The shell was normal flow at `min-height: 100vh`, so the page scrolled rather than the panes.
4. `.app-main` had no inner grid, so the routed view grew to its content and the shell's fixed
   height did nothing. Only visible in the browser.
5. The visually hidden `input[type="file"]` elements are `position: absolute` with no positioned
   ancestor. They resolved against the initial containing block, escaped the scrolling pane, and
   extended the document by their static offset. This was the last 335px at 1440x900. Only
   visible in the browser.
6. `.app-shell` had no explicit grid column, so the implicit `auto` column took its minimum from
   the nowrap app bar and widened the document by 188px on mobile. Only visible in the browser.

Two further structural problems: five `max-width` breakpoints (34/48/52/78/80rem) appeared in
non-monotonic source order with 48rem repeated three times, so declaration order rather than
specificity decided the winner below 34rem; and the superseded `.play-page` / `.play-workspace`
rules stayed live underneath the `.analysis-*` rules, leaving two competing layout systems.

`--control-font` also led with Inter, which is neither bundled nor permitted by the same-origin
`style-src` CSP, so the design was authored against a font that never rendered.

## 2. Changed files

- Layout and shell: `src/index.css` (rebuilt as one system), `src/App.tsx`.
- Match route: `src/MatchPlay.tsx`, `src/match-clock.ts`, `src/project.ts`.
- Extracted board: `src/ShogiBoardView.tsx`, with `src/BrowserPlay.tsx` updated to consume it.
- Interaction: `src/keyboard.ts`, `src/kifu.ts`, `src/publish-throttle.ts`.
- Copy: `src/localization.ts`.
- Tests and gates: `src/layout.test.ts`, `src/MatchPlay.test.tsx`, `src/match-clock.test.ts`,
  `src/keyboard.test.ts`, `src/kifu.test.ts`, `src/publish-throttle.test.ts`,
  `src/BrowserPlay.test.tsx`, `src/EvaluationLab.test.tsx`, `src/project.test.ts`,
  `scripts/check-accessibility.mjs`.
- Documentation: `docs/design-qa.md`, `docs/references.md`, `docs/interfaces.md`, this report.

Unchanged and verified by `git diff --name-only`: `src/generated/` (all four files),
`public/pieces/`, `public/licenses/`, `LICENSE`, `ASSET_PROVENANCE.json`,
`THIRD_PARTY_ASSETS.md`, and both dependency blocks in `package.json`.

## 3. Layout

One mobile-first system on an ascending `min-width` ladder: base, 48rem, 64rem, 80rem. No
`max-width` query remains.

From 80rem the shell is `height: 100dvh` with `overflow: hidden`, and the rail, board column, and
analysis panel scroll individually. Below that the document flows normally, because forcing a
fixed height on a stacked narrow layout is user-hostile.

The board is sized inside a size query container from
`min(available width, available height, 46rem)`. Size containment is scoped to the desktop
breakpoint, where the shell actually has a definite height; below it the box is in normal flow and
full containment would collapse it and push the board past the viewport width.

The board precedes the move history in the DOM. It is the primary content, and this keeps visual
order matching DOM order at every breakpoint without an `order` override that would desync the tab
sequence.

## 4. Match mode

`#/match` renders the board, both hand stands, both clocks, the move number, and the controls.
Nothing else: `MatchPlay.test.tsx` asserts the component cannot reference any analysis surface,
evaluation field, or continuous-analysis call.

Time controls are 3-minute sudden death, 10-minute sudden death, and untimed. The clocked presets
set byoyomi and increment to zero, so exhausting main time loses.

The AI manages its own time. `match-clock.ts` serializes the preset as `open_shogi_time_control/v1`
carrying each side's remaining main time; the UI never emits `movetimeMs`, `nodes`, or `depth`, so
the per-move budget decision stays inside the engine. The test asserts that absence directly,
because emitting any of them would silently move the decision into the UI. Untimed forwards
`casual: true`, and the setup screen states the engine's 20-second cap rather than implying none.

Clocks derive from two wall-clock readings, not an accumulated tick count: background tabs have
their timers throttled, so a counter would under-report elapsed time and let a player survive a
flag fall by switching away. Flag fall is detected while a side is still thinking, symmetrically
for both players, and a human move whose clock has already expired is rejected before the worker
position changes. Both sides are charged wall-clock time so that the in-progress flag check and
the charge cannot disagree.

Observed: from 3:00, the engine spent about 8 seconds on its first reply and was charged 8 seconds.

## 5. Interaction

Keyboard: Left/Right step history, Home/End jump, Escape clears selection, Cmd+Z or Ctrl+Z takes
back, Shift+Cmd+Z or Ctrl+Y redoes. Both modifiers are accepted rather than sniffing the platform.
Events from `input`, `textarea`, `select`, or `contenteditable` resolve to null so text undo keeps
working, and events with `isComposing` resolve to null so Escape during an IME conversion cancels
the conversion. Verified against the real DOM.

Takeback rewinds two plies, keeping the side to move on the human. Spent time is not returned;
rewinding a sudden-death clock would make the flag-fall rule meaningless. The redo stack carries
each removed ply's position and elapsed time, so replaying restores the record exactly.

Record export writes KIF and USI from the snapshots the engine produced. Piece names are read off
the board in the position before each move rather than inferred from coordinates. Download uses a
Blob object URL, which is not a network request; exporting recorded zero off-origin requests.

Evaluation display is gated to one update per second. The search and the summary store are
unaffected. Non-live states bypass the gate, and the newest suppressed value is flushed where
analysis stops so a finished search never leaves a stale number on screen. Measured with a
MutationObserver: 6 updates in a 6 second window, minimum gap 1001ms.

## 6. Verification

Observed results, all on this tree:

- `npm run check`: passed. Prettier, Oxlint, TypeScript, 139 unit tests, the static accessibility
  contract, and the boundary, license, provenance, and asset-license audits, then the production
  build.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- Production build served with `npm run preview`, all four routes at each viewport:

  | Viewport | Page scroll | Horizontal overflow | Board |
  | --- | --- | ---: | ---: |
  | 1920x1080 | none | 0 | 718px |
  | 1440x900 | none | 0 | 614px |
  | 1280x800 | none | 0 | 454px |
  | 768x1024 | document flow | 0 | 551px |
  | 375x812 | document flow | 0 | 333px |

- Production build console on load: no errors.
- Wide report tables scroll inside their own region while the document stays at zero horizontal
  overflow.
- Match mode played against the engine: move applied, engine replied, clock charged, no analysis
  text anywhere in the rendered DOM.
- Takeback and redo: move 3, Cmd+Z, move 1, Shift+Cmd+Z, move 3.
- Resignation confirmation and result dialog render as modal panels with the outcome and the
  reason stated separately.
- KIF export from a real two-ply game produced correct piece names and per-side times; USI
  produced `position sfen ... moves 7g7f 5a6b`.

## 7. Not verified

- Safari and Firefox. Only Chromium was available here; they remain an external publication gate.
- `npm run integration:ai` was not run: no `OPENSHOGIAI_ROOT` checkout is present. The pinned
  bindings are unchanged, and `provenance:check` confirms all four hashes.
- The Evaluation Lab with a real imported report. No redistributable report fixture exists in the
  repository, so its table layout was verified by injecting the same markup and confirming the
  scroll region contains the overflow, not by importing a genuine run.
- Match mode was played to a checkmate but not to an actual flag fall in a 3-minute game; the
  flag-fall path is covered by unit tests and by the resignation and checkmate end-states.

## 8. Known limitations carried forward

- Localization is still split between `src/localization.ts` and a local `text(locale)` dictionary
  inside `BrowserPlay.tsx`. New match-mode copy went to `localization.ts`; migrating the existing
  analysis copy was out of scope for this phase.
- `scripts/check-boundaries.mjs` only scans `src/*.ts(x)` for generated-interface imports, so a
  file placed in a subdirectory would escape that guard. New modules were kept flat for this
  reason; `src/pieces/` predates this phase.
- No push, deployment, publication, release, or external repository modification was performed.
