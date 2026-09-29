import { useEffect, useRef } from "react";
import type { Locale } from "./localization";
import { repositoryUrl } from "./project";
import licenseText from "../LICENSE?raw";
import thirdPartyNotices from "../THIRD_PARTY.md?raw";
import pieceAssetNotices from "../THIRD_PARTY_ASSETS.md?raw";
export type NoticeView =
  | "license"
  | "third-party"
  | "piece-credits"
  | "model-license"
  | "source-code";

/** The engine repository this site's runtime and models ship from. */
const aiRepositoryUrl = "https://github.com/TKY-27/OpenShogiAI";

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
          : view === "source-code"
            ? locale === "ja"
              ? "ソースコード"
              : "Source Code"
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
          <>
            <p>
              {locale === "ja"
                ? "公開モデル（リリース models-v1: OSAI R4 と開発世代の計6本）の重みは、CC BY 4.0 で公開されています。表示（TKY-27 / OpenShogiAI）を付ければ、再配布・改変・再学習・商用利用も許諾されます。"
                : "The published weights (release models-v1: OSAI R4 plus five development generations) are offered under CC BY 4.0. Redistribution, modification, further training and commercial use are permitted with attribution (TKY-27 / OpenShogiAI)."}
            </p>
            <p>
              {locale === "ja"
                ? "このサイトが読み込む重みは、レビュー済みの許可リストでSHA-256で固定され、ビルド時に検証されます。訪問者の実行時に重みを取得することはありません。"
                : "The weights this site loads are hash-pinned in a reviewed allowlist and verified at build time. They are never fetched at visitor runtime."}
            </p>
            <p>
              {locale === "ja"
                ? "この許諾は重みのみに適用されます。コードはAGPL-3.0-onlyであり、学習データ・教師バイナリ・評価テーブルは再配布しません。第三者のデータセットと駒画像はそれぞれの条件（第三者通知・駒のクレジット）に従います。"
                : "This grant covers the weights only. Code stays AGPL-3.0-only; training data, teacher binaries and evaluation tables are not redistributed. Third-party datasets and piece images keep their own terms (Third-Party Notices, Piece Credits)."}
            </p>
            <p>
              {locale === "ja"
                ? "主な学習元のクレジット: CSA/WCSC 棋譜（コンピュータ将棋協会）、電竜戦第5期ハード部門のアーカイブ、AobaZero no-noise サンプル（プロジェクト自身の公開声明によりパブリックドメイン）、nodchip shogi_hao_depth9（MIT、C3/C4 系統のみ）。Apery 2.0.0 は教師ラベル生成のためローカルで実行しただけで、再配布はしていません。"
                : "Key training-source credits: CSA/WCSC game records (Computer Shogi Association), the Denryu-sen hardware-3 archive, AobaZero no-noise samples (public domain per the project's own statement), and nodchip shogi_hao_depth9 (MIT, C3/C4 lineage only). Apery 2.0.0 was only executed locally to produce teacher labels and is not redistributed."}
            </p>
            <p>
              {locale === "ja"
                ? "世代の並びは開発順であり、棋力の順位を示しません。公開は所有者の選定によるものです。機械可読なマニフェストと条件の詳細は "
                : "Listings order generations by development order, not strength. Publication is the owner's selection. The machine-readable manifest and the verified conditions are in "}
              <a
                href={`${aiRepositoryUrl}/blob/main/configs/models/distribution.json`}
                rel="noreferrer"
                target="_blank"
              >
                configs/models/distribution.json
              </a>
              {locale === "ja"
                ? "（OpenShogiAI リポジトリ）にあります。"
                : " in the OpenShogiAI repository."}
            </p>
          </>
        ) : view === "source-code" ? (
          <>
            <p>
              {locale === "ja"
                ? "このサイトは次の2つのリポジトリから構成されています。"
                : "This site is built from the following two repositories."}
            </p>
            <ul className="notice-source-list">
              <li>
                <a
                  href={aiRepositoryUrl}
                  rel="noreferrer source"
                  target="_blank"
                >
                  OpenShogiAI
                </a>
                <span>
                  {locale === "ja"
                    ? "将棋エンジン本体。モデルの学習、USI対応、ブラウザー用Wasmの生成と権利記録。"
                    : "The shogi engine: model training, USI support, and the browser Wasm build with its rights records."}
                </span>
              </li>
              <li>
                <a href={repositoryUrl} rel="noreferrer source" target="_blank">
                  OpenShogiUI
                </a>
                <span>
                  {locale === "ja"
                    ? "このサイトのソースコード（AGPL-3.0-only）。"
                    : "The source code of this site (AGPL-3.0-only)."}
                </span>
              </li>
            </ul>
          </>
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
