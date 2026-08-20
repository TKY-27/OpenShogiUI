# Third-Party Components

Exact resolved versions and transitive metadata are recorded in `package-lock.json`.

| Component | Purpose | Upstream license family |
| --- | --- | --- |
| React and React DOM | UI runtime | MIT |
| Vite and its React plugin | production/dev build | MIT |
| TypeScript | static type checking | Apache-2.0 |
| Vitest | unit and component tests | MIT |
| Oxlint | static analysis | MIT |
| Prettier | formatting | MIT |

The generated files under `src/generated/` are produced through `wasm-bindgen` from the separate
OpenShogiAI WebAssembly crate. OpenShogiAI project source is AGPL-3.0-only; `wasm-bindgen` and its
tool/runtime dependencies retain their upstream MIT and/or Apache-2.0 terms. Distribution must
preserve every applicable notice and provide corresponding source where required.

This repository includes no third-party font, image, icon set, game-record collection, trained
model, or analytics SDK. The piece presentation uses text and project-authored CSS. This summary
does not replace a complete notices inventory for a distributed build.
