# OpenShogiUI working rules

- `npm run check` is the verification gate (format, lint, typecheck, tests,
  accessibility, boundaries, license/provenance/asset audits, production
  build). Keep it green; run `integration:ai` when the shared Wasm contract
  changes.
- Play and analysis are book-free in every build: no opening books, fixed
  first moves, position tables or online engines. Model selection is
  generation order (`最新←→開発初期`), never a strength ranking.
- Models ship only through the reviewed `release-model.json` allowlist with
  hash-bound rights records; verify every artifact byte before release and
  never bundle an unreviewed checkpoint. Weights are fetched from the fixed
  OpenShogiAI release tag at build time, never at visitor runtime.
- Game collection stays opt-in: local/plain builds disabled; the Cloudflare
  profile enables it with the exact allowlisted identity, consent version and
  contact. Keep the closed submission schema, size limits, no-PII and 30-day
  purge behavior.
- Generated data, fetched model assets, local DBs and QA evidence belong in
  ignored `local/`; never commit weights, secrets or machine-specific paths.
  `wrangler.deploy.jsonc` is generated (account-specific) and stays ignored.
- OpenShogiAI is a separate repository; coordinate engine/binding changes
  there and keep `src/generated/` byte-identical via `integration:ai`.
