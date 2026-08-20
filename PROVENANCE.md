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
