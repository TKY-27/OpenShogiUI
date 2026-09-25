# Third-Party Components

Exact resolved versions and transitive metadata are recorded in `package-lock.json`.

| Component | Purpose | Upstream license family |
| --- | --- | --- |
| React and React DOM | UI runtime | MIT |
| tsshogi | Shogi record serialization (KIF/KI2/CSA) for local saves | MIT |
| encoding-japanese | Shift_JIS byte encoding for KIF/KI2 saves | MIT |
| Vite and its React plugin | production/dev build | MIT |
| TypeScript | static type checking | Apache-2.0 |
| Vitest | unit and component tests | MIT |
| Oxlint | static analysis | MIT |
| Prettier | formatting | MIT |

The generated files under `src/generated/` are produced through `wasm-bindgen` from the separate
OpenShogiAI WebAssembly crate. OpenShogiAI project source is AGPL-3.0-only; `wasm-bindgen` and its
tool/runtime dependencies retain their upstream MIT and/or Apache-2.0 terms. Distribution must
preserve every applicable notice and provide corresponding source where required.

The repository also includes 13 standard-shogi piece sets copied without modification from the
pinned official Lishogi repository. Those images are licensed CC BY 4.0 and retain creator,
source-path, license-evidence, and SHA-256 records in `THIRD_PARTY_ASSETS.md`,
`ASSET_PROVENANCE.json`, and `public/licenses/lishogi-COPYING.md`. No third-party font, icon set,
game-record collection, trained model, or analytics SDK is bundled. This summary does not replace
a complete notices inventory for a distributed build.
