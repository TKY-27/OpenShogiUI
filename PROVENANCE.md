# Provenance

## Clean-history derivation

This candidate was extracted byte-for-byte from the private OpenShogiAI source checkpoint and
then adapted into a standalone UI repository. It does not inherit the private repository's Git
history.

| Field                   | Value                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| Private source commit   | `5451e02d35abc3efc1fcc29260cdb89acad1d416`                         |
| Private source tree     | `21bf0c1fbe02250855b66a96f2fe37bd042650d4`                         |
| Local recovery tag      | `private-pre-split-source`                                         |
| Split manifest SHA-256  | `aa3eec7afc3bc9dff5a330eb6c3b3a1ee503baa703073281a906bb3753c01731` |
| Recovery bundle         | `OpenShogiAI-private-pre-split.bundle`                             |
| Recovery bundle SHA-256 | `60504e4fe09686f61f3184008c759a2c0ba43182f4538e67bf170b4717715730` |
| Extraction date         | 2026-08-21 JST                                                     |

Files were read from the tagged checkpoint with `git archive` and placed according to the
versioned split manifest. Browser files were lifted from the former `web/` workspace to this
repository root; the four generated WebAssembly files moved to `src/generated/` without byte
changes. Standalone metadata, documentation, boundary checks, and AGPL-3.0-only licensing were
then added in this clean repository.

## Exclusions

No Rust engine source, Python code, acquisition pipeline, dataset object, local artifact, model
weight, credential, machine-local path, or prior commit was imported. The private source and its
verified recovery bundle remain separate and are not publication inputs.

## Generated AI interface

`src/generated/` is a pinned generated snapshot whose corresponding AI-side source and build
instructions live in OpenShogiAI. `npm run integration:ai` compares all four files byte-for-byte
against an explicitly chosen AI checkout. Updating only part of the snapshot is invalid.

The original analysis/time-control protocol snapshot was introduced from OpenShogiAI commit
`1232d015a6b2c3df9abf366137bded245bd14a93` (tree
`57843fb5ed31ec7ac57f933393e1a7d520647cfd`). The interface retains the versioned
`open_shogi_analysis/v1`, `open_shogi_time_control/v1`, and
`open_shogi_resource_budget/v1` contracts.

The previous snapshot was regenerated on 2026-09-12 for the book-free defense campaign.
Its source code commit is `ea7dc1376a30ead0b9571fbe640e24f513198f4c` (tree
`42e38eef28395aa2935382795c46fc440701c7fb`).

On 2026-09-20 the standard analysis Wasm was synchronized with the R4 bounded-mate
source commit `3e83f59cd351dff733e8db390f5ae1304f6921ab`. The other three bindings
were unchanged. All four files match `bindings/wasm/` after `make check` and
`npm run integration:ai`. This standard runtime is separate from the pure-only
Wasm used for the defense/C1 Arena and development matches; those hashes and
results are unchanged.

On 2026-09-29 the snapshot's Wasm binary was synchronized with the parallel
root-partitioned search and resource-aware time-management engine. The binding
was regenerated in OpenShogiAI commit `fc978b3c969eb930b18e4402aa6d727e584cbb09`
(tree `be1b3ee743ddd05a16defd7fdd94d58dae10f910`) and repinned by
`67bb678c27456a681a36b68bb869580d24e219c8`.

On 2026-09-29 the Wasm binary was synchronized again with the correctness pass
over the same engine (Linux topology discovery, self-load-aware AutoThreads,
continuous emergency clock ramp, a browser play clock that persists across
match moves, and an exactness fix in the parallel root merge), and on
2026-09-30 with the follow-up that persists the same play clock, spend
observation and reset/restore lifecycle in the bundled browser runtime as
well, and keeps a rejected superseding search from cancelling the previous
one. The binding was regenerated in OpenShogiAI commit
`94a3d5138c8a389b623d4b4ecd01bf23e164804d` (tree
`7491159bea7c155360aaf041477cace4a22b9b62`). The three text bindings are unchanged, so
`searchWithTimeControl` keeping the match clock state across calls is invisible
to the TypeScript surface.

On 2026-10-01 the snapshot's Wasm binary was synchronized once more with the
parallel-search repair round (one shared deadline and one shared node budget
per `go`, helper fork accounting, fork TT reuse, chained accumulator parity
verification) regenerated in OpenShogiAI commit
`196055ffa4adf3d8a28a332080189dd92681fe83`. Only the binary changed; the three
text bindings are unchanged. Later the same day the binary was synchronized
again with the mate-prepass budget closeout, in which one `go` pays the
search controller's mate prepass from the same shared node pool and under the
same absolute deadline as every worker, regenerated in OpenShogiAI commit
`9433ffce1f4f21bb042e0b6cee858b1a674542d3`. Only the binary changed again;
the three text bindings are unchanged, so the TypeScript surface stays
identical.

## Pure-only play runtime

The production match worker does not execute the analysis snapshot above. It
loads the pure-only runtime (`--no-default-features --features pure-only`)
built by `make pure-build` in OpenShogiAI, hash-pinned by `release-model.json`
and fetched into the build mirror by `scripts/fetch-release-models.mjs`. The
regenerated post-repair runtime replaced the pre-repair Wasm
(`ab7fcf0e2433afeea630dbf029f6dc2e9c1130ea315ae189805cda80e1ef8b3a`) on
2026-10-01, ahead of any models-v1 republish. Because the published models-v1
release keeps serving the pre-repair bytes and must not be moved for this fix,
the verified runtime bytes are additionally tracked in this repository under
`assets/pure-runtime/` and `release-assets.json` marks those two entries as
`tracked` sources; weights and rights records continue to come from models-v1.
The rebuild from OpenShogiAI `196055ffa4adf3d8a28a332080189dd92681fe83`
reproduced those bytes byte-for-byte (wasm-bindgen output is deterministic for
the same source and flags). Later on 2026-10-01 the tracked Wasm was replaced
again with the mate-prepass budget closeout rebuild, whose every build input is
content-identical to OpenShogiAI commit
`9433ffce1f4f21bb042e0b6cee858b1a674542d3`; the staged bytes were taken from
that closeout's durable handoff copy and re-verified against the hash below.
The tracked JavaScript is unchanged and still reproduces from the same
command.

| Pure runtime file                          | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `assets/pure-runtime/open_shogi_wasm.js`   | `907da1421263a2cbc621297095d13ccd3f707942b1e6f09bd7a2b2512efeee2e` |
| `assets/pure-runtime/open_shogi_wasm_bg.wasm` | `b1ce9a381f47367017aa8b891aa76b5a0356308b019093039536222930a90b67` |

The frozen R4 weights stay
`9466a7e8cf11b7d165b325edd9a5a421bdbaa4bed550940afcf33c9faf3bfd0f`
(`osai-r4.osaval03` in the models-v1 release); no weight, rights record or
release tag moved.

| Generated file                 | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `open_shogi_wasm.d.ts`         | `8b899de7246585f5c7ccafe0b5b2dde012eec0af12a8032d5d4e5741be9cf063` |
| `open_shogi_wasm.js`           | `8d36745850bb91e90f93436a9c40d833686cca6c1232ab2c7c9346a59e109023` |
| `open_shogi_wasm_bg.wasm`      | `d99db1f648f5adc0efb46927dd0b1f22a77f0334adcb457656576a66fb76fc36` |
| `open_shogi_wasm_bg.wasm.d.ts` | `efb20b72f02808e77a8baed92fc80fa2f3e1c9b8ce0709f2cd49ed7259933068` |
