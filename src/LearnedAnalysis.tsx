import { useEffect, useRef, useState } from "react";
import { getMessages, type Locale } from "./localization";
import {
  initialAnalysisState,
  LearnedAnalysisSession,
  readAnalysisPosition,
} from "./learned-analysis";
import type {
  PrototypeSelection,
  PrototypeSnapshot,
} from "./core-prototype-protocol";
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
import { useBoardFit } from "./useBoardFit";
import "./core-prototype.css";

/** Keeps the setting folds open on wide screens where the column has room. */
function useWideLayout(): boolean {
  const [wide, setWide] = useState(
    () => window.matchMedia("(min-width: 64rem)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function LearnedAnalysis({ locale }: { locale: Locale }) {
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const fileGeneration = useRef(0);
  const [state, setState] = useState(initialAnalysisState);
  const sessionRef = useRef<LearnedAnalysisSession | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const [profile, setProfile] = useState<SearchProfile>("balanced");
  const [budget, setBudget] = useState(1000);
  const [multiPv, setMultiPv] = useState(3);
  const [record, setRecord] = useState("position startpos");
  const [inputError, setInputError] = useState<string | null>(null);
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotion, setPromotion] = useState<MoveSummary[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pieceSet] = useState(persistedPieceSet);
  const messages = getMessages(locale);
  const wide = useWideLayout();
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
  const position = state.snapshot;
  const orientation = flipped ? "gote-bottom" : "sente-bottom";
  const locked = state.phase === "loading";
  const ready = position !== null && state.identity !== null && !locked;
  useBoardFit(boardRef, position !== null);
  const move = (usi: string) => {
    setPromotion(null);
    setSelection(null);
    fileGeneration.current++;
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
  function prepare(
    value: PrototypeSelection = state.selection,
    position?: Pick<PrototypeSnapshot, "initialSfen" | "moves">,
  ) {
    fileGeneration.current++;
    void sessionRef.current?.prepare(value, position);
  }
  function load(text: string) {
    fileGeneration.current++;
    try {
      const source = readAnalysisPosition(text);
      setInputError(null);
      prepare(state.selection, source);
    } catch (error) {
      setInputError(
        error instanceof Error
          ? error.message
          : t("読込できませんでした。", "Could not load the position."),
      );
    }
  }
  /** The current line only: this view keeps one branch, and saves exactly it. */
  const describeRecord = () =>
    position === null
      ? null
      : {
          initialSfen: position.initialSfen,
          moves: [...position.moves],
          blackName: messages.match.sente,
          whiteName: messages.match.gote,
          termination: position.terminal?.kind,
        };
  const perspective = position?.sideToMove === "white" ? -1 : 1;
  return (
    <main className="learned-analysis" aria-labelledby="analysis-title">
      <header>
        <h1 id="analysis-title">{t("局面解析", "Position analysis")}</h1>
        <p>
          {t(
            "選択した学習モデルで局面を調べます。解析から駒を自動着手しません。",
            "Inspect positions with the selected learned model. Analysis does not play moves automatically.",
          )}
        </p>
      </header>
      <p className="analysis-model-line" role="status">
        {state.phase === "loading"
          ? `${modelLabel(state.selection, locale)}${t("を読み込み、照合しています…", ": loading and verifying…")}`
          : state.identity
            ? `${modelLabel(state.selection, locale)} · ${state.identity.modelId} · ${state.identity.leafSha256.slice(0, 12)}`
            : t("照合済みモデルはありません", "No verified model loaded")}
      </p>
      {state.error || inputError ? (
        <div className="play-notice">
          <p role="alert">{inputError ?? state.error}</p>
          {state.phase === "error" ? (
            <button type="button" onClick={() => prepare()}>
              {t("同じモデルで再試行", "Retry this model")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="learned-analysis__layout">
        <section
          className="learned-analysis__settings"
          aria-label={t("解析設定", "Analysis settings")}
        >
          <details
            className="analysis-fold"
            key={`quality-${wide}`}
            open={wide}
          >
            <summary>{t("解析設定", "Search settings")}</summary>
            <label>
              {t("計算品質", "Search quality")}{" "}
              <select
                disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
                value={multiPv}
                onChange={(event) =>
                  changeOptions(() => setMultiPv(Number(event.target.value)))
                }
              >
                <option value={1}>{t("1手", "1 move")}</option>
                <option value={3}>{t("最大3手", "Up to 3 moves")}</option>
              </select>
            </label>
          </details>
          <details className="analysis-fold" key={`model-${wide}`} open={wide}>
            <summary>{t("モデル選択", "Model")}</summary>
            <ModelPicker
              selection={state.selection}
              disabled={false}
              locale={locale}
              onSelect={(value) => prepare(value)}
            />
          </details>
          <details className="analysis-fold">
            <summary>
              {t("局面・棋譜を読み込む", "Load a position or game")}
            </summary>
            <label>
              USI / SFEN{" "}
              <textarea
                value={record}
                onChange={(event) => {
                  fileGeneration.current++;
                  setRecord(event.target.value);
                }}
                maxLength={12288}
              />
            </label>
            <button type="button" onClick={() => load(record)}>
              {t("局面を読み込む", "Load position")}
            </button>
            <label>
              {t("USI / SFENファイル", "USI / SFEN file")}{" "}
              <input
                type="file"
                accept=".usi,.sfen,.txt"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const generation = ++fileGeneration.current;
                  const input = event.target;
                  input.value = "";
                  if (file.size > 12288) {
                    setInputError(
                      t(
                        "ファイルは12KiB以内で指定してください。",
                        "Choose a file of 12 KiB or less.",
                      ),
                    );
                    return;
                  }
                  try {
                    const text = await file.text();
                    if (generation !== fileGeneration.current) return;
                    setRecord(text);
                    load(text);
                  } catch {
                    if (generation !== fileGeneration.current) return;
                    setInputError(
                      t(
                        "ファイルを読み込めませんでした。",
                        "Could not read the file.",
                      ),
                    );
                  }
                }}
              />
            </label>
            <p>
              {t(
                "読込内容は端末内だけで扱い、棋譜提供の対象にはしません。SFENの合法性と指し手の再現は既存Wasmで確認します。",
                "Imported positions stay on your device and are excluded from game collection. The engine checks the position and replays its moves.",
              )}
            </p>
          </details>
        </section>
        <section
          className="learned-analysis__board"
          aria-label={t("解析盤", "Analysis board")}
          ref={boardRef}
        >
          {position ? (
            <>
              <div className="board-fit">
                <div className={`board-stage board-stage--${orientation}`}>
                  {hand("white")}
                  <ShogiBoard
                    snapshot={position}
                    selection={selection}
                    disabled={!ready}
                    messages={messages}
                    orientation={orientation}
                    pieceSet={pieceSet}
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
              </div>
              <div className="inline-actions analysis-actions">
                <button
                  type="button"
                  disabled={
                    !ready ||
                    state.phase === "searching" ||
                    position?.terminal !== null
                  }
                  onClick={() =>
                    void sessionRef.current?.analyze(profile, budget, multiPv)
                  }
                >
                  {t("解析開始", "Start analysis")}
                </button>
                <button
                  type="button"
                  disabled={state.phase !== "searching"}
                  onClick={() => sessionRef.current?.stop()}
                >
                  {t("解析停止", "Stop analysis")}
                </button>
                <button
                  type="button"
                  onClick={() => setFlipped((value) => !value)}
                >
                  {t("盤面反転", "Flip board")}
                </button>
                <button
                  type="button"
                  disabled={!ready || !position.moves.length}
                  onClick={() =>
                    prepare(state.selection, {
                      initialSfen: position.initialSfen,
                      moves: position.moves.slice(0, -1),
                    })
                  }
                >
                  {t("一手戻す", "Take back")}
                </button>
              </div>
              <KifuSaveMenu
                describe={describeRecord}
                locale={locale}
                prefix="shogi-analysis"
              />
            </>
          ) : null}
        </section>
        <section
          className="learned-analysis__result"
          aria-label={t("解析結果", "Analysis results")}
        >
          <h2>
            {t("探索評価（先手視点）", "Search evaluation (Sente perspective)")}
          </h2>
          <p role="status">
            {state.phase === "error"
              ? t(
                  "解析を完了できませんでした。",
                  "Analysis could not be completed.",
                )
              : state.phase === "searching"
                ? t("解析中…", "Analyzing\u2026")
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
          {state.update ? (
            <>
              <p>
                {t("深さ", "Depth")} {state.update.depth} ·{" "}
                {state.progress.nodes.toLocaleString()} nodes
              </p>
              <ol>
                {state.update.lines.map((line) => (
                  <li key={line.rank}>
                    <strong>
                      {line.pv[0]} · {line.score * perspective > 0 ? "+" : ""}
                      {line.score * perspective} cp
                    </strong>
                    <p>{line.pv.join(" ")}</p>
                    {line.mateScore !== null ? (
                      <p>
                        {t(
                          "詰み域の探索値（証明未確認）",
                          "Mate-range search score (not independently proven)",
                        )}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
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
          </details>
        </section>
      </div>
    </main>
  );
}
