import { useEffect, useReducer, useState } from "react";

import { BrowserPlay } from "./BrowserPlay";
import { EvaluationLab } from "./EvaluationLab";
import {
  applyDocumentLanguage,
  DEFAULT_LOCALE,
  getMessages,
  Locale,
  localeReducer,
} from "./localization";
import { projectStatus, routeForHash, workspaceStatuses } from "./project";

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
  const isEvaluationLab = route === "evaluation-lab";
  const isBrowserPlay = route === "browser-play";
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
    <div className="site-shell">
      <header className="site-header">
        <div className="site-nav">
          <a className="wordmark" href="#/workspace">
            Open<span>ShogiUI</span>
          </a>
          <nav aria-label={selectedMessages.header.primaryNavigation}>
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
        </div>
      </header>

      {isBrowserPlay ? (
        <BrowserPlay locale={locale} />
      ) : isEvaluationLab ? (
        <EvaluationLab locale={locale} />
      ) : (
        <WorkspaceHome locale={locale} />
      )}

      <footer>{selectedMessages.footer}</footer>
    </div>
  );
}

export default App;
