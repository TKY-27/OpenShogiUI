import { useEffect, useRef, useState } from "react";
import { releaseControllerEnabled } from "virtual:shogi-runtime";
import type { MoveSummary, SearchProfile, Side } from "./browser-engine";
import {
  initialPrototypeState,
  PrototypeMatchSession,
} from "./core-prototype-session";
import { getMessages, type Locale } from "./localization";
import { MatchClockPanel } from "./MatchClockPanel";
import { opposing } from "./match-clock";
import { downloadText } from "./kifu";
import { lastMoveHighlight } from "./play-settings";
import {
  HandStand,
  persistedPieceSet,
  resolveBoardClick,
  ShogiBoard,
  toggleHandSelection,
  type BoardSelection,
} from "./ShogiBoardView";
import "./core-prototype.css";

export default function CorePrototype({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const ja = locale === "ja";
  const sessionRef = useRef<PrototypeMatchSession | null>(null);
  const [state, setState] = useState(initialPrototypeState);
  const [humanSide, setHumanSide] = useState<Side>("black");
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<"blitz3" | "rapid10">("blitz3");
  const [profile, setProfile] = useState<SearchProfile>("balanced");
  const [confirmAction, setConfirmAction] = useState<"resign" | "reset" | null>(
    null,
  );
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotion, setPromotion] = useState<MoveSummary[] | null>(null);
  const [pieceSet] = useState(persistedPieceSet);

  useEffect(() => {
    const session = new PrototypeMatchSession(setState);
    sessionRef.current = session;
    void session.prepare();
    const timer = window.setInterval(() => session.tick(), 100);
    return () => {
      window.clearInterval(timer);
      session.dispose();
      sessionRef.current = null;
    };
  }, []);
  useEffect(() => {
    setSelection(null);
    setPromotion(null);
  }, [state.snapshot, state.phase]);
  useEffect(() => {
    if (confirmAction !== null && !confirmRef.current?.open)
      confirmRef.current?.showModal();
  }, [confirmAction]);

  const position = state.snapshot;
  const orientation =
    state.humanSide === "black" ? "sente-bottom" : "gote-bottom";
  const canMove =
    state.phase === "playing" &&
    !state.busy &&
    position?.sideToMove === state.humanSide;
  const topSide = opposing(state.humanSide);
  const running = (side: Side) =>
    (state.phase === "playing" || state.phase === "stopping") &&
    position?.sideToMove === side
      ? state.turnStartedAt
      : null;
  const sideLabel = (side: Side) =>
    side === "black" ? messages.match.sente : messages.match.gote;
  const move = (usi: string) => {
    setSelection(null);
    setPromotion(null);
    void sessionRef.current?.move(usi);
  };
  const choose = (moves: MoveSummary[]) => {
    if (moves.length === 1) move(moves[0].usi);
    else setPromotion(moves);
  };
  const legalDrops = new Set(
    position?.legalMoves.flatMap(({ drop }) => (drop === null ? [] : [drop])) ??
      [],
  );
  const setup =
    state.phase === "setup" ||
    state.phase === "error" ||
    (state.phase === "loading" && position === null);
  const active = state.phase === "playing" || state.phase === "stopping";
  const canSelectModel = setup && (state.phase === "loading" || !state.busy);
  const ready =
    state.phase === "setup" &&
    !state.busy &&
    state.manifest !== null &&
    position !== null &&
    state.identity?.expectedHashVerified === true &&
    state.identity.leafSha256 === position.leafSha256;
  const modelLabel = import.meta.env.DEV
    ? state.selection === "r4c1"
      ? ja
        ? "R4-C1（比較候補・未採用）"
        : "R4-C1 (comparison only)"
      : state.selection === "defense"
        ? ja
          ? "防御学習候補"
          : "Defense learning candidate"
        : state.selection === "candidate"
          ? ja
            ? "r3候補"
            : "r3 candidate"
          : ja
            ? "旧基準 (W256)"
            : "Previous baseline (W256)"
    : messages.match.engine;
  const result = state.result;
  const status =
    state.phase === "loading"
      ? ja
        ? "ローカル AI を準備しています…"
        : "Preparing local AI…"
      : state.phase === "stopping"
        ? ja
          ? "探索を中断しています…"
          : "Cancelling search…"
        : state.phase === "stopped"
          ? ja
            ? "対局を停止しました。残り時間を保持しています。"
            : "Paused. Remaining time is preserved."
          : result !== null
            ? `${result.winner === null ? (ja ? "引き分け" : "Draw") : `${sideLabel(result.winner)}${ja ? "の勝ち" : " wins"}`} · ${result.reason === "timeout" ? (ja ? "時間切れ" : "Time expired") : result.reason.includes("resignation") ? (ja ? "投了" : "Resignation") : ja ? "終局" : "Game ended"}`
            : state.phase === "playing"
              ? state.busy
                ? messages.match.engineThinking
                : messages.match.yourTurn
              : ja
                ? "持ち時間制・定跡なし"
                : "Sudden death; no opening book";

  const clock = (side: Side) => (
    <MatchClockPanel
      label={sideLabel(side)}
      name={side === state.humanSide ? messages.match.you : modelLabel}
      baseMs={state.clock[side === "black" ? "blackTimeMs" : "whiteTimeMs"]}
      runningSince={running(side)}
      showClock
      active={running(side) !== null}
      remainingLabel={messages.match.remainingTime}
    />
  );

  return (
    <main
      className={`match-page core-prototype ${import.meta.env.DEV ? "core-prototype--development" : ""} ${setup ? "" : "match-page--playing"}`}
      aria-labelledby="prototype-title"
    >
      <header className="prototype-heading">
        <h1 id="prototype-title">
          {import.meta.env.DEV
            ? ja
              ? "学習モデルを選んで対局"
              : "Choose a learned model to play"
            : messages.workspace.startMatch}
        </h1>
        <p>
          {import.meta.env.DEV
            ? ja
              ? "開発用の新旧モデル比較です。棋力は検証中です。"
              : "Compare development models. Playing strength is under evaluation."
            : ja
              ? "3分・10分の切れ負け。定跡なし。"
              : "3-minute or 10-minute sudden death. No opening book."}
        </p>
      </header>
      {import.meta.env.DEV ? (
        <section
          className="prototype-model"
          aria-label={ja ? "開発用モデル設定" : "Development model settings"}
        >
          <fieldset className="segmented-control" disabled={!canSelectModel}>
            <legend>{ja ? "モデル" : "Model"}</legend>
            <div>
              {(["defense", "r4c1", "candidate", "baseline"] as const).map(
                (value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={state.selection === value}
                    onClick={() => {
                      setEnabled(false);
                      void sessionRef.current?.prepare(value);
                    }}
                  >
                    {value === "r4c1"
                      ? ja
                        ? "R4-C1（比較候補・未採用）"
                        : "R4-C1 (comparison only)"
                      : value === "defense"
                        ? ja
                          ? "防御学習候補"
                          : "Defense learning candidate"
                        : value === "candidate"
                          ? ja
                            ? "r3候補"
                            : "r3 candidate"
                          : ja
                            ? "旧基準 (W256)"
                            : "Previous baseline (W256)"}
                  </button>
                ),
              )}
            </div>
          </fieldset>
          <p
            className="prototype-model__status"
            role="status"
            aria-live="polite"
          >
            {state.phase === "loading" ? (
              ja ? (
                `${modelLabel}を読み込み、照合しています…`
              ) : (
                `Loading and verifying ${modelLabel}…`
              )
            ) : state.identity === null ? (
              ja ? (
                "モデルは未読込です"
              ) : (
                "No verified model is loaded"
              )
            ) : (
              <>
                {modelLabel} · {ja ? "照合済み" : "Verified"} ·{" "}
                <code>{state.identity.modelId}</code>
                <br />
                OSAVAL03 · <code>
                  {state.identity.leafSha256.slice(0, 12)}
                </code>{" "}
                · {ja ? "思考制御" : "Controller"}{" "}
                {(setup ? enabled : state.enabled) ? "ON" : "OFF"} ·{" "}
                {messages.play.profileName[setup ? profile : state.profile]}
              </>
            )}
          </p>
          {!setup ? (
            <p className="match-setup__note">
              {ja
                ? "モデルを変更するには、対局を終了して設定に戻ってください。"
                : "End this game and return to settings to change models."}
            </p>
          ) : null}
        </section>
      ) : null}
      {setup ? (
        <div className="match-setup">
          <fieldset
            className="segmented-control"
            disabled={state.phase === "loading" || state.busy}
          >
            <legend>{messages.match.timeControl}</legend>
            <div>
              {(["blitz3", "rapid10"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={preset === value}
                  onClick={() => setPreset(value)}
                >
                  {messages.match.preset[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset
            className="segmented-control"
            disabled={state.phase === "loading" || state.busy}
          >
            <legend>{ja ? "計算品質" : "Search quality"}</legend>
            <div>
              {(["balanced", "quality"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={profile === value}
                  onClick={() => setProfile(value)}
                >
                  {messages.play.profileName[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset
            className="segmented-control"
            disabled={state.phase === "loading" || state.busy}
          >
            <legend>{messages.match.yourSide}</legend>
            <div>
              {(["black", "white"] as const).map((side) => (
                <button
                  type="button"
                  aria-pressed={humanSide === side}
                  onClick={() => setHumanSide(side)}
                  key={side}
                >
                  {sideLabel(side)}
                </button>
              ))}
            </div>
          </fieldset>
          {import.meta.env.DEV ? (
            <fieldset
              className="segmented-control"
              disabled={state.phase === "loading" || state.busy}
            >
              <legend>
                {ja ? "思考制御 (開発用)" : "Computation control (development)"}
              </legend>
              <div>
                {[true, false].map((value) => (
                  <button
                    type="button"
                    key={String(value)}
                    aria-pressed={enabled === value}
                    disabled={
                      value &&
                      state.manifest?.artifacts["controller.json"] == null
                    }
                    onClick={() => setEnabled(value)}
                  >
                    {value ? (ja ? "有効" : "On") : ja ? "無効" : "Off"}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <p className="match-setup__note">
            {ja
              ? "標準・高品質は同じモデルを使い、残り時間から思考時間を配分します。モデルの読込と照合が終わると対局を開始できます。"
              : "Standard and high quality use the same model and allocate thinking time from the remaining clock. Play is available after the model is loaded and verified."}
          </p>
          <button
            className="match-start"
            type="button"
            disabled={!ready}
            onClick={() =>
              void sessionRef.current?.start(
                humanSide,
                import.meta.env.DEV ? enabled : releaseControllerEnabled,
                preset,
                profile,
              )
            }
          >
            {messages.match.start}
          </button>
        </div>
      ) : null}
      {state.error === null ? null : (
        <div className="play-notice prototype-error">
          <p role="alert">{state.error}</p>
          <button
            type="button"
            onClick={() => void sessionRef.current?.prepare(state.selection)}
          >
            {ja ? "同じモデルで再試行" : "Retry this model"}
          </button>
        </div>
      )}
      {position === null || setup ? null : (
        <div className="match-board">
          {clock(topSide)}
          <div className="board-fit">
            <div className={`board-stage board-stage--${orientation}`}>
              <HandStand
                disabled={!canMove || position.sideToMove !== "white"}
                entries={position.hands.white}
                legalDrops={legalDrops}
                messages={messages}
                onSelect={(piece) =>
                  setSelection(toggleHandSelection(selection, piece))
                }
                orientation={orientation}
                pieceSet={pieceSet}
                selection={selection}
                side="white"
              />
              <ShogiBoard
                snapshot={position}
                selection={selection}
                disabled={!canMove}
                messages={messages}
                orientation={orientation}
                pieceSet={pieceSet}
                lastMove={
                  state.previous === null
                    ? null
                    : lastMoveHighlight([state.previous, position], 1)
                }
                promotion={
                  promotion === null || !canMove
                    ? null
                    : {
                        moves: promotion,
                        onChoose: move,
                        onCancel: () => setPromotion(null),
                      }
                }
                onSquare={(index) => {
                  if (!canMove) return;
                  const result = resolveBoardClick(position, selection, index);
                  if (result.kind === "move") choose(result.candidates);
                  else setSelection(result.selection);
                }}
              />
              <HandStand
                disabled={!canMove || position.sideToMove !== "black"}
                entries={position.hands.black}
                legalDrops={legalDrops}
                messages={messages}
                onSelect={(piece) =>
                  setSelection(toggleHandSelection(selection, piece))
                }
                orientation={orientation}
                pieceSet={pieceSet}
                selection={selection}
                side="black"
              />
            </div>
          </div>
          {clock(state.humanSide)}
        </div>
      )}
      <div className="match-controls">
        <p role="status" aria-live="polite" className="match-status">
          {status}
        </p>
        <p className="match-move-number">
          {import.meta.env.DEV ? (
            <span>
              {ja ? "思考制御" : "Control"}{" "}
              {(setup ? enabled : state.enabled) ? "ON" : "OFF"}
            </span>
          ) : null}
          <strong>
            {position?.moveNumber ?? 1}
            {ja ? "手目" : " ply"}
          </strong>
        </p>
        <div className="inline-actions">
          {active ? (
            <button
              type="button"
              disabled={state.phase === "stopping"}
              onClick={() => sessionRef.current?.stop()}
            >
              {ja ? "停止" : "Stop"}
            </button>
          ) : null}
          {state.phase === "stopped" ? (
            <button
              type="button"
              onClick={() => void sessionRef.current?.resume()}
            >
              {ja ? "再開" : "Resume"}
            </button>
          ) : null}
          {state.phase === "playing" || state.phase === "stopped" ? (
            <button type="button" onClick={() => setConfirmAction("resign")}>
              {messages.match.resign}
            </button>
          ) : null}
          {position !== null && !setup ? (
            <button
              type="button"
              disabled={state.phase === "stopping"}
              onClick={() => {
                if (active || state.phase === "stopped")
                  setConfirmAction("reset");
                else sessionRef.current?.configure();
              }}
            >
              {active || state.phase === "stopped"
                ? ja
                  ? "対局を終了して設定へ"
                  : "End game and return to settings"
                : messages.match.rematch}
            </button>
          ) : null}
        </div>
      </div>
      {import.meta.env.DEV && state.manifest !== null ? (
        <details className="prototype-artifacts">
          <summary>
            {ja
              ? "モデルと読込の詳細 (開発用)"
              : "Model and load details (development)"}
          </summary>
          {state.telemetry == null ||
          state.telemetry.elapsedMs == null ? null : (
            <>
              <p>
                {ja ? "直前の AI 手" : "Last AI move"} ·{" "}
                {state.telemetry.enabled ? "ON" : "OFF"} ·{" "}
                {ja ? "実消費" : "Charged"}{" "}
                {state.telemetry.elapsedMs.toLocaleString(
                  ja ? "ja-JP" : "en-US",
                )}{" "}
                ms · {ja ? "目標" : "Target"}{" "}
                {state.telemetry.targetMs.toFixed(1)} ms
              </p>
              <p>
                {state.telemetry.profile} · {state.telemetry.preset} ·{" "}
                {state.telemetry.side} · {state.telemetry.movement} ·{" "}
                {state.telemetry.termination}
                <br />
                {ja ? "探索" : "Search"} {state.telemetry.searchMs.toFixed(1)}{" "}
                ms · {ja ? "絶対上限" : "Hard limit"}{" "}
                {state.telemetry.hardLimitMs.toFixed(1)} ms · depth{" "}
                {state.telemetry.depth} · nodes {state.telemetry.nodes} · cp{" "}
                {state.telemetry.scoreCp ?? "—"}
                <br />
                {ja ? "残り時計" : "Remaining clocks"}{" "}
                {state.telemetry.remaining.blackTimeMs} /{" "}
                {state.telemetry.remaining.whiteTimeMs} ms
              </p>
              <p>
                {ja ? "予測リスク" : "Predicted risk"}{" "}
                {state.telemetry.predictedRisk.toFixed(3)} ·{" "}
                {ja ? "制御判断" : "Decisions"} {state.telemetry.decisions} ·{" "}
                {ja ? "並べ替えた手" : "Reordered moves"}{" "}
                {state.telemetry.reorderedMoves}
              </p>
            </>
          )}
          {state.preparation === null ? null : (
            <p>
              {ja ? "対局前準備" : "Preparation"}: fetch{" "}
              {state.preparation.fetchMs.toFixed(1)} ms · module{" "}
              {state.preparation.moduleMs.toFixed(1)} ms · compile{" "}
              {state.preparation.compileMs.toFixed(1)} ms · model{" "}
              {state.preparation.modelMs.toFixed(1)} ms · total{" "}
              {state.preparation.totalMs.toFixed(1)} ms
            </p>
          )}
          <p>
            {state.manifest.selection} · {state.manifest.runId}
          </p>
          <p>
            {ja ? "期待する評価器 SHA-256" : "Expected evaluator SHA-256"}
            <br />
            {state.manifest.artifacts["leaf.osaval03"].sha256}
          </p>
          {state.identity === null ? null : (
            <>
              <p>
                {ja ? "読み込んだ評価器 SHA-256" : "Loaded evaluator SHA-256"}
                <br />
                {state.identity.leafSha256}
              </p>
              <p>
                {state.identity.modelFormat} · {state.identity.buildClass} ·{" "}
                {state.identity.evaluationMode}
              </p>
            </>
          )}
          {state.telemetry === null ? null : (
            <p>
              {ja
                ? "直前の推論が使った評価器 SHA-256"
                : "Evaluator SHA-256 used for the last inference"}
              <br />
              {state.telemetry.leafSha256}
            </p>
          )}
          <p>
            {ja ? "思考制御" : "Controller"} ·{" "}
            {state.manifest.artifacts["controller.json"]?.sha256 ??
              (ja
                ? "対応する制御器なし / OFF"
                : "No matching controller / OFF")}
          </p>
          <p>Wasm · {state.manifest.artifacts["engine.wasm"].sha256}</p>
          <button
            type="button"
            onClick={() =>
              downloadText(
                "openshogi-development-diagnostics.json",
                JSON.stringify(
                  {
                    schema: "open_shogi_ui_diagnostics/v1",
                    manifest: state.manifest,
                    identity: state.identity,
                    preparation: state.preparation,
                    searches: state.diagnostics,
                    game: {
                      initialSfen: state.snapshot?.initialSfen,
                      moves: state.snapshot?.moves,
                      moveTimes: state.moveTimes,
                      finalSfen: state.snapshot?.sfen,
                      result: state.result,
                      humanSide: state.humanSide,
                      preset: state.preset,
                      profile: state.profile,
                    },
                  },
                  null,
                  2,
                ),
              )
            }
          >
            {ja ? "診断ログを保存" : "Save diagnostics"}
          </button>
        </details>
      ) : null}
      {confirmAction === null ? null : (
        <dialog
          ref={confirmRef}
          aria-labelledby="prototype-confirm-title"
          aria-modal="true"
          className="notice-view"
          onCancel={() => setConfirmAction(null)}
          onClose={() => setConfirmAction(null)}
        >
          <article>
            <h2 id="prototype-confirm-title">
              {confirmAction === "resign"
                ? messages.match.resign
                : ja
                  ? "対局を終了"
                  : "End this game"}
            </h2>
            <p>
              {confirmAction === "resign"
                ? messages.match.resignConfirm
                : ja
                  ? "現在の対局を終了し、モデルと対局設定の選択に戻ります。"
                  : "End the current game and return to model and game settings."}
            </p>
            <div className="inline-actions">
              <button type="button" onClick={() => setConfirmAction(null)}>
                {messages.match.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAction === "resign") sessionRef.current?.resign();
                  else sessionRef.current?.configure();
                  setConfirmAction(null);
                }}
              >
                {confirmAction === "resign"
                  ? messages.match.confirm
                  : ja
                    ? "終了する"
                    : "End game"}
              </button>
            </div>
          </article>
        </dialog>
      )}
    </main>
  );
}
