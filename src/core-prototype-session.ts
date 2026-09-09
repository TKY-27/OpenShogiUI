import type { Side } from "./browser-engine";
import {
  chargeTurn,
  hasFlagFallen,
  initialClockFor,
  matchTimeControl,
  opposing,
} from "./match-clock";
import type { MatchClock } from "./play-settings";
import {
  loadPrototypeManifest,
  PrototypeWorkerClient,
  type PrototypeEngineClient,
} from "./core-prototype-client";
import type {
  ComputeTelemetry,
  PrototypeManifest,
  PrototypeSnapshot,
} from "./core-prototype-protocol";

export interface PrototypeState {
  phase: "setup" | "loading" | "playing" | "stopped" | "finished" | "error";
  snapshot: PrototypeSnapshot | null;
  previous: PrototypeSnapshot | null;
  clock: MatchClock;
  turnStartedAt: number | null;
  humanSide: Side;
  enabled: boolean;
  busy: boolean;
  result: { reason: string; winner: Side | null } | null;
  error: string | null;
  manifest: PrototypeManifest | null;
  telemetry: (ComputeTelemetry & { elapsedMs: number }) | null;
}

/** Owns committed positions, both clocks, and every operation that can outlive a match. */
export function initialPrototypeState(): PrototypeState {
  return {
    phase: "setup",
    snapshot: null,
    previous: null,
    clock: initialClockFor("blitz3"),
    turnStartedAt: null,
    humanSide: "black",
    enabled: true,
    busy: false,
    result: null,
    error: null,
    manifest: null,
    telemetry: null,
  };
}
export class PrototypeMatchSession {
  state: PrototypeState = initialPrototypeState();
  private generation = 0;
  private client: PrototypeEngineClient | null = null;
  private disposed = false;

  constructor(
    private readonly onChange: (state: PrototypeState) => void,
    private readonly createClient: () => PrototypeEngineClient = () =>
      new PrototypeWorkerClient(),
    private readonly manifestLoader = loadPrototypeManifest,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async start(humanSide: Side, enabled: boolean): Promise<void> {
    if (this.disposed) return;
    const generation = this.invalidate();
    this.publish({
      phase: "loading",
      snapshot: null,
      previous: null,
      clock: initialClockFor("blitz3"),
      turnStartedAt: null,
      humanSide,
      enabled,
      busy: true,
      result: null,
      error: null,
      manifest: null,
      telemetry: null,
    });
    try {
      const manifest = await this.manifestLoader();
      if (!this.current(generation)) return;
      this.publish({ manifest });
      await this.initialize(generation, null);
    } catch (error) {
      this.fail(generation, error);
    }
  }

  async resume(): Promise<void> {
    if (
      this.disposed ||
      this.state.phase !== "stopped" ||
      this.state.snapshot === null
    )
      return;
    const position = this.state.snapshot;
    const generation = this.invalidate();
    this.publish({ phase: "loading", busy: true, error: null });
    try {
      await this.initialize(generation, position);
    } catch (error) {
      this.fail(generation, error);
    }
  }

  configure(): void {
    if (this.disposed) return;
    this.invalidate();
    this.publish(initialPrototypeState());
  }

  stop(): void {
    if (this.state.phase !== "playing" && this.state.phase !== "loading")
      return;
    if (this.tick()) return;
    this.chargeActiveTurn();
    this.invalidate();
    this.publish({
      phase: this.state.snapshot === null ? "setup" : "stopped",
      turnStartedAt: null,
      busy: false,
    });
  }

  resign(): void {
    if (this.state.phase !== "playing" && this.state.phase !== "stopped")
      return;
    this.finish("resignation", opposing(this.state.humanSide));
  }

  tick(): boolean {
    const { phase, snapshot, turnStartedAt, clock } = this.state;
    if (phase !== "playing" || snapshot === null || turnStartedAt === null)
      return false;
    if (!hasFlagFallen(clock, snapshot.sideToMove, turnStartedAt, this.now()))
      return false;
    this.finish("timeout", opposing(snapshot.sideToMove));
    return true;
  }

  async move(movement: string): Promise<void> {
    const { snapshot, humanSide, busy, phase } = this.state;
    if (
      phase !== "playing" ||
      busy ||
      snapshot === null ||
      snapshot.sideToMove !== humanSide ||
      this.tick()
    )
      return;
    if (!snapshot.legalMoves.some(({ usi }) => usi === movement)) return;
    const generation = this.generation;
    const client = this.client!;
    this.chargeActiveTurn();
    this.publish({ busy: true, turnStartedAt: null });
    try {
      const next = await client.move(movement);
      if (!this.current(generation)) return;
      this.acceptMove(snapshot, next, movement);
      if (this.finishTerminal()) return;
      await this.engineTurn(generation);
    } catch (error) {
      this.fail(generation, error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  private async initialize(
    generation: number,
    position: PrototypeSnapshot | null,
  ): Promise<void> {
    const client = this.createClient();
    this.client = client;
    const snapshot = await client.initialize(
      this.state.manifest!,
      this.state.enabled,
      position,
    );
    if (!this.current(generation)) return;
    if (
      position !== null &&
      (snapshot.sfen !== position.sfen ||
        snapshot.initialSfen !== position.initialSfen ||
        JSON.stringify(snapshot.moves) !== JSON.stringify(position.moves))
    )
      throw new Error("Restored game does not match the committed position");
    this.publish({
      snapshot,
      phase: "playing",
      busy: false,
      turnStartedAt: this.now(),
    });
    if (this.finishTerminal()) return;
    if (snapshot.sideToMove !== this.state.humanSide)
      await this.engineTurn(generation);
  }

  private async engineTurn(generation: number): Promise<void> {
    if (!this.current(generation) || this.tick()) return;
    const position = this.state.snapshot!;
    const client = this.client!;
    this.publish({ busy: true });
    const remaining = chargeTurn(
      this.state.clock,
      position.sideToMove,
      this.now() - this.state.turnStartedAt!,
    );
    const response = await client.search(matchTimeControl("blitz3", remaining));
    if (!this.current(generation) || this.tick()) return;
    if (response.perspective !== position.sideToMove)
      throw new Error("Search returned the wrong side");
    if (response.bestMove === null) {
      this.finish("engine-resignation", this.state.humanSide);
      return;
    }
    if (!position.legalMoves.some(({ usi }) => usi === response.bestMove))
      throw new Error("Search returned an illegal move");
    const next = await client.move(response.bestMove);
    if (!this.current(generation) || this.tick()) return;
    const clockKey =
      position.sideToMove === "black" ? "blackTimeMs" : "whiteTimeMs";
    const beforeCharge = this.state.clock[clockKey];
    this.chargeActiveTurn();
    const elapsedMs = beforeCharge - this.state.clock[clockKey];
    this.acceptMove(position, next, response.bestMove);
    this.publish({ telemetry: { ...response.computeControl, elapsedMs } });
    this.finishTerminal();
  }

  private acceptMove(
    before: PrototypeSnapshot,
    next: PrototypeSnapshot,
    movement: string,
  ): void {
    if (
      next.initialSfen !== before.initialSfen ||
      next.sideToMove !== opposing(before.sideToMove) ||
      next.moveNumber !== before.moveNumber + 1 ||
      JSON.stringify(next.moves) !== JSON.stringify([...before.moves, movement])
    )
      throw new Error("Move response does not extend the committed game");
    this.publish({
      previous: before,
      snapshot: next,
      busy: false,
      turnStartedAt: next.terminal === null ? this.now() : null,
    });
  }
  private finishTerminal(): boolean {
    const terminal = this.state.snapshot?.terminal;
    if (!terminal) return false;
    this.finish(terminal.kind, terminal.winner);
    return true;
  }
  private finish(reason: string, winner: Side | null): void {
    this.chargeActiveTurn();
    this.invalidate();
    this.publish({
      phase: "finished",
      result: { reason, winner },
      turnStartedAt: null,
      busy: false,
    });
  }
  private chargeActiveTurn(): void {
    const { snapshot, turnStartedAt, clock } = this.state;
    if (snapshot !== null && turnStartedAt !== null)
      this.publish({
        clock: chargeTurn(
          clock,
          snapshot.sideToMove,
          this.now() - turnStartedAt,
        ),
        turnStartedAt: this.now(),
      });
  }
  private fail(generation: number, error: unknown): void {
    if (!this.current(generation)) return;
    this.chargeActiveTurn();
    this.invalidate();
    this.publish({
      phase: "error",
      busy: false,
      turnStartedAt: null,
      error: error instanceof Error ? error.message : "Prototype engine failed",
    });
  }
  private invalidate(): number {
    this.generation += 1;
    this.client?.dispose();
    this.client = null;
    return this.generation;
  }
  private current(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }
  private publish(patch: Partial<PrototypeState>): void {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.onChange(this.state);
  }
}
