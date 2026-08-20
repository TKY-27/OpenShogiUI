# Phase 1 Report — Analysis Workspace and Licensed Piece Assets

Date: 2026-08-21 JST
Branch: `codex/ui-analysis-assets`

This phase upgrades the standalone OpenShogiUI repository against the frozen OpenShogiAI Wasm
protocol at commit `1232d015a6b2c3df9abf366137bded245bd14a93`. The OpenShogiAI repository was
not modified.

## Changed files

- Protocol/runtime: `src/browser-engine.ts`, `src/engine-client.ts`, `src/engine-adapter.ts`,
  `src/engine.worker.ts`, and the four `src/generated/open_shogi_wasm*` snapshot files.
- Product/UI: `src/BrowserPlay.tsx`, `src/App.tsx`, `src/index.css`, `src/play-settings.ts`,
  `src/analysis-cache.ts`, `src/pieces/catalog.ts`, and `project.config.json`.
- Tests/audits: the Browser Play, engine, settings, cache, and piece-catalog test files plus the
  accessibility, provenance, asset-license, and Wasm integration scripts.
- Assets/notices: `public/pieces/standard/` (390 images), `public/licenses/`,
  `ASSET_PROVENANCE.json`, `THIRD_PARTY_ASSETS.md`, `THIRD_PARTY.md`, and `LICENSE_SCOPE.md`.
- Documentation/configuration: `README.md`, `ARCHITECTURE.md`, `PROVENANCE.md`, relevant `docs/`
  files, `package.json`, and this report.

## 1. Analysis architecture

`WasmEngineAdapter` is the explicit UI boundary. Browser Play creates independent play and
analysis adapters, each with its own Worker and Wasm engine. Play owns the canonical live game,
time-managed move search, model/book state, and physical restart. Analysis owns the currently
displayed live or historical SFEN and runs bounded `open_shogi_analysis/v1` slices. Analysis can
pause while play is searching and can be disabled by assigning zero analysis threads while keeping
the profile-fixed hash value truthful.

Worker requests retain monotonically increasing IDs. The client accepts only the matching closed
response kind and request ID. UI request epochs plus complete protocol-identity comparison reject
out-of-order and stale updates. Disposal is terminal: an expected cancellation can no longer
resurrect a disposed adapter as ready or crashed. AI-vs-AI stop physically replaces the play
Worker and restores the canonical session, model, book, and opening profile.

## 2. Position-switch behavior

The history array is immutable presentation state; its final element is the live game. A separate
displayed index selects initial, previous, next, last, or clicked positions. Changing the index
stops the prior logical analysis request, invalidates its presentation, loads a compatible cached
summary if present, and starts/resumes the selected canonical SFEN. It never calls `playMove` or
mutates the live Worker. “Return to live game” selects the final history entry.

## 3. Cache behavior

`AnalysisSummaryStore` keys by schema, canonical SFEN, model hash, evaluator-config hash,
feature-schema hash, evaluation-semantics hash, search-options hash, opening-profile hash, MultiPV,
and the frozen Wasm SHA-256. Every cached/live update must match all fields before display or
persistence. IndexedDB values are closed-parsed before use and it retains at most 128 completed
nonzero-depth summaries; memory is the fallback when storage is missing or fails. Model bytes,
opening-book bytes, search trees, and Wasm stacks are never stored.

## 4. Side and orientation controls

Human role supports Sente, Gote, AI-vs-AI, and analysis-only. Role affects who may move but does
not rewrite SFEN. Sente-bottom, Gote-bottom, and flip affect square order, piece orientation, and
hand placement independently. Takeover selects the role matching the current side to move without
changing SFEN, move count, or history. Taking over during an AI search physically cancels and
restores the play Worker first. Browser QA completed legal moves as both Sente and Gote from the
initial position.

## 5. Last-move and board-state behavior

Each selected history entry derives its last move from that entry and the immediately preceding
board. Normal origin/destination, drops, captures, and promotions have distinct classes. Current
selection, legal targets, last move, terminal checkmated king, and PV preview combine color with
double/dotted borders, geometric marks, hatching, or dot patterns. Human and AI highlights were
verified in the in-app browser, including a historical human move after an AI reply.

## 6. Time-control UI

The UI serializes `open_shogi_time_control/v1` without allocating search time:

- casual forwards `casual: true`; the frozen engine enforces its 20,000 ms hard cap;
- fixed supports 0.5, 1, 2, 5, 10, and 20 seconds;
- match clock forwards per-side remaining main time, byoyomi, increment, and safety margin;
- advanced node limit forwards the exact bounded node count within the frozen profile limits:
  1,500 (eco), 4,000 (balanced), or 12,000 (quality).

The UI maintains remaining clock state per history entry and subtracts observed human time or
engine-reported AI elapsed time, then applies increment. Human moves beyond remaining main time
plus byoyomi are rejected before the Worker position changes. The engine remains solely responsible
for each AI search budget. Configured maximum/clock and actual AI thinking time are displayed
separately. Threads and hash are shown as the frozen single-thread and profile-fixed Wasm values
instead of ineffective controls.

## 7. Book indication

Local bounded opening books can be loaded, checksum-verified, removed, and restored after a play
Worker restart. Profiles are `ibisha_strict` (default), `ibisha_preferred`, and `unrestricted`;
copy states explicitly that they are selection policies, not legal-move restrictions. A returned
book move is applied immediately, stored in history, marked `定跡`, and shown with classification
and profile. Search depth/nodes are not shown for a book source.

## 8. Imported piece sets

Exactly 13 standard-shogi sets, 30 images each (390 total), were copied unmodified from
`WandererXII/lishogi` commit `acb3b12286dd41bc88edfa81172e6a5e7f68c52b`:

`1kanji_3d`, `intl_colored_3d`, `intl_colored_2d`, `intl_monochrome_2d`,
`intl_shadowed`, `intl_wooden_3d`, `international`, `kanji_guide_shadowed`,
`intl_portella`, `simple_kanji`, `kanji_red_wood`, `kanji_light`, and `kanji_brown`.

`kanji_brown` is the default. Selection persists, fixed image frames prevent layout shift, and
failed images fall back to semantic kanji. Only the active set appears in rendered image sources;
alternatives remain static files until selected.

## 9. Creators and licenses

- Little-Mage and CouchTomato87: `1kanji_3d`, `intl_colored_3d`.
- CouchTomato87: all other retained international sets.
- Ka-hu: `simple_kanji`, `kanji_red_wood`, `kanji_light`, `kanji_brown`.

All retained sets are CC BY 4.0. The in-app credits give creator, pinned source, license link,
unmodified indication, and a no-endorsement statement. `ASSET_PROVENANCE.json` records every
file’s upstream/local path, hashes, byte length, creators, commit, license, modification status,
and acquisition date. The original `COPYING.md` is retained byte-for-byte.

## 10. Excluded assets

CC BY-SA 3.0/4.0 sets were excluded because ShareAlike is outside this asset scope. Portella’s
CC BY-NC-SA sets were excluded for NonCommercial and ShareAlike terms. `dobutsu` and Lishogi-only
all-rights-reserved content were excluded as non-free. Ambiguous/unlisted artwork, logos, boards,
sounds, fonts, CSS, TypeScript, and other Lishogi source were not acquired. Exact set names and
reasons are in `THIRD_PARTY_ASSETS.md`.

## 11. Bundle-size impact

Measured production static bytes at the original `dd7ce92` tree versus this phase:

| Artifact | Before | After | Change |
| --- | ---: | ---: | ---: |
| Complete `dist/` files | 602,796 B | 7,262,799 B | +6,660,003 B |
| Wasm module | 291,300 B | 568,235 B | +276,935 B |
| Piece images | 0 B | 6,255,926 B | +6,255,926 B |

The complete static artifact includes every selectable set. Initial Browser Play rendering refers
only to the selected set, confirmed by visible image-source inspection before and after reload.

## 12. Tests, accessibility, and visual QA

Observed results:

- `npm run check`: passed, including formatter check, Oxlint, TypeScript, 70 unit tests, static
  accessibility contract, boundary/license/provenance/asset audits, and production build.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- `OPENSHOGIAI_ROOT=../OpenShogiAI-final npm run integration:ai`:
  all four generated files byte-identical; Wasm legal move, time-control search, and analysis
  start/step/stop/failure/restart smoke tests passed.
- In-app browser: clean console; Sente/Gote moves, AI reply, history switching, flip, in-flight
  takeover cancellation, invalid numeric editing, analysis stop, piece persistence, notices, and
  clock presentation passed.
- Independent Sol xhigh closure review: no remaining actionable P0-P3 findings after worker,
  clock/history, cache, profile/book, dialog, and fallback repairs.
- Responsive geometry: desktop layout width 1,279 CSS px in a 1,333 px viewport; mobile document
  width 347 CSS px in a 361 px viewport with no horizontal overflow.

Visual fidelity ledger against the generated target:

1. Preserved warm-white paper, dark ink, muted vermilion, and pale indigo analysis semantics.
2. Preserved desktop history/board/analysis three-column hierarchy.
3. Preserved a dominant square board, file/rank coordinates, and horizontal hand stands.
4. Preserved compact metrics, MultiPV list, toggle, and settings rail without decorative charts.
5. Preserved square controls, crisp rules, and pattern/shape-based board annotations.
6. Preserved mobile stacking and 44 px interactive targets without horizontal scrolling.

Intentional copy differences: generated placeholder engine names, fabricated metrics, dates,
opening names, and match metadata were replaced with actual OpenShogiAI protocol values or omitted.
The UI uses the repository’s Japanese/English product terms and exact license/source notices.

Screenshots:

- Desktop and mobile screenshots were captured during the final browser QA run; they are task artifacts and are not versioned in this repository.

## 13. Exact local commands

```sh
cd OpenShogiUI
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/#/browser-play`.

```sh
cd OpenShogiUI
npm run check
npm audit --audit-level=moderate
OPENSHOGIAI_ROOT=../OpenShogiAI-final npm run integration:ai
npm run build
npm run preview
```

## 14. Commits and remaining limitations

Commits preceding this report:

- `b5fb26c` — `assets: add audited CC BY 4.0 shogi pieces`
- `2a85f91` — `feat: add browser analysis workspace`
- `f586ef4` — `fix: harden browser engine state handling`

The final handoff also identifies the commit containing this report. No branch was pushed and no
deployment, publication, release, model training, or external repository modification was
performed.

Remaining protocol/UI limitations:

- `open_shogi_analysis/v1` does not expose selective depth, so the labelled field displays `—`.
- The browser snapshot does not expose a general in-check flag. The king warning is therefore
  shown for protocol-reported checkmate, without reimplementing engine attack rules in the UI.
- Book presentation and strict parsing are covered, but no redistributable opening-book fixture is
  bundled, so browser QA did not load a real `.gz` book.
- Browser QA covered the Codex in-app browser at desktop/mobile dimensions. Safari and Firefox
  remain an external publication gate.

The phase is ready for user review. Progression to another roadmap phase requires explicit user
approval.
