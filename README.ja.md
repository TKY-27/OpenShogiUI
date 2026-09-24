# OpenShogiUI（OSUI）

[English version](README.md)

OpenShogiUIは、[OpenShogiAI（OSAI）](https://github.com/TKY-27/OpenShogiAI)
の学習モデルとブラウザーで対局し、局面を解析するためのWebアプリです。
持ち時計付きのリアルタイム対局や、任意局面の学習評価による解析ができます。
対局・解析はすべてWebAssemblyでブラウザー内で行い、サーバー側エンジンは
使いません。

このリポジトリ（[OpenShogiUI](https://github.com/TKY-27/OpenShogiUI)）はUIのみを
含みます。Rustエンジン・モデル形式・学習・モデル配布は
[OpenShogiAI](https://github.com/TKY-27/OpenShogiAI)にあります。

作者は[TKY-27](https://github.com/TKY-27)。

## 特徴

- **ブラウザ対局**：OSAI学習モデルとの3分/10分の持ち時計対局、標準/高品質
  探索、先後選択、モバイルとデスクトップの両レイアウト、最終手マーカー、
  成り・打ちのUI、投了と再対局、棋譜・診断のローカル保存。定跡なし・初手固定
  なし・外部エンジンなしのBook-free対局です。
- **学習解析**：局面を読み込み（対局から継続も可）、公開モデルのいずれかで
  探索します。表示はそのモデルの探索スコアで、自動で指すことはありません。
- **代表モデル世代**：公開allowlistは最新世代OSAI R4と以前の開発世代
  （C3、C1、防御強化best1536、r3、初期W256）を検証済みhash付きで同梱します。
  C2選抜は防御best1536と同一のため重複登録しません。
- **静的でhash検証された配信**：モデル重みとWasmランタイムは内容hash付きの
  静的資産としてサイトに組み込み、ブラウザーでsha256検証してから使用します。
  取得するのは選択中のモデルだけです。
- **任意の棋譜収集**：OSAI R4との対局終了時に、明示的に同意した場合のみ
  最小限の構造化棋譜を1回送信します（氏名・メール・IP・追跡IDなし）。
  同意しなくてもすべての機能が使えます。詳細はアプリ内のプライバシーページ。

## ローカルで動かす

必要環境：Node.js `>=22.13 <23`、npm `>=10 <11`。

```sh
git clone https://github.com/TKY-27/OpenShogiUI.git
cd OpenShogiUI
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

`http://127.0.0.1:5174/#/match` を開いてください。開発モードは隣接する
[OpenShogiAI](https://github.com/TKY-27/OpenShogiAI)チェックアウトからモデルを
配信します。分離モードと検証コマンド（`npm run check`）は
[開発ガイド](docs/development.md)を参照してください。

## デプロイ（Cloudflare Workers）

本番構成はCloudflare Workers静的アセット＋小さなAPI Worker＋D1データベース
（Free枠）です。設定手順の全体（ボタン、入力値、確認項目）は
[docs/deploy-cloudflare.md](docs/deploy-cloudflare.md)にあります。要点：

```sh
npm run build:cloudflare   # モデル取得/検証、ビルド、deploy設定の生成
npm run deploy:cloudflare  # 生成した設定でデプロイ（Cloudflare Buildsが実行）
```

`build:cloudflare`はCloudflareのBuild variablesから`OSAI_D1_DATABASE_ID`と
`PUBLIC_SITE_URL`を読みます。D1 IDが無くてもサイトのビルド・対局は可能で、
その場合は棋譜収集が無効になります。

## ドキュメント

- [開発ガイド](docs/development.md) — 開発サーバー、検証、allowlist、収集、
  ブランド資産。
- [アーキテクチャ](ARCHITECTURE.md)と[インターフェース契約](docs/interfaces.md)。
- [デプロイ手順](docs/deploy-cloudflare.md) — Cloudflare設定の完全手順。
- [来歴](PROVENANCE.md)、[ライセンス範囲](LICENSE_SCOPE.md)、
  [サードパーティ通知](THIRD_PARTY.md)、[素材の出典](THIRD_PARTY_ASSETS.md)。
- エンジン・モデル・学習：[OpenShogiAI](https://github.com/TKY-27/OpenShogiAI)。

## コントリビュート

Issueとプルリクエストを歓迎します。詳細は
[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)。個人が保守するプロジェクト
のため、継続更新・回答期限・全PRのマージは保証しません。AIによる貢献は、OpenAIモデルではAstra以上、ClaudeモデルではOpus 5.5またはFableと同等以上のフロントエンドデザイン能力を持つエージェントによるものに限ります。

## ライセンス

プロジェクト独自部分のソースコードは**AGPL-3.0-only**（[LICENSE](LICENSE)）。
生成されたAIバインディング、依存コード、CC BY 4.0の駒素材はそれぞれの範囲に
従います（[LICENSE_SCOPE.md](LICENSE_SCOPE.md)、[THIRD_PARTY.md](THIRD_PARTY.md)）。
モデル重みはOpenShogiAIリポジトリからCC BY 4.0で配布されます。

連絡先：X [@ANAg2bGOD](https://x.com/ANAg2bGOD)（DM）。
