import type { SearchProfile, Side } from "./browser-engine";
import { releaseControllerEnabled } from "virtual:shogi-runtime";
import {
  chargeTurn,
  hasFlagFallen,
  initialClockFor,
  matchTimeControl,
  opposing,
  type MatchPreset,
} from "./match-clock";
import type { MatchClock } from "./play-settings";
import {
  loadPrototypeManifest,
  PrototypeWorkerClient,
  type PrototypeEngineClient,
} from "./core-prototype-client";
import {
  DEFAULT_SELECTION,
  parseRuntimeIdentity,
  type PrototypeSelection,
  type RuntimeIdentity,
  type PureRuntimeProof,
  type ComputeTelemetry,
  type PreparationTelemetry,
  type PrototypeManifest,
  type PrototypeSearch,
  type PrototypeSnapshot,
} from "./core-prototype-protocol";

export interface PlayDiagnostic extends ComputeTelemetry {
  elapsedMs: number;
  searchMs: number;
  hardLimitMs: number;
  depth: number;
  nodes: number;
  scoreCp: number | null;
  termination: string;
  profile: SearchProfile;
  preset: MatchPreset;
  remaining: MatchClock;
  side: Side;
  movement: string | null;
  pv: string[];
  leafSha256: string;
  wasmSha256: string;
  sfen: string;
  runtimeProof: PureRuntimeProof;
}
export interface PrototypeState {
  phase:
    | "setup"
    | "loading"
    | "playing"
    | "stopping"
    | "stopped"
    | "finished"
    | "error";
  snapshot: PrototypeSnapshot | null;
  previous: PrototypeSnapshot | null;
  clock: MatchClock;
  turnStartedAt: number | null;
  humanSide: Side;
  enabled: boolean;
  profile: SearchProfile;
  preset: "blitz3" | "rapid10";
  busy: boolean;
  result: { reason: string; winner: Side | null } | null;
  error: string | null;
  selection: PrototypeSelection;
  manifest: PrototypeManifest | null;
  identity: RuntimeIdentity | null;
  preparation: PreparationTelemetry | null;
  telemetry: PlayDiagnostic | null;
  diagnostics: PlayDiagnostic[];
}
export function initialPrototypeState(): PrototypeState {
  return {
    phase: "setup",
    snapshot: null,
    previous: null,
    clock: initialClockFor("blitz3"),
    turnStartedAt: null,
    humanSide: "black",
    enabled: !import.meta.env.DEV && releaseControllerEnabled,
    profile: "balanced",
    preset: "blitz3",
    busy: false,
    result: null,
    error: null,
    selection: DEFAULT_SELECTION,
    manifest: null,
    identity: null,
    preparation: null,
    telemetry: null,
    diagnostics: [],
  };
}

/** The session alone owns clocks and committed positions; every asynchronous response is generation-bound. */
export class PrototypeMatchSession {
  state = initialPrototypeState();
  private generation = 0;
  private client: PrototypeEngineClient | null = null;
  private disposed = false;
  private searching = false;
  private preparationAbort: AbortController | null = null;
  constructor(
    private readonly onChange: (state: PrototypeState) => void,
    private readonly createClient: () => PrototypeEngineClient = () =>
      new PrototypeWorkerClient(),
    private readonly manifestLoader = loadPrototypeManifest,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async prepare(
    selection: PrototypeSelection = DEFAULT_SELECTION,
  ): Promise<void> {
    if (
      this.disposed ||
      ["playing", "stopping", "stopped"].includes(this.state.phase)
    )
      return;
    const generation = this.invalidate();
    const abort = new AbortController();
    this.preparationAbort = abort;
    this.publish({
      ...initialPrototypeState(),
      selection,
      phase: "loading",
      busy: true,
    });
    try {
      const manifest = await this.manifestLoader(selection, abort.signal);
      if (!this.current(generation)) return;
      if (manifest.selection !== selection)
        throw new Error("Selected model manifest mismatch");
      const client = this.createClient();
      this.client = client;
      const ready = await client.initialize(manifest, this.state.enabled, null);
      if (!this.current(generation)) return;
      const identity = parseRuntimeIdentity(ready.identity, manifest);
      if (ready.snapshot.leafSha256 !== identity.leafSha256)
        throw new Error("Prepared model identity mismatch");
      this.preparationAbort = null;
      this.publish({
        manifest,
        identity,
        preparation: ready.preparation,
        snapshot: ready.snapshot,
        phase: "setup",
        busy: false,
      });
    } catch (error) {
      this.fail(generation, error);
    }
  }

  async start(
    humanSide: Side,
    enabled: boolean,
    preset: "blitz3" | "rapid10" = "blitz3",
    profile: SearchProfile = "balanced",
  ): Promise<void> {
    if (this.disposed) return;
    if (!import.meta.env.DEV && enabled !== releaseControllerEnabled) return;
    if (
      this.state.phase !== "setup" ||
      this.state.busy ||
      this.client === null ||
      this.state.snapshot === null ||
      this.state.identity === null
    )
      return;
    const generation = this.generation;
    this.publish({ busy: true });
    try {
      await this.client!.configure(enabled);
      if (!this.current(generation)) return;
      this.publish({
        phase: "playing",
        humanSide,
        enabled,
        preset,
        profile,
        clock: initialClockFor(preset),
        turnStartedAt: this.now(),
        busy: false,
        result: null,
        telemetry: null,
        diagnostics: [],
      });
      if (this.finishTerminal()) return;
      if (this.state.snapshot!.sideToMove !== humanSide)
        await this.engineTurn(generation);
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
    const generation = this.generation;
    this.publish({
      phase: "playing",
      turnStartedAt: this.now(),
      busy: true,
      error: null,
    });
    try {
      if (this.client === null) await this.restoreClient(generation);
      if (!this.current(generation) || this.tick()) return;
      this.publish({ busy: false });
      if (this.state.snapshot!.sideToMove !== this.state.humanSide)
        await this.engineTurn(generation);
    } catch (error) {
      this.fail(generation, error);
    }
  }

  configure(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const selection = this.state.selection;
    this.invalidate();
    this.publish({ ...initialPrototypeState(), selection });
    return this.prepare(selection);
  }
  stop(): void {
    if (!["playing", "loading"].includes(this.state.phase)) return;
    if (this.tick()) return;
    if (this.searching && this.client !== null) {
      this.publish({ phase: "stopping", busy: true });
      this.client.stopSearch();
      return;
    }
    this.chargeActiveTurn();
    const hasPosition = this.state.snapshot !== null;
    // A pending move/initialization cannot be reused after a physical stop.
    if (this.state.busy || this.state.phase === "loading") this.invalidate();
    this.publish({
      phase: hasPosition ? "stopped" : "setup",
      turnStartedAt: null,
      busy: false,
    });
  }
  resign(): void {
    if (["playing", "stopping", "stopped"].includes(this.state.phase))
      this.finish("resignation", opposing(this.state.humanSide));
  }
  tick(): boolean {
    const { phase, snapshot, turnStartedAt, clock } = this.state;
    if (
      (phase !== "playing" && phase !== "stopping") ||
      snapshot === null ||
      turnStartedAt === null
    )
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
    this.publish({ busy: true });
    try {
      const next = await this.client!.move(movement);
      if (!this.current(generation) || this.tick()) return;
      // Include Worker validation and response delivery in the moving side's clock.
      this.chargeActiveTurn();
      this.acceptMove(snapshot, next, movement);
      if (!this.finishTerminal()) await this.engineTurn(generation);
    } catch (error) {
      this.fail(generation, error);
    }
  }
  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  private async restoreClient(generation: number): Promise<void> {
    const position = this.state.snapshot!;
    this.client?.dispose();
    const client = this.createClient();
    this.client = client;
    const ready = await client.initialize(
      this.state.manifest!,
      this.state.enabled,
      position,
    );
    if (!this.current(generation)) return;
    parseRuntimeIdentity(ready.identity, this.state.manifest!);
    if (
      ready.snapshot.leafSha256 !== position.leafSha256 ||
      ready.snapshot.sfen !== position.sfen ||
      ready.snapshot.initialSfen !== position.initialSfen ||
      JSON.stringify(ready.snapshot.moves) !== JSON.stringify(position.moves)
    )
      throw new Error("Restored game does not match the committed position");
    this.publish({ preparation: ready.preparation, identity: ready.identity });
  }
  private async engineTurn(generation: number): Promise<void> {
    if (!this.current(generation) || this.tick()) return;
    const position = this.state.snapshot!;
    const startedAt = this.state.turnStartedAt!;
    this.publish({ busy: true });
    const remaining = chargeTurn(
      this.state.clock,
      position.sideToMove,
      this.now() - startedAt,
    );
    this.searching = true;
    const response = await this.client!.search(
      matchTimeControl(this.state.preset, remaining),
      this.state.profile,
    );
    if (!this.current(generation)) return;
    this.searching = false;
    if (this.tick()) return;
    if (response.perspective !== position.sideToMove)
      throw new Error("Search returned the wrong side");
    if (
      response.bestMove !== null &&
      !position.legalMoves.some(({ usi }) => usi === response.bestMove)
    )
      throw new Error("Search returned an illegal move");
    if (this.state.phase === "stopping") {
      this.record(response, position, remaining, startedAt);
      this.chargeActiveTurn();
      if (response.workerRestartRequired) {
        this.client?.dispose();
        this.client = null;
      }
      this.publish({ phase: "stopped", turnStartedAt: null, busy: false });
      return;
    }
    if (response.bestMove === null) {
      this.finish("engine-resignation", this.state.humanSide);
      return;
    }
    if (response.workerRestartRequired) await this.restoreClient(generation);
    if (!this.current(generation) || this.tick()) return;
    const next = await this.client!.move(response.bestMove);
    if (!this.current(generation) || this.tick()) return;
    this.record(response, position, remaining, startedAt);
    this.chargeActiveTurn();
    this.acceptMove(position, next, response.bestMove);
    this.finishTerminal();
  }
  private record(
    response: PrototypeSearch,
    position: PrototypeSnapshot,
    remaining: MatchClock,
    startedAt: number,
  ): void {
    const telemetry: PlayDiagnostic = {
      ...response.computeControl,
      targetMs: response.timing.targetMs,
      elapsedMs: this.now() - startedAt,
      searchMs: response.timing.searchMs,
      hardLimitMs: response.timing.hardLimitMs,
      depth: response.depth,
      nodes: response.nodes,
      scoreCp: response.scoreCp,
      termination: response.termination,
      profile: this.state.profile,
      preset: this.state.preset,
      remaining,
      side: position.sideToMove,
      movement: response.bestMove,
      pv: response.pv,
      leafSha256: position.leafSha256,
      wasmSha256: this.state.manifest!.artifacts["engine.wasm"].sha256,
      sfen: position.sfen,
      runtimeProof: response.runtimeProof,
    };
    this.publish({
      telemetry,
      diagnostics: [...this.state.diagnostics, telemetry],
    });
  }
  private acceptMove(
    before: PrototypeSnapshot,
    next: PrototypeSnapshot,
    movement: string,
  ): void {
    if (
      next.leafSha256 !== before.leafSha256 ||
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
    if (snapshot !== null && turnStartedAt !== null) {
      const now = this.now();
      this.publish({
        clock: chargeTurn(clock, snapshot.sideToMove, now - turnStartedAt),
        turnStartedAt: now,
      });
    }
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
    this.searching = false;
    this.preparationAbort?.abort();
    this.preparationAbort = null;
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
