# Development guide

Operational details for developing, verifying and releasing OpenShogiUI.
Public-facing overview: [../README.md](../README.md). Interface contracts:
[interfaces.md](interfaces.md).

## Development server

```sh
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/#/match`. The development match defaults to
defense best1536 and offers the registered generations (OSAI R4 / R4-C4, C3,
C1, defense, r3, frozen W256) in `最新←→開発初期` order — development order,
not a strength ranking. C2 aliases the identical defense configuration.
`#/analysis` uses the same model list with a separate bounded analysis budget
and never plays moves automatically. `#/browser-play` and `#/evaluation-lab`
are development-only routes.

The development server reads model artifacts from the adjacent
[OpenShogiAI](https://github.com/TKY-27/OpenShogiAI) checkout via loopback
middleware under `/__core-prototype/<selection>/` (descriptors in that
repository's ignored `local/core-prototype/`). Every artifact is hash-bound;
changed, missing, escaping, oversized or incompatible artifacts fail visibly.
`npm run dev:isolated` (port 5186) serves the same UI from ignored
`local/model-assets/` copies instead, via `OSUI_ISOLATED_MODELS=1`.

The dev server sets COOP `same-origin` / COEP `require-corp` for the
SharedArrayBuffer cancellation flag used to stop synchronous Wasm search.
Stop/resume, watchdog termination and operation generations behave as
described in [interfaces.md](interfaces.md). Hands show held kinds in
飛・角・金・銀・桂・香・歩 order with identical counts on mobile and desktop.

## Verification

```sh
npm run check            # format, lint, typecheck, tests, a11y, boundaries,
                         # license/provenance/asset audits, production build
OPENSHOGIAI_ROOT=../OpenShogiAI npm run integration:ai   # bindings snapshot
```

The four files under `src/generated/` are a pinned snapshot produced by the
OpenShogiAI repository; regenerate there, copy all four together and verify
byte identity with `integration:ai`. `PROVENANCE.md` records the frozen
engine commit and hashes.

Local UI regression (uses the isolated dev server plus a local collection
Worker; no network, no deployment):

```sh
npm run dev:isolated
npm run test:ui:local -- http://127.0.0.1:5186 local/ui-check
```

## Production model allowlist

`release-model.json` (`open_shogi_release_allowlist/v1`) is the reviewed
publication allowlist: `default`, and per entry `selection`, `label`,
`generation` (unique, newest first), hash-bound `provenance` rights record,
and the full model configuration (id, format, runtimeProfile,
controllerEnabled, four exact artifact keys). Duplicate weight/runtime
configurations are rejected even under different labels; controller-enabled
entries are rejected for representative release models.

A plain `npm run build` reads artifacts from the adjacent OpenShogiAI
checkout (fail-closed without it). The Cloudflare build
(`npm run build:cloudflare`) instead fetches the artifacts recorded in
`release-assets.json` from the fixed OpenShogiAI release tag (or a local
mirror via `OPENSHOGI_ASSET_MIRROR`) into `local/model-assets/`, verifying
every sha256, then builds with `OSUI_ISOLATED_MODELS=1`. Builds never follow
a moving tag and never contact GitHub at visitor runtime.

Build-time guarantees: all registered bytes, model format, profile and real
Wasm load identity are checked before output; only allowlisted assets are
emitted under content-hashed `/model/<sha256>/` URLs plus
`/model/manifest.json`; `copyPublicDir` is disabled and only registered
public UI assets are emitted; source maps are rejected; the post-build audit
scans the entire output for unregistered assets. Production weights are
static gzip files decoded in the browser before size/hash verification.
A `OPENSHOGI_RELEASE_CONFIG` override (inside the AI checkout) remains
available for local QA configs.

## Opt-in game collection

Collection is a build-time profile. Local and plain production builds are
disabled (no consent prompt, no API calls). `npm run build:cloudflare` sets
`OSUI_COLLECTION_PROFILE=on`, which enables the consent dialog and wires the
exact allowlisted OSAI R4 identity (model/js/wasm hashes) into both the
client and the generated Worker configuration. The Worker additionally
refuses submissions unless deployed with `COLLECTION_ENABLED=true`, a
matching `COLLECTION_NOTICE_VERSION` and a non-empty `COLLECTION_CONTACT`.

Privacy design: one structured submission per finished eligible game
(initial position, OSAI R4 only, resignation/checkmate endings), random
per-game UUID, no names/email/IP/User-Agent storage, deduplication by
payload and move-list hashes, 30-day expiry with daily batched deletion via
the scheduled handler. See `#/privacy` in the app and
`worker/index.ts`. Local tests:

```sh
npm run collection:migrate:local   # local D1 schema (local/collection-db)
npm run collection:local           # local Worker on 127.0.0.1:5187 (disabled)
npm run test:collection            # unit tests incl. worker handler
npm run test:collection:local      # local D1 end-to-end verification
```

## Brand assets and metadata

`assets/brand.svg` is the editable source for the favicon, 16/32/180px
icons and the 1200×630 OGP image (`npm run brand:generate`, local
Chrome/Playwright only, `PLAYWRIGHT_MODULE` override; generated files are
committed). Site title/description/OGP are injected at build time from
`site-metadata.ts`; the public origin comes from `PUBLIC_SITE_URL`
(Cloudflare build) or `project.config.json` `publicOrigin`. An unset origin
omits canonical/og:url and stays `noindex`. Operator identity and contact
live in `project.config.json`.

## Deployment

Production deployment is Cloudflare Workers Static Assets + a small API
Worker + D1. See [deploy-cloudflare.md](deploy-cloudflare.md) for the full
user procedure. Repository entry points:

- `npm run build:cloudflare` — fetch/verify models, build, generate
  `wrangler.deploy.jsonc` from `OSAI_D1_DATABASE_ID` and `PUBLIC_SITE_URL`.
- `npm run deploy:cloudflare` — deploy the generated config (Cloudflare
  Build only; refuses to deploy a collection-disabled config without the
  D1 ID).
- `wrangler.jsonc` — tracked base configuration (Worker name `openshogiai`,
  assets, loopback-only local D1 placeholder for `wrangler dev`).
