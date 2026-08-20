import { useEffect, useReducer, useRef, useState } from "react";

import licenseText from "../LICENSE?raw";
import thirdPartyNotices from "../THIRD_PARTY.md?raw";
import pieceAssetNotices from "../THIRD_PARTY_ASSETS.md?raw";

import { BrowserPlay } from "./BrowserPlay";
import { EvaluationLab } from "./EvaluationLab";
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
          <p className="summary">{workspace.summary}</p>
          <p className="phase">
            {workspace.releaseStatus[projectStatus.release]}
          </p>
        </div>
        <BoardMotif />
      </section>

      <section className="workspace" aria-labelledby="workspace-title">
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
              ? "モデル重みは同梱されません。完全な由来と条件の審査が終わるまで、ライセンス状態は pending-review です。"
              : "Model weights are not bundled. Their license status remains pending-review until complete provenance and terms are reviewed."}
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
  const [route, setRoute] = useState(() => routeForHash(window.location.hash));
  const [locale, dispatchLocale] = useReducer(localeReducer, DEFAULT_LOCALE);
  const [noticeView, setNoticeView] = useState<NoticeView | null>(null);
  const isEvaluationLab = route === "evaluation-lab";
  const isBrowserPlay = route === "browser-play";
  // App routes own a fixed-height shell whose panes scroll; document routes
  // keep normal page flow because their content is genuinely long.
  const isAppRoute = isBrowserPlay;
  const selectedMessages = getMessages(locale);

  useEffect(() => {
    function updateRoute() {
      setRoute(routeForHash(window.location.hash));
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
          Open<span>ShogiUI</span>
        </a>
        <nav
          className="app-nav"
          aria-label={selectedMessages.header.primaryNavigation}
        >
          <a
            aria-current={
              !isEvaluationLab && !isBrowserPlay ? "page" : undefined
            }
            href="#/workspace"
          >
            {selectedMessages.header.workspace}
          </a>
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
        </nav>
        <LanguageSwitcher
          locale={locale}
          onSelect={(selectedLocale) =>
            dispatchLocale({ type: "select", locale: selectedLocale })
          }
        />
      </header>

      <div className="app-main">
        {isBrowserPlay ? (
          <BrowserPlay locale={locale} />
        ) : isEvaluationLab ? (
          <EvaluationLab locale={locale} />
        ) : (
          <WorkspaceHome locale={locale} />
        )}
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
        <span>{selectedMessages.footer}</span>
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
