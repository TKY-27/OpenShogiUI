# UI Interfaces

## Compatibility policy

Every value crossing a file, generated-code, persistence, or presentation boundary uses a
documented, versioned, bounded representation. Unknown schema versions and unknown object fields
are rejected; parsers do not guess repairs for untrusted data. Internal Worker responses validate
their correlation envelope on the main thread after their generated JSON payload has been deeply
validated once in the Worker.

## Engine Worker

`src/engine-client.ts` defines the UI-facing boundary and owns the Worker lifecycle directly;
`src/engine.worker.ts` is the only module that imports the generated OpenShogiAI binding. Play and
continuous analysis use separate Workers. Messages use discriminated unions and transferable model
bytes. Request correlation, one active analysis generation, complete analysis
identity, and physical Worker replacement prevent stale work from updating a newer displayed
position.

The browser-facing engine supports:

- initialization and immutable engine identity;
- canonical game snapshots and legal moves;
- bounded move application and reset;
- engine-backed casual, fixed-movetime, match-clock, and profile-bounded node time controls using
  `open_shogi_time_control/v1`; the UI maintains per-side and per-history remaining clock values,
  rejects expired human moves before changing the Worker position, and leaves every AI search
  budget allocation to the engine;
- bounded search profiles and one to ten continuous MultiPV lines;
- `open_shogi_analysis/v1` start, bounded slice, and stop lifecycle messages;
- book-free play with opening-book load and policy-change requests rejected;
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

## Development-only core prototype

`#/core-prototype` is recognized only in development and loads a separate Worker lazily.
`core-prototype-dev.ts` exposes a loopback-only, same-origin allowlist under
`/__core-prototype/`; no source or artifact from the AI checkout is a production import.
Its `open_shogi_core_prototype_assets/v1` manifest binds each artifact URL, SHA-256 and size.
The server resolves symlinks inside the AI checkout and rehashes every artifact response.

`core-prototype-protocol.ts` validates the actual pure-only OSAVAL03 identity, disabled opening
policy, runtime proof and `computeControl` telemetry separately from the legacy MLP contract.
Rules-only board fields share the existing position validator. An evaluated search requires
positive learned calls and zero prohibited counters. Explicit pre-evaluation interruptions
carry a null score and validated zero-work evidence; failures never substitute a legacy engine.

`PrototypeMatchSession` owns confirmed positions, per-side remaining milliseconds and operation
generations. Both sides start with 180000 ms and zero increment/byoyomi. The engine receives both
remaining clocks with `eco`, `pure_learned`, and MultiPV 1. User stop and every end condition
physically terminate the Worker. Resume reconstructs the confirmed position and selected
artifacts; stale results cannot change a newer match. AI flag fall is checked during search,
before move application and before committing its response. The production build includes an
automated check that no prototype Worker, artifact URL or loading code was emitted.

## Record export

`src/kifu.ts` renders KIF and USI from snapshots the engine already produced. It re-derives no
shogi rules: the piece for each ply is read from the board in the preceding position. Output is
handed to the browser through a Blob object URL, which is not a network request and does not touch
the same-origin `connect-src` boundary.

## Live analysis identity

`src/analysis-cache.ts` retains the versioned identity validator and legacy summary store utility.
Browser Play uses a non-persistent store: no past summary is read, written or preloaded. Live
updates must still match schema, canonical SFEN, model, evaluator configuration, feature schema,
evaluation semantics, search options, opening profile and MultiPV count. Analysis runs in its
own Worker and is not an input to the play Worker. Historical report/book metadata parsers remain
read-compatible; their presence does not allow book activation through the Worker protocol.

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
