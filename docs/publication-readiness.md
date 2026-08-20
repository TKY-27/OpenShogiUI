# Publication Readiness

This document describes a local release-candidate boundary. It is not a deployment record,
security certification, or legal opinion.

## Static build

- repository root: `/`
- build command: `npm ci --ignore-scripts && npm run build`
- output directory: `dist`
- runtime: Node.js `>=22.13 <23`, npm `>=10 <11`

Vite emits content-hashed Worker, JavaScript, CSS, and WebAssembly assets. Fragment routes need no
server rewrite. `public/_headers` supplies a same-origin CSP with the narrow
`wasm-unsafe-eval` capability, denies framing and unnecessary browser permissions, and limits
immutable caching to hashed assets.

## Browser data boundary

- Play and continuous analysis run in separate module Workers.
- Locally chosen model and opening-book bytes remain in memory and are never uploaded.
- IndexedDB stores only bounded analysis summaries with full request identity; storage failure
  falls back to memory without weakening live-update validation.
- Imported report JSON is parsed locally and never causes referenced files to be fetched.
- The application has no analytics, telemetry, account, payment, or remote-model integration.

## License and content gate

Project-owned source is AGPL-3.0-only. The generated AI interface and npm dependencies retain all
applicable project and upstream notices. The 13 bundled standard-shogi piece sets are CC BY 4.0;
their creators, original license evidence, pinned source commit, and per-file hashes are retained
in `THIRD_PARTY_ASSETS.md`, `public/licenses/`, and `ASSET_PROVENANCE.json`. No trained model,
dataset, private record, or private Git history is included. Before publication, review the final
notices, preserve attribution, and provide corresponding source required by AGPL-3.0-only.

## Remaining external gate

Run the current candidate's functional and responsive checks in supported Safari, Firefox, and
Chromium versions, inspect headers on the actual host, and obtain explicit approval before any
push, upload, release, or deployment.
