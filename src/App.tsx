import { lazy, Suspense, useEffect, useReducer, useState } from "react";

import "./core-prototype.css";
const CollectionPrivacy = lazy(() => import("./CollectionPrivacy"));

import type { NoticeView } from "./NoticeDialog";

import {
  applyDocumentLanguage,
  DEFAULT_LOCALE,
  getMessages,
  Locale,
  localeReducer,
} from "./localization";
import { repositoryUrl, routeForHash } from "./project";
const NoticeDialog = lazy(() => import("./NoticeDialog"));
const LearnedAnalysis = lazy(() => import("./LearnedAnalysis"));
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
  return (
    <main className="workspace-home">
      <section className="introduction" aria-labelledby="page-title">
        <div className="introduction-copy">
          <h1 id="page-title">{workspace.headline}</h1>
        </div>
        <BoardMotif />
      </section>

      <section
        className="start-actions"
        aria-label={locale === "ja" ? "対局と解析" : "Play and analysis"}
      >
        <a className="start-action start-action--primary" href="#/match">
          <strong>{workspace.startMatch}</strong>
          <span>
            {locale === "ja"
              ? "3分切れ負け・10分切れ負け"
              : "3-minute or 10-minute sudden death"}
          </span>
        </a>
        <a className="start-action" href="#/analysis">
          <strong>{workspace.startAnalysis}</strong>
          <span>{workspace.startAnalysisDetail}</span>
        </a>
        {import.meta.env.DEV ? (
          <>
            <a className="start-action" href="#/evaluation-lab">
              <strong>{workspace.startLab}</strong>
              <span>{workspace.startLabDetail}</span>
            </a>
          </>
        ) : null}
      </section>

      <section
        className="workspace"
        aria-label={locale === "ja" ? "開発について" : "Development"}
      >
        <p>
          {locale === "ja"
            ? "個人開発のため、継続更新や対応期限は保証しません。Issue・PRは歓迎します。Issueには可能な範囲で対応し、PRは品質と方向性を確認して積極的に議論・取り込みを検討します。"
            : "This is a personal project, with no guaranteed updates or response times. Issues and PRs are welcome. We address issues when possible and actively discuss and consider PRs for quality and project fit."}
        </p>
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
  const isAppRoute =
    isBrowserPlay || isMatch || isPrototype || route === "analysis";
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
      className={`app-shell ${isMatch || isPrototype ? "app-shell--match" : ""} ${isAppRoute ? "app-shell--fixed" : "app-shell--document"}`}
    >
      <header className="app-bar">
        <a className="wordmark" href="#/workspace">
          <img src="/favicon.svg" width="24" height="24" alt="" />
          Open<span>ShogiAI</span>
        </a>
        <nav
          className="app-nav"
          aria-label={selectedMessages.header.primaryNavigation}
        >
          <a
            aria-current={route === "workspace" ? "page" : undefined}
            href="#/workspace"
          >
            {selectedMessages.header.workspace}
          </a>
          <a aria-current={isMatch ? "page" : undefined} href="#/match">
            {selectedMessages.header.match}
          </a>
          <a
            href="#/analysis"
            aria-current={route === "analysis" ? "page" : undefined}
          >
            {locale === "ja" ? "局面解析" : "Analysis"}
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
          {route === "privacy" ? (
            <CollectionPrivacy locale={locale} />
          ) : route === "analysis" ? (
            <LearnedAnalysis locale={locale} />
          ) : isMatch || (import.meta.env.DEV && isPrototype) ? (
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
          <a href="#/privacy">
            {locale === "ja"
              ? "棋譜提供・利用について"
              : "Collection and privacy"}
          </a>
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
        <Suspense
          fallback={
            <p role="status">{locale === "ja" ? "読み込み中…" : "Loading…"}</p>
          }
        >
          <NoticeDialog
            locale={locale}
            onClose={() => setNoticeView(null)}
            view={noticeView}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
