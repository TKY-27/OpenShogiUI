import { useEffect, useRef, useState } from "react";
import type { MoveSummary, Side } from "./browser-engine";
import {
  initialPrototypeState,
  PrototypeMatchSession,
} from "./core-prototype-session";
import { getMessages, type Locale } from "./localization";
import { MatchClockPanel } from "./MatchPlay";
import { opposing } from "./match-clock";
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
  const [enabled, setEnabled] = useState(true);
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotion, setPromotion] = useState<MoveSummary[] | null>(null);
  const [pieceSet] = useState(persistedPieceSet);

  useEffect(() => {
    const session = new PrototypeMatchSession(setState);
    sessionRef.current = session;
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
    state.phase === "playing" && position?.sideToMove === side
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
  const active = state.phase === "playing" || state.phase === "loading";
  const result = state.result;
  const status =
    state.phase === "loading"
      ? ja
        ? "ローカル AI を準備しています…"
        : "Preparing local AI…"
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
              ? "3分切れ負け・定跡なし"
              : "Three minutes, sudden death; no opening book";

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
          {ja ? "ローカル試作との対局" : "Play the local prototype"}
        </h1>
        <p>
          {ja
            ? "同じ凍結評価器で、学習した思考配分・着手順序の有無を比べます。"
            : "Compare learned time allocation and move ordering with the same frozen evaluator."}
        </p>
      </header>
      {setup ? (
        <div className="match-setup">
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
                  onClick={() => setEnabled(value)}
                >
                  {value ? (ja ? "有効" : "On") : ja ? "無効" : "Off"}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="match-setup__note">
            {ja
              ? "持ち時間は先後それぞれ3分です。各手の思考時間は AI が決めます。資産はこの端末からのみ読み込みます。"
              : "Each player has three minutes. The AI allocates its own thinking time. Artifacts are loaded only from this computer."}
          </p>
          <button
            className="match-start"
            type="button"
            disabled={state.phase === "loading"}
            onClick={() => void sessionRef.current?.start(humanSide, enabled)}
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
      {position === null ? null : (
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
            <button type="button" onClick={() => sessionRef.current?.stop()}>
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
                ms · {ja ? "学習目標" : "Learned target"}{" "}
                {state.telemetry.targetMs.toFixed(1)} ms
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
          <p>
            OSAVAL03 W256 · {state.manifest.artifacts["leaf.osaval03"].sha256}
          </p>
          <p>
            {ja ? "思考制御" : "Controller"} ·{" "}
            {state.manifest.artifacts["controller.json"].sha256}
          </p>
        </details>
      )}
    </main>
  );
}
