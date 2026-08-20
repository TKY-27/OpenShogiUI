# Browser Play Design QA

## Verified product constraints

| Requirement | Candidate behavior |
| --- | --- |
| Canonical geometry | 9 rows, 81 cells, files 9–1, ranks 一–九 |
| Initial position | 40 pieces with canonical rook, bishop, and pawn placement |
| Player orientation | White pieces rotate; accessible names remain text |
| Analysis density | One line by default, up to three bounded lines |
| Serious-match focus | Analysis and settings leave the DOM after play starts |
| Responsive structure | Square board without horizontal scrolling at tested desktop/mobile sizes |
| Accessibility | Visible focus, labelled controls, live status, dialog and grid semantics |
| Visual language | Paper, ink, red accent, semantic text pieces, no copied artwork |

The original private checkpoint was visually inspected at desktop and mobile dimensions. The
clean candidate preserves those source files byte-for-byte before rebranding and must repeat
browser checks before publication. Semantic kanji pieces avoid third-party image assets; layout,
typography, spacing, and the established red accent provide hierarchy without decorative metrics
or unverified data.
