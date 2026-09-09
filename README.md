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
`npm run dev -- --host 127.0.0.1 --strictPort`, select Sente/Gote and learned computation
control on/off, then start a three-minute sudden-death game. Stop terminates the search Worker;
Resume restores the last confirmed position with the same artifacts and remaining clocks.
Resignation, flag fall, and terminal positions prevent subsequent moves. Rematch returns to
the side/control choices. This local prototype makes no playing-strength claim.

The adjacent OpenShogiAI checkout must contain `target/pure/bindings/open_shogi_wasm.js`,
`target/pure/bindings/open_shogi_wasm_bg.wasm`, `local/frozen/baseline/model.osaval03`, and
`local/core-prototype/controller.json`. The dev middleware serves only these four allowlisted
files to loopback, same-origin requests. Its manifest binds their sizes and SHA-256 hashes;
the leaf must match the frozen W256 baseline. Missing, changed, oversized or incompatible
artifacts fail closed. Controller links must remain within that AI checkout.

Play uses the pure evaluator with no opening book and the `eco` profile, leaving time allocation
to the engine. The learned controller changes computation only; on/off uses the same leaf and
controller identities. Neither weights nor pure bindings are copied into this repository.
Production builds exclude the prototype module and artifact endpoint, checked by the build
command. The existing committed Wasm snapshot and default play evaluator remain unchanged.

## Static hosting preparation

For a future Cloudflare Pages project, use the repository root, build command
`npm ci --ignore-scripts && npm run build`, and output directory `dist`. The committed
`public/_headers` supplies the same-origin WebAssembly CSP and other static response headers.
No deployment, upload, release, or remote push is performed by this repository's checks.

## License

Project-owned source is licensed under `AGPL-3.0-only`. Generated AI bindings, dependency code,
optional local files, and bundled CC BY 4.0 piece art retain their own applicable scope; see
`LICENSE_SCOPE.md`, `THIRD_PARTY.md`, and `THIRD_PARTY_ASSETS.md`.
