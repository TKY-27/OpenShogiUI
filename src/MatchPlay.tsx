import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BrowserSnapshot,
  HandPieceKind,
  MoveSummary,
  SearchProfile,
  Side,
} from "./browser-engine";
import { WasmEngineAdapter } from "./engine-adapter";
import { getMessages, type Locale } from "./localization";
import {
  chargeTurn,
  clockIsUrgent,
  formatMatchClock,
  hasFlagFallen,
  initialClockFor,
  matchTimeControl,
  MATCH_PRESETS,
  opposing,
  presetIsClocked,
  type MatchOutcome,
  type MatchPreset,
} from "./match-clock";
import {
  flippedOrientation,
  lastMoveHighlight,
  type BoardOrientation,
  type MatchClock,
  type MoveHighlight,
} from "./play-settings";
import { resolveShortcut } from "./keyboard";
import { downloadText, kifuFileName, toKif, toUsi } from "./kifu";
import {
  destinationIndex,
  HandStand,
  persistedPieceSet,
  selectedMoves,
  ShogiBoard,
  type BoardSelection,
} from "./ShogiBoardView";

/** One ply removed by a takeback, kept whole so redo can restore the record. */
interface UndoneStep {
  movement: string;
  position: BrowserSnapshot;
  timeMs: number;
}

type Phase = "setup" | "playing" | "finished";
type Busy = "preparing" | "moving" | "engine" | null;

/** Display refresh for the running clock. The clock value itself is derived
 *  from wall-clock readings, so this only controls how often it repaints. */
const CLOCK_TICK_MS = 100;

function MatchClockPanel({
  label,
  name,
  remainingMs,
  showClock,
  active,
  remainingLabel,
}: {
  label: string;
  name: string;
  remainingMs: number;
  showClock: boolean;
  active: boolean;
  remainingLabel: (clock: string) => string;
}) {
  const urgent = showClock && clockIsUrgent(remainingMs);
  return (
    <div
      className={[
        "match-clock",
        active ? "match-clock--active" : "",
        urgent ? "match-clock--urgent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="match-clock__side">{label}</span>
      <span className="match-clock__name">{name}</span>
      {showClock ? (
        <strong
          aria-label={remainingLabel(formatMatchClock(remainingMs))}
          className="match-clock__time"
        >
          {formatMatchClock(remainingMs)}
        </strong>
      ) : (
        <strong aria-hidden="true" className="match-clock__time">
          —
        </strong>
      )}
    </div>
  );
}

export function MatchPlay({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const match = messages.match;
  const adapterRef = useRef<WasmEngineAdapter | null>(null);
  const operationRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("setup");
  const [preset, setPreset] = useState<MatchPreset>("blitz3");
  const [humanSide, setHumanSide] = useState<Side>("black");
  const [profile, setProfile] = useState<SearchProfile>("balanced");
  const [orientation, setOrientation] =
    useState<BoardOrientation>("sente-bottom");
  const [pieceSet] = useState(persistedPieceSet);

  const [snapshot, setSnapshot] = useState<BrowserSnapshot | null>(null);
  const [previous, setPrevious] = useState<BrowserSnapshot | null>(null);
  const [busy, setBusy] = useState<Busy>("preparing");
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotionMoves, setPromotionMoves] = useState<MoveSummary[] | null>(
    null,
  );
  const [clock, setClock] = useState<MatchClock>(() =>
    initialClockFor("blitz3"),
  );
  const [turnStartedAt, setTurnStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const [undone, setUndone] = useState<UndoneStep[]>([]);
  const [positions, setPositions] = useState<BrowserSnapshot[]>([]);
  const [moveTimesMs, setMoveTimesMs] = useState<number[]>([]);
  const [matchStartedAt, setMatchStartedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clocked = presetIsClocked(preset);
  const sideToMove = snapshot?.sideToMove ?? "black";
  const humanToMove = phase === "playing" && sideToMove === humanSide;

  useEffect(() => {
    const adapter = new WasmEngineAdapter("play");
    adapterRef.current = adapter;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    void adapter.initialize().then(
      (initialized) => {
        if (operationRef.current !== operation) return;
        setSnapshot(initialized);
        setBusy(null);
      },
      (error: unknown) => {
        if (operationRef.current !== operation) return;
        setNotice(error instanceof Error ? error.message : messages.play.error);
        setBusy(null);
      },
    );
    return () => {
      operationRef.current += 1;
      adapterRef.current = null;
      adapter.dispose();
    };
    // The adapter owns a Worker; it must be created exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint the running clock. `now` only drives presentation; every decision
  // reads Date.now() directly so a throttled background tab cannot gain time.
  useEffect(() => {
    if (phase !== "playing" || !clocked) return;
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase, clocked]);

  const finish = useCallback((result: MatchOutcome) => {
    setOutcome(result);
    setPhase("finished");
    setBusy(null);
    setSelection(null);
    setPromotionMoves(null);
  }, []);

  // Flag fall while a side is still thinking. Symmetric for both players.
  useEffect(() => {
    if (phase !== "playing" || !clocked) return;
    if (!hasFlagFallen(clock, sideToMove, turnStartedAt, now)) return;
    finish({
      kind: "timeout",
      winner: opposing(sideToMove),
      loser: sideToMove,
    });
  }, [phase, clocked, clock, sideToMove, turnStartedAt, now, finish]);

  function terminalOutcome(next: BrowserSnapshot): MatchOutcome | null {
    if (next.terminal === null) return null;
    const winner = next.terminal.winner ?? opposing(next.sideToMove);
    return { kind: "checkmate", winner };
  }

  async function runEngineTurn(
    adapter: WasmEngineAdapter,
    operation: number,
    position: BrowserSnapshot,
    clockAtTurn: MatchClock,
  ) {
    const engineSide = position.sideToMove;
    setBusy("engine");
    const startedAt = Date.now();
    setTurnStartedAt(startedAt);
    const response = await adapter.search(
      profile,
      // Match mode never loads a local model, so the bundled evaluator is the
      // only choice that can be satisfied without a user-supplied artifact.
      "overall-champion",
      1,
      matchTimeControl(preset, clockAtTurn),
    );
    if (operationRef.current !== operation) return;
    if (response.bestMove === null) {
      finish({
        kind: "resignation",
        winner: opposing(engineSide),
        loser: engineSide,
      });
      return;
    }
    /*
     * Charge wall-clock time, not the engine's reported search time.
     *
     * The flag-fall check that runs while a side is thinking can only use wall
     * clock. If the charge used response.elapsedNs instead, the two would
     * disagree: a search could be flagged mid-think for exceeding the clock and
     * yet be billed less than the budget once it returned. A real clock runs on
     * wall time for both players, so both use it here.
     */
    const spent = clocked ? Date.now() - startedAt : 0;
    const afterEngine = clocked
      ? chargeTurn(clockAtTurn, engineSide, spent)
      : clockAtTurn;
    if (
      clocked &&
      afterEngine[engineSide === "black" ? "blackTimeMs" : "whiteTimeMs"] <= 0
    ) {
      setClock(afterEngine);
      finish({
        kind: "timeout",
        winner: opposing(engineSide),
        loser: engineSide,
      });
      return;
    }
    setPrevious(position);
    const replied = await adapter.playMove(response.bestMove);
    if (operationRef.current !== operation) return;
    setSnapshot(replied);
    setPositions((current) => [...current, replied]);
    setMoveTimesMs((current) => [...current, Date.now() - startedAt]);
    setClock(afterEngine);
    setTurnStartedAt(Date.now());
    setNow(Date.now());
    const ended = terminalOutcome(replied);
    if (ended !== null) {
      finish(ended);
      return;
    }
    setBusy(null);
  }

  async function applyMove(movement: string) {
    const adapter = adapterRef.current;
    if (adapter === null || snapshot === null || busy !== null) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setBusy("moving");
    setSelection(null);
    setPromotionMoves(null);
    setNotice(null);
    try {
      const movedAt = Date.now();
      // Reject an expired move before the worker position changes.
      if (clocked && hasFlagFallen(clock, humanSide, turnStartedAt, movedAt)) {
        finish({
          kind: "timeout",
          winner: opposing(humanSide),
          loser: humanSide,
        });
        return;
      }
      const afterHuman = clocked
        ? chargeTurn(clock, humanSide, movedAt - turnStartedAt)
        : clock;
      setPrevious(snapshot);
      const next = await adapter.playMove(movement);
      if (operationRef.current !== operation) return;
      setSnapshot(next);
      setPositions((current) => [...current, next]);
      setMoveTimesMs((current) => [...current, movedAt - turnStartedAt]);
      setUndone([]);
      setClock(afterHuman);
      setTurnStartedAt(Date.now());
      setNow(Date.now());
      const ended = terminalOutcome(next);
      if (ended !== null) {
        finish(ended);
        return;
      }
      await runEngineTurn(adapter, operation, next, afterHuman);
    } catch (error) {
      if (operationRef.current !== operation) return;
      setNotice(error instanceof Error ? error.message : messages.play.error);
      setBusy(null);
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
    if (!humanToMove || busy !== null || snapshot === null) return;
    const candidates = selectedMoves(snapshot, selection).filter(
      (movement) => destinationIndex(movement) === index,
    );
    if (candidates.length > 0) {
      chooseMove(candidates);
      return;
    }
    const piece = snapshot.board[index];
    if (piece?.side === snapshot.sideToMove) {
      const next: BoardSelection = { kind: "board", index };
      setSelection(selectedMoves(snapshot, next).length > 0 ? next : null);
      return;
    }
    setSelection(null);
  }

  function selectHand(piece: HandPieceKind) {
    if (!humanToMove || busy !== null) return;
    setSelection((current) =>
      current?.kind === "hand" && current.piece === piece
        ? null
        : { kind: "hand", piece },
    );
  }

  async function startMatch() {
    const adapter = adapterRef.current;
    if (adapter === null) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setBusy("moving");
    setNotice(null);
    setOutcome(null);
    setPrevious(null);
    setSelection(null);
    try {
      const fresh = await adapter.reset();
      if (operationRef.current !== operation) return;
      const startingClock = initialClockFor(preset);
      setSnapshot(fresh);
      setPositions([fresh]);
      setMoveTimesMs([]);
      setMatchStartedAt(new Date());
      setUndone([]);
      setClock(startingClock);
      setOrientation(humanSide === "black" ? "sente-bottom" : "gote-bottom");
      setPhase("playing");
      const startedAt = Date.now();
      setTurnStartedAt(startedAt);
      setNow(startedAt);
      if (fresh.sideToMove === humanSide) {
        setBusy(null);
        return;
      }
      await runEngineTurn(adapter, operation, fresh, startingClock);
    } catch (error) {
      if (operationRef.current !== operation) return;
      setNotice(error instanceof Error ? error.message : messages.play.error);
      setBusy(null);
    }
  }

  /**
   * Replays the game two plies earlier: the player's move and the engine's
   * reply. Two keeps the side to move on the human, so the position is always
   * one the player can act on.
   *
   * Spent time is deliberately not returned. Rewinding a sudden-death clock
   * would make the flag-fall rule meaningless.
   */
  async function rewind(count: number) {
    const adapter = adapterRef.current;
    if (adapter === null || snapshot === null || busy !== null) return;
    if (snapshot.moves.length < count) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setBusy("moving");
    setSelection(null);
    setPromotionMoves(null);
    setNotice(null);
    try {
      const moves = snapshot.moves.slice(0, snapshot.moves.length - count);
      const restored = await adapter.restart(
        { initialSfen: snapshot.initialSfen, moves },
        null,
        null,
      );
      if (operationRef.current !== operation) return;
      const removed: UndoneStep[] = snapshot.moves
        .slice(-count)
        .map((movement, offset) => ({
          movement,
          position: positions[positions.length - count + offset],
          timeMs: moveTimesMs[moveTimesMs.length - count + offset] ?? 0,
        }));
      setSnapshot(restored);
      setPrevious(null);
      setPositions((current) => current.slice(0, current.length - count));
      setMoveTimesMs((current) => current.slice(0, current.length - count));
      setUndone((current) => [...current, ...removed]);
      setOutcome(null);
      setPhase("playing");
      setTurnStartedAt(Date.now());
      setNow(Date.now());
      setBusy(null);
    } catch (error) {
      if (operationRef.current !== operation) return;
      setNotice(error instanceof Error ? error.message : messages.play.error);
      setBusy(null);
    }
  }

  function takeback() {
    void rewind(2);
  }

  async function redo() {
    const adapter = adapterRef.current;
    if (adapter === null || snapshot === null || busy !== null) return;
    if (undone.length < 2) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setBusy("moving");
    setNotice(null);
    try {
      const replay = undone.slice(-2);
      const restored = await adapter.restart(
        {
          initialSfen: snapshot.initialSfen,
          moves: [...snapshot.moves, ...replay.map((step) => step.movement)],
        },
        null,
        null,
      );
      if (operationRef.current !== operation) return;
      setSnapshot(restored);
      setPrevious(null);
      // Restore the exact positions and times the takeback removed, so the
      // exported record stays byte-identical to the game as it was played.
      setPositions((current) => [...current, ...replay.map((s) => s.position)]);
      setMoveTimesMs((current) => [...current, ...replay.map((s) => s.timeMs)]);
      setUndone(undone.slice(0, -2));
      setTurnStartedAt(Date.now());
      setNow(Date.now());
      setBusy(null);
    } catch (error) {
      if (operationRef.current !== operation) return;
      setNotice(error instanceof Error ? error.message : messages.play.error);
      setBusy(null);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = resolveShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        isComposing: event.isComposing,
        target: event.target as HTMLElement | null,
      });
      if (action === null) return;
      if (action === "clear-selection") {
        setSelection(null);
        return;
      }
      if (action === "undo") {
        event.preventDefault();
        takeback();
        return;
      }
      if (action === "redo") {
        event.preventDefault();
        void redo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function exportRecord(format: "kif" | "usi") {
    if (positions.length === 0) return;
    const record = {
      snapshots: positions,
      blackName: humanSide === "black" ? match.you : match.engine,
      whiteName: humanSide === "white" ? match.you : match.engine,
      timeControl: match.preset[preset],
      moveTimesMs,
      terminationLabel:
        outcome === null ? undefined : match.reason[outcome.kind],
      startedAt: matchStartedAt ?? undefined,
    };
    downloadText(
      kifuFileName("shogi-match", format),
      format === "kif" ? toKif(record) : toUsi(record),
    );
  }

  function resign() {
    setConfirmingResign(false);
    finish({
      kind: "resignation",
      winner: opposing(humanSide),
      loser: humanSide,
    });
  }

  const legalDrops = new Set(
    snapshot?.legalMoves
      .map(({ drop }) => drop)
      .filter((piece): piece is HandPieceKind => piece !== null) ?? [],
  );

  const lastMove: MoveHighlight | null =
    previous === null || snapshot === null
      ? null
      : lastMoveHighlight([previous, snapshot], 1);

  const remainingFor = (side: Side) => {
    if (!clocked) return 0;
    const base = clock[side === "black" ? "blackTimeMs" : "whiteTimeMs"];
    return side === sideToMove && phase === "playing"
      ? Math.max(0, base - Math.max(0, now - turnStartedAt))
      : base;
  };

  const status =
    busy === "preparing"
      ? match.preparing
      : phase !== "playing"
        ? ""
        : busy === "engine"
          ? match.engineThinking
          : match.yourTurn;

  const topSide: Side = orientation === "sente-bottom" ? "white" : "black";
  const bottomSide = opposing(topSide);
  const sideName = (side: Side) =>
    side === humanSide ? match.you : match.engine;
  const sideLabel = (side: Side) =>
    side === "black" ? match.sente : match.gote;

  if (phase === "setup") {
    return (
      <main className="match-page" aria-labelledby="match-title">
        <div className="match-setup">
          <h1 id="match-title">{match.title}</h1>
          <p className="match-setup__lead">{match.subtitle}</p>

          <fieldset className="segmented-control">
            <legend>{match.timeControl}</legend>
            <div>
              {MATCH_PRESETS.map((value) => (
                <button
                  aria-pressed={preset === value}
                  key={value}
                  onClick={() => setPreset(value)}
                  type="button"
                >
                  {match.preset[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="match-setup__note">{match.presetDetail[preset]}</p>

          <fieldset className="segmented-control">
            <legend>{match.yourSide}</legend>
            <div>
              {(["black", "white"] as const).map((value) => (
                <button
                  aria-pressed={humanSide === value}
                  key={value}
                  onClick={() => setHumanSide(value)}
                  type="button"
                >
                  {value === "black" ? match.sente : match.gote}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="segmented-control">
            <legend>{match.strength}</legend>
            <div>
              {(["eco", "balanced", "quality"] as const).map((value) => (
                <button
                  aria-pressed={profile === value}
                  key={value}
                  onClick={() => setProfile(value)}
                  type="button"
                >
                  {messages.play.profileName[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="match-setup__note">{match.engineAllocatesTime}</p>
          {clocked ? (
            // title alone is unreachable by keyboard and touch, so the caveat
            // is stated here where there is room for it.
            <p className="match-setup__note">{match.takebackClockNote}</p>
          ) : (
            <p className="match-setup__note">{match.casualCap}</p>
          )}

          {notice === null ? null : (
            <p className="play-notice" role="alert">
              {notice}
            </p>
          )}

          <button
            className="match-start"
            disabled={busy !== null || snapshot === null}
            onClick={() => void startMatch()}
            type="button"
          >
            {busy === "preparing" ? match.preparing : match.start}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="match-page match-page--playing"
      aria-labelledby="match-title"
    >
      <h1 className="visually-hidden" id="match-title">
        {match.title}
      </h1>

      {notice === null ? null : (
        <p className="play-notice" role="alert">
          {notice}
        </p>
      )}

      <div className="match-board">
        <MatchClockPanel
          active={phase === "playing" && sideToMove === topSide}
          label={sideLabel(topSide)}
          name={sideName(topSide)}
          remainingLabel={match.remainingTime}
          remainingMs={remainingFor(topSide)}
          showClock={clocked}
        />

        <div className="board-fit">
          {snapshot === null ? (
            <div className="board-loading">{match.preparing}</div>
          ) : (
            <div className={`board-stage board-stage--${orientation}`}>
              <HandStand
                disabled={!humanToMove || sideToMove !== "white"}
                entries={snapshot.hands.white}
                legalDrops={legalDrops}
                messages={messages}
                onSelect={selectHand}
                orientation={orientation}
                pieceSet={pieceSet}
                selection={selection}
                side="white"
              />
              <ShogiBoard
                disabled={!humanToMove || busy !== null}
                lastMove={lastMove}
                messages={messages}
                onSquare={selectSquare}
                orientation={orientation}
                pieceSet={pieceSet}
                selection={selection}
                snapshot={snapshot}
              />
              <HandStand
                disabled={!humanToMove || sideToMove !== "black"}
                entries={snapshot.hands.black}
                legalDrops={legalDrops}
                messages={messages}
                onSelect={selectHand}
                orientation={orientation}
                pieceSet={pieceSet}
                selection={selection}
                side="black"
              />
            </div>
          )}
        </div>

        <MatchClockPanel
          active={phase === "playing" && sideToMove === bottomSide}
          label={sideLabel(bottomSide)}
          name={sideName(bottomSide)}
          remainingLabel={match.remainingTime}
          remainingMs={remainingFor(bottomSide)}
          showClock={clocked}
        />
      </div>

      <div className="match-controls">
        <p aria-live="polite" className="match-status" role="status">
          {status}
        </p>
        <p className="match-move-number">
          <span>{match.moveNumber}</span>
          <strong>{snapshot?.moveNumber ?? 1}</strong>
        </p>
        <div className="inline-actions">
          <button
            onClick={() => setOrientation(flippedOrientation(orientation))}
            type="button"
          >
            {match.flip}
          </button>
          <button
            disabled={busy !== null || (snapshot?.moves.length ?? 0) < 2}
            onClick={takeback}
            title={clocked ? match.takebackClockNote : undefined}
            type="button"
          >
            {match.takeback}
          </button>
          <button
            disabled={(snapshot?.moves.length ?? 0) === 0}
            onClick={() => exportRecord("kif")}
            type="button"
          >
            {match.exportKif}
          </button>
          <button
            disabled={(snapshot?.moves.length ?? 0) === 0}
            onClick={() => exportRecord("usi")}
            type="button"
          >
            {match.exportUsi}
          </button>
          {phase === "playing" ? (
            <button
              className="match-resign"
              disabled={busy !== null}
              onClick={() => setConfirmingResign(true)}
              type="button"
            >
              {match.resign}
            </button>
          ) : (
            <button onClick={() => setPhase("setup")} type="button">
              {match.rematch}
            </button>
          )}
        </div>
      </div>

      {promotionMoves === null ? null : (
        <PromotionDialog
          messages={messages}
          moves={promotionMoves}
          onCancel={() => setPromotionMoves(null)}
          onChoose={(movement) => void applyMove(movement)}
        />
      )}

      {confirmingResign ? (
        <ConfirmDialog
          cancelLabel={match.cancel}
          confirmLabel={match.confirm}
          message={match.resignConfirm}
          onCancel={() => setConfirmingResign(false)}
          onConfirm={resign}
        />
      ) : null}

      {outcome === null ? null : (
        <MatchResultDialog
          humanSide={humanSide}
          locale={locale}
          onClose={() => setPhase("setup")}
          outcome={outcome}
        />
      )}
    </main>
  );
}

function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="match-confirm-title"
      aria-modal="true"
      className="match-dialog"
      onCancel={onCancel}
      onClose={onCancel}
      ref={ref}
    >
      <div>
        <p id="match-confirm-title">{message}</p>
        <div className="dialog-actions">
          <button onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
          <button onClick={() => ref.current?.close()} type="button">
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function PromotionDialog({
  messages,
  moves,
  onChoose,
  onCancel,
}: {
  messages: ReturnType<typeof getMessages>;
  moves: MoveSummary[];
  onChoose: (movement: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="match-promotion-title"
      aria-modal="true"
      className="promotion-choice"
      onCancel={onCancel}
      onClose={onCancel}
      ref={ref}
    >
      <div>
        <p id="match-promotion-title">{messages.play.promoteQuestion}</p>
        <div className="dialog-actions">
          {moves.map((movement) => (
            <button
              key={movement.usi}
              onClick={() => onChoose(movement.usi)}
              type="button"
            >
              {movement.promote
                ? messages.play.promote
                : messages.play.doNotPromote}
            </button>
          ))}
          <button onClick={() => ref.current?.close()} type="button">
            {messages.play.cancel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function MatchResultDialog({
  locale,
  outcome,
  humanSide,
  onClose,
}: {
  locale: Locale;
  outcome: MatchOutcome;
  humanSide: Side;
  onClose: () => void;
}) {
  const { match } = getMessages(locale);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  const humanWon = outcome.winner === humanSide;
  return (
    <dialog
      aria-labelledby="match-result-title"
      aria-modal="true"
      className="match-dialog"
      onCancel={onClose}
      onClose={onClose}
      ref={ref}
    >
      <div>
        <header>
          <h2 id="match-result-title">
            {humanWon ? match.result.win : match.result.loss}
          </h2>
        </header>
        <p>{match.reason[outcome.kind]}</p>
        <div className="dialog-actions">
          <button onClick={() => ref.current?.close()} type="button">
            {match.rematch}
          </button>
        </div>
      </div>
    </dialog>
  );
}
