# Third-party piece assets

OpenShogiUI includes only the standard-shogi piece artwork listed below from the official
[WandererXII/lishogi repository](https://github.com/WandererXII/lishogi), pinned to commit
[`acb3b12286dd41bc88edfa81172e6a5e7f68c52b`](https://github.com/WandererXII/lishogi/commit/acb3b12286dd41bc88edfa81172e6a5e7f68c52b).
The acquisition date is 2026-08-21. Each retained image was copied byte-for-byte from the
upstream path; no image was resized, re-encoded, renamed, or otherwise modified.

The complete per-file manifest, including upstream and local SHA-256 values, is in
[`ASSET_PROVENANCE.json`](ASSET_PROVENANCE.json). The original upstream license evidence is
preserved at [`public/licenses/lishogi-COPYING.md`](public/licenses/lishogi-COPYING.md), whose
SHA-256 is `3034502d3f88f9110a4a8554e05eca5a823ed2dc1f5d956bf5024dea806d1c52`.

## CC BY 4.0 sets retained

The upstream `COPYING.md` Exceptions (free) table explicitly assigns CC BY 4.0 to these sets
and identifies the creators. Every set contains the 30 standard piece images (`0FU` through
`1UM`, including promoted pieces).

| Set | Upstream directory | Creator(s) | Local directory |
| --- | --- | --- | --- |
| Kanji 3D | `ui/@build/pieces/assets/standard/1kanji_3d` | Little-Mage; CouchTomato87 | `public/pieces/standard/1kanji_3d` |
| International Colored 3D | `ui/@build/pieces/assets/standard/intl_colored_3d` | Little-Mage; CouchTomato87 | `public/pieces/standard/intl_colored_3d` |
| International Colored 2D | `ui/@build/pieces/assets/standard/intl_colored_2d` | CouchTomato87 | `public/pieces/standard/intl_colored_2d` |
| International Monochrome 2D | `ui/@build/pieces/assets/standard/intl_monochrome_2d` | CouchTomato87 | `public/pieces/standard/intl_monochrome_2d` |
| International Shadowed | `ui/@build/pieces/assets/standard/intl_shadowed` | CouchTomato87 | `public/pieces/standard/intl_shadowed` |
| International Wooden 3D | `ui/@build/pieces/assets/standard/intl_wooden_3d` | CouchTomato87 | `public/pieces/standard/intl_wooden_3d` |
| International Variant | `ui/@build/pieces/assets/standard/international` | CouchTomato87 | `public/pieces/standard/international` |
| Kanji Guide Shadowed | `ui/@build/pieces/assets/standard/kanji_guide_shadowed` | CouchTomato87 | `public/pieces/standard/kanji_guide_shadowed` |
| International Portella | `ui/@build/pieces/assets/standard/intl_portella` | CouchTomato87 | `public/pieces/standard/intl_portella` |
| Simple Kanji | `ui/@build/pieces/assets/standard/simple_kanji` | Ka-hu | `public/pieces/standard/simple_kanji` |
| Kanji Red Wood | `ui/@build/pieces/assets/standard/kanji_red_wood` | Ka-hu | `public/pieces/standard/kanji_red_wood` |
| Kanji Light | `ui/@build/pieces/assets/standard/kanji_light` | Ka-hu | `public/pieces/standard/kanji_light` |
| Kanji Brown | `ui/@build/pieces/assets/standard/kanji_brown` | Ka-hu | `public/pieces/standard/kanji_brown` |

The applicable license is Creative Commons Attribution 4.0 International (CC BY 4.0). The
required attribution is preserved in the upstream `COPYING.md` evidence and the creator fields
in the typed catalog and provenance manifest. See the
[CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/) for the license terms.

## Explicit exclusions

No other Lishogi artwork was acquired. In particular, the following standard piece directories
were excluded because `COPYING.md` identifies ShareAlike, NonCommercial, or non-free terms:

| Set(s) | Upstream license/status | Reason |
| --- | --- | --- |
| `2kanji_3d`, `orangain` | CC BY-SA 3.0 | ShareAlike is outside this asset scope. |
| `shogi_cz`, `shogi_bnw`, `ryoko_1kanji`, `logy_games`, `vald_opt`, `valdivia`, `engraved_cz` | CC BY-SA 4.0 | ShareAlike is outside this asset scope. |
| `western` | CC BY-SA 3.0 | ShareAlike is outside this asset scope. |
| `portella`, `portella_2kanji` | CC BY-NC-SA 4.0 | NonCommercial and ShareAlike terms are prohibited. |
| `dobutsu` | All rights reserved; permission granted to Lishogi | Non-free exception and not standard shogi. |

The remaining piece directories are not included because their license is not an explicit CC BY
4.0 grant in the upstream evidence. No logos, sounds, boards, static artwork, CSS, TypeScript,
or other upstream files were copied.
