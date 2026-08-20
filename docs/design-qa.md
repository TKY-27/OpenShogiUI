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
| Responsive structure | Three-column desktop, two-column intermediate, and stacked mobile layout without board overflow |
| Accessibility | 44px controls, visible focus, labelled controls, live status, dialog and grid semantics |
| Visual language | Warm paper shell, ink, muted vermilion, pale indigo, crisp separators, and square geometry |
| Piece art | One active CC BY 4.0 set loads at a time; fixed frames prevent layout shift and kanji remains the failure fallback |

The target visual was generated as a concept before implementation and is not shipped as an
asset. Browser QA compares the implementation with that target at desktop and mobile dimensions.
Decorative motion is intentionally absent: patterns explain board state, controls preserve stable
geometry, and status copy reports observed engine/cache state without invented strength or timing
claims.
