# OpenShogiUI

OpenShogiUI is the standalone browser interface for OpenShogiAI. It supports local browser play,
continuous position analysis and bounded arena-report inspection in development. The production
build contains one explicitly selected learned configuration for play. WebAssembly computation
and model weights remain in a dedicated local browser Worker.

This clean-history repository contains the UI only. It has no Rust engine source, Python
training stack, data-acquisition pipeline, local model, or private source history.

## Requirements

- Node.js `>=22.13 <23`
- npm `>=10 <11`

## Development

```sh
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/#/match`. The development match defaults to defense best1536
and offers R4-C2/R4-C1 (comparison only, not adopted), r3 and frozen W256 comparisons, in `最新←→開発初期` order. C2 becomes loadable after the reviewed training/registration path completes.
The legacy analysis/lab routes are development only. Production builds require a separate explicit selection, as described below.

Development-only Browser Play includes independent Sente/Gote role and board-orientation controls, move-history
navigation, takeover without position mutation, bounded time controls, MultiPV analysis,
local model loading, and 13 selectable CC BY 4.0 piece sets. All play and evaluation are book-free;
Browser Play offers no opening-book upload, opening profiles or persisted analysis preload. The default
casual time control delegates to the engine's adaptive policy with its documented 20-second cap;
fixed, clock, and profile-bounded node limits are serialized through
`open_shogi_time_control/v1`. Thread and hash values reflect the frozen single-threaded Wasm
profile instead of presenting ineffective memory controls.

## Working policy

All development games, strength evaluation and any future production play use ordinary search
without an opening book, fixed first moves, position-to-answer tables, preloaded past analysis or
external teachers during play. Normal search transposition tables remain allowed. Opening game
records and teachers may inform training; teachers may also be used for offline diagnosis.
Future production uses an explicitly reviewed representative-model allowlist. Each game uses one selected configuration throughout; generation order is not strength order.
No new public adoption or weight publication is implied by development changes.

Astra owns strength diagnosis, design, evaluator/search/teacher/training changes, selection,
important review and UI integration. The user starts a separate Luna Max execution session for
fixed data processing, main training, routine evaluation, monitoring and predefined recovery.
Astra performs bounded path/resume checks and stops at the AI repository's `ready_for_luna`
contract; it does not start a Luna subagent or wait as a long-running monitor. Follow
OpenShogiAI `docs/status.md` for the current run contract and state.

## AI integration contract

The four committed files under `src/generated/` are a pinned interface snapshot produced by the
separate OpenShogiAI repository. After regenerating `bindings/wasm/` in the AI repository, copy
all four files together and verify that the snapshots remain byte-identical:

```sh
OPENSHOGIAI_ROOT=../OpenShogiAI npm run integration:ai
```

Only `src/engine.worker.ts` imports the generated JavaScript/Wasm interface. The frozen engine
commit and all four generated hashes are recorded in `PROVENANCE.md`. See `ARCHITECTURE.md` and
`docs/interfaces.md` for the closed message, cache-identity, and artifact boundaries.

## Local core prototype

Development mode uses `#/match`; `#/core-prototype` remains a development alias. Start with
`npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` and reload the page after a
server/binding update. The page prepares the selected model and Wasm before enabling Start.
The defense best1536 candidate remains the initial selection. Choose it, R4-C1 (comparison only, not adopted),
r3 or frozen W256, Sente/Gote, three- or ten-minute
sudden death, and standard/high quality. No opening book is used. Both quality modes pass
the full remaining match clocks to the same engine time policy; quality changes the bounded
search memory allocation. The unvalidated learned controller is explicitly OFF by default.
Model selection stays available during preparation, with cancellation and generation guards. During
play or pause it is disabled; end/reset the match explicitly to change it. Failures show a reason
and a same-model retry. Every replacement physically terminates the previous Worker. This makes
no playing-strength claim. The old prototype uses the same W256 weights plus controller ON; it
is represented by the separate development controller setting, not a duplicate model.

The adjacent OpenShogiAI checkout supplies `target/pure/bindings/open_shogi_wasm.js`,
`target/pure/bindings/open_shogi_wasm_bg.wasm`, `local/frozen/baseline/model.osaval03`, and
`local/core-prototype/controller.json`. A trained candidate becomes available only when the
judgment owner writes `local/core-prototype/candidate.json` after checking its export and
runtime identity. The independent `local/core-prototype/defense.json` descriptor uses the same
format for the defense learning candidate; `candidate.json` continues to identify r3.
`local/core-prototype/r4c1.json` registers `r4-c1-attempt-01-best-step512` from
`local/runs/r4-c1/attempt-01/fit/best.osaval03`, SHA-256
`6b49c3361194011c0c8ac114491dcdb6c67a3b4f4cc6c17262a867572aefb3a6`, with controller null.
It uses the same verified pure runtime as defense best1536. See the AI checkout's
`docs/status.md` for the review; tied Arena scores do not authorize adoption.
These development selections require runtime verification, not completed strength evaluation or release adoption.
Each local descriptor has schema `open_shogi_development_candidate/v1`,
`runId`, `leaf: { path, sha256 }`, and `controller: null | { path, sha256 }`. Artifact paths
must be inside the adjacent checkout's `local/`. A null controller disables ON for that
candidate; the old W256 controller is never silently paired with a new leaf.

The loopback-only development middleware exposes selected, hash-bound manifests and assets
under `/__core-prototype/baseline/`, `/__core-prototype/candidate/`, `/__core-prototype/defense/` or `/__core-prototype/r4c1/`. The baseline leaf must
match the frozen SHA-256. Every response uses no-store, and changed, missing, escaping,
oversized or incompatible artifacts fail visibly. The Worker hashes fetched JS/Wasm/model/controller bytes once; the verified JS bytes run through
a short-lived Blob module and the verified Wasm bytes are passed explicitly. The runtime independently
checks the leaf identity and controller-to-leaf binding. Search diagnostics retain positive learned
evaluation proof and zero forbidden-path counters. No Service Worker or model storage cache is used. The artifact panel
shows the run, leaf/controller/Wasm identities, preparation stages, and each last move's
remaining clocks, quality, target, hard limit, actual search time, total charged user wait,
depth/nodes and stop reason. Save diagnostics exports the full game move list, result, model/runtime identities and search records including PVs.
`game.moveTimes` records every committed human and AI move with charged milliseconds and remaining
clocks, including cancelled-search time before resume and excluding paused time. Downloads stay local.

The dev server sets COOP `same-origin` and COEP `require-corp`. This creates the actual
cross-origin isolation needed for a four-byte SharedArrayBuffer cancellation flag; unsupported
contexts fail before play. Rust polls that flag during synchronous Wasm search. Completed-depth
progress returns audited legal candidates to the main thread. Stop writes the shared flag,
retains the confirmed position, and charges cancellation latency. Resume reuses the healthy
Worker, or restores the same artifacts after a watchdog termination; restoration during a
resumed/active turn remains part of the charged user wait. The engine's monotonic hard deadline,
main-thread atomic cancellation, and final physical Worker watchdog are independent of quality
and the controller. The physical watchdog allows at most 100 ms to acknowledge cancellation.
Flag fall uses elapsed wall time even in hidden tabs, and operation generations reject old
responses after stop, resignation or rematch.

## Explicit representative-model production allowlist

`release-model.json` uses `open_shogi_release_allowlist/v1`, with `default: null` and
`models: []` until a separate publication GO. Ordinary builds fail closed. No model is
promoted automatically. Each entry contains `selection`, `label`, `generation`, hash-bound
`provenance`, and the complete model configuration (`id`, `format`, `runtimeProfile`,
`controllerEnabled`, and four exact artifact keys). Generation values are unique and sorted
newest first. Known representative selections are `r4c2`, `r4c1`, `defense`, `candidate`, `baseline`.
Rights records have schema `open_shogi_model_distribution/v1`, exact `modelSha256`,
`trainingAllowed`, `derivedWeightsAllowed`, and explicit source-audit identifiers.
A rights record is evidence to review, not permission to publish without GO.

All registered bytes, model format, profile and real Wasm load identity are checked before
output. Only allowlisted assets are emitted under `/model/<selection>/`; the public index is
`/model/manifest.json`. Page/Worker bundles contain only public identity/label/generation,
never source paths, training records or optimizer state. Only the selected model is fetched.
The old v1 selection parser remains for local compatibility tests, not a one-model policy.

Local validation (no publication):

```sh
OPENSHOGI_RELEASE_CONFIG=local/r4-c2-preparation/release-allowlist.local.json npm run check
```

The override is inside the adjacent AI checkout, is build-time only, and has no effect on
runtime selection. Analysis/lab changes remain a separate post-training Astra task.

## C2 local post-training integration

The single AI `evaluator_run resume` entry in its `docs/status.md` completes training, audit,
fixed comparison and the `integrate` stage. It updates only the ignored
`OpenShogiAI/local/core-prototype/r4c2.json`, starts/reuses loopback OSUI on port 5175, and runs
`scripts/verify-development-candidate.mjs` against `http://127.0.0.1:5175/#/match`.
The browser checks the real Worker hash, high-quality responses as both colors, stop/rematch,
USI/diagnostic downloads, nonempty rendered board, console and mobile layout.
A failed registration restores the previous descriptor byte-for-byte and leaves failure evidence.
The default remains defense. Candidate registration is possible even when adoption criteria fail.
Luna may execute these reviewed scripts and change that descriptor; it may not edit source code.
The preparation `rehearsal` command uses the same route for the preserved prefix, then restores
its temporary descriptor and never writes main Arena completion receipts.

Vite's [public directory is copied verbatim by default](https://vite.dev/guide/assets#the-public-directory),
so this build disables `copyPublicDir` and emits only allowlisted existing UI assets. It rejects
public symlinks and unexpected assets, ignores Finder metadata, clears its `dist/` output, disables
source maps and rejects non-production builds. The postbuild audit scans the entire output,
including Worker bundles, for assets outside the explicit allowlist, development routes and unselected hashes.
No Service Worker/precache is installed. All model paths use content-bound URLs and no-store.

The committed `public/_headers` and local preview apply COOP/COEP and a same-origin Wasm CSP.
`blob:` is limited to script execution for already hash-verified module bytes; external network
origins remain disallowed. No deployment/upload/release is performed by repository checks.
The legacy `integration:ai` command validates the separate development analysis snapshot.

## License

Project-owned source is licensed under `AGPL-3.0-only`. Generated AI bindings, dependency code,
optional local files, and bundled CC BY 4.0 piece art retain their own applicable scope; see
`LICENSE_SCOPE.md`, `THIRD_PARTY.md`, and `THIRD_PARTY_ASSETS.md`.
