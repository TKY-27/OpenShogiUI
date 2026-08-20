# Architecture

OpenShogiUI is a static React application with isolated local-data paths:

```text
React Browser Play
  -> EngineAdapter
  -> bounded EngineClient messages
  -> play module Worker (canonical live game and move search)
  -> analysis module Worker (displayed-position continuous analysis)
  -> generated JavaScript binding
  -> pinned OpenShogiAI WebAssembly module

analysis summaries
  -> full versioned protocol identity
  -> bounded IndexedDB cache with memory fallback

local arena JSON
  -> closed report validator
  -> Evaluation Lab presentation
```

The main thread owns routes, localization, controls, rendering, live/displayed position indices,
and cache admission. Each `WasmEngineAdapter` owns exactly one Worker and one engine instance.
The play Worker owns the canonical live game and move search; the analysis Worker owns resumable
analysis for the currently displayed live or historical SFEN. Locally selected model bytes are
loaded into both Workers, while an optional opening book belongs to play. A physical restart
reconstructs only from the canonical initial SFEN and bounded move list, then restores explicitly
retained local artifacts.

Continuous analysis uses `open_shogi_analysis/v1` start, bounded step, stop, worker-failed, and
restart events. Every update is rejected unless its complete protocol identity matches the active
request. Only bounded summaries are persisted; engine internals, model bytes, opening-book bytes,
and search trees are never written to IndexedDB.

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

Worker messages, local model/book bytes, local report JSON, report strings, SFEN text, IndexedDB
values, and every generated-interface response are untrusted inputs. Parsers use closed schemas
and explicit size, count, numeric, and enum bounds. Cache hits must revalidate against the active
request. The application has no account, analytics, telemetry, remote model fetch, game upload,
payment, camera, microphone, or geolocation integration.
