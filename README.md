# OpenShogiUI

OpenShogiUI is the standalone browser interface for OpenShogiAI. It supports local browser play,
continuous position analysis, and import-only inspection of bounded arena reports. Separate play
and analysis module Workers keep WebAssembly game state, search, optional models, and optional
opening books on the user's device.

This clean-history repository contains the UI only. It has no Rust engine source, Python
training stack, data-acquisition pipeline, local model, or private source history.

## Requirements

- Node.js `>=22.13 <23`
- npm `>=10 <11`

## Development

```sh
npm ci --ignore-scripts
npm run check
```

For local development and production preview:

```sh
npm run dev
npm run build
npm run preview
```

The build output is `dist/`. Hash routes provide Workspace, Browser Play, and Evaluation Lab
without requiring server-side route rewrites.

Browser Play includes independent Sente/Gote role and board-orientation controls, move-history
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

Development mode adds an explicit Workspace link to `#/core-prototype`. Start with
`npm run dev -- --host 127.0.0.1 --port 5176 --strictPort` and reload the page after a
server/binding update. The page prepares the selected model and Wasm before enabling Start.
Select the frozen W256 or a prepared training candidate, Sente/Gote, three- or ten-minute
sudden death, and standard/high quality. No opening book is used. Both quality modes pass
the full remaining match clocks to the same engine time policy; quality changes the bounded
search memory allocation. The unvalidated learned controller is explicitly OFF by default.
Candidate/controller selection is fixed for the match; no alternate evaluator is loaded after
a failure. This development route makes no playing-strength claim.

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
oversized or incompatible artifacts fail visibly. Both the loaded model identity and the
controller-to-leaf binding are checked by the pure runtime and the Worker. The artifact panel
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

The ordinary `#/match` route uses the existing committed standard Wasm snapshot and its bundled
`overall-champion` evaluator; it does not load the frozen W256 or this training candidate.
The normal route now rejects stale responses after flag fall and includes move-validation and
response delivery in clock charges, but its old Wasm time allocation and synchronous transport
are **not** the new development runtime. Use `#/core-prototype` for the corrected engine clock
comparison. Updating the public/default artifact remains a separate decision.

Neither weights nor pure bindings are copied into this repository. Production builds exclude
the prototype module and artifact endpoint, checked by the build command. The existing committed
Wasm snapshot and public default evaluator remain unchanged. The legacy `integration:ai`
command validates that separate pinned standard snapshot, not this development route.

## Static hosting preparation

For a future Cloudflare Pages project, use the repository root, build command
`npm ci --ignore-scripts && npm run build`, and output directory `dist`. The committed
`public/_headers` supplies the same-origin WebAssembly CSP and other static response headers.
No deployment, upload, release, or remote push is performed by this repository's checks.

## License

Project-owned source is licensed under `AGPL-3.0-only`. Generated AI bindings, dependency code,
optional local files, and bundled CC BY 4.0 piece art retain their own applicable scope; see
`LICENSE_SCOPE.md`, `THIRD_PARTY.md`, and `THIRD_PARTY_ASSETS.md`.
