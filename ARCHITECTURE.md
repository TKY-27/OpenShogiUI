# Architecture

OpenShogiUI is a static React application with isolated local-data paths:

```text
React Browser Play
  -> shared GameTimeline / AnalysisSessionController
  -> bounded EngineWorkerClient messages
  -> play module Worker (canonical live game and move search)
  -> analysis module Worker (displayed-position continuous analysis)
  -> generated JavaScript binding
  -> pinned OpenShogiAI WebAssembly module

analysis updates
  -> full versioned protocol identity
  -> live display (no persisted summary preload)

local arena JSON
  -> closed report validator
  -> Evaluation Lab presentation
```

The main thread owns routes, localization, controls, and rendering. `GameTimeline` keeps snapshots,
move sources, clocks, move times, history selection, and redo entries aligned as one value for both
play routes. `AnalysisSessionController` owns continuous-analysis generations, cache admission,
display throttling, cancellation, and recovery. Each `EngineWorkerClient` owns exactly one Worker
and one engine instance. The play Worker owns the canonical live game and move search; the analysis
Worker owns resumable analysis for the currently displayed live or historical SFEN. Locally
selected model bytes are loaded into both Workers. Opening-book requests are rejected at the
Worker boundary; the legacy engine uses its unrestricted profile with no loaded book.
A physical restart reconstructs only from the canonical initial SFEN and bounded move list, then
restores explicitly retained local artifacts.

Continuous analysis uses `open_shogi_analysis/v1` start, bounded step, and stop events. A single
session generation rejects stale work. Any analysis failure takes one recovery path: replace the
physical Worker, restore the selected position and model, then start a new logical analysis. Every
update is rejected unless its complete protocol identity matches the active request. Browser Play neither reads nor writes persisted analysis summaries. Its live analysis Worker is
separate from move search and never supplies previous analysis as a play decision.

## Repository boundary

- UI source is under `src/`; static assets and headers are under `public/`.
- The only generated AI interface is the four-file snapshot under `src/generated/`.
- `src/engine.worker.ts` is the only consumer of that generated interface.
- Engine implementation, training, data acquisition, model production, and native tooling belong
  to the separate OpenShogiAI repository.
- The UI never imports source across repository roots at build time. A separate integration check
  compares the pinned snapshot against an explicitly selected AI checkout.
- Bundled piece images are isolated under `public/pieces/standard/`; their per-file source paths,
  hashes, creators, and license evidence are recorded independently from engine provenance.

## Trust boundaries

Local model bytes, local report JSON, report strings, SFEN text, and every
generated-interface response are untrusted inputs. They use closed schemas and explicit size,
count, numeric, and enum bounds. Internal Worker traffic uses typed requests plus a validated
response envelope; generated JSON is deeply validated once inside the Worker before it crosses to
the UI. Cache hits must revalidate against the active request. The application has no account,
analytics, telemetry, remote model fetch, payment, camera, microphone, or geolocation
integration. The only outbound request is the optional, consent-gated game
submission described in [docs/development.md](docs/development.md); it is a
single same-origin POST of a closed schema, and every feature works when it
is declined or unavailable.
