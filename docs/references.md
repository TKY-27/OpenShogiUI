# References

| Topic | Reference | Consulted | Use |
| --- | --- | --- | --- |
| GNU AGPLv3 | [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.html) | 2026-08-21 | Exact license text and conditions for project-owned source |
| SPDX identifier | [SPDX License List](https://spdx.org/licenses/) | 2026-08-21 | Canonical `AGPL-3.0-only` identifier |
| React 19 | [React documentation](https://react.dev/) | 2026-07-29 | Reducer state, effects, rendering, and accessibility behavior |
| Vite 8 | [Vite documentation](https://vite.dev/guide/) | 2026-08-20 | Static build, module Worker, and content-hashed assets |
| wasm-bindgen | [wasm-bindgen documentation](https://rustwasm.github.io/docs/wasm-bindgen/) | 2026-08-20 | Generated JavaScript/TypeScript/WebAssembly boundary |
| Cloudflare static headers | [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/) | 2026-08-20 | Location and syntax of static response headers |
| WebAssembly CSP | [MDN `script-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) | 2026-08-20 | Narrow WebAssembly compilation permission without JavaScript `unsafe-eval` |
| IndexedDB | [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | 2026-08-21 | Local bounded analysis-summary persistence and failure behavior |
| Analysis/time protocol | OpenShogiAI commit `1232d015a6b2c3df9abf366137bded245bd14a93`, `docs/protocol/` | 2026-08-21 | Frozen `open_shogi_analysis/v1`, `open_shogi_time_control/v1`, and resource-budget identities |
| Standard piece art | [WandererXII/lishogi pinned commit](https://github.com/WandererXII/lishogi/tree/acb3b12286dd41bc88edfa81172e6a5e7f68c52b/ui/%40build/pieces/assets/standard) | 2026-08-21 | Exact unmodified source images for the 13 retained CC BY 4.0 sets |
| Piece-art license evidence | [Lishogi `COPYING.md` at pinned commit](https://github.com/WandererXII/lishogi/blob/acb3b12286dd41bc88edfa81172e6a5e7f68c52b/COPYING.md) | 2026-08-21 | Per-set license and creator evidence; exclusion of ShareAlike, NonCommercial, and non-free sets |
| CC BY 4.0 | [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) | 2026-08-21 | Attribution requirements for retained piece artwork |
| Product calm and consistency | [Linear design refresh](https://linear.app/now/behind-the-latest-design-refresh) | 2026-08-20 | Calmer hierarchy and predictable action placement as general design principles |
| AI-generated UI failure modes | [925studios, *AI Slop Web Design*](https://www.925studios.co/blog/ai-slop-web-design-guide), [vibecodekit, *AI Slop Design*](https://vibecodekit.dev/ai-slop-design), [BSWEN, *AI-Generated UI Anti-Patterns*](https://docs.bswen.com/blog/2026-03-20-ai-generated-ui-anti-patterns/) | 2026-08-21 | Named defaults to avoid: Inter, purple/blue gradients, centred hero, three-column card rows, rounded-card chrome, missing focus and empty states |
| Dense analysis-tool composition | Kishin Analytics, user-supplied screenshot | 2026-08-21 | Structure and proportion only: thin app bar, grouped left rail, board flanked by hand stands, right analysis column, compact control heights. No asset, wording, colour, or branding was copied |
| Board sizing | [lichess-org/chessground](https://github.com/lichess-org/chessground) | 2026-08-21 | Sizing a board from the smaller of available width and height rather than width alone |
| Interaction judgment | [Emil Kowalski, *Train your judgement*](https://emilkowal.ski/ui/train-your-judgement) | 2026-08-20 | Evaluation of whether motion or decoration explains an interaction |

No third-party interface code, shogi-engine source, game records, datasets, or model weights were
copied into this UI candidate. Piece-art acquisition is limited to the manifest recorded in
`ASSET_PROVENANCE.json`.
