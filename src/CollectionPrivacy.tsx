import type { Locale } from "./localization";
import { collectionPolicy } from "virtual:shogi-runtime";
import { CONSENT_VERSION, RETENTION_DAYS } from "./collection-schema";
import { CollectionSettings } from "./CollectionConsent";
import operator from "../project.config.json";

export default function CollectionPrivacy({
  locale = "ja",
}: {
  locale?: Locale;
}) {
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  return (
    <main className="privacy-page">
      <h1>{t("棋譜提供とプライバシー", "Game collection and privacy")}</h1>
      <p>
        {t("説明の版：", "Notice version: ")}
        {CONSENT_VERSION}
        {collectionPolicy.enabled
          ? t(
              "。棋譜提供は任意で、同意しなくても対局・解析・ローカル保存を利用できます。",
              ". Sharing is optional. Play, analysis and local downloads work without consent.",
            )
          : t(
              "。棋譜提供は任意で、同意しなくても対局・解析・ローカル保存を利用できます。このビルドでは収集は無効です。",
              ". Sharing is optional. Play, analysis and local downloads work without consent. Collection is disabled in this build.",
            )}
      </p>
      <h2>{t("収集内容・利用目的", "What is collected and why")}</h2>
      <p>
        {t(
          "将来公開を承認したC4の指定された重み・runtimeを使い、このサイトの初期局面から開始した通常対局のうち、投了または実盤面の詰みで終了した棋譜だけを対象とします。オフラインのAI学習・評価に利用し、学習後のモデルを公開する可能性があります。生棋譜は今回公開しません。受付データは未検証として隔離し、自動で学習に採用しません。",
          "Only normal games started from the initial position on this site, using C4 weights and runtime approved for publication, and ending in resignation or board checkmate are eligible. Games may be used for offline AI training and evaluation; trained models may be published. Raw games will not be published as part of this collection. Submissions are quarantined as unverified and are not automatically used for training.",
        )}
      </p>
      <p>
        {t(
          "送信内容は指し手列、必要な先後・結果・終了理由、モデルとruntimeの識別子、持ち時間・品質・思考制御・ponderの設定、同意説明の版、対局限りのランダムIDです。受信時刻と期限、重複判定用digestをサーバーで付けます。細かな着手時刻や診断ログは送りません。",
          "We send the moves, player sides, result and ending reason, model and runtime identities, time control, quality, controller and ponder settings, notice version, and a random ID for this game only. The server adds receipt and expiry times and hashes for deduplication. Detailed move timings and diagnostic logs are not sent.",
        )}
      </p>
      <p>
        {t(
          "氏名・メール・対局者名・コメント・タグ・ファイル名やパス・URL・位置情報・端末識別子は送信項目に含めません。読み込んだ棋譜、編集局面、解析、途中離脱、時間切れ、手数打切り、千日手等は対象外です。",
          "Submissions do not include names, email, player names, comments, tags, filenames, paths, URLs, location or device identifiers. Imported games, edited positions, analysis, abandoned games, timeouts, move limits and repetition are excluded.",
        )}
      </p>
      <h2>{t("保存と通信", "Storage and network processing")}</h2>
      <p>
        {t(
          "アプリの棋譜DBやアプリログへIP・User-Agent・Referrer・request\n        header/bodyを記録しません。アクセス数と画面表示速度の集計には、Cookieを使わないCloudflare Web Analytics（提供者はCloudflare）を使用します。棋譜・盤面・入力内容はこの集計に含まれず、サイトのサーバーにも保存されません。これはアプリが棋譜として保存する内容とは別です。",
          "The app does not log IP addresses, User-Agent, Referrer or request headers and bodies in game storage or app logs. For visit counts and page performance we use Cloudflare Web Analytics (provided by Cloudflare), which does not use cookies. Game records, boards and input text are not part of that aggregate and are not stored by the site. This is separate from the game data the app stores.",
        )}
        <a href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer">
          {t("Cloudflareのプライバシーポリシー", "Cloudflare privacy policy")}
        </a>
        {t("と", " and ")}
        <a
          href="https://developers.cloudflare.com/web-analytics/"
          rel="noreferrer"
        >
          {t("Web Analyticsの説明", "the Web Analytics description")}
        </a>
        {t("をご覧ください。", " are available.")}
      </p>
      <p>
        {t(
          `未検証受付データは受信後${RETENTION_DAYS}日で期限切れとなり、少量ずつ削除します。期限後は学習採用・管理者取得の対象外です。削除処理が止まった場合は実削除が遅れる可能性があるため、運用確認が必要です。通常の対局・思考はブラウザー内で行い、収集停止や通信失敗でも継続できます。`,
          `Unverified submissions expire ${RETENTION_DAYS} days after receipt and are deleted in small batches. Expired data is excluded from training and administrator export. Actual deletion can be delayed if cleanup stops, so operations must be monitored. Play and computation run in the browser and continue when collection or the network is unavailable.`,
        )}
      </p>
      <h2>
        {t(
          "変更・取り消し・削除相談",
          "Changes, withdrawal and deletion requests",
        )}
      </h2>
      <p>
        {t(
          "設定からいつでも将来の提供を停止でき、未送信分は破棄します。同意前やONにする前の対局は遡って送りません。取り消す直前に送信済みのデータは自動削除できず、学習済みモデルから影響を完全に消すことも保証しません。重要な利用目的の変更は再同意の対象です。",
          "You can stop future sharing in settings at any time; unsent games are discarded. Games played before consent or before enabling sharing are not sent later. Withdrawal cannot automatically delete data already received or guarantee removal of its influence from trained models. Material changes to the purpose require renewed consent.",
        )}
      </p>
      <p>
        {t(
          `運営者は ${operator.operator.name} です。棋譜の削除相談・問い合わせは`,
          `This site is operated by ${operator.operator.name}. For deletion requests and inquiries, use`,
        )}
        <a href={operator.operator.contactUrl} rel="noreferrer">
          {operator.operator.contactLabel}
        </a>
        {t(
          "へDMでお願いします。対局受付ID（棋譜保存時に画面へ表示されるランダムID）を添えると特定が確実になります。実名や住所等の本人確認は求めません。公開Issueへ棋譜や個人情報を投稿しないでください。",
          " (direct message). Include the game receipt ID shown when you save a game to identify the record. We do not ask for your real name, address or other identity verification. Do not post game records or personal information in public issues.",
        )}
      </p>
      <h2 id="terms">{t("利用について", "Terms of use")}</h2>
      <p>
        {t(
          "棋譜提供への同意はサービス利用規約への同意とは別です。本サイトは個人の運営する無料の実験サービスで、継続運用・特定目的への適合性を保証しません。ソフトウェアのライセンスはAGPL-3.0-only、モデルと第三者素材にはそれぞれの条件があります。下部のライセンス・第三者通知をご確認ください。",
          "Consent to game collection is separate from accepting the service terms. This site is a free experimental service run by an individual; continuous operation or fitness for a particular purpose is not guaranteed. The software is AGPL-3.0-only; models and third-party assets have separate terms. See the license and third-party notices in the footer.",
        )}
      </p>
      {collectionPolicy.enabled ? <CollectionSettings locale={locale} /> : null}
      <p>
        <a href="#/match">{t("対局へ戻る", "Return to play")}</a>
      </p>
    </main>
  );
}
