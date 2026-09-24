import { useEffect, useRef, useSyncExternalStore } from "react";
import { collectionPolicy } from "virtual:shogi-runtime";
import { getConsent, setConsent, subscribeConsent } from "./collection";
import type { Locale } from "./localization";

export function ConsentDialog({
  onContinue,
  locale = "ja",
}: {
  onContinue: () => void;
  locale?: Locale;
}) {
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="notice-view consent-dialog"
      ref={ref}
      aria-labelledby="consent-title"
      onCancel={onContinue}
    >
      <article>
        <h2 id="consent-title">
          {t(
            "モデルの棋力向上を図るため、対局した棋譜の収集を許可しますか？",
            "May we collect your games to help improve the model’s playing strength?",
          )}
        </h2>
        <div className="consent-actions">
          <button
            type="button"
            onClick={() => {
              setConsent(true);
              onContinue();
            }}
          >
            {t("同意（任意）", "Agree (optional)")}
          </button>
          <button
            type="button"
            onClick={() => {
              setConsent(false);
              onContinue();
            }}
          >
            {t("同意しない", "Do not agree")}
          </button>
        </div>
        <p>
          {t(
            "同意しなくても対局できます。設定からいつでも変更できます。",
            "You can play without agreeing. You can change this in settings at any time.",
          )}
        </p>
        <a className="consent-details" href="#/privacy">
          {t("収集内容・利用目的", "What is collected and why")}
        </a>
      </article>
    </dialog>
  );
}
export function CollectionSettings({ locale = "ja" }: { locale?: Locale }) {
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsent,
    getConsent,
  );
  return (
    <section
      className="collection-settings"
      aria-label={t("棋譜提供の設定", "Game collection settings")}
    >
      <h2>{t("棋譜提供", "Game collection")}</h2>
      <label>
        <input
          type="checkbox"
          checked={consent.allowed}
          onChange={(event) => setConsent(event.target.checked)}
        />{" "}
        {t(
          "今後開始する対象対局の棋譜を提供する（任意）",
          "Share eligible games started from now on (optional)",
        )}
      </label>
      <p>
        {collectionPolicy.enabled
          ? t(
              "OFFにすると未送信分を破棄します。",
              "Turning this off discards unsent games.",
            )
          : t(
              "このビルドでは収集が無効のため、送信は行われません。",
              "Collection is disabled in this build; nothing is sent.",
            )}
      </p>
      <a href="#/privacy">
        {t("収集内容・利用目的", "What is collected and why")}
      </a>
    </section>
  );
}
