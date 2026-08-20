# OpenShogiUI

OpenShogiUI is the standalone browser interface for OpenShogiAI. It supports local browser play,
position analysis, and import-only inspection of bounded arena reports. The WebAssembly engine,
game state, search, and optional model stay in a module Worker on the user's device.

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

## AI integration contract

The four committed files under `src/generated/` are a pinned interface snapshot produced by the
separate OpenShogiAI repository. After regenerating `bindings/wasm/` in the AI repository, copy
all four files together and verify that the snapshots remain byte-identical:

```sh
OPENSHOGIAI_ROOT=../OpenShogiAI-final npm run integration:ai
```

Only `src/engine.worker.ts` imports the generated JavaScript/Wasm interface. See
`ARCHITECTURE.md` and `docs/interfaces.md` for the closed message and artifact boundaries.

## Static hosting preparation

For a future Cloudflare Pages project, use the repository root, build command
`npm ci --ignore-scripts && npm run build`, and output directory `dist`. The committed
`public/_headers` supplies the same-origin WebAssembly CSP and other static response headers.
No deployment, upload, release, or remote push is performed by this repository's checks.

## License

Project-owned source is licensed under `AGPL-3.0-only`. Generated AI bindings, dependency code,
and optional local model files retain their own applicable scope; see `LICENSE_SCOPE.md` and
`THIRD_PARTY.md`.
