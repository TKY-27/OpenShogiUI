# Browser Play Design QA

## Verified product constraints

| Requirement | Candidate behavior |
| --- | --- |
| Canonical geometry | 9 rows, 81 cells, files 9–1, ranks 一–九 |
| Initial position | 40 pieces with canonical rook, bishop, and pawn placement |
| Player role | Sente, Gote, AI-vs-AI, and analysis-only roles do not mutate side to move |
| Orientation | Board flip is independent from human role; piece names remain semantic text |
| History | Initial/current positions and every move are keyboard-selectable without mutating the live game |
| Analysis density | Three lines by default, up to ten bounded live or cached lines |
| State markings | Selection, legal moves, last origin/destination, drop, capture, promotion, mate king, and PV use shape/pattern as well as color |
| Responsive structure | One mobile-first system on an ascending min-width ladder (48rem / 64rem / 80rem); no max-width query remains |
| Desktop page scroll | None. The shell is 100dvh from 80rem up and the rail, board, and analysis panes scroll individually |
| Board sizing | Derived from min(available width, available height, 46rem) via a size query container, so viewport height is an input |
| Match mode | `#/match` renders board, hands, clocks, move number, and controls only; no evaluation, PV, depth, or node count reaches the DOM |
| Accessibility | 44px targets scoped to coarse pointers, visible focus, labelled controls, live status, modal `<dialog>` semantics, and keyboard shortcuts that never intercept text entry or IME composition |
| Visual language | Warm paper shell, ink, muted vermilion, pale indigo, crisp separators, and square geometry |
| Piece art | One active CC BY 4.0 set loads at a time; fixed frames prevent layout shift and kanji remains the failure fallback |

Composition follows a dense analysis-tool reference: thin app bar, grouped left rail, board
flanked by vertical hand stands, and a right analysis column. Only structure and proportion were
taken from it; no asset, wording, colour, or branding was copied, and the palette remains the
project's own paper, ink, and vermilion.

The defaults that AI-generated interfaces converge on are avoided deliberately: no Inter, no
gradients, no centred marketing hero, no three-column card rows, no rounded-card chrome. Square
geometry and rule-based separation carry the hierarchy instead. Decorative motion is still absent:
patterns explain board state, controls preserve stable geometry, and status copy reports observed
engine and cache state without invented strength or timing claims.

Measured on the production build, all four routes, zero horizontal overflow throughout:

| Viewport | Page scroll | Board |
| --- | --- | --- |
| 1920x1080 | none | 718px |
| 1440x900 | none | 614px |
| 1280x800 | none | 454px |
| 768x1024 | document flow | 551px |
| 375x812 | document flow | 333px |

Safari and Firefox remain an external publication gate; these figures are Chromium only.
