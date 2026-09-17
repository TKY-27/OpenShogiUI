import { lazy, Suspense, useEffect, useReducer, useRef, useState } from "react";

import licenseText from "../LICENSE?raw";
import thirdPartyNotices from "../THIRD_PARTY.md?raw";
import pieceAssetNotices from "../THIRD_PARTY_ASSETS.md?raw";

import {
  applyDocumentLanguage,
  DEFAULT_LOCALE,
  getMessages,
  Locale,
  localeReducer,
} from "./localization";
import {
  projectStatus,
  repositoryUrl,
  routeForHash,
  workspaceStatuses,
} from "./project";

type NoticeView = "license" | "third-party" | "piece-credits" | "model-license";
const CorePrototype = lazy(() => import("./CorePrototype"));
const BrowserPlay = import.meta.env.DEV
  ? lazy(() =>
      import("./BrowserPlay").then((module) => ({
        default: module.BrowserPlay,
      })),
    )
  : null;
const EvaluationLab = import.meta.env.DEV
  ? lazy(() =>
      import("./EvaluationLab").then((module) => ({
        default: module.EvaluationLab,
      })),
    )
  : null;

const markedBoardCells = new Map([
  [12, "accent-outline"],
  [24, "ink-outline"],
  [40, "accent-fill"],
  [63, "ink-outline"],
  [70, "accent-outline"],
]);

function BoardMotif() {
  return (
    <div className="board-motif" aria-hidden="true">
      {Array.from({ length: 81 }, (_, index) => (
        <span className={markedBoardCells.get(index) ?? ""} key={index} />
      ))}
    </div>
  );
}

function WorkspaceHome({ locale }: { locale: Locale }) {
  const { workspace } = getMessages(locale);
  const workspaceNames = {
    adapter: workspace.adapter,
    play: workspace.play,
    delivery: workspace.delivery,
  };
  const statusNames = {
    inProgress: workspace.inProgress,
    ready: workspace.ready,
  };

  return (
    <main className="workspace-home">
      <section className="introduction" aria-labelledby="page-title">
        <div className="introduction-copy">
          <h1 id="page-title">{workspace.headline}</h1>
          <p className="summary">
            {import.meta.env.DEV
              ? workspace.summary
              : locale === "ja"
                ? "OpenShogiAIのWebAssemblyエンジンと、このビルドで指定された学習モデルで対局します。"
                : "Play with the OpenShogiAI WebAssembly engine and the learned model selected for this build."}
          </p>
          <p className="phase">
            {workspace.releaseStatus[projectStatus.release]}
          </p>
        </div>
        <BoardMotif />
      </section>

      <section className="start-actions" aria-labelledby="start-title">
        <h2 id="start-title">{workspace.startHeading}</h2>
        <a className="start-action start-action--primary" href="#/match">
          <strong>{workspace.startMatch}</strong>
          <span>
            {locale === "ja"
              ? "3分切れ負け・10分切れ負け"
              : "3-minute or 10-minute sudden death"}
          </span>
        </a>
        {import.meta.env.DEV ? (
          <>
            <a className="start-action" href="#/browser-play">
              <strong>{workspace.startAnalysis}</strong>
              <span>{workspace.startAnalysisDetail}</span>
            </a>
            <a className="start-action" href="#/evaluation-lab">
              <strong>{workspace.startLab}</strong>
              <span>{workspace.startLabDetail}</span>
            </a>
          </>
        ) : null}
      </section>

      <section className="workspace" aria-labelledby="workspace-title">
        {import.meta.env.DEV ? (
          <a href="#/match">
            {locale === "ja"
              ? "防御学習候補・r3候補・旧基準を選んで対局する"
              : "Choose the defense candidate, r3 candidate or previous baseline"}
          </a>
        ) : null}
        <h2 id="workspace-title">{workspace.title}</h2>
        <ul>
          {workspaceStatuses.map(({ workspace: workspaceKey, status }) => (
            <li key={workspaceKey}>
              <span>{workspaceNames[workspaceKey]}</span>
              <span className="status">{statusNames[status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function NoticeDialog({
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
      onCancel={onClose}
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
              ? "モデルは開発時には登録済みのローカル資産から、本番相当ビルドでは明示指定した一構成から読み込みます。ビルドへの同梱は公開採用や権利審査の完了を意味しません。完全な由来と条件の審査が終わるまで、ライセンス状態は pending-review です。"
              : "Development loads registered local assets; a production-equivalent build includes one explicitly selected configuration. Inclusion does not mean public adoption or rights approval. The license status remains pending-review until complete provenance and terms are reviewed."}
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

export function LanguageSwitcher({
  locale,
  onSelect,
}: {
  locale: Locale;
  onSelect: (locale: Locale) => void;
}) {
  const { header } = getMessages(locale);

  return (
    <fieldset className="language-switcher">
      <legend className="visually-hidden">{header.language}</legend>
      <button
        aria-pressed={locale === "ja"}
        lang="ja"
        onClick={() => onSelect("ja")}
        type="button"
      >
        {header.japanese}
      </button>
      <button
        aria-pressed={locale === "en"}
        lang="en"
        onClick={() => onSelect("en")}
        type="button"
      >
        {header.english}
      </button>
    </fieldset>
  );
}

function App() {
  const [route, setRoute] = useState(() =>
    routeForHash(window.location.hash, import.meta.env.DEV),
  );
  const [locale, dispatchLocale] = useReducer(localeReducer, DEFAULT_LOCALE);
  const [noticeView, setNoticeView] = useState<NoticeView | null>(null);
  const isEvaluationLab = route === "evaluation-lab";
  const isBrowserPlay = route === "browser-play";
  const isMatch = route === "match";
  const isPrototype = route === "core-prototype";
  // App routes own a fixed-height shell whose panes scroll; document routes
  // keep normal page flow because their content is genuinely long.
  const isAppRoute = isBrowserPlay || isMatch || isPrototype;
  const selectedMessages = getMessages(locale);

  useEffect(() => {
    function updateRoute() {
      setRoute(routeForHash(window.location.hash, import.meta.env.DEV));
    }

    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    applyDocumentLanguage(locale);
  }, [locale]);

  return (
    <div
      className={`app-shell ${isAppRoute ? "app-shell--fixed" : "app-shell--document"}`}
    >
      <header className="app-bar">
        <a className="wordmark" href="#/workspace">
          Open<span>ShogiAI</span>
        </a>
        <nav
          className="app-nav"
          aria-label={selectedMessages.header.primaryNavigation}
        >
          <a
            aria-current={
              !isEvaluationLab && !isBrowserPlay && !isMatch && !isPrototype
                ? "page"
                : undefined
            }
            href="#/workspace"
          >
            {selectedMessages.header.workspace}
          </a>
          <a aria-current={isMatch ? "page" : undefined} href="#/match">
            {selectedMessages.header.match}
          </a>
          {import.meta.env.DEV ? (
            <>
              <a
                aria-current={isBrowserPlay ? "page" : undefined}
                href="#/browser-play"
              >
                {selectedMessages.header.browserPlay}
              </a>
              <a
                aria-current={isEvaluationLab ? "page" : undefined}
                href="#/evaluation-lab"
              >
                {selectedMessages.header.evaluationLab}
              </a>
            </>
          ) : null}
        </nav>
        <LanguageSwitcher
          locale={locale}
          onSelect={(selectedLocale) =>
            dispatchLocale({ type: "select", locale: selectedLocale })
          }
        />
      </header>

      <div className="app-main">
        <Suspense
          fallback={
            <p role="status">
              {locale === "ja" ? "準備しています…" : "Loading…"}
            </p>
          }
        >
          {isMatch || (import.meta.env.DEV && isPrototype) ? (
            <CorePrototype locale={locale} />
          ) : import.meta.env.DEV && isBrowserPlay && BrowserPlay !== null ? (
            <BrowserPlay locale={locale} />
          ) : import.meta.env.DEV &&
            isEvaluationLab &&
            EvaluationLab !== null ? (
            <EvaluationLab locale={locale} />
          ) : (
            <WorkspaceHome locale={locale} />
          )}
        </Suspense>
      </div>

      <footer className="site-footer">
        <nav
          aria-label={
            locale === "ja" ? "法的情報" : "Legal and source information"
          }
        >
          <a href={repositoryUrl} rel="source">
            {locale === "ja" ? "ソースコード" : "Source Code"}
          </a>
          <button onClick={() => setNoticeView("license")} type="button">
            AGPL-3.0-only
          </button>
          <button onClick={() => setNoticeView("third-party")} type="button">
            {locale === "ja" ? "第三者通知" : "Third-Party Notices"}
          </button>
          <button onClick={() => setNoticeView("piece-credits")} type="button">
            {locale === "ja" ? "駒のクレジット" : "Piece Credits"}
          </button>
          <button onClick={() => setNoticeView("model-license")} type="button">
            {locale === "ja" ? "モデルライセンス" : "Model License"}
          </button>
        </nav>
        <span>
          {locale === "ja"
            ? "AGPL-3.0-only · モデルの公開採用・権利審査は別途必要です"
            : "AGPL-3.0-only · Model adoption and rights review are separate"}
        </span>
      </footer>

      {noticeView === null ? null : (
        <NoticeDialog
          locale={locale}
          onClose={() => setNoticeView(null)}
          view={noticeView}
        />
      )}
    </div>
  );
}

export default App;
