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

The analysis/time-control update pins OpenShogiAI commit
`1232d015a6b2c3df9abf366137bded245bd14a93` (tree
`57843fb5ed31ec7ac57f933393e1a7d520647cfd`). That committed engine checkout provides the frozen
`open_shogi_analysis/v1`, `open_shogi_time_control/v1`, and
`open_shogi_resource_budget/v1` contracts. The four generated files were copied together from
its `bindings/wasm/` output and remain byte-identical under `npm run integration:ai`.

| Generated file | SHA-256 |
| --- | --- |
| `open_shogi_wasm.d.ts` | `19f8a5a9f786666d2a736daff7cedae9fa9c77a55f6e6ed85950882e0e07eee9` |
| `open_shogi_wasm.js` | `b0862ea56ee808c2feabe2ab67128d317fdbb824856b47fe6fabd5dbfac40d88` |
| `open_shogi_wasm_bg.wasm` | `49034d4d1cff1e004eceaf1e62b309d9882516e039457c09a758904217fd3805` |
| `open_shogi_wasm_bg.wasm.d.ts` | `25de209ae4d389487b6b7db0ae895e935fdd84fa62a9bad0dbadf08ec7c910cd` |
