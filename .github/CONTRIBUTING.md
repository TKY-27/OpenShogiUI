# Contributing / コントリビュート

Issues and pull requests are welcome. This is a solo-maintainer personal
project: continuous updates, response deadlines and merging of every PR are
not guaranteed, but quality discussions and contributions are actively
considered on their merits. We do not distinguish hand-written work from
AI-assisted work, and we do not require any declaration or proof of either.

Issueやプルリクエストを歓迎します。個人が保守するプロジェクトのため、継続更新・
回答期限・全PRのマージは保証しませんが、内容に基づいて積極的に検討します。
手書きとAI支援を区別せず、申告や証明も求めません。

Before submitting / 提出前に:

```sh
npm ci --ignore-scripts
npm run check
```

- Include reproduction steps and verification matching the scale of the
  change. Strength-affecting changes need comparison conditions (opponents,
  clocks, game counts).
- Large or architectural changes: open an issue and discuss the design first.
- Preserve the trust boundaries: closed schemas, size limits, hash checks,
  same-origin collection, no analytics/tracking, book-free play. Do not add
  remote engines, opening books or model sources outside the reviewed
  allowlist.
- Do not commit credentials, private data, local model files, generated
  local artifacts or machine-specific paths. Model artifacts flow through
  the reviewed release allowlist only.
- Confirm the rights of anything you submit; contributions must not
  misrepresent third-party licenses. Project-owned contributions are
  accepted under AGPL-3.0-only.
