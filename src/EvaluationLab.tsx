import { ChangeEvent, ReactNode, useReducer, useRef, useState } from "react";

import {
  ARENA_REPORT_SCHEMA,
  ARENA_REPORT_SCHEMA_V2,
  ArenaGame,
  ArenaGameV2,
  ArenaPlayerIdentity,
  ArenaReport,
  ArenaReportValidationError,
  ImportState,
  MAX_ARENA_REPORT_BYTES,
  importReducer,
  initialImportState,
  parseArenaReport,
} from "./arena-report";
import {
  getMessages,
  Locale,
  localizeArenaReportError,
  Messages,
} from "./localization";

export const ARENA_GAMES_PAGE_SIZE = 100;

export type GamePageAction = "next" | "previous";

function isArenaGameV2(game: ArenaGame): game is ArenaGameV2 {
  return "csaSha256" in game;
}

export function gamePageIndexAfterAction(
  currentPage: number,
  action: GamePageAction,
  pageCount: number,
): number {
  const lastPage = Math.max(0, pageCount - 1);
  const boundedCurrentPage = Math.min(Math.max(0, currentPage), lastPage);
  return action === "next"
    ? Math.min(boundedCurrentPage + 1, lastPage)
    : Math.max(boundedCurrentPage - 1, 0);
}

function numberLocale(locale: Locale): string {
  return locale === "ja" ? "ja-JP" : "en-US";
}

const numberFormatters = new Map<string, Intl.NumberFormat>();
const percentFormatters = new Map<Locale, Intl.NumberFormat>();

function formatNumber(
  value: number,
  locale: Locale,
  maximumFractionDigits = 0,
): string {
  const key = `${locale}:${maximumFractionDigits}`;
  let formatter = numberFormatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(numberLocale(locale), {
      maximumFractionDigits,
    });
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

function formatPercent(rate: number, locale: Locale): string {
  let formatter = percentFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(numberLocale(locale), {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format(rate);
}

function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024, locale, 1)} KiB`;
  }
  return `${formatNumber(bytes / (1024 * 1024), locale, 1)} MiB`;
}

function formatDurationFromNanoseconds(
  nanoseconds: number,
  locale: Locale,
): string {
  if (nanoseconds < 1_000_000) {
    return `${formatNumber(nanoseconds / 1_000, locale, 2)} μs`;
  }
  if (nanoseconds < 1_000_000_000) {
    return `${formatNumber(nanoseconds / 1_000_000, locale, 2)} ms`;
  }
  return `${formatNumber(nanoseconds / 1_000_000_000, locale, 2)} s`;
}

function formatDurationFromMilliseconds(
  milliseconds: number,
  locale: Locale,
): string {
  if (milliseconds === 0) {
    return "0 ms";
  }
  if (milliseconds < 0.001) {
    return `${formatNumber(milliseconds * 1_000_000, locale, 2)} ns`;
  }
  if (milliseconds < 1) {
    return `${formatNumber(milliseconds * 1_000, locale, 2)} μs`;
  }
  if (milliseconds < 1_000) {
    return `${formatNumber(milliseconds, locale, 2)} ms`;
  }
  return `${formatNumber(milliseconds / 1_000, locale, 2)} s`;
}

function formatResult(result: ArenaGame["result"], messages: Messages): string {
  switch (result) {
    case "black_win":
      return messages.lab.blackWin;
    case "white_win":
      return messages.lab.whiteWin;
    case "draw":
      return messages.lab.draw;
    case "max_plies":
      return messages.lab.maxPlies;
  }
}

export function ScrollTableRegion({
  children,
  labelledBy,
}: {
  children: ReactNode;
  labelledBy: string;
}) {
  return (
    <div
      aria-labelledby={labelledBy}
      className="table-scroll"
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function formatImportStatus(state: ImportState, locale: Locale): string {
  const selectedMessages = getMessages(locale);
  switch (state.status) {
    case "idle":
      return selectedMessages.lab.idle;
    case "loading":
      return selectedMessages.lab.loading(state.fileName);
    case "ready":
      return selectedMessages.lab.ready(
        state.fileName,
        state.loadedAt,
        formatBytes(state.byteSize, locale),
      );
    case "invalid": {
      let detail: string;
      switch (state.reason.type) {
        case "file-too-large":
          detail = selectedMessages.lab.fileTooLarge(
            formatBytes(state.reason.maximumBytes, locale),
          );
          break;
        case "invalid-report":
          detail = localizeArenaReportError(state.reason.error, locale);
          break;
        case "unknown":
          detail = selectedMessages.lab.reportCouldNotBeRead;
          break;
      }
      return selectedMessages.lab.invalid(state.fileName, detail);
    }
  }
}

function Summary({ report, locale }: { report: ArenaReport; locale: Locale }) {
  const selectedMessages = getMessages(locale);
  const fields = [
    [selectedMessages.lab.schema, report.schema],
    [selectedMessages.lab.limit, formatNumber(report.run.gameLimit, locale)],
    [selectedMessages.lab.seed, formatNumber(report.run.seed, locale)],
    [selectedMessages.lab.engine, report.run.engine],
    [
      selectedMessages.lab.commit,
      report.run.gitCommit ?? selectedMessages.lab.unavailable,
    ],
    [selectedMessages.lab.started, report.run.startedAt],
    [
      selectedMessages.lab.completed,
      report.run.completedAt ?? selectedMessages.lab.unavailable,
    ],
  ];

  if (report.schema === ARENA_REPORT_SCHEMA_V2) {
    fields.push(
      [selectedMessages.lab.initialSfen, report.run.initialSfen],
      [
        selectedMessages.lab.maxPliesLabel,
        formatNumber(report.run.maxPlies, locale),
      ],
      [selectedMessages.lab.configHash, report.run.configSha256],
      [
        selectedMessages.lab.budget,
        `${report.run.budget.kind} · ${formatNumber(report.run.budget.value, locale)}`,
      ],
    );
  }

  return (
    <section
      className="lab-section run-summary"
      aria-labelledby="run-summary-title"
    >
      <h2 id="run-summary-title">{selectedMessages.lab.runSummary}</h2>
      <dl>
        {fields.map(([term, detail]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function identityRows(
  player: ArenaPlayerIdentity,
  messages: Messages,
  locale: Locale,
): Array<[string, string]> {
  return [
    [messages.lab.evaluator, player.evaluatorKind],
    [
      messages.lab.searchDepth,
      player.searchDepth === null
        ? messages.lab.unavailable
        : formatNumber(player.searchDepth, locale),
    ],
    [
      messages.lab.hashMemory,
      player.hashMegabytes === null
        ? messages.lab.unavailable
        : `${formatNumber(player.hashMegabytes, locale)} MiB`,
    ],
    [
      messages.lab.transposition,
      player.transposition === null
        ? messages.lab.unavailable
        : player.transposition
          ? messages.lab.enabled
          : messages.lab.disabled,
    ],
    [
      messages.lab.opening,
      player.openingEnabled ? messages.lab.enabled : messages.lab.disabled,
    ],
    [
      messages.lab.modelArtifact,
      player.modelArtifactSha256 === null || player.modelArtifactSize === null
        ? messages.lab.unavailable
        : `${player.modelArtifactSha256} · ${formatBytes(player.modelArtifactSize, locale)}`,
    ],
    [
      messages.lab.payloadHash,
      player.modelPayloadSha256 === null
        ? messages.lab.unavailable
        : player.modelPayloadSha256,
    ],
    [
      messages.lab.architecture,
      player.architectureVersion === null
        ? messages.lab.unavailable
        : formatNumber(player.architectureVersion, locale),
    ],
    [
      messages.lab.quantization,
      player.quantization ?? messages.lab.unavailable,
    ],
  ];
}

function PlayerIdentities({
  report,
  locale,
}: {
  report: Extract<ArenaReport, { schema: typeof ARENA_REPORT_SCHEMA_V2 }>;
  locale: Locale;
}) {
  const selectedMessages = getMessages(locale);
  const players = [
    [selectedMessages.lab.playerA, report.run.playerA],
    [selectedMessages.lab.playerB, report.run.playerB],
  ] as const;
  const opening = report.run.opening;

  return (
    <section
      className="lab-section identity-section"
      aria-labelledby="player-identities-title"
    >
      <h2 id="player-identities-title">
        {selectedMessages.lab.playerIdentities}
      </h2>
      <p className="section-caption">
        {selectedMessages.lab.playerIdentityCaption}
      </p>
      <div className="identity-grid">
        {players.map(([name, player]) => (
          <article className="player-identity" key={name}>
            <h3>{name}</h3>
            <p className="identity-label">{player.label}</p>
            <dl>
              {identityRows(player, selectedMessages, locale).map(
                ([term, detail]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{detail}</dd>
                  </div>
                ),
              )}
            </dl>
          </article>
        ))}
      </div>
      <p className="opening-identity">
        <strong>{selectedMessages.lab.openingIdentity}</strong>{" "}
        {opening.enabled &&
        opening.artifactSha256 !== null &&
        opening.artifactSize !== null &&
        opening.maxPlies !== null
          ? `${opening.artifactSha256} · ${formatBytes(opening.artifactSize, locale)} · ${selectedMessages.lab.maxPliesLabel} ${formatNumber(opening.maxPlies, locale)}`
          : selectedMessages.lab.disabled}
      </p>
    </section>
  );
}

function Metrics({ report, locale }: { report: ArenaReport; locale: Locale }) {
  const selectedMessages = getMessages(locale);
  const { metrics } = report;
  const metricsRows = [
    [selectedMessages.lab.games, formatNumber(metrics.games, locale)],
    [
      selectedMessages.lab.finishRate,
      formatPercent(metrics.finishedGames / Math.max(metrics.games, 1), locale),
    ],
    [
      selectedMessages.lab.searchWins,
      `${formatNumber(metrics.searchWins, locale)} (${formatPercent(metrics.searchWins / Math.max(metrics.games, 1), locale)})`,
    ],
    [
      selectedMessages.lab.draws,
      `${formatNumber(metrics.draws, locale)} (${formatPercent(metrics.draws / Math.max(metrics.games, 1), locale)})`,
    ],
    [
      selectedMessages.lab.nodesPerSecond,
      formatNumber(metrics.nodesPerSecond, locale),
    ],
    [
      selectedMessages.lab.averageDepth,
      formatNumber(metrics.averageDepth, locale, 2),
    ],
    [selectedMessages.lab.ttHitRate, formatPercent(metrics.ttHitRate, locale)],
    [
      selectedMessages.lab.cutoffRate,
      formatPercent(metrics.cutoffRate, locale),
    ],
    [
      selectedMessages.lab.pruningRate,
      formatPercent(metrics.pruningRate, locale),
    ],
    [
      selectedMessages.lab.timePerMove,
      formatDurationFromMilliseconds(metrics.millisecondsPerMove, locale),
    ],
    [
      selectedMessages.lab.peakMemory,
      metrics.peakMemoryBytes === null
        ? selectedMessages.lab.unavailable
        : formatBytes(metrics.peakMemoryBytes, locale),
    ],
    [
      selectedMessages.lab.illegalMoves,
      formatNumber(metrics.illegalMoves, locale),
    ],
  ];

  if (report.schema === ARENA_REPORT_SCHEMA_V2) {
    const v2Metrics = report.metrics;
    metricsRows.splice(
      3,
      0,
      [
        selectedMessages.lab.playerAWins,
        `${formatNumber(v2Metrics.playerAWins, locale)} (${formatPercent(v2Metrics.playerAWins / Math.max(v2Metrics.games, 1), locale)})`,
      ],
      [
        selectedMessages.lab.playerBWins,
        `${formatNumber(v2Metrics.playerBWins, locale)} (${formatPercent(v2Metrics.playerBWins / Math.max(v2Metrics.games, 1), locale)})`,
      ],
    );
    metricsRows.push(
      [
        selectedMessages.lab.neuralCalls,
        formatNumber(v2Metrics.neuralInferenceCalls, locale),
      ],
      [
        selectedMessages.lab.neuralTime,
        formatDurationFromNanoseconds(v2Metrics.neuralInferenceTimeNs, locale),
      ],
      [
        selectedMessages.lab.averageInferenceTime,
        v2Metrics.neuralInferenceCalls === 0
          ? selectedMessages.lab.unavailable
          : formatDurationFromNanoseconds(
              v2Metrics.neuralInferenceTimeNs / v2Metrics.neuralInferenceCalls,
              locale,
            ),
      ],
    );
  }

  return (
    <section
      className="lab-section metrics-section"
      aria-labelledby="metrics-title"
    >
      <h2 id="metrics-title">{selectedMessages.lab.searchMetrics}</h2>
      <p className="section-caption metrics-validation-note">
        {selectedMessages.lab.metricsValidationNote}
      </p>
      <ScrollTableRegion labelledBy="metrics-title">
        <table className="metrics-table">
          <caption>{selectedMessages.lab.metricsCaption}</caption>
          <thead>
            <tr>
              {metricsRows.map(([label]) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {metricsRows.map(([label, value]) => (
                <td key={label}>{value}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </ScrollTableRegion>
    </section>
  );
}

function PlayerMetrics({
  report,
  locale,
}: {
  report: Extract<ArenaReport, { schema: typeof ARENA_REPORT_SCHEMA_V2 }>;
  locale: Locale;
}) {
  const selectedMessages = getMessages(locale);
  const { metrics } = report;
  const players = [
    {
      name: selectedMessages.lab.playerA,
      label: report.run.playerA.label,
      wins: metrics.playerAWins,
      nodes: metrics.playerASearchNodes,
      elapsed: metrics.playerASearchElapsedMs,
      depth:
        metrics.playerASearches === 0
          ? 0
          : metrics.playerADepthSum / metrics.playerASearches,
      searches: metrics.playerASearches,
      calls: metrics.playerANeuralInferenceCalls,
      inferenceNs: metrics.playerANeuralInferenceTimeNs,
    },
    {
      name: selectedMessages.lab.playerB,
      label: report.run.playerB.label,
      wins: metrics.playerBWins,
      nodes: metrics.playerBSearchNodes,
      elapsed: metrics.playerBSearchElapsedMs,
      depth:
        metrics.playerBSearches === 0
          ? 0
          : metrics.playerBDepthSum / metrics.playerBSearches,
      searches: metrics.playerBSearches,
      calls: metrics.playerBNeuralInferenceCalls,
      inferenceNs: metrics.playerBNeuralInferenceTimeNs,
    },
  ];

  return (
    <section
      className="lab-section player-metrics-section"
      aria-labelledby="player-metrics-title"
    >
      <h2 id="player-metrics-title">{selectedMessages.lab.playerMetrics}</h2>
      <ScrollTableRegion labelledBy="player-metrics-title">
        <table className="player-metrics-table">
          <caption>{selectedMessages.lab.playerMetricsCaption}</caption>
          <thead>
            <tr>
              <th scope="col">A / B</th>
              <th scope="col">{selectedMessages.lab.wins}</th>
              <th scope="col">{selectedMessages.lab.searchNodes}</th>
              <th scope="col">{selectedMessages.lab.searchElapsed}</th>
              <th scope="col">{selectedMessages.lab.averageDepth}</th>
              <th scope="col">{selectedMessages.lab.searches}</th>
              <th scope="col">{selectedMessages.lab.neuralCalls}</th>
              <th scope="col">{selectedMessages.lab.neuralTime}</th>
              <th scope="col">{selectedMessages.lab.averageInferenceTime}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.name}>
                <th scope="row">
                  <strong>{player.name}</strong>
                  <span>{player.label}</span>
                </th>
                <td>{formatNumber(player.wins, locale)}</td>
                <td>{formatNumber(player.nodes, locale)}</td>
                <td>
                  {formatDurationFromMilliseconds(player.elapsed, locale)}
                </td>
                <td>{formatNumber(player.depth, locale, 2)}</td>
                <td>{formatNumber(player.searches, locale)}</td>
                <td>{formatNumber(player.calls, locale)}</td>
                <td>
                  {formatDurationFromNanoseconds(player.inferenceNs, locale)}
                </td>
                <td>
                  {player.calls === 0
                    ? selectedMessages.lab.unavailable
                    : formatDurationFromNanoseconds(
                        player.inferenceNs / player.calls,
                        locale,
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTableRegion>
    </section>
  );
}

export function Games({
  report,
  locale,
}: {
  report: ArenaReport;
  locale: Locale;
}) {
  const selectedMessages = getMessages(locale);
  const pageCount = Math.max(
    1,
    Math.ceil(report.games.length / ARENA_GAMES_PAGE_SIZE),
  );
  const [pageIndex, setPageIndex] = useState(0);
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const firstGameIndex = currentPageIndex * ARENA_GAMES_PAGE_SIZE;
  const visibleGames = report.games.slice(
    firstGameIndex,
    firstGameIndex + ARENA_GAMES_PAGE_SIZE,
  );
  const firstVisibleGame = visibleGames.length === 0 ? 0 : firstGameIndex + 1;
  const lastVisibleGame = firstGameIndex + visibleGames.length;
  const rangeDescription =
    report.games.length === 0
      ? selectedMessages.lab.noImportedGames
      : selectedMessages.lab.gameRange(
          formatNumber(firstVisibleGame, locale),
          formatNumber(lastVisibleGame, locale),
          formatNumber(report.games.length, locale),
        );

  function changePage(action: GamePageAction): void {
    setPageIndex((current) =>
      gamePageIndexAfterAction(current, action, pageCount),
    );
  }

  return (
    <section
      className="lab-section games-section"
      aria-labelledby="games-title"
    >
      <h2 id="games-title">{selectedMessages.lab.games}</h2>
      <div className="game-pagination">
        <p aria-live="polite" id="games-range">
          {rangeDescription}
        </p>
        {pageCount > 1 ? (
          <div
            aria-label={selectedMessages.lab.gamePagination}
            className="game-pagination__controls"
            role="group"
          >
            <button
              aria-controls="games-table"
              disabled={currentPageIndex === 0}
              onClick={() => changePage("previous")}
              type="button"
            >
              {selectedMessages.lab.previousPage}
            </button>
            <span>
              {selectedMessages.lab.pageStatus(
                formatNumber(currentPageIndex + 1, locale),
                formatNumber(pageCount, locale),
              )}
            </span>
            <button
              aria-controls="games-table"
              disabled={currentPageIndex === pageCount - 1}
              onClick={() => changePage("next")}
              type="button"
            >
              {selectedMessages.lab.nextPage}
            </button>
          </div>
        ) : null}
      </div>
      <ScrollTableRegion labelledBy="games-title">
        <table
          aria-describedby="games-range"
          className="games-table"
          id="games-table"
        >
          <caption>{rangeDescription}</caption>
          <thead>
            <tr>
              <th scope="col">{selectedMessages.lab.game}</th>
              <th scope="col">{selectedMessages.lab.black}</th>
              <th scope="col">{selectedMessages.lab.white}</th>
              <th scope="col">{selectedMessages.lab.result}</th>
              <th scope="col">{selectedMessages.lab.moves}</th>
              <th scope="col">CSA</th>
              {report.schema === ARENA_REPORT_SCHEMA_V2 ? (
                <>
                  <th scope="col">{selectedMessages.lab.csaHash}</th>
                  <th scope="col">{selectedMessages.lab.csaSize}</th>
                  <th scope="col">{selectedMessages.lab.neuralCalls}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visibleGames.map((game) => (
              <tr key={game.id}>
                <th scope="row">{game.id}</th>
                <td>{game.black}</td>
                <td>{game.white}</td>
                <td>{formatResult(game.result, selectedMessages)}</td>
                <td>{formatNumber(game.moves, locale)}</td>
                <td>{game.csaPath ?? "—"}</td>
                {isArenaGameV2(game) ? (
                  <>
                    <td className="hash-cell">{game.csaSha256}</td>
                    <td>{formatBytes(game.csaSize, locale)}</td>
                    <td>{formatNumber(game.neuralInferenceCalls, locale)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTableRegion>
    </section>
  );
}

export function ReportContent({
  report,
  locale,
}: {
  report: ArenaReport;
  locale: Locale;
}) {
  return (
    <div className="report-content">
      <Summary locale={locale} report={report} />
      {report.schema === ARENA_REPORT_SCHEMA_V2 ? (
        <PlayerIdentities locale={locale} report={report} />
      ) : null}
      <Metrics locale={locale} report={report} />
      {report.schema === ARENA_REPORT_SCHEMA_V2 ? (
        <PlayerMetrics locale={locale} report={report} />
      ) : null}
      <Games locale={locale} report={report} />
    </div>
  );
}

export function EvaluationLab({ locale }: { locale: Locale }) {
  const [state, dispatch] = useReducer(importReducer, initialImportState);
  const nextRequestId = useRef(0);
  const selectedMessages = getMessages(locale);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) {
      return;
    }

    const requestId = ++nextRequestId.current;
    dispatch({ type: "importStarted", requestId, fileName: file.name });

    if (file.size > MAX_ARENA_REPORT_BYTES) {
      dispatch({
        type: "importFailed",
        requestId,
        fileName: file.name,
        reason: {
          type: "file-too-large",
          maximumBytes: MAX_ARENA_REPORT_BYTES,
        },
      });
      return;
    }

    try {
      const report = parseArenaReport(await file.text());
      dispatch({
        type: "importSucceeded",
        requestId,
        report,
        fileName: file.name,
        byteSize: file.size,
        loadedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      dispatch({
        type: "importFailed",
        requestId,
        fileName: file.name,
        reason:
          error instanceof ArenaReportValidationError
            ? { type: "invalid-report", error }
            : { type: "unknown" },
      });
    }
  }

  return (
    <main className="lab-page" aria-labelledby="lab-title">
      <header className="lab-introduction">
        <h1 id="lab-title">{selectedMessages.lab.title}</h1>
        <p>{selectedMessages.lab.description}</p>
        <p className="browser-note">{selectedMessages.lab.browserNote}</p>
      </header>

      <section className="report-import" aria-labelledby="report-import-title">
        <h2 id="report-import-title">{selectedMessages.lab.arenaReport}</h2>
        <div className="file-control">
          <label htmlFor="arena-report-file">
            {selectedMessages.lab.chooseReport}
          </label>
          <input
            accept="application/json,.json"
            aria-describedby="import-status import-schema-note"
            id="arena-report-file"
            onChange={handleFileChange}
            type="file"
          />
          <p id="import-schema-note">
            {selectedMessages.lab.expectedSchema}: {ARENA_REPORT_SCHEMA}
            {" · "}
            {selectedMessages.lab.compatibleSchema}
          </p>
        </div>
        <p
          aria-live="polite"
          className={`import-status import-status--${state.status}`}
          id="import-status"
          role={state.status === "invalid" ? "alert" : "status"}
        >
          {formatImportStatus(state, locale)}
        </p>
      </section>

      {state.status === "ready" ? (
        <ReportContent
          key={`${state.loadedAt}:${state.fileName}:${state.byteSize}`}
          locale={locale}
          report={state.report}
        />
      ) : null}
    </main>
  );
}
