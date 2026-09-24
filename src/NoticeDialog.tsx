import { useEffect, useRef } from "react";
import type { Locale } from "./localization";
import licenseText from "../LICENSE?raw";
import thirdPartyNotices from "../THIRD_PARTY.md?raw";
import pieceAssetNotices from "../THIRD_PARTY_ASSETS.md?raw";
export type NoticeView =
  | "license"
  | "third-party"
  | "piece-credits"
  | "model-license";

export default function NoticeDialog({
  locale,
  view,
  onClose,
}: {
  locale: Locale;
  view: NoticeView;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  const title =
    view === "license"
      ? "AGPL-3.0-only"
      : view === "third-party"
        ? locale === "ja"
          ? "第三者通知"
          : "Third-Party Notices"
        : view === "piece-credits"
          ? locale === "ja"
            ? "駒のクレジット"
            : "Piece Credits"
          : locale === "ja"
            ? "モデルライセンス"
            : "Model License";

  return (
    <dialog
      aria-labelledby="notice-view-title"
      aria-modal="true"
      className="notice-view"
      onClose={onClose}
      ref={dialogRef}
    >
      <article>
        <header>
          <h2 id="notice-view-title">{title}</h2>
          <button onClick={() => dialogRef.current?.close()} type="button">
            {locale === "ja" ? "閉じる" : "Close"}
          </button>
        </header>
        {view === "model-license" ? (
          <p>
            {locale === "ja"
              ? "モデルの公開採用と権利審査は未完了です。ローカルで対局できることは、重みの公開・再配布の許可を意味しません。由来と利用条件を確認するまで、ライセンス状態は審査中です。"
              : "Public adoption and model rights review are pending. Local play does not grant permission to publish or redistribute weights. The license status stays under review until provenance and terms have been checked."}
          </p>
        ) : (
          <pre>
            {view === "license"
              ? licenseText
              : view === "third-party"
                ? thirdPartyNotices
                : pieceAssetNotices}
          </pre>
        )}
      </article>
    </dialog>
  );
}
