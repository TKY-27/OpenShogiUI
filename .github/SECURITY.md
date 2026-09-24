# Security Policy

OpenShogiUI is research software by a solo maintainer. No formal security
support or compatibility commitment is made.

## Reporting a vulnerability

Please do **not** post vulnerability details in public issues. Use GitHub's
private vulnerability reporting on this repository when available, or contact
X [@ANAg2bGOD](https://x.com/ANAg2bGOD) by direct message with a minimal,
non-sensitive description.

脆弱性の詳細を公開Issueへ投稿しないでください。GitHubの非公開セキュリティ報告
（利用可能になった場合）か、X [@ANAg2bGOD](https://x.com/ANAg2bGOD) のDMへ、
秘密を含まない最小の説明をお送りください。

## In-scope boundaries

- Local model bytes, arena/report JSON and all nested strings and counters;
- generated WebAssembly responses and the pinned interface snapshot;
- main-thread/Worker messages, timeouts, cancellation and reconstruction;
- the opt-in collection submission path (closed schema, size limits, D1
  parameterized SQL, no request/payload logging) and Worker configuration;
- browser CSP/COOP/COEP headers, static assets, dependencies, build output.

The application validates schema versions, field sets, sizes, counts, enums,
finite numeric ranges, canonical text and hashes. A selected model is limited
in size, read locally and retained only in Worker memory. Never commit
credentials, private keys, private data, local model files or
machine-specific paths. Test security behavior only against your own local
deployment; do not run probes against the production site or third parties.
