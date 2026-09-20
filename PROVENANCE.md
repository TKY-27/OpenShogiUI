# Provenance

## Clean-history derivation

This candidate was extracted byte-for-byte from the private OpenShogiAI source checkpoint and
then adapted into a standalone UI repository. It does not inherit the private repository's Git
history.

| Field | Value |
| --- | --- |
| Private source commit | `5451e02d35abc3efc1fcc29260cdb89acad1d416` |
| Private source tree | `21bf0c1fbe02250855b66a96f2fe37bd042650d4` |
| Local recovery tag | `private-pre-split-source` |
| Split manifest SHA-256 | `aa3eec7afc3bc9dff5a330eb6c3b3a1ee503baa703073281a906bb3753c01731` |
| Recovery bundle | `OpenShogiAI-private-pre-split.bundle` |
| Recovery bundle SHA-256 | `60504e4fe09686f61f3184008c759a2c0ba43182f4538e67bf170b4717715730` |
| Extraction date | 2026-08-21 JST |

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

| Generated file | SHA-256 |
| --- | --- |
| `open_shogi_wasm.d.ts` | `8b899de7246585f5c7ccafe0b5b2dde012eec0af12a8032d5d4e5741be9cf063` |
| `open_shogi_wasm.js` | `8d36745850bb91e90f93436a9c40d833686cca6c1232ab2c7c9346a59e109023` |
| `open_shogi_wasm_bg.wasm` | `6ad83e2a0631021e08206e505432d940852e94ad46acac6a7b781af1a5de22e6` |
| `open_shogi_wasm_bg.wasm.d.ts` | `efb20b72f02808e77a8baed92fc80fa2f3e1c9b8ce0709f2cd49ed7259933068` |
