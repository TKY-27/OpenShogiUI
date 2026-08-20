# UI Interfaces

## Compatibility policy

Every value crossing a Worker, file, generated-code, or presentation boundary uses a documented,
versioned, bounded representation. Unknown schema versions and unknown object fields are rejected;
parsers do not guess repairs for untrusted data.

## Engine Worker

`src/engine-client.ts` owns main-thread request correlation and lifecycle. `src/engine.worker.ts`
is the only module that imports the generated OpenShogiAI binding and owns an engine instance.
Messages use closed discriminated unions, bounded strings and arrays, and transferable model
bytes. Search cancellation terminates the Worker so stale work cannot update a newer position.

The browser-facing engine supports:

- initialization and immutable engine identity;
- canonical game snapshots and legal moves;
- bounded move application and reset;
- bounded fixed search profiles and one to three analysis lines;
- local `OSAVAL01` validation, activation, and removal.

The main thread renders returned snapshots rather than reconstructing rules from visual board
coordinates.

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
