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
npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

Open `http://127.0.0.1:5176/#/match`. The development match defaults to the locally registered
r3 candidate and offers the frozen W256 comparison. The legacy analysis/lab routes are development
only. Production builds require a separate explicit selection, as described below.

Development-only Browser Play includes independent Sente/Gote role and board-orientation controls, move-history
navigation, takeover without position mutation, bounded time controls, MultiPV analysis, opening
profiles, local opening-book/model loading, and 13 selectable CC BY 4.0 piece sets. The default
casual time control delegates to the engine's adaptive policy with its documented 20-second cap;
fixed, clock, and profile-bounded node limits are serialized through
`open_shogi_time_control/v1`. Thread and hash values reflect the frozen single-threaded Wasm
profile instead of presenting ineffective memory controls.

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
`npm run dev -- --host 127.0.0.1 --port 5176 --strictPort` and reload the page after a
server/binding update. The page prepares the selected model and Wasm before enabling Start.
Select the frozen W256 or a prepared training candidate, Sente/Gote, three- or ten-minute
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
runtime identity. That one local descriptor has schema `open_shogi_development_candidate/v1`,
`runId`, `leaf: { path, sha256 }`, and `controller: null | { path, sha256 }`. Artifact paths
must be inside the adjacent checkout's `local/`. A null controller disables ON for that
candidate; the old W256 controller is never silently paired with a new leaf.

The loopback-only development middleware exposes selected, hash-bound manifests and assets
under `/__core-prototype/baseline/` or `/__core-prototype/candidate/`. The baseline leaf must
match the frozen SHA-256. Every response uses no-store, and changed, missing, escaping,
oversized or incompatible artifacts fail visibly. The Worker hashes fetched JS/Wasm/model/controller bytes once; the verified JS bytes run through
a short-lived Blob module and the verified Wasm bytes are passed explicitly. The runtime independently
checks the leaf identity and controller-to-leaf binding. Search diagnostics retain positive learned
evaluation proof and zero forbidden-path counters. No Service Worker or model storage cache is used. The artifact panel
shows the run, leaf/controller/Wasm identities, preparation stages, and each last move's
remaining clocks, quality, target, hard limit, actual search time, total charged user wait,
depth/nodes and stop reason. Save diagnostics exports the bounded latest 128 search records.

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

## One-model production build

`release-model.json` is the explicit release selection and currently contains `model: null`:
public adoption is **undecided**. An ordinary `npm run build` therefore fails clearly. It never
selects latest, the development candidate, or a champion automatically. Model files remain outside
this Git repository. The existing standard snapshot is retained for development analysis and is
not included in the production output.

For the authorized local structure test, the adjacent AI checkout holds a temporary selection:

```sh
OPENSHOGI_RELEASE_CONFIG=local/runs/evaluator-20260910/diagnosis/astra-browser-r3/release-selection.local.json npm run check
npm run preview -- --host 127.0.0.1 --port 4176 --strictPort
```

The override path is relative to the adjacent AI checkout and must stay inside it. It is used only
by the build process. Preview serves the completed `dist/`; it does not read the development
registry or this environment variable. Open `http://127.0.0.1:4176/#/match`. This local test is not
release adoption, weight publication, a deployment or a champion change.

A selection has schema `open_shogi_release_selection/v1` and exactly one `model` object with `id`,
`format: "OSAVAL03"`, `runtimeProfile: "pure_learned-v3"`, `controllerEnabled`, and `artifacts`.
The exact artifact keys are `engine.js`, `engine.wasm`, `leaf.osaval03`, `controller.json`.
Each component specifies `{ path, sha256 }`; the controller may be null only when disabled.
Paths must be registered files inside the AI checkout's `local/` or `target/`. The build checks
all actual bytes and loads the evaluator/controller with the selected Wasm before emitting.
Missing/multiple selections, wrong format/hash and incompatible configurations stop the build.

Only this one configuration is emitted under `/model/release/`, with an output identity manifest
at `/model/manifest.json`. Both the page and Worker compile the sole allowed manifest and controller
setting. Query/hash/localStorage and runtime flags cannot activate development selection. Model
selection UI, upload/analysis/lab routes and their alternate runtime are absent from production.
Standard/high-quality and ordinary match settings remain available.

Vite's [public directory is copied verbatim by default](https://vite.dev/guide/assets#the-public-directory),
so this build disables `copyPublicDir` and emits only allowlisted existing UI assets. It rejects
public symlinks and unexpected assets, ignores Finder metadata, clears its `dist/` output, disables
source maps and rejects non-production builds. The postbuild audit scans the entire output,
including Worker bundles, for extra models/runtime binaries, development routes and unselected hashes.
No Service Worker/precache is installed. All model paths use content-bound URLs and no-store.

The committed `public/_headers` and local preview apply COOP/COEP and a same-origin Wasm CSP.
`blob:` is limited to script execution for already hash-verified module bytes; external network
origins remain disallowed. No deployment/upload/release is performed by repository checks.
The legacy `integration:ai` command validates the separate development analysis snapshot.

## License

Project-owned source is licensed under `AGPL-3.0-only`. Generated AI bindings, dependency code,
optional local files, and bundled CC BY 4.0 piece art retain their own applicable scope; see
`LICENSE_SCOPE.md`, `THIRD_PARTY.md`, and `THIRD_PARTY_ASSETS.md`.
