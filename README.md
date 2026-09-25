# OpenShogiUI (OSUI)

[日本語はこちら](README.ja.md)

OpenShogiUI is the browser application for playing shogi against — and
analyzing positions with — the learned models of
[OpenShogiAI (OSAI)](https://github.com/TKY-27/OpenShogiAI). Play against the
engine in real time with clocks, or load any position and inspect it with the
same learned evaluation. Everything runs in your browser via WebAssembly; no
server-side engine is involved in play or analysis.

This repository ([OpenShogiUI](https://github.com/TKY-27/OpenShogiUI))
contains the UI only. The Rust engine, model format, training stack and model
distribution live in
[OpenShogiAI](https://github.com/TKY-27/OpenShogiAI).

Project by [TKY-27](https://github.com/TKY-27).

## Features

- **Browser play** against OSAI learned models: 3-minute / 10-minute
  sudden-death clocks, standard/high-quality search, either side, mobile and
  desktop layouts, move markers, promotion/drop UI, resignation and rematch,
  local kifu download (KIF by default, KI2/CSA/USI selectable) and diagnostics download. Book-free: no opening books, fixed
  first moves or online engines.
- **Learned analysis**: load a position (or continue from a game) and search
  with any released model; results are search scores of that model, with no
  automatic moves.
- **Representative model generations**: the published allowlist ships OSAI R4
  (the newest generation) and earlier development generations (C3, C1,
  defense best1536, r3, initial W256) with verified hashes. The C2 selection
  was identical to defense best1536 and is not duplicated.
- **Static, hash-verified delivery**: model weights and the Wasm runtime are
  baked into the site as content-addressed assets, verified by sha256 in the
  browser before use; only the selected model is fetched.
- **Opt-in game collection**: finished games against OSAI R4 may be shared,
  only with explicit consent, as a minimal structured record (no names,
  email, IP or tracking identifiers). Declining keeps all features; see the
  in-app privacy page.

## Run locally

Requirements: Node.js `>=22.13 <23`, npm `>=10 <11`.

```sh
git clone https://github.com/TKY-27/OpenShogiUI.git
cd OpenShogiUI
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/#/match`. Development mode serves models from an
adjacent [OpenShogiAI](https://github.com/TKY-27/OpenShogiAI) checkout; see
the [development guide](docs/development.md) for the isolated-mode variant
and all verification commands (`npm run check`).

## Deploy (Cloudflare Workers)

The production deployment is Cloudflare Workers Static Assets plus a small
API Worker and a D1 database (Free tier). The full setup procedure — buttons,
values, and checks — is [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).
In short:

```sh
npm run build:cloudflare   # fetch/verify models, build, generate deploy config
npm run deploy:cloudflare  # deploy the generated config (run by Cloudflare Builds)
```

`build:cloudflare` reads `OSAI_D1_DATABASE_ID` and `PUBLIC_SITE_URL` from
Cloudflare Build variables; without the D1 ID the site still builds and
plays, with game collection off.

## Documentation

- [Development guide](docs/development.md) — dev server, verification,
  allowlist, collection, brand assets.
- [Architecture](ARCHITECTURE.md) and [interface contracts](docs/interfaces.md).
- [Deployment](docs/deploy-cloudflare.md) — the Cloudflare procedure.
- [Provenance](PROVENANCE.md), [license scope](LICENSE_SCOPE.md),
  [third-party notices](THIRD_PARTY.md) and
  [asset attribution](THIRD_PARTY_ASSETS.md).
- Engine, models and training:
  [OpenShogiAI](https://github.com/TKY-27/OpenShogiAI).

## Contributing

Issues and pull requests are welcome; see
[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). Solo-maintainer project:
continuous updates, response deadlines and merging of every PR are not
guaranteed. AI-generated contributions are accepted only when produced by agents with frontend design capabilities equivalent to or exceeding Astra for OpenAI models, or Opus 5.5 or Fable for Claude models.

## License

Project-owned source is **AGPL-3.0-only** ([LICENSE](LICENSE)). Generated AI
bindings, dependencies and the CC BY 4.0 piece art keep their own scope; see
[LICENSE_SCOPE.md](LICENSE_SCOPE.md) and
[THIRD_PARTY.md](THIRD_PARTY.md). Model weights are distributed by the
OpenShogiAI repository under CC BY 4.0.

Contact: X [@ANAg2bGOD](https://x.com/ANAg2bGOD) (DM).
