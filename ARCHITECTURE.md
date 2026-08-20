# Architecture

OpenShogiUI is a static React application with two isolated local-data paths:

```text
React Browser Play
  -> bounded EngineClient messages
  -> module Worker
  -> generated JavaScript binding
  -> pinned OpenShogiAI WebAssembly module

local arena JSON
  -> closed report validator
  -> Evaluation Lab presentation
```

The main thread owns routes, localization, controls, and rendering. One module Worker owns the
engine instance, canonical game state, search lifecycle, and any locally selected model bytes.
Stopping a search terminates the Worker and reconstructs state only from a bounded canonical
initial position and move list.

## Repository boundary

- UI source is under `src/`; static assets and headers are under `public/`.
- The only generated AI interface is the four-file snapshot under `src/generated/`.
- `src/engine.worker.ts` is the only consumer of that generated interface.
- Engine implementation, training, data acquisition, model production, and native tooling belong
  to the separate OpenShogiAI repository.
- The UI never imports source across repository roots at build time. A separate integration check
  compares the pinned snapshot against an explicitly selected AI checkout.

## Trust boundaries

Worker messages, local model bytes, local report JSON, report strings, SFEN text, and every
generated-interface response are untrusted inputs. Parsers use closed schemas and explicit size,
count, numeric, and enum bounds. The application has no account, analytics, telemetry, remote
model fetch, game upload, payment, camera, microphone, or geolocation integration.
