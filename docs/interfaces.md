# UI Interfaces

## Compatibility policy

Every value crossing a Worker, file, generated-code, or presentation boundary uses a documented,
versioned, bounded representation. Unknown schema versions and unknown object fields are rejected;
parsers do not guess repairs for untrusted data.

## Engine Worker

`src/engine-adapter.ts` defines the UI-facing boundary. Each adapter owns an
`EngineWorkerClient`; `src/engine.worker.ts` is the only module that imports the generated
OpenShogiAI binding. Play and continuous analysis use separate Workers. Messages use closed
discriminated unions, bounded strings and arrays, and transferable model or opening-book bytes.
Request correlation, active analysis identity, and physical Worker replacement prevent stale
work from updating a newer displayed position.

The browser-facing engine supports:

- initialization and immutable engine identity;
- canonical game snapshots and legal moves;
- bounded move application and reset;
- engine-backed casual, fixed-movetime, match-clock, and profile-bounded node time controls using
  `open_shogi_time_control/v1`; the UI maintains per-side and per-history remaining clock values,
  rejects expired human moves before changing the Worker position, and leaves every AI search
  budget allocation to the engine;
- bounded search profiles and one to ten continuous MultiPV lines;
- `open_shogi_analysis/v1` start, slice, stop, failure, and restart lifecycle messages;
- strict, preferred, or disabled opening policy plus local opening-book load/removal;
- local `OSAVAL01` validation, activation, and removal.

The main thread renders returned snapshots rather than reconstructing rules from visual board
coordinates.

## Routes

`src/project.ts` resolves four hash routes: `workspace`, `match`, `browser-play`, and
`evaluation-lab`, with unknown hashes falling back to `workspace`. `match` and `browser-play` are
application routes and run inside a fixed-height shell; the other two use normal document flow.

`src/ShogiBoardView.tsx` owns the board, hand stands, and piece rendering, and is the only place
those components are defined. Both play routes consume it.

## Match mode time control

`src/match-clock.ts` maps the three presets onto `open_shogi_time_control/v1`. The clocked presets
forward each side's remaining main time with byoyomi and increment at zero; the untimed preset
forwards `casual: true`. The UI never emits `movetimeMs`, `nodes`, or `depth`, so the per-move
budget is decided entirely by the engine. Clock arithmetic uses wall-clock readings rather than an
accumulated tick count, so a throttled background tab cannot gain time.

## Record export

`src/kifu.ts` renders KIF and USI from snapshots the engine already produced. It re-derives no
shogi rules: the piece for each ply is read from the board in the preceding position. Output is
handed to the browser through a Blob object URL, which is not a network request and does not touch
the same-origin `connect-src` boundary.

## Analysis summary cache

`src/analysis-cache.ts` keys summaries by schema, canonical position SFEN, model hash, evaluator
configuration hash, feature-schema hash, evaluation-semantics hash, search-options hash,
opening-profile hash, MultiPV count, and frozen Wasm SHA-256. A cached or live update is publishable
only when every identity field still matches. IndexedDB values are closed-parsed before use and it
retains at most 128 bounded summaries; memory remains the fallback when storage is unavailable.
Model bytes, book bytes, and internal search state are not cached.

## Generated WebAssembly snapshot

The generated interface is an indivisible four-file set:

```text
src/generated/open_shogi_wasm.js
src/generated/open_shogi_wasm.d.ts
src/generated/open_shogi_wasm_bg.wasm
src/generated/open_shogi_wasm_bg.wasm.d.ts
```

The AI repository produces the matching set under `bindings/wasm/`. The UI builds only from its
committed snapshot; `npm run integration:ai` provides an explicit cross-repository drift check.
`PROVENANCE.md` pins the corresponding engine commit/tree and hashes all four files.

## Piece assets

`src/pieces/catalog.ts` is the closed presentation catalog for the 13 included standard-shogi
sets. Only the active set is referenced by board/hand images; image elements have fixed intrinsic
dimensions and fall back to semantic kanji when an asset cannot load. `ASSET_PROVENANCE.json`
binds every local file to the exact upstream path and SHA-256. `npm run asset-license:audit`
checks completeness, hashes, path bounds, allowed set IDs, and retained license evidence.

## Arena report import

Evaluation Lab accepts bounded local JSON for `phase2_arena_report/v2` and retains explicit read
compatibility with v1. The validator rejects oversized files, unsupported or missing fields,
unsafe integers, non-finite or out-of-range values, malformed identifiers, duplicate or
noncontiguous games, inconsistent aggregates, invalid A/B schedules, and unsupported result or
player labels.

For v2, run identity binds engine text, commit, seed, configuration hash, search budget, starting
SFEN, players, optional model identities, and optional opening identity. Per-game and aggregate
counters are cross-checked, and derivable metrics are recomputed. Referenced CSA, opening, and
model files are not opened by the browser importer; their content verification remains an
upstream responsibility.

## Routes and localization

The application uses fragment routes `#/workspace`, `#/browser-play`, and `#/evaluation-lab`.
Unknown fragments resolve to Workspace. Japanese is the deterministic default, and switching
language updates visible text and the document `lang` attribute.
