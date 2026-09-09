import { useEffect, useRef, useState } from "react";
import type { MoveSummary, SearchProfile, Side } from "./browser-engine";
import {
  initialPrototypeState,
  PrototypeMatchSession,
} from "./core-prototype-session";
import { getMessages, type Locale } from "./localization";
import { MatchClockPanel } from "./MatchPlay";
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
  const [candidate, setCandidate] = useState<"baseline" | "candidate">(
    "baseline",
  );
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
  const active = ["playing", "stopping", "loading"].includes(state.phase);
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
      name={
        side === state.humanSide
          ? messages.match.you
          : ja
            ? "ローカル試作 AI"
            : "Local prototype AI"
      }
      baseMs={state.clock[side === "black" ? "blackTimeMs" : "whiteTimeMs"]}
      runningSince={running(side)}
      showClock
      active={running(side) !== null}
      remainingLabel={messages.match.remainingTime}
    />
  );

  return (
    <main
      className={`match-page core-prototype ${position === null ? "" : "match-page--playing"}`}
      aria-labelledby="prototype-title"
    >
      <header className="prototype-heading">
        <h1 id="prototype-title">
          {ja
            ? "開発用学習モデルとの対局"
            : "Play the development learned model"}
        </h1>
        <p>
          {ja
            ? "同じ時計管理で凍結評価器と準備済みの学習候補を比較します。棋力は検証中です。"
            : "Compare the frozen evaluator and prepared candidate with the same clock management. Playing strength is under evaluation."}
        </p>
      </header>
      {setup ? (
        <div className="match-setup">
          <fieldset
            className="segmented-control"
            disabled={state.phase === "loading"}
          >
            <legend>{ja ? "評価モデル" : "Evaluator"}</legend>
            <div>
              {(["baseline", "candidate"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={candidate === value}
                  onClick={() => {
                    setCandidate(value);
                    setEnabled(false);
                    void sessionRef.current?.prepare(value);
                  }}
                >
                  {value === "baseline"
                    ? ja
                      ? "凍結 W256"
                      : "Frozen W256"
                    : ja
                      ? "本学習候補"
                      : "Trained candidate"}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset
            className="segmented-control"
            disabled={state.phase === "loading"}
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
            disabled={state.phase === "loading"}
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
            disabled={state.phase === "loading"}
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
          <fieldset
            className="segmented-control"
            disabled={state.phase === "loading"}
          >
            <legend>
              {ja ? "学習した思考制御" : "Learned computation control"}
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
          <p className="match-setup__note">
            {ja
              ? "高品質も同じ残り時計と絶対上限を守ります。思考制御は効果未確認のため既定で無効です。準備が終わってから対局を開始します。"
              : "Both quality modes use the same remaining clock and hard limit. The unvalidated learned controller is off by default. Preparation completes before play starts."}
          </p>
          <button
            className="match-start"
            type="button"
            disabled={
              state.phase === "loading" ||
              state.manifest === null ||
              state.snapshot === null
            }
            onClick={() =>
              void sessionRef.current?.start(
                humanSide,
                enabled,
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
        <p className="play-notice" role="alert">
          {state.error}
        </p>
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
          <span>
            {ja ? "思考制御" : "Control"}{" "}
            {(setup ? enabled : state.enabled) ? "ON" : "OFF"}
          </span>
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
            <button type="button" onClick={() => sessionRef.current?.resign()}>
              {messages.match.resign}
            </button>
          ) : null}
          {position !== null && !active ? (
            <button
              type="button"
              onClick={() => sessionRef.current?.configure()}
            >
              {messages.match.rematch}
            </button>
          ) : null}
        </div>
      </div>
      {state.manifest === null ? null : (
        <details className="prototype-artifacts">
          <summary>
            {ja ? "使用中のローカル資産" : "Active local artifacts"}
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
          <p>OSAVAL03 · {state.manifest.artifacts["leaf.osaval03"].sha256}</p>
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
                    preparation: state.preparation,
                    searches: state.diagnostics,
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
      )}
    </main>
  );
}
