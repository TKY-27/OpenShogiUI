# Security Policy

OpenShogiUI is pre-release software. No production-security or compatibility claim is made.

## Reporting

Do not include credentials, personal data, private game records, proprietary model files, or
active exploit payloads against third-party services in a public issue. Send maintainers a
minimal non-sensitive description and arrange a private follow-up channel.

## In-scope boundaries

- local arena-report JSON and all nested strings and counters;
- local `OSAVAL01` files and generated WebAssembly responses;
- main-thread/Worker messages, timeouts, cancellation, and reconstruction;
- browser CSP, static headers, dependencies, and build output.

The application validates schema versions, field sets, sizes, counts, enums, finite numeric
ranges, canonical text, and relevant hashes. A selected model is limited to 16 MiB, read locally,
and retained only in Worker memory. The site makes no analytics or upload request.

Never commit credentials, private keys, private data, local model files, or machine-specific
paths. Supported fixes target the active development branch; a versioned support window will be
defined before a public release.
