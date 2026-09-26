import { useEffect, useRef, useState } from "react";
import { getMessages, type Locale } from "./localization";
import {
  initialAnalysisState,
  LearnedAnalysisSession,
  readAnalysisPosition,
  type AnalysisMode,
} from "./learned-analysis";
import type { PrototypeSelection } from "./core-prototype-protocol";
import { ModelPicker, modelLabel } from "./ModelPicker";
import {
  HandStand,
  ShogiBoard,
  persistedPieceSet,
  resolveBoardClick,
  toggleHandSelection,
  type BoardSelection,
} from "./ShogiBoardView";
import type {
  HandPieceKind,
  MoveSummary,
  SearchProfile,
} from "./browser-engine";
import { KifuSaveMenu } from "./KifuSaveMenu";
import { downloadText } from "./kifu";
import { MAX_KIFU_BYTES, parseKifuBytes } from "./kifu-import";
import { pvJapanese } from "./pv-notation";
import { parseUsiMoveShape, type MoveHighlight } from "./play-settings";
import "./core-prototype.css";

/** Candidate-move highlights: the move that led to the displayed position. */
function highlightFor(movement: string | undefined): MoveHighlight | null {
  if (movement === undefined) return null;
  try {
    const shape = parseUsiMoveShape(movement);
    return {
      from: shape.from,
      to: shape.to,
      drop: shape.from === null,
      capture: false,
      promotion: movement.endsWith("+"),
    };
  } catch {
    return null;
  }
}

const formatScore = (score: number) => `${score > 0 ? "+" : ""}${score}`;

export default function LearnedAnalysis({ locale }: { locale: Locale }) {
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const fileGeneration = useRef(0);
  const [state, setState] = useState(initialAnalysisState);
  const sessionRef = useRef<LearnedAnalysisSession | null>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const kifuInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<SearchProfile>("balanced");
  const [budget, setBudget] = useState(1000);
  const [multiPv, setMultiPv] = useState(3);
  const [recordText, setRecordText] = useState("position startpos");
  const [inputError, setInputError] = useState<string | null>(null);
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotion, setPromotion] = useState<MoveSummary[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pieceSet] = useState(persistedPieceSet);
  const [tab, setTab] = useState<"score" | "graph" | "kifu">("score");
  const [mode, setMode] = useState<AnalysisMode>("position");
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(
    null,
  );
  const [candidateNotation, setCandidateNotation] = useState<string[][]>([]);
  const [lineNotation, setLineNotation] = useState<string[]>([]);
  const messages = getMessages(locale);

  useEffect(() => {
    const session = new LearnedAnalysisSession(setState);
    sessionRef.current = session;
    void session.prepare();
    return () => {
      fileGeneration.current++;
      session.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSelection(null);
    setPromotion(null);
    setExpandedCandidate(null);
  }, [state.snapshot, state.selection]);

  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
        setPromotion(null);
      }
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);

  // Japanese notation of every candidate PV, rebuilt whenever results change.
  // `state.update?.lines` keeps a stable identity so the effect cannot loop
  // when there is no update.
  const candidateLines = state.update?.lines;
  const candidateSfen = state.snapshot?.sfen ?? null;
  useEffect(() => {
    let alive = true;
    if (
      candidateSfen === null ||
      !candidateLines ||
      candidateLines.length === 0
    ) {
      setCandidateNotation((previous) =>
        previous.length === 0 ? previous : [],
      );
      return;
    }
    Promise.all(
      candidateLines.map((line) => pvJapanese(candidateSfen, line.pv)),
    ).then((lines) => {
      if (alive) setCandidateNotation(lines);
    });
    return () => {
      alive = false;
    };
  }, [candidateSfen, candidateLines]);

  // Japanese notation of the committed line, for the kifu list and navigation.
  const lineMoves = state.line;
  const lineSfen = state.record.initialSfen;
  useEffect(() => {
    let alive = true;
    if (lineMoves.length === 0) {
      setLineNotation((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    pvJapanese(lineSfen, lineMoves).then((notation) => {
      if (alive) setLineNotation(notation);
    });
    return () => {
      alive = false;
    };
  }, [lineSfen, lineMoves]);

  const position = state.snapshot;
  const orientation = flipped ? "gote-bottom" : "sente-bottom";
  const ready =
    position !== null && state.identity !== null && state.phase !== "loading";
  const searching = state.phase === "searching";
  const perspective = position?.sideToMove === "white" ? -1 : 1;

  const move = (usi: string) => {
    setPromotion(null);
    setSelection(null);
    void sessionRef.current?.move(usi);
  };
  const legalDrops = new Set(
    position?.legalMoves.flatMap(({ drop }) => (drop === null ? [] : [drop])) ??
      [],
  );
  const hand = (side: "black" | "white") => (
    <HandStand
      side={side}
      entries={position!.hands[side]}
      selection={selection}
      legalDrops={legalDrops}
      disabled={!ready || position?.sideToMove !== side}
      messages={messages}
      orientation={orientation}
      pieceSet={pieceSet}
      onSelect={(piece: HandPieceKind) =>
        setSelection(toggleHandSelection(selection, piece))
      }
    />
  );
  const changeOptions = (action: () => void) => {
    sessionRef.current?.stop(true);
    action();
  };
  async function loadKifuFile(file: File): Promise<void> {
    const generation = ++fileGeneration.current;
    try {
      if (file.size > MAX_KIFU_BYTES)
        throw new Error(
          t(
            "棋譜ファイルは128KiB以内で指定してください。",
            "Choose a kifu file of 128 KiB or less.",
          ),
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (generation !== fileGeneration.current) return;
      const imported = await parseKifuBytes(bytes);
      if (generation !== fileGeneration.current) return;
      setInputError(null);
      await sessionRef.current?.loadPosition(imported);
    } catch (error) {
      if (generation === fileGeneration.current)
        setInputError(
          error instanceof Error
            ? error.message
            : t("読み込めませんでした。", "Could not load the file."),
        );
    }
  }
  function loadText(text: string) {
    fileGeneration.current++;
    try {
      const source = readAnalysisPosition(text);
      setInputError(null);
      void sessionRef.current?.loadPosition(source, "end");
    } catch (error) {
      setInputError(
        error instanceof Error
          ? error.message
          : t("読み込めませんでした。", "Could not load the position."),
      );
    }
  }
  const resetRecord = () => {
    if (
      state.line.length === 0 ||
      window.confirm(
        t(
          "読み込んだ棋譜とコメントを消して初期局面に戻しますか？",
          "Discard the loaded record and comments, and return to the start position?",
        ),
      )
    )
      void sessionRef.current
        ?.loadPosition({
          initialSfen: "position startpos",
          moves: [],
        })
        .catch(() => {});
  };

  /** The displayed line: the record, or the preview branch when one is active. */
  const describeRecord = () =>
    position === null
      ? null
      : {
          initialSfen: state.record.initialSfen,
          moves: [...state.line],
          blackName: state.record.blackName ?? messages.match.sente,
          whiteName: state.record.whiteName ?? messages.match.gote,
          termination:
            position.terminal === null
              ? undefined
              : {
                  reason: position.terminal.kind,
                  winner: position.terminal.winner,
                },
        };

  const modeNote =
    mode === "position"
      ? t(
          "表示中の局面を、選択した学習モデルで調べます。解析から駒を自動着手しません。",
          "Inspect the displayed position with the selected model. Analysis does not play moves automatically.",
        )
      : mode === "game"
        ? t(
            "表示中の手順を最初から順に解析し、各局面の評価値をグラフと棋譜に記録します。途中で停止できます。",
            "Analyze every position of the displayed line in order and record each evaluation in the graph and kifu. You can stop any time.",
          )
        : t(
            "予算内の探索で詰み手順を探します。見つからない場合も、詰んでいない保証にはなりません。",
            "Search for a mating sequence within the budget. Finding none does not prove the position is mate-free.",
          );

  const startLabel =
    mode === "game"
      ? t("棋譜を解析", "Analyze the record")
      : mode === "mate"
        ? t("詰み探索", "Search for mate")
        : t("解析開始", "Start analysis");
  const startAction = () => {
    const session = sessionRef.current;
    if (session === null) return;
    if (mode === "game") void session.sweep(profile, budget, multiPv);
    else void session.analyze(profile, budget, multiPv, mode);
  };

  const navLabel =
    state.cursor === 0
      ? t("開始局面", "Start position")
      : `${state.cursor} ${lineNotation[state.cursor - 1] ?? state.line[state.cursor - 1] ?? ""}`;

  return (
    <main className="learned-analysis" aria-labelledby="analysis-title">
      <h1 id="analysis-title" className="visually-hidden">
        {t("局面解析", "Position analysis")}
      </h1>
      {state.error || inputError ? (
        <div className="play-notice">
          <p role="alert">{inputError ?? state.error}</p>
          {state.phase === "error" ? (
            <button
              type="button"
              onClick={() => void sessionRef.current?.prepare()}
            >
              {t("同じモデルで再試行", "Retry this model")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="analysis-frame">
        <nav
          className="analysis-rail"
          aria-label={t("解析メニュー", "Analysis menu")}
        >
          <button type="button" onClick={() => kifuInput.current?.click()}>
            {t("棋譜を開く", "Open kifu")}
          </button>
          <input
            ref={kifuInput}
            type="file"
            accept=".kif,.kifu,.ki2,.ki2u,.csa,.usi,.sfen,.txt"
            className="visually-hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) await loadKifuFile(file);
            }}
          />
          <button type="button" onClick={() => setFlipped((value) => !value)}>
            {t("盤面反転", "Flip board")}
          </button>
          <button
            type="button"
            onClick={() => settingsDialog.current?.showModal()}
          >
            {t("解析設定", "Analysis settings")}
          </button>
          <button
            type="button"
            disabled={
              state.line.length === 0 && state.record.moves.length === 0
            }
            onClick={resetRecord}
          >
            {t("棋譜をリセット", "Reset record")}
          </button>
          <div className="analysis-rail__save">
            {state.branching ? (
              <p className="analysis-rail__note">
                {t(
                  "分岐を表示中。保存されるのは現在表示の手順です。",
                  "A branch is shown; the save covers the displayed line.",
                )}
              </p>
            ) : null}
            <KifuSaveMenu
              describe={describeRecord}
              locale={locale}
              prefix="shogi-analysis"
            />
          </div>
          <p className="analysis-rail__note">
            {t(
              "読み込んだ棋譜・コメントは端末内だけで扱います。",
              "Loaded records and comments stay on this device.",
            )}
          </p>
        </nav>

        <section
          className="analysis-center"
          aria-label={t("解析盤", "Analysis board")}
        >
          <div className="kifu-nav">
            <button
              type="button"
              aria-label={t("最初の局面へ", "Go to the start")}
              disabled={!ready || state.cursor === 0}
              onClick={() => void sessionRef.current?.goto(0)}
            >
              ⏮
            </button>
            <button
              type="button"
              aria-label={t("前の局面へ", "Go back one position")}
              disabled={!ready || state.cursor === 0}
              onClick={() => void sessionRef.current?.goto(state.cursor - 1)}
            >
              ◀
            </button>
            <p className="kifu-nav__label" aria-live="polite">
              {navLabel}
              <span className="kifu-nav__count">
                {state.line.length > 0
                  ? ` (${state.cursor}/${state.line.length})`
                  : ""}
              </span>
            </p>
            <button
              type="button"
              aria-label={t("次の局面へ", "Go forward one position")}
              disabled={!ready || state.cursor >= state.line.length}
              onClick={() => void sessionRef.current?.goto(state.cursor + 1)}
            >
              ▶
            </button>
            <button
              type="button"
              aria-label={t("最後の局面へ", "Go to the end")}
              disabled={!ready || state.cursor >= state.line.length}
              onClick={() => void sessionRef.current?.goto(state.line.length)}
            >
              ⏭
            </button>
          </div>
          {state.branching ? (
            <p className="analysis-branch-note">
              {t("分岐を表示しています。", "Showing a branch.")}{" "}
              <button
                type="button"
                onClick={() => sessionRef.current?.discardBranch()}
              >
                {t("本譜に戻す", "Back to the record")}
              </button>
              <button
                type="button"
                onClick={() => sessionRef.current?.adoptBranch()}
              >
                {t("この手順を本譜にする", "Make this the record")}
              </button>
            </p>
          ) : null}
          <div className="analysis-board-zone">
            <div className="board-fit">
              {position ? (
                <div className={`board-stage board-stage--${orientation}`}>
                  {hand("white")}
                  <ShogiBoard
                    snapshot={position}
                    selection={selection}
                    disabled={!ready}
                    messages={messages}
                    orientation={orientation}
                    pieceSet={pieceSet}
                    lastMove={highlightFor(state.line[state.cursor - 1])}
                    promotion={
                      promotion
                        ? {
                            moves: promotion,
                            onChoose: move,
                            onCancel: () => setPromotion(null),
                          }
                        : null
                    }
                    onSquare={(index) => {
                      const result = resolveBoardClick(
                        position,
                        selection,
                        index,
                      );
                      if (result.kind === "selection")
                        setSelection(result.selection);
                      else if (result.candidates.length === 1)
                        move(result.candidates[0].usi);
                      else setPromotion(result.candidates);
                    }}
                  />
                  {hand("black")}
                </div>
              ) : (
                <p role="status" className="analysis-board-status">
                  {state.phase === "loading"
                    ? t("準備しています…", "Preparing…")
                    : t("局面がありません。", "No position loaded.")}
                </p>
              )}
            </div>
            <label className="analysis-comment">
              {t("コメント", "Comment")}
              <textarea
                value={
                  state.cursor > 0
                    ? (state.record.comments[state.cursor - 1] ?? "")
                    : ""
                }
                disabled={
                  state.cursor === 0 || state.cursor > state.line.length
                }
                placeholder={
                  state.cursor === 0
                    ? t(
                        "手を選ぶとその手のコメントを書けます。",
                        "Select a move to comment on it.",
                      )
                    : t(
                        "この手へのメモ（端末内のみ）",
                        "A note for this move (local only)",
                      )
                }
                onChange={(event) =>
                  sessionRef.current?.setComment(
                    state.cursor,
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        </section>

        <section
          className="analysis-side"
          aria-label={t("解析結果", "Analysis results")}
        >
          <div className="analysis-side__head">
            <p className="analysis-model-line" role="status">
              {state.phase === "loading"
                ? `${modelLabel(state.selection, locale)}${t("を読み込み、照合しています…", ": loading and verifying…")}`
                : state.identity
                  ? modelLabel(state.selection, locale)
                  : t("照合済みモデルはありません", "No verified model loaded")}
            </p>
            {state.update ? (
              <p className="analysis-metrics-line">
                {t("深さ", "Depth")} {state.update.depth} ·{" "}
                {state.update.nodes.toLocaleString()} nodes
              </p>
            ) : null}
          </div>
          <div
            className="analysis-tabs"
            role="group"
            aria-label={t("表示の切り替え", "Display tabs")}
          >
            {(
              [
                ["score", t("評価値", "Scores")],
                ["graph", t("グラフ", "Graph")],
                ["kifu", t("棋譜", "Kifu")],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "score" ? (
            <div className="learned-analysis__result">
              <p role="status">
                {state.phase === "error"
                  ? t(
                      "解析を完了できませんでした。",
                      "Analysis could not be completed.",
                    )
                  : state.phase === "searching"
                    ? t("解析中…", "Analyzing…")
                    : state.phase === "stopped"
                      ? t("解析を停止しました。", "Analysis stopped.")
                      : state.update
                        ? t("解析を終了しました。", "Analysis complete.")
                        : t(
                            "解析は手動で開始します。",
                            "Start analysis when ready.",
                          )}
              </p>
              {position?.terminal ? (
                <p>
                  {position.terminal.kind === "checkmate"
                    ? t(
                        "実盤面で詰みが成立しています。",
                        "The position is checkmate.",
                      )
                    : `${t("終局：", "Game over: ")}${position.terminal.kind}`}
                </p>
              ) : null}
              {state.update && candidateLines ? (
                <ol className="candidate-list">
                  {candidateLines.map((line, index) => {
                    const names = candidateNotation[index] ?? [];
                    const score = line.score * perspective;
                    return (
                      <li key={line.rank} className="candidate">
                        <button
                          type="button"
                          className="candidate__row"
                          aria-expanded={expandedCandidate === line.rank}
                          onClick={() =>
                            setExpandedCandidate(
                              expandedCandidate === line.rank
                                ? null
                                : line.rank,
                            )
                          }
                        >
                          <span className="candidate__rank">#{line.rank}</span>
                          <span className="candidate__score">
                            {formatScore(score)}
                          </span>
                          <span className="candidate__move">
                            {names[0] ?? line.pv[0]}
                          </span>
                          <span className="candidate__summary">
                            {names.slice(1, 4).join(" ")}
                          </span>
                          <span
                            className="candidate__toggle"
                            aria-hidden="true"
                          >
                            {expandedCandidate === line.rank ? "▾" : "›"}
                          </span>
                        </button>
                        {expandedCandidate === line.rank ? (
                          <ol className="candidate__pv">
                            {(names.length > 0 ? names : line.pv).map(
                              (entry, moveIndex) => (
                                <li key={moveIndex}>{entry}</li>
                              ),
                            )}
                          </ol>
                        ) : null}
                        {line.mateScore !== null ? (
                          <p className="candidate__mate-note">
                            {t(
                              "詰み域の探索値（証明未確認）",
                              "Mate-range search score (not independently proven)",
                            )}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>
                  {t(
                    "この局面・モデルの探索結果はまだありません。",
                    "No search results for this position and model yet.",
                  )}
                </p>
              )}
              <details className="analysis-fold">
                <summary>
                  {t("評価の見方と診断", "Score notes and diagnostics")}
                </summary>
                <p>
                  {t(
                    "＋は先手寄り、−は後手寄りの探索値です。勝率ではなく、モデル間の値の大小も棋力順位を表しません。静的評価と独立した詰み証明はこの画面では未対応です。",
                    "Positive scores favor Sente; negative scores favor Gote. These are search scores, not win probabilities or a strength ranking across models. Static evaluation and independent mate proof are not available here.",
                  )}
                </p>
                <p>
                  {t(
                    "現runtimeの深さ上限は標準7・高品質9。解析予算は対局時計とは別で、区切りまたは停止時に終了します。ponder・常時解析は行いません。",
                    "This runtime searches up to depth 7 on Standard and 9 on High quality. Analysis uses a separate time budget and stops at a search boundary or when stopped. Pondering and continuous analysis are off.",
                  )}
                </p>
              </details>
            </div>
          ) : null}

          {tab === "graph" ? (
            <div className="analysis-graph">
              <EvalGraph
                points={state.graph}
                cursor={state.cursor}
                onSelect={(ply) => void sessionRef.current?.goto(ply)}
                labels={{
                  title: t(
                    "手数ごとの探索評価（先手視点）",
                    "Search evaluation per ply (Sente perspective)",
                  ),
                  note: t(
                    "±1400cp超は端に折り返します。詰み域の点は菱形。未解析の手は欠測です。点を選ぶとその局面へ移動します。",
                    "Scores beyond ±1400cp are clamped at the edges; mate-range points are diamonds. Unanalyzed plies are gaps. Select a point to jump to that position.",
                  ),
                }}
              />
              <label className="analysis-graph__slider">
                {t("手数", "Ply")}
                <input
                  type="range"
                  min={0}
                  max={state.line.length}
                  value={state.cursor}
                  onChange={(event) =>
                    void sessionRef.current?.goto(Number(event.target.value))
                  }
                />
                <span>{state.cursor}</span>
              </label>
            </div>
          ) : null}

          {tab === "kifu" ? (
            <div className="analysis-kifu">
              {state.record.blackName || state.record.whiteName ? (
                <p className="analysis-kifu__names">
                  {state.record.blackName ?? t("先手", "Sente")} vs{" "}
                  {state.record.whiteName ?? t("後手", "Gote")}
                </p>
              ) : null}
              {state.record.endingNote ? (
                <p className="analysis-kifu__ending">
                  {state.record.endingNote}
                </p>
              ) : null}
              <ol className="kifu-list">
                <li>
                  <button
                    type="button"
                    aria-current={state.cursor === 0 ? "step" : undefined}
                    onClick={() => void sessionRef.current?.goto(0)}
                  >
                    <span className="kifu-list__ply">—</span>
                    <span>{t("開始局面", "Start position")}</span>
                  </button>
                </li>
                {state.line.map((movement, index) => (
                  <li key={`${index}-${movement}`}>
                    <button
                      type="button"
                      aria-current={
                        state.cursor === index + 1 ? "step" : undefined
                      }
                      onClick={() => void sessionRef.current?.goto(index + 1)}
                    >
                      <span className="kifu-list__ply">{index + 1}</span>
                      <span className="kifu-list__move">
                        {lineNotation[index] ?? movement}
                      </span>
                      <span className="kifu-list__eval">
                        {state.graph[index + 1] !== null &&
                        state.graph[index + 1] !== undefined
                          ? formatScore(state.graph[index + 1]!.score)
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="analysis-modes">
            <fieldset
              className="segmented-control analysis-modes__picker"
              disabled={state.phase === "loading"}
            >
              <legend className="visually-hidden">
                {t("解析モード", "Analysis mode")}
              </legend>
              <div>
                {(
                  [
                    ["position", t("局面解析", "Position")],
                    ["game", t("棋譜解析", "Record")],
                    ["mate", t("詰み解析", "Mate")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={mode === value}
                    disabled={searching}
                    onClick={() => setMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="analysis-mode-note">{modeNote}</p>
            <div className="inline-actions">
              {mode === "game" ? (
                <button
                  type="button"
                  disabled={!ready || searching || state.line.length === 0}
                  onClick={startAction}
                >
                  {startLabel}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!ready || searching || position?.terminal !== null}
                  onClick={startAction}
                >
                  {startLabel}
                </button>
              )}
              <button
                type="button"
                disabled={!searching}
                onClick={() => sessionRef.current?.stop()}
              >
                {t("解析停止", "Stop analysis")}
              </button>
            </div>
            {state.sweep ? (
              <p className="analysis-sweep" role="status">
                {t("棋譜解析", "Record analysis")} {state.sweep.done}/
                {state.sweep.total}
                <progress
                  aria-label={t("棋譜解析の進捗", "Record analysis progress")}
                  max={state.sweep.total}
                  value={state.sweep.done}
                />
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <dialog
        ref={settingsDialog}
        className="notice-view analysis-settings"
        aria-labelledby="analysis-settings-title"
        onCancel={() => {}}
        onClose={() => {}}
      >
        <article>
          <header>
            <h2 id="analysis-settings-title">
              {t("解析設定", "Analysis settings")}
            </h2>
            <button
              type="button"
              onClick={() => settingsDialog.current?.close()}
            >
              {t("閉じる", "Close")}
            </button>
          </header>
          <fieldset className="analysis-settings__group">
            <legend>{t("探索", "Search")}</legend>
            <label>
              {t("計算品質", "Search quality")}{" "}
              <select
                disabled={state.phase === "loading"}
                value={profile}
                onChange={(event) =>
                  changeOptions(() =>
                    setProfile(event.target.value as SearchProfile),
                  )
                }
              >
                <option value="balanced">{t("標準", "Standard")}</option>
                <option value="quality">{t("高品質", "High quality")}</option>
              </select>
            </label>
            <label>
              {t("解析予算", "Analysis time")}{" "}
              <select
                disabled={state.phase === "loading"}
                value={budget}
                onChange={(event) =>
                  changeOptions(() => setBudget(Number(event.target.value)))
                }
              >
                <option value={250}>{t("0.25秒", "0.25 seconds")}</option>
                <option value={1000}>{t("1秒", "1 second")}</option>
                <option value={3000}>{t("3秒", "3 seconds")}</option>
              </select>
            </label>
            <label>
              {t("候補手", "Candidate moves")}{" "}
              <select
                disabled={state.phase === "loading"}
                value={multiPv}
                onChange={(event) =>
                  changeOptions(() => setMultiPv(Number(event.target.value)))
                }
              >
                <option value={1}>{t("1手", "1 move")}</option>
                <option value={3}>{t("最大3手", "Up to 3 moves")}</option>
              </select>
            </label>
          </fieldset>
          <fieldset className="analysis-settings__group">
            <legend>{t("モデル選択", "Model selection")}</legend>
            <ModelPicker
              selection={state.selection}
              disabled={false}
              locale={locale}
              onSelect={(value: PrototypeSelection) =>
                void sessionRef.current?.prepare(value)
              }
            />
            {state.identity ? (
              <p className="analysis-settings__identity">
                <code>{state.identity.modelId}</code> ·{" "}
                <code>{state.identity.leafSha256.slice(0, 12)}</code>
              </p>
            ) : null}
          </fieldset>
          <fieldset className="analysis-settings__group">
            <legend>
              {t("局面・棋譜を読み込む", "Load a position or game")}
            </legend>
            <label>
              USI / SFEN{" "}
              <textarea
                value={recordText}
                onChange={(event) => setRecordText(event.target.value)}
                maxLength={12288}
              />
            </label>
            <button type="button" onClick={() => loadText(recordText)}>
              {t("局面を読み込む", "Load position")}
            </button>
            <label>
              {t(
                "棋譜ファイル (KIF/KI2/CSA/USI)",
                "Kifu file (KIF/KI2/CSA/USI)",
              )}{" "}
              <input
                type="file"
                accept=".kif,.kifu,.ki2,.ki2u,.csa,.usi,.sfen,.txt"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) await loadKifuFile(file);
                }}
              />
            </label>
            <p>
              {t(
                "読込内容は端末内だけで扱い、棋譜提供の対象にはしません。SFENの合法性と指し手の再現は既存Wasmで確認します。",
                "Imported positions stay on your device and are excluded from game collection. The engine checks the position and replays its moves.",
              )}
            </p>
          </fieldset>
          <button
            type="button"
            disabled={!state.identity}
            onClick={() =>
              downloadText(
                "openshogi-analysis-diagnostics.json",
                JSON.stringify(
                  {
                    identity: state.identity,
                    position: position?.sfen,
                    profile,
                    budget,
                    multiPv,
                    update: state.update,
                    progress: state.progress,
                  },
                  null,
                  2,
                ),
              )
            }
          >
            {t("診断ログを保存", "Save diagnostics")}
          </button>
        </article>
      </dialog>
    </main>
  );
}

/** Compact SVG line chart of recorded evaluations; gaps stay gaps. */
function EvalGraph({
  points,
  cursor,
  onSelect,
  labels,
}: {
  points: ({
    ply: number;
    score: number;
    mate: boolean;
    depth: number;
  } | null)[];
  cursor: number;
  onSelect: (ply: number) => void;
  labels: { title: string; note: string };
}) {
  const width = 640;
  const height = 300;
  const midY = height / 2;
  const span = 1400;
  const maxPly = points.length - 1;
  const x = (ply: number) =>
    maxPly <= 0 ? width / 2 : 10 + (ply / maxPly) * (width - 20);
  const y = (score: number) => {
    const clamped = Math.max(-span, Math.min(span, score));
    return midY - (clamped / span) * (midY - 10);
  };
  const segments: string[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    segments.push(
      `M${x(from.ply).toFixed(1)},${y(from.score).toFixed(1)}L${x(to.ply).toFixed(1)},${y(to.score).toFixed(1)}`,
    );
  }
  const zero = midY;
  return (
    <figure className="eval-graph">
      <svg
        role="img"
        aria-label={labels.title}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <line
          className="eval-graph__axis"
          x1={0}
          x2={width}
          y1={zero}
          y2={zero}
        />
        <line
          className="eval-graph__cursor"
          x1={x(cursor)}
          x2={x(cursor)}
          y1={4}
          y2={height - 4}
        />
        {segments.map((path) => (
          <path className="eval-graph__line" d={path} key={path} />
        ))}
        {points.map((point) =>
          point === null ? null : (
            <g key={point.ply}>
              {point.mate ? (
                <rect
                  className="eval-graph__mate"
                  height={9}
                  transform={`rotate(45 ${x(point.ply)} ${y(point.score)})`}
                  width={9}
                  x={x(point.ply) - 4.5}
                  y={y(point.score) - 4.5}
                />
              ) : (
                <circle
                  className="eval-graph__point"
                  cx={x(point.ply)}
                  cy={y(point.score)}
                  r={3.4}
                />
              )}
              <circle
                className="eval-graph__hit"
                cx={x(point.ply)}
                cy={y(point.score)}
                onClick={() => onSelect(point.ply)}
                r={11}
              >
                <title>{`#${point.ply} ${formatScore(point.score)}${point.mate ? " (詰み域)" : ""}`}</title>
              </circle>
            </g>
          ),
        )}
      </svg>
      <figcaption>{labels.note}</figcaption>
    </figure>
  );
}
