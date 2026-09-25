# Cloudflare公開手順（OpenShogiUI / openshogiai）

OpenShogiAI/OpenShogiUIをCloudflare Workersで公開するための、ボタンと入力値まで
決めた手順です。構成は **Workers Static Assets ＋ 小さな受付Worker ＋ D1（Free）**、
Worker名 `openshogiai`、公開URLは
`https://openshogiai.<あなたのworkers.devサブドメイン>.workers.dev` です。
Pagesは使いません。ブランド名（OpenShogiAI / OSAI）とWorker名（openshogiai）は
別のものです。

前提： LunaによるGitHub公開が完了していること（両リポジトリの最終main、
OpenShogiAIのRelease `models-v1` の公開URL・ファイル名・hash、OSUIビルドがその
固定版を取得できること）。GitHub連携（Git接続）を行うのはこのOpenShogiUI
リポジトリだけです。Cloudflareアカウント・D1・ドメインへのアクセス、作成、
課金、deployは本手順の利用者が行います（リポジトリ側は一切行いません）。

この文書のボタン名は執筆時の公式ドキュメント
（[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)・
[Builds設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)・
[D1](https://developers.cloudflare.com/d1/get-started/)）に合わせています。
ダッシュボードの表示が異なる場合は公式手順を優先し、「公式手順で確認」の
内容は実アカウントでは未確認です。

## 1. workers.devサブドメインの確認

1. Cloudflareダッシュボード → **Workers & Pages** を開きます。
2. 画面（Overview）にアカウント全体の **workers.devサブドメイン** が表示
  されます。これが公開URLの `openshogiai.<サブドメイン>.workers.dev` の
   `<サブドメイン>` 部分です。
3. サブドメインはアカウント全体の設定です。**変更しません**（他サービスの
   URLに影響します）。初回しか設定できない場合、選択は実名を避けた任意の名前で
   構いません（公開URLの一部になります）。

## 2. D1データベースの作成（openshogiai-games）

1. ダッシュボード → **Storage & Databases**（または **Workers & Pages** 近くの
   **D1 SQL database**）→ **Create database**。
2. **Database name** に `openshogiai-games` を入力 → **Create**。
   （Location hintは未指定で構いません。Freeプランで始めます。）
3. 作成後、データベースの **Overview** に **Database ID**（UUID形式）が表示
   されます。**Copy**（コピー）して控えてください。手順4のBuild変数
   `OSAI_D1_DATABASE_ID` に使います。
4. **Console** タブを開き、下の初期化SQLを貼り付けて **Execute**。
   破壊的操作（DROP）は含まれません。

```sql
-- 初期化SQL（リポジトリ worker/migrations/0001_games.sql と同一内容）
CREATE TABLE unverified_games (
  game_id TEXT PRIMARY KEY NOT NULL,
  payload_hash TEXT NOT NULL,
  record_hash TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX unverified_games_expiry ON unverified_games(expires_at);
```

5. **Tables** タブで `unverified_games` とインデックス `unverified_games_expiry`
   が作成されたことを確認します。確認用SQL（Consoleで実行）：

```sql
SELECT name, type FROM sqlite_master WHERE name LIKE 'unverified%' ORDER BY name;
```

## 3. Workerの作成（GitHub連携）

1. **Workers & Pages** → **Create application** → **Import a repository** 横の
   **Get started**。（**Pages** タブの作成導線は使いません。）
2. **Connect a Git provider** でGitHub `TKY-27` を選択し（初回はCloudflareの
   GitHub App導入に従います）、リポジトリ **OpenShogiUI** を選択。
3. 表示される設定に次の値を入れます（表の「アカウント依存」の値だけがあなたの
   アカウント固有です）:

| 設定項目 | 値 | 備考 |
|---|---|---|
| Worker name | `openshogiai` | `wrangler.jsonc` の `name` と一致必須。別名にする場合は先に設定変更が必要 |
| Production branch | `main` | |
| Root directory | （空欄のまま） | リポジトリ直下がUIルートのため |
| Build command | `npm run build:cloudflare` | モデル取得/検証・ビルド・deploy設定生成 |
| Deploy command | `npm run deploy:cloudflare` | 生成された `wrangler.deploy.jsonc` でdeploy |
| Build variables | 下の表 | Build時のみ有効。runtime変数はdeploy設定が持ちます |

Build variables and secrets（種類はどちらもPlaintextで構いません。秘密を含み
ません）:

| 変数名 | 値 | 取得元 |
|---|---|---|
| `OSAI_D1_DATABASE_ID` | 手順2-3でコピーしたDatabase ID（UUID） | D1ダッシュボード |
| `PUBLIC_SITE_URL` | `https://openshogiai.<サブドメイン>.workers.dev` | 手順1のサブドメイン |
| `OSAI_COLLECTION_MODE` | （省略可）`auto`（既定）/ `on` / `off` | 下の「収集の一時停止」参照 |

4. **Save and Deploy** を押す前に、上の値が揃っていることを確認します。
   `OSAI_D1_DATABASE_ID` が無いと（`OSAI_COLLECTION_MODE` が `off` 以外のとき）
   ビルドは完了しますが収集OFFの設定が生成され、deployコマンドが
   「D1 IDを設定してやり直す」エラーで停止します（サイトは
   部分的に公開されません）。`OSAI_COLLECTION_MODE=on` を指定した場合は
   D1 IDが無いとビルド自体が失敗します（入力ミス防止）。

## 4. 初回ビルドとdeploy

1. **Save and Deploy** を押します。初回は依存インストールを含むため数分かかります。
2. ビルドログで次を確認します:
   - `release models ready: ... fetched into local/model-assets`
     （OpenShogiAI Release `models-v1` からの取得。**Release公開前はここで
     404になります** — その場合はLunaのRelease公開完了を待ってRetry）
   - `Allowlist verified: 6 models; 8 components, no unregistered weights/data/source maps`
   - `generated wrangler.deploy.jsonc (worker openshogiai, collection ON)`
   - deployログで `Deployed openshogiai triggers ... openshogiai.<サブドメイン>.workers.dev`
3. **API tokenについて**: 連携時にCloudflareが自動作成するtokenはWorkers
   Scripts等の編集権限を持ちますが、**D1編集権限が含まれない場合があります**。
   deployログにD1に関する権限エラー（authorization / not authorized）が出た
   場合は、Settings → Builds → API tokenで既定の自動tokenの代わりに、
   「D1:Edit」を追加したtokenを作成・選択してください（他の権限は既定の
   まま）。管理tokenをBuild変数や公開ファイルへ入れる必要はありません。
   有料サービスを選ぶ必要はありません。
4. 失敗した場合: 該当ビルドの **Retry**、またはSettings → Builds →
   **Redeploy**。設定変更は次回ビルドから適用されます。

## 5. deploy後の確認（Bindings・Vars・Cron）

1. Worker **openshogiai** → **Settings → Bindings**:
   `DB`（D1 / openshogiai-games）が表示されていることを確認。**手動で追加
   しないでください**（deploy設定との二重管理になります。表示されていれば
   deploy設定からの適用です）。
2. **Settings → Variables and Secrets**（runtime変数）:
   `COLLECTION_ENABLED=true`、`COLLECTION_ALLOWLIST`（r4-c4-osai-r4のJSON）、
   `COLLECTION_NOTICE_VERSION=2026-09-21-v1`、`COLLECTION_CONTACT`（X案内）、
   `COLLECTION_MODE`（ビルド時の `OSAI_COLLECTION_MODE` の値）が
   表示されていることを確認。これらは `wrangler.deploy.jsonc` 経由で適用され、
   dashboardで直接編集すると**次回deployで上書きされます**。変更はリポジトリ側
   （buildスクリプト）で行うのが正規の手順です。
   収集を一時停止するときはBuild変数 `OSAI_COLLECTION_MODE=off` を設定して
   再ビルド・deployします（下の「収集の一時停止」）。
3. **Settings → Trigger Events → Cron Triggers**:
   `17 3 * * *` が表示されていることを確認（**UTC** 03:17 = 日本時間12:17に
   毎日、期限切れ棋譜の削除batchを実行）。設定はdeploy設定が管理するため、
   UIでは確認のみ行います。
4. **Settings → Build → Branch control**: Production branch `main`、
   **非本番branchのbuild（Preview deployments）をOFF** にします。
   未承認previewの自動公開を防ぎます。
5. **Observability / Logs**: `observability.enabled=false` でdeployされるため
   Workers Logsは無効です。有効化する場合もFree枠とプライバシー方針
   （IP等の保存）を確認してください。既定では無効のままを推奨します。

## 5.5 収集の一時停止（OSAI_COLLECTION_MODE）

受付だけを止めて安全な静的対局サイトとして運用したいときと、必須設定の
入力ミスは、明示的なスイッチで区別します。

| `OSAI_COLLECTION_MODE` | D1 ID | 動作 |
|---|---|---|
| 省略 / `auto`（既定） | あり | 収集ON（初回既定。再ビルドしてもこのまま） |
| 省略 / `auto` | 無し | ビルドは完了するがdeployが「D1 IDを設定して」で停止（入力ミス防止） |
| `on` | あり | 収集ON |
| `on` | 無し | **ビルド失敗**（明示的にONを要求したのにIDが無い=設定漏れ） |
| `off` | あり | 受付OFF。同意ダイアログ無し・POST無し・Workerは`/api/games`を拒否。**D1 bindingとcleanup cronは保持**され、既存受付行は予定どおり期限切れ削除される |
| `off` | 無し | 受付OFF・DB無しの静的サイトとしてdeploy可能 |

- `off` は明示指定なので、再ビルド・再deployで勝手にONへ戻ることはありません。
  戻すときは `OSAI_COLLECTION_MODE` を削除（または `auto`/`on`）にして再ビルド。
- dashboardの `COLLECTION_ENABLED` を直接 `false` にする方法も引き続き使えますが、
  次回deployで戻る一時運用です（クライアントは同意済みのままPOSTを試み、
  503を受け取って「利用不可」表示になります）。




## 6. 公開確認チェックリスト

スマホ（目安390px幅）とPCの両方で `https://openshogiai.<サブドメイン>.workers.dev` を開き:

- [ ] 対局（`#/match`）: OSAI R4を含む6世代が「最新←→開発初期」の順に選べる。
      3分/10分、標準/高品質、先後で1局する。盤・持ち駒・時計・最終手マーカー・
      成り/打ちが正しく表示される。
- [ ] モデル切替が対局中に禁止され、投了・再対局が動く。
- [ ] 局面解析（`#/analysis`）: モデル選択・探索結果・棋譜/診断のローカル保存。
- [ ] OGP/ロゴ: URLを共有用に開いたときtitle/description/og画像が正しい
      （SNS実表示は公開後の別確認。XのDMで自分に投稿して確認できます）。
- [ ] 初回対局開始時に同意ダイアログが出る。「同意しない」で対局でき、
      **ネットワークタブで `/api/games` へのPOSTが0回**であること。
- [ ] 同意した場合: OSAI R4との初期局面からの対局を投了または詰みで終え、
      受付済み表示（"棋譜を受け付けました（未検証）"）が出る。
      D1 Consoleで `SELECT game_id, received_at, expires_at FROM unverified_games;`
      して1行確認（試験データは game_id で区別して後で削除）。
- [ ] 対象外（他モデル・解析・途中離脱・時間切れ）ではPOSTされない。
- [ ] 同意取消し後は未送信分が破棄され送信されない。
- [ ] 公開前: X @ANAg2bGOD のDM受信設定で、フォロワー以外からのDMを受け取れる
      ことを確認する（削除相談の受け皿）。受信できない場合はX側で設定する。
- [ ] 収集OFF時（`OSAI_COLLECTION_MODE=off` で再deploy後）でも対局・解析・保存が
      続く。同意ダイアログ自体が表示されず、`/api/games` へのPOSTが0回、
      D1 bindingとcleanup cronは保持される。
- [ ] 翌日のCron後（日本時間12:17以降）、期限切れ行が削除されている
      （試験で作った期限切れデータで確認可。30日ちょうどの保証はなく、
      日次実行・1回あたりの削除上限（500行×20 batch）・Free枠・
      失敗時は翌回再試行の扱い。超過分は翌日以降のCronで順次消化される）。

## 7. トラブル対処

| 症状 | 原因と対処 |
|---|---|
| ビルドでモデル404 / "Asset fetch failed (404)" | OpenShogiAI Release `models-v1` が未公開。Lunaの公開完了後にRetry |
| hash mismatchでビルド失敗 | Release資産が想定と異なる。Releaseをやり直すか、リポジトリの `release-assets.json` と一致させ、mainへ反映後に再ビルド |
| deployが「D1 IDを設定して」で停止 | `OSAI_D1_DATABASE_ID` 未設定（`OSAI_COLLECTION_MODE` が `off` 以外）。手順2-3のIDをBuild変数へ設定しRetry。DBなしの静的サイトとして意図的に出すには `OSAI_COLLECTION_MODE=off` を設定して再ビルド |
| deployがD1権限エラー | 手順4-3のtoken権限（D1:Edit追加） |
| `/api/games` がHTMLを返す | deploy設定ではなく素の `wrangler deploy` が実行された可能性。Deploy commandが `npm run deploy:cloudflare` か確認 |
| サイト全体が404 / "Workerを通って遅い" | Assets設定が未適用。Build commandに `npm run build:cloudflare`（dist生成）が含まれるか、Root directoryが空欄か確認 |
| 公開URLが変わらない / 古い版が出る | ビルドは成功したか（Retry/Redeploy）。ブラウザーのキャッシュは通常の再読み込みで解決しない場合、`?v=`付き資産URLは不変のためHTMLのみ再取得される |
| 収集されない | `COLLECTION_ENABLED`・同意版・allowlisthash・モデル選択（OSAI R4固定）・終了理由（投了/詰みのみ）を確認。開発/自動テスト/外部previewからは送られません |
| Free上限 | 静的資産のリクエストは無料・無制限。Worker起動（`/api/*`のみ）とD1にFree枠があります。超過時も対局・解析は静的資産で継続します |
| データ初期化 | 失敗の常套手段にしない。`DELETE FROM unverified_games WHERE game_id = '...'` で対象行のみ削除 |

## 8. データの取り扱い（運用メモ）

- 受信データは未検証として隔離し、30日で期限切れ、日次Cronで小分け物理削除
  （1回最大 500行×20 batch、超過分は翌回へ繰越）。
  期限切れデータを学習取得対象に出しません。
- `/api/games` の頻度制御（12件/分）はWorker isolate単位の軽いburst防止で、
  全世界での厳密な受付件数保証ではありません。IP・端末識別の保存や全ページ
  CAPTCHAは行いません。受付の真正性は保証せず、学習前の厳選で別工程に扱います。
- 削除相談はX @ANAg2bGOD のDMで受け付け、対局受付IDで特定します。
  アカウントや実名の確認は要求しません。
- 生棋譜の公開一覧・GET API・任意URL取得・管理キーは提供しません。
  確認はD1ダッシュボードのConsole/Tablesで行います。
- 学習済み・配布済み重みから特定棋譜の影響を完全に消去することは保証しません。

## 9. この手順の未確認点

- 実アカウントでのダッシュボード表示・ボタン名は執筆時の公式ドキュメントに
  基づくもので、実際の画面では微差がある可能性があります。
- SNS・検索エンジンでのOGP実表示は公開後の確認です。
- `17 3 * * *` のCronはUTC指定です（日本時間12:17）。ダッシュボードの
  表示が現地時間扱いでないか、Trigger Eventsの表示で確認してください。
