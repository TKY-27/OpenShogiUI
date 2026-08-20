import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MAX_BROWSER_MODEL_BYTES,
  type BrowserSnapshot,
  type HandEntry,
  type HandPieceKind,
  type ModelSummary,
  type MoveSummary,
  type PieceKind,
  recommendedSearchProfile,
  type SearchProfile,
  type SearchResponse,
  sha256Hex,
  type Side,
} from "./browser-engine";
import { EngineWorkerClient, type RestorableModel } from "./engine-client";
import { getMessages, type Locale, type Messages } from "./localization";

export const BOARD_FILE_LABELS = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
export const BOARD_RANK_LABELS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
] as const;

const PIECE_GLYPHS: Record<PieceKind, string> = {
  pawn: "歩",
  lance: "香",
  knight: "桂",
  silver: "銀",
  gold: "金",
  bishop: "角",
  rook: "飛",
  king: "玉",
  "promoted-pawn": "と",
  "promoted-lance": "杏",
  "promoted-knight": "圭",
  "promoted-silver": "全",
  horse: "馬",
  dragon: "龍",
};

export type DisplayMode = "match" | "analysis";
type BusyState = "initializing" | "moving" | "searching" | "engine" | "model";
export type BoardSelection =
  | { kind: "board"; index: number }
  | { kind: "hand"; piece: HandPieceKind }
  | null;

function numberLocale(locale: Locale): string {
  return locale === "ja" ? "ja-JP" : "en-US";
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(value);
}

function formatScore(score: number): string {
  if (score === 0) return "±0";
  return score > 0 ? `+${score}` : String(score);
}

function selectedMoves(
  snapshot: BrowserSnapshot,
  selection: BoardSelection,
): MoveSummary[] {
  if (selection === null) return [];
  if (selection.kind === "hand") {
    return snapshot.legalMoves.filter(
      (movement) => movement.drop === selection.piece,
    );
  }
  const piece = snapshot.board[selection.index];
  if (piece === null) return [];
  return snapshot.legalMoves.filter(
    (movement) =>
      movement.from?.file === piece.square.file &&
      movement.from.rank === piece.square.rank,
  );
}

export function boardIndex(file: number, rank: number): number {
  return (rank - 1) * 9 + (9 - file);
}

export function isBoardOnlyMode(
  mode: DisplayMode,
  matchStarted: boolean,
): boolean {
  return mode === "match" && matchStarted;
}

function destinationIndex(movement: MoveSummary): number {
  return boardIndex(movement.to.file, movement.to.rank);
}

function modelFileAccepts(file: File): boolean {
  return file.size > 0 && file.size <= MAX_BROWSER_MODEL_BYTES;
}

function deviceProfile(): SearchProfile {
  if (typeof navigator === "undefined") return "balanced";
  const extendedNavigator = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return recommendedSearchProfile({
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    deviceMemoryGiB: extendedNavigator.deviceMemory ?? null,
    reducedData: extendedNavigator.connection?.saveData ?? false,
  });
}

function PieceText({ kind, side }: { kind: PieceKind; side: Side }) {
  const glyph = kind === "king" && side === "white" ? "王" : PIECE_GLYPHS[kind];
  return (
    <span className={`shogi-piece shogi-piece--${side}`} lang="ja">
      {glyph}
    </span>
  );
}

function HandStand({
  side,
  entries,
  selection,
  legalDrops,
  disabled,
  messages,
  onSelect,
}: {
  side: Side;
  entries: HandEntry[];
  selection: BoardSelection;
  legalDrops: ReadonlySet<HandPieceKind>;
  disabled: boolean;
  messages: Messages;
  onSelect: (piece: HandPieceKind) => void;
}) {
  const pieces = entries.filter(({ count }) => count > 0);
  const heading = <h2>{messages.play.hand(side)}</h2>;
  return (
    <section className={`hand-stand hand-stand--${side}`}>
      {side === "black" ? heading : null}
      <div className="hand-stand__pieces">
        {pieces.length === 0 ? (
          <p>{messages.play.emptyHand}</p>
        ) : (
          pieces.map(({ piece, count }) => {
            const isSelected =
              selection?.kind === "hand" && selection.piece === piece;
            return (
              <button
                aria-pressed={isSelected}
                className="hand-piece"
                disabled={disabled || !legalDrops.has(piece)}
                key={piece}
                onClick={() => onSelect(piece)}
                type="button"
              >
                <PieceText kind={piece} side={side} />
                <span aria-label={`${messages.play.pieceName[piece]} ${count}`}>
                  ×{count}
                </span>
              </button>
            );
          })
        )}
      </div>
      {side === "white" ? heading : null}
    </section>
  );
}

export function ShogiBoard({
  snapshot,
  selection,
  disabled,
  messages,
  onSquare,
}: {
  snapshot: BrowserSnapshot;
  selection: BoardSelection;
  disabled: boolean;
  messages: Messages;
  onSquare: (index: number) => void;
}) {
  const destinations = useMemo(
    () => new Set(selectedMoves(snapshot, selection).map(destinationIndex)),
    [selection, snapshot],
  );
  const rows = Array.from({ length: 9 }, (_, rankIndex) =>
    snapshot.board.slice(rankIndex * 9, rankIndex * 9 + 9),
  );

  return (
    <div className="board-coordinate-grid">
      <div aria-hidden="true" className="file-coordinates">
        {BOARD_FILE_LABELS.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      <div aria-label={messages.play.title} className="shogi-board" role="grid">
        {rows.map((row, rankIndex) => (
          <div
            className="board-row"
            key={BOARD_RANK_LABELS[rankIndex]}
            role="row"
          >
            {row.map((piece, fileIndex) => {
              const index = rankIndex * 9 + fileIndex;
              const file = BOARD_FILE_LABELS[fileIndex];
              const rank = BOARD_RANK_LABELS[rankIndex];
              const isSelected =
                selection?.kind === "board" && selection.index === index;
              const isDestination = destinations.has(index);
              const state = [
                isSelected ? messages.play.selected : null,
                isDestination ? messages.play.legalDestination : null,
              ]
                .filter(Boolean)
                .join("、");
              const pieceLabel =
                piece === null
                  ? ""
                  : `${piece.side === "black" ? messages.play.black : messages.play.white}${messages.play.pieceName[piece.kind]}`;
              const label = [
                messages.play.squareLabel(file, rank),
                pieceLabel,
                state,
              ]
                .filter(Boolean)
                .join("、");

              return (
                <button
                  aria-label={label}
                  aria-selected={isSelected}
                  className={[
                    "board-square",
                    isSelected ? "board-square--selected" : "",
                    isDestination ? "board-square--destination" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-file={file}
                  data-kind={piece?.kind}
                  data-rank={rankIndex + 1}
                  data-side={piece?.side}
                  disabled={disabled}
                  key={`${file}${rank}`}
                  onClick={() => onSquare(index)}
                  role="gridcell"
                  type="button"
                >
                  {piece === null ? null : (
                    <PieceText kind={piece.kind} side={piece.side} />
                  )}
                  {isDestination ? (
                    <span aria-hidden="true" className="destination-mark" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="rank-coordinates">
        {BOARD_RANK_LABELS.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  disabled = false,
  onSelect,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <fieldset className="segmented-control">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            disabled={disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AnalysisPanel({
  locale,
  analysis,
  children,
}: {
  locale: Locale;
  analysis: SearchResponse | null;
  children: ReactNode;
}) {
  const messages = getMessages(locale);
  return (
    <aside className="analysis-panel" aria-label={messages.play.analysisMode}>
      {children}
      <section
        className="analysis-results"
        aria-labelledby="analysis-lines-title"
      >
        <div className="analysis-results__heading">
          <h2 id="analysis-lines-title">{messages.play.analysisMode}</h2>
          {analysis === null ? null : (
            <p>
              {messages.play.depth} {analysis.depth} · {messages.play.nodes}{" "}
              {formatNumber(analysis.nodes, locale)}
            </p>
          )}
        </div>
        {analysis === null ? (
          <div className="analysis-empty">
            <p>{messages.play.noAnalysis}</p>
            <span>{messages.play.analysisHint}</span>
          </div>
        ) : (
          <ol className="analysis-lines">
            {analysis.lines.map((line) => (
              <li key={line.rank}>
                <div className="analysis-line__score">
                  <span>#{line.rank}</span>
                  <strong>{formatScore(line.scoreCp)}</strong>
                </div>
                <p className="analysis-line__move">{line.bestMove}</p>
                <dl>
                  <div>
                    <dt>{messages.play.depth}</dt>
                    <dd>{line.depth}</dd>
                  </div>
                  <div>
                    <dt>{messages.play.nodes}</dt>
                    <dd>{formatNumber(line.nodes, locale)}</dd>
                  </div>
                </dl>
                <p className="analysis-line__pv">
                  <span>{messages.play.principalVariation}</span>
                  {line.pv.join(" ")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

export function BrowserPlay({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const clientRef = useRef<EngineWorkerClient | null>(null);
  const operationRef = useRef(0);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot | null>(null);
  const [mode, setMode] = useState<DisplayMode>("analysis");
  const [matchStarted, setMatchStarted] = useState(false);
  const [busy, setBusy] = useState<BusyState | null>("initializing");
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotionMoves, setPromotionMoves] = useState<MoveSummary[] | null>(
    null,
  );
  const [profile, setProfile] = useState<SearchProfile>(deviceProfile);
  const [multiPv, setMultiPv] = useState<1 | 2 | 3>(1);
  const [evaluator, setEvaluator] = useState<"handcrafted" | "model">(
    "handcrafted",
  );
  const [analysis, setAnalysis] = useState<SearchResponse | null>(null);
  const [model, setModel] = useState<RestorableModel | null>(null);
  const [modelSummary, setModelSummary] = useState<ModelSummary | null>(null);
  const [modelFileName, setModelFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const client = new EngineWorkerClient();
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    clientRef.current = client;
    void client.initialize().then(
      (initialized) => {
        if (operationRef.current !== operation) return;
        setSnapshot(initialized);
        setBusy(null);
      },
      (error: unknown) => {
        if (operationRef.current !== operation) return;
        setNotice(
          error instanceof Error
            ? error.message
            : "Engine initialization failed",
        );
        setBusy(null);
      },
    );
    return () => {
      operationRef.current += 1;
      if (clientRef.current === client) clientRef.current = null;
      client.dispose();
    };
  }, []);

  const legalSelectionMoves = useMemo(
    () => (snapshot === null ? [] : selectedMoves(snapshot, selection)),
    [selection, snapshot],
  );
  const legalDrops = useMemo(
    () =>
      new Set(
        snapshot?.legalMoves
          .map(({ drop }) => drop)
          .filter((piece): piece is HandPieceKind => piece !== null) ?? [],
      ),
    [snapshot],
  );
  const focusMode = isBoardOnlyMode(mode, matchStarted);
  const humanCanMove =
    snapshot !== null &&
    busy === null &&
    snapshot.terminal === null &&
    (!matchStarted || snapshot.sideToMove === "black");

  function beginOperation(nextBusy: BusyState): number {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setBusy(nextBusy);
    setNotice(null);
    setSelection(null);
    setPromotionMoves(null);
    return operation;
  }

  function finishOperation(operation: number) {
    if (operationRef.current === operation) setBusy(null);
  }

  function reportError(operation: number, error: unknown) {
    if (operationRef.current !== operation) return;
    setNotice(error instanceof Error ? error.message : messages.play.error);
    setBusy(null);
  }

  async function applyMove(movement: string) {
    const client = clientRef.current;
    if (client === null || snapshot === null || busy !== null) return;
    const operation = beginOperation("moving");
    try {
      const next = await client.playMove(movement);
      if (operationRef.current !== operation) return;
      setSnapshot(next);
      setAnalysis(null);
      if (
        matchStarted &&
        next.terminal === null &&
        next.sideToMove === "white"
      ) {
        setBusy("engine");
        const response = await client.search(profile, evaluator, 1);
        if (operationRef.current !== operation) return;
        if (response.bestMove === null) {
          throw new Error("engine search returned no legal move");
        }
        const replied = await client.playMove(response.bestMove);
        if (operationRef.current !== operation) return;
        setSnapshot(replied);
      }
      finishOperation(operation);
    } catch (error) {
      reportError(operation, error);
    }
  }

  function chooseMove(candidates: MoveSummary[]) {
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      void applyMove(candidates[0].usi);
      return;
    }
    setPromotionMoves(candidates);
  }

  function selectSquare(index: number) {
    if (!humanCanMove || snapshot === null) return;
    const candidates = legalSelectionMoves.filter(
      (movement) => destinationIndex(movement) === index,
    );
    if (candidates.length > 0) {
      chooseMove(candidates);
      return;
    }
    const piece = snapshot.board[index];
    if (piece?.side === snapshot.sideToMove) {
      const nextSelection: BoardSelection = { kind: "board", index };
      setSelection(
        selectedMoves(snapshot, nextSelection).length > 0
          ? nextSelection
          : null,
      );
      return;
    }
    setSelection(null);
  }

  function selectHand(piece: HandPieceKind) {
    if (!humanCanMove || snapshot === null || !legalDrops.has(piece)) return;
    setSelection((current) =>
      current?.kind === "hand" && current.piece === piece
        ? null
        : { kind: "hand", piece },
    );
  }

  async function resetPosition(startMatch: boolean) {
    const client = clientRef.current;
    if (client === null || busy !== null) return;
    const operation = beginOperation("moving");
    try {
      const reset = await client.reset();
      if (operationRef.current !== operation) return;
      setSnapshot(reset);
      setAnalysis(null);
      setMatchStarted(startMatch);
      finishOperation(operation);
    } catch (error) {
      reportError(operation, error);
    }
  }

  async function analyzePosition() {
    const client = clientRef.current;
    if (client === null || snapshot === null || busy !== null) return;
    const operation = beginOperation("searching");
    try {
      const response = await client.search(profile, evaluator, multiPv);
      if (operationRef.current !== operation) return;
      setAnalysis(response);
      finishOperation(operation);
    } catch (error) {
      reportError(operation, error);
    }
  }

  async function stopSearch() {
    const client = clientRef.current;
    if (
      client === null ||
      snapshot === null ||
      (busy !== "searching" && busy !== "engine")
    ) {
      return;
    }
    const operation = beginOperation("initializing");
    try {
      const restored = await client.cancelAndRestore(
        { initialSfen: snapshot.initialSfen, moves: snapshot.moves },
        model,
      );
      if (operationRef.current !== operation) return;
      setSnapshot(restored);
      setAnalysis(null);
      setMatchStarted(false);
      finishOperation(operation);
    } catch (error) {
      reportError(operation, error);
    }
  }

  async function loadModel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const client = clientRef.current;
    if (file === undefined || client === null || busy !== null) return;
    if (!modelFileAccepts(file)) {
      setNotice(
        `OSAVAL model must be between 1 byte and ${MAX_BROWSER_MODEL_BYTES} bytes`,
      );
      return;
    }
    const operation = beginOperation("model");
    try {
      const bytes = await file.arrayBuffer();
      const expectedArtifactSha256 = await sha256Hex(bytes);
      const summary = await client.loadModel({
        bytes,
        expectedArtifactSha256,
      });
      if (operationRef.current !== operation) return;
      setModel({ bytes, expectedArtifactSha256 });
      setModelSummary(summary);
      setModelFileName(file.name);
      setEvaluator("model");
      setNotice(messages.play.modelReady(file.name));
      finishOperation(operation);
    } catch (error) {
      reportError(operation, error);
    }
  }

  async function unloadModel() {
    const client = clientRef.current;
    if (client === null || busy !== null) return;
    const operation = beginOperation("model");
    try {
      const next = await client.unloadModel();
      if (operationRef.current !== operation) return;
      setSnapshot(next);
      setModel(null);
      setModelSummary(null);
      setModelFileName(null);
      setEvaluator("handcrafted");
      setAnalysis(null);
      finishOperation(operation);
    } catch (error) {
      reportError(operation, error);
    }
  }

  const status = (() => {
    if (busy === "initializing") return messages.play.initialization;
    if (busy === "searching" || busy === "model")
      return messages.play.searching;
    if (busy === "engine") return messages.play.engineTurn;
    if (snapshot?.terminal !== null && snapshot?.terminal !== undefined) {
      return messages.play.terminal;
    }
    if (matchStarted) return messages.play.yourTurn;
    return messages.play.ready;
  })();

  return (
    <main
      className={`play-page ${focusMode ? "play-page--focus" : ""}`}
      aria-labelledby="browser-play-title"
    >
      <header className="play-heading">
        <div>
          <h1 id="browser-play-title">{messages.play.title}</h1>
          {!focusMode ? (
            <>
              <p>{messages.play.description}</p>
              <span>{messages.play.localNote}</span>
            </>
          ) : null}
        </div>
        <div className="play-heading__actions">
          {focusMode ? null : (
            <SegmentedControl
              disabled={matchStarted || busy !== null}
              label={messages.play.modeLabel}
              onSelect={(selectedMode) => {
                setMode(selectedMode);
                setAnalysis(null);
                setSelection(null);
              }}
              options={[
                { value: "match", label: messages.play.matchMode },
                { value: "analysis", label: messages.play.analysisMode },
              ]}
              value={mode}
            />
          )}
          <p aria-live="polite" className="engine-status" role="status">
            {status}
          </p>
        </div>
      </header>

      {notice === null ? null : (
        <p className="play-notice" role="alert">
          {notice}
        </p>
      )}

      <div
        className={`play-workspace ${focusMode ? "play-workspace--focus" : ""}`}
      >
        <section className="board-area" aria-label={messages.play.title}>
          {snapshot === null ? (
            <div className="board-loading">{messages.play.initialization}</div>
          ) : (
            <div className="board-stage">
              <HandStand
                disabled={!humanCanMove || snapshot.sideToMove !== "white"}
                entries={snapshot.hands.white}
                legalDrops={legalDrops}
                messages={messages}
                onSelect={selectHand}
                selection={selection}
                side="white"
              />
              <ShogiBoard
                disabled={!humanCanMove}
                messages={messages}
                onSquare={selectSquare}
                selection={selection}
                snapshot={snapshot}
              />
              <HandStand
                disabled={!humanCanMove || snapshot.sideToMove !== "black"}
                entries={snapshot.hands.black}
                legalDrops={legalDrops}
                messages={messages}
                onSelect={selectHand}
                selection={selection}
                side="black"
              />
            </div>
          )}

          {snapshot === null ? null : (
            <div className="board-meta">
              <p>
                <span>{messages.play.sideToMove}</span>
                <strong>
                  {snapshot.sideToMove === "black"
                    ? messages.play.black
                    : messages.play.white}
                </strong>
              </p>
              <p>
                <span>{messages.play.moveNumber}</span>
                <strong>{formatNumber(snapshot.moveNumber, locale)}</strong>
              </p>
              {matchStarted ? (
                <button
                  disabled={busy !== null}
                  onClick={() => setMatchStarted(false)}
                  type="button"
                >
                  {messages.play.stopMatch}
                </button>
              ) : (
                <button
                  disabled={busy !== null}
                  onClick={() => void resetPosition(false)}
                  type="button"
                >
                  {messages.play.newPosition}
                </button>
              )}
            </div>
          )}

          {promotionMoves === null ? null : (
            <div
              aria-labelledby="promotion-question"
              aria-modal="true"
              className="promotion-choice"
              role="dialog"
            >
              <p id="promotion-question">{messages.play.promoteQuestion}</p>
              <div>
                {promotionMoves.map((movement) => (
                  <button
                    key={movement.usi}
                    onClick={() => void applyMove(movement.usi)}
                    type="button"
                  >
                    {movement.promote
                      ? messages.play.promote
                      : messages.play.doNotPromote}
                  </button>
                ))}
                <button onClick={() => setPromotionMoves(null)} type="button">
                  {messages.play.cancel}
                </button>
              </div>
            </div>
          )}
        </section>

        {focusMode ? null : (
          <AnalysisPanel analysis={analysis} locale={locale}>
            <section
              className="play-settings"
              aria-labelledby="play-settings-title"
            >
              <h2 id="play-settings-title">
                {mode === "match"
                  ? messages.play.matchSetup
                  : messages.play.settings}
              </h2>
              <p className="settings-note">
                {mode === "match"
                  ? messages.play.boardOnlyNote
                  : messages.play.multiPvHelp}
              </p>
              <label className="select-field">
                <span>{messages.play.searchProfile}</span>
                <select
                  disabled={busy !== null}
                  onChange={(event) =>
                    setProfile(event.currentTarget.value as SearchProfile)
                  }
                  value={profile}
                >
                  {(["eco", "balanced", "quality"] as const).map((value) => (
                    <option key={value} value={value}>
                      {messages.play.profileName[value]}
                    </option>
                  ))}
                </select>
                <small>{messages.play.deviceChoice}</small>
              </label>

              <SegmentedControl
                disabled={busy !== null}
                label={messages.play.evaluator}
                onSelect={setEvaluator}
                options={[
                  { value: "handcrafted", label: messages.play.handcrafted },
                  { value: "model", label: messages.play.localModel },
                ]}
                value={evaluator}
              />

              <div className="model-control">
                <div>
                  <span>{messages.play.localModel}</span>
                  <strong>
                    {modelFileName ?? messages.play.modelNotLoaded}
                  </strong>
                </div>
                <div className="model-control__actions">
                  <label htmlFor="browser-model-file">
                    {messages.play.chooseModel}
                  </label>
                  <input
                    accept=".osaval,application/octet-stream"
                    disabled={busy !== null}
                    id="browser-model-file"
                    onChange={(event) => void loadModel(event)}
                    type="file"
                  />
                  {modelSummary === null ? null : (
                    <button
                      disabled={busy !== null}
                      onClick={() => void unloadModel()}
                      type="button"
                    >
                      {messages.play.removeModel}
                    </button>
                  )}
                </div>
                {modelSummary === null ? null : (
                  <p className="model-identity">
                    SHA-256 {modelSummary.artifactSha256} ·{" "}
                    {modelSummary.quantization}
                  </p>
                )}
              </div>

              {mode === "analysis" ? (
                <SegmentedControl
                  disabled={busy !== null}
                  label={messages.play.multiPv}
                  onSelect={setMultiPv}
                  options={[1, 2, 3].map((value) => ({
                    value: value as 1 | 2 | 3,
                    label: String(value),
                  }))}
                  value={multiPv}
                />
              ) : null}

              <div className="primary-actions">
                {busy === "searching" || busy === "engine" ? (
                  <button onClick={() => void stopSearch()} type="button">
                    {messages.play.stopSearch}
                  </button>
                ) : mode === "match" ? (
                  <button
                    disabled={
                      busy !== null ||
                      snapshot === null ||
                      (evaluator === "model" && modelSummary === null)
                    }
                    onClick={() => void resetPosition(true)}
                    type="button"
                  >
                    {messages.play.startMatch}
                  </button>
                ) : (
                  <>
                    <button
                      disabled={
                        busy !== null ||
                        snapshot === null ||
                        snapshot.terminal !== null ||
                        (evaluator === "model" && modelSummary === null)
                      }
                      onClick={() => void analyzePosition()}
                      type="button"
                    >
                      {messages.play.analyze}
                    </button>
                    <button
                      disabled={
                        busy !== null ||
                        analysis?.bestMove === null ||
                        analysis === null
                      }
                      onClick={() => {
                        if (analysis?.bestMove !== null && analysis !== null) {
                          void applyMove(analysis.bestMove);
                        }
                      }}
                      type="button"
                    >
                      {messages.play.playBestMove}
                    </button>
                  </>
                )}
              </div>
            </section>
          </AnalysisPanel>
        )}
      </div>
    </main>
  );
}
