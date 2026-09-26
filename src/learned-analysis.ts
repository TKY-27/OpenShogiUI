import {
  ANALYSIS_SCHEMA,
  sha256Hex,
  type AnalysisStart,
  type AnalysisUpdate,
  type SearchProfile,
} from "./browser-engine";
import { MAX_GAME_MOVES } from "./browser-engine";
import { AnalysisSummaryStore, updateMatchesRequest } from "./analysis-cache";
import {
  accumulateSlice,
  emptyProgress,
  analysisSliceNodes,
  type AnalysisProgress,
} from "./analysis-progress";
import {
  loadPrototypeManifest,
  PrototypeWorkerClient,
} from "./core-prototype-client";
import {
  DEFAULT_SELECTION,
  moveList,
  type PrototypeManifest,
  type PrototypeSelection,
  type PrototypeSnapshot,
  type RuntimeIdentity,
} from "./core-prototype-protocol";
import { START_SFEN } from "./collection";

export function readAnalysisPosition(text: string): {
  initialSfen: string;
  moves: string[];
} {
  if (new TextEncoder().encode(text).length > 12_288)
    throw new Error("棋譜は12KiB以内のUSIまたはSFENで指定してください。");
  const words = text.trim().split(/\s+/);
  if (words[0] === "position") words.shift();
  const initialSfen =
    words[0] === "startpos"
      ? (words.shift(), START_SFEN)
      : (words[0] === "sfen" && words.shift(), words.splice(0, 4).join(" "));
  if (words.length && words.shift() !== "moves")
    throw new Error("USIまたはSFEN形式を指定してください。");
  return { initialSfen, moves: moveList(words) };
}

/** The committed line (本譜) plus everything navigation and comments need. */
export interface AnalysisRecord {
  initialSfen: string;
  moves: string[];
  blackName: string | null;
  whiteName: string | null;
  /** Free-text notes parallel to moves (index 0 = ply 1); never transmitted. */
  comments: string[];
  /** Ending named by an imported file, kept as information only. */
  endingNote: string | null;
}

export function emptyRecord(): AnalysisRecord {
  return {
    initialSfen: START_SFEN,
    moves: [],
    blackName: null,
    whiteName: null,
    comments: [],
    endingNote: null,
  };
}

/** One stored per-position search result, bound to its full request identity. */
export interface StoredResult {
  request: AnalysisStart;
  update: AnalysisUpdate;
}

/**
 * Evaluation samples for the graph and the kifu list, one entry per ply of the
 * displayed line. Missing plies stay null: an unanalyzed position is a gap,
 * never a fabricated zero. Scores are Sente perspective.
 */
export interface GraphPoint {
  ply: number;
  score: number;
  mate: boolean;
  depth: number;
}

export type AnalysisMode = "position" | "game" | "mate";

export interface LearnedAnalysisState {
  selection: PrototypeSelection;
  snapshot: PrototypeSnapshot | null;
  identity: RuntimeIdentity | null;
  phase: "loading" | "ready" | "searching" | "stopped" | "error";
  update: AnalysisUpdate | null;
  progress: AnalysisProgress;
  error: string | null;
  record: AnalysisRecord;
  /** Displayed line; identical to record.moves when no branch is active. */
  line: string[];
  /** The position before line[cursor] is displayed (0 = record start). */
  cursor: number;
  branching: boolean;
  /** Per-position results for the displayed line (index = ply). */
  graph: (GraphPoint | null)[];
  /** 棋譜解析 progress; null while idle. */
  sweep: { done: number; total: number } | null;
}

export const initialAnalysisState = (): LearnedAnalysisState => ({
  selection: DEFAULT_SELECTION,
  snapshot: null,
  identity: null,
  phase: "loading",
  update: null,
  progress: emptyProgress(),
  error: null,
  record: emptyRecord(),
  line: [],
  cursor: 0,
  branching: false,
  graph: [],
  sweep: null,
});

const hashText = (text: string) =>
  sha256Hex(new TextEncoder().encode(text).buffer);

/** Requests are deterministic per position/model/options; the hashing is not free. */
const requestMemo = new Map<string, Promise<AnalysisStart>>();

export async function analysisRequest(
  snapshot: PrototypeSnapshot,
  manifest: PrototypeManifest,
  profile: SearchProfile,
  multiPv: number,
): Promise<AnalysisStart> {
  // UI cache namespaces bind the runtime bytes, not guessed engine feature-version numbers.
  const runtime = `${manifest.artifacts["engine.js"].sha256}:${manifest.artifacts["engine.wasm"].sha256}`;
  const memoKey = `${snapshot.sfen}|${snapshot.leafSha256}|${profile}|${multiPv}|${runtime}`;
  const memo = requestMemo.get(memoKey);
  if (memo) return memo;
  const request = (async (): Promise<AnalysisStart> => ({
    schema: ANALYSIS_SCHEMA,
    positionSfen: snapshot.sfen,
    modelHash: snapshot.leafSha256,
    evaluatorConfigHash: await hashText(
      `pure_learned:controller-off:${runtime}`,
    ),
    featureSchemaHash: await hashText(`runtime-features:${runtime}`),
    evaluationSemanticsHash: await hashText(`root-side-search:${runtime}`),
    searchOptionsHash: await hashText(
      JSON.stringify({ profile, multiPv, runtime }),
    ),
    openingProfileHash: await hashText("opening-disabled"),
    multiPv,
  }))();
  if (requestMemo.size > 2048) requestMemo.clear();
  requestMemo.set(memoKey, request);
  return request;
}

const snapshotCacheLimit = 720;

/**
 * Owns one analysis workspace: model loading, kifu navigation with cached
 * snapshots, branching previews, bounded per-position analysis, the full-game
 * sweep and the local result store. Stale worker responses are rejected by
 * generation, exactly as before.
 */
export class LearnedAnalysisSession {
  state = initialAnalysisState();
  private generation = 0;
  /** Search operations (position/mate/sweep) are cancelled independently of navigation. */
  private searchGeneration = 0;
  private searchRunning = false;
  private client: PrototypeWorkerClient | null = null;
  private searchClient: PrototypeWorkerClient | null = null;
  /** Plies of the current line the navigation worker is positioned after; -1 = unknown. */
  private navPosition = -1;
  private manifest: PrototypeManifest | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly snapshots = new Map<string, PrototypeSnapshot>();
  private readonly results = new Map<string, StoredResult[]>();
  private readonly store: AnalysisSummaryStore;
  /** Identity of the most recent search; displayed results must match it. */
  private lastOptionsHash: string | null = null;

  constructor(
    private readonly onChange: (state: LearnedAnalysisState) => void,
    private readonly makeClient = () => new PrototypeWorkerClient(),
    private readonly loadManifest = loadPrototypeManifest,
    store: AnalysisSummaryStore = new AnalysisSummaryStore(),
  ) {
    this.store = store;
  }

  async prepare(
    selection = this.state.selection,
    position: Pick<PrototypeSnapshot, "initialSfen" | "moves"> | null = null,
  ): Promise<void> {
    const generation = this.invalidate();
    const abort = new AbortController();
    this.abort = abort;
    if (position !== null) {
      this.state.record = {
        initialSfen: position.initialSfen,
        moves: [...position.moves],
        blackName: null,
        whiteName: null,
        comments: [],
        endingNote: null,
      };
      this.state.line = [...position.moves];
      this.state.cursor = position.moves.length;
      this.state.branching = false;
    }
    this.publish({
      selection,
      identity: null,
      phase: "loading",
      update: null,
      progress: emptyProgress(),
      error: null,
      sweep: null,
    });
    try {
      const manifest = await this.loadManifest(selection, abort.signal);
      if (!this.current(generation)) return;
      const client = this.makeClient();
      this.client = client;
      const ready = await client.initialize(manifest, false, {
        initialSfen: this.state.record.initialSfen,
        moves: this.state.line.slice(0, this.state.cursor),
      });
      if (!this.current(generation)) return;
      this.manifest = manifest;
      this.navPosition = this.state.cursor;
      this.cacheSnapshot(ready.snapshot);
      this.publish({
        phase: "ready",
        snapshot: ready.snapshot,
        identity: ready.identity,
      });
      this.publishGraph();
    } catch (error) {
      if (this.current(generation)) {
        this.invalidate();
        this.publish({
          phase: "error",
          error:
            error instanceof Error
              ? error.message
              : "モデルを読み込めませんでした。",
        });
      }
    }
  }

  /**
   * Loads an imported or USI position as the new committed record. The Wasm
   * runtime replays and validates the line first; on failure the previous
   * record stays in place. Imported games open at the first position, pasted
   * USI lines at the final one.
   */
  async loadPosition(
    source: {
      initialSfen: string;
      moves: string[];
      blackName?: string | null;
      whiteName?: string | null;
      comments?: string[];
      endingNote?: string | null;
    },
    cursorAfter: "start" | "end" = "start",
  ): Promise<void> {
    const previous = {
      record: this.state.record,
      line: this.state.line,
      cursor: this.state.cursor,
      branching: this.state.branching,
      snapshot: this.state.snapshot,
    };
    await this.prepare(this.state.selection, {
      initialSfen: source.initialSfen,
      moves: source.moves,
    });
    if (
      this.state.phase === "error" ||
      this.state.phase === "loading" ||
      this.disposed
    ) {
      if (!this.disposed && this.state.phase === "error") {
        this.state.record = previous.record;
        this.state.line = previous.line;
        this.state.cursor = previous.cursor;
        this.state.branching = previous.branching;
        this.publish({
          record: previous.record,
          line: previous.line,
          cursor: previous.cursor,
          branching: previous.branching,
          snapshot: previous.snapshot,
        });
        this.publishGraph();
      }
      return;
    }
    this.publish({
      record: {
        initialSfen: source.initialSfen,
        moves: [...source.moves].slice(0, MAX_GAME_MOVES),
        blackName: source.blackName ?? null,
        whiteName: source.whiteName ?? null,
        comments: [...(source.comments ?? [])].slice(0, source.moves.length),
        endingNote: source.endingNote ?? null,
      },
      error: null,
    });
    this.publishGraph();
    if (cursorAfter === "start" && this.state.cursor > 0) await this.goto(0);
  }

  /** Moves the displayed position without touching record or line. */
  async goto(cursor: number): Promise<void> {
    const target = Math.max(
      0,
      Math.min(Math.round(cursor), this.state.line.length),
    );
    if (target === this.state.cursor && this.state.snapshot !== null) return;
    const prefix = this.state.line.slice(0, target);
    const cached = this.cachedSnapshot(prefix);
    this.state.cursor = target;
    this.publish({
      cursor: target,
      snapshot: cached,
      update: cached === null ? null : this.lookupUpdate(cached),
      progress: emptyProgress(),
    });
    // Re-position the navigation worker in the background; navigation to a
    // cached position stays instant, and a superseded sync is discarded.
    const generation = ++this.generation;
    if (!this.manifest || this.disposed) return;
    try {
      if (this.navPosition === target && this.client !== null) return;
      let synced: PrototypeSnapshot | null = null;
      if (
        this.navPosition === target - 1 &&
        target >= 1 &&
        this.client !== null
      ) {
        // Single forward step: the worker can play the movement directly.
        synced = await this.client.move(this.state.line[target - 1]!);
      } else {
        // The worker accepts initialize only once in its lifetime, so any
        // other repositioning needs a fresh Worker.
        this.client?.dispose();
        this.client = this.makeClient();
        const ready = await this.client.initialize(this.manifest, false, {
          initialSfen: this.state.record.initialSfen,
          moves: prefix,
        });
        synced = ready.snapshot;
      }
      if (!this.current(generation)) return;
      this.navPosition = target;
      if (synced !== null) {
        this.cacheSnapshot(synced);
        if (this.state.cursor === target)
          this.publish({
            snapshot: synced,
            update: this.lookupUpdate(synced),
          });
      }
    } catch {
      // A superseded or failed sync surfaces on the next operation instead of
      // clobbering the view the user is looking at. The unknown position
      // forces a fresh worker on the next sync.
      this.navPosition = -1;
    }
  }

  /**
   * Plays a movement from the board. At the end of the committed line it
   * extends the record; anywhere else it forks a preview branch and never
   * overwrites the record silently.
   */
  async move(usi: string): Promise<void> {
    const position = this.state.snapshot;
    if (!position?.legalMoves.some((candidate) => candidate.usi === usi))
      return;
    const cursor = this.state.cursor;
    if (!this.state.branching && cursor === this.state.line.length) {
      const record = {
        ...this.state.record,
        moves: [...this.state.record.moves, usi],
      };
      this.state.record = record;
      this.state.line = [...record.moves];
      this.publish({
        record,
        line: this.state.line,
        branching: false,
      });
    } else {
      this.state.line = [...this.state.line.slice(0, cursor), usi];
      const branching =
        this.state.line.join(" ") !== this.state.record.moves.join(" ");
      this.state.branching = branching;
      this.publish({ line: this.state.line, branching });
    }
    this.publishGraph();
    await this.goto(cursor + 1);
  }

  /** Discards a preview branch and returns to the committed record. */
  discardBranch(): void {
    if (!this.state.branching) return;
    this.state.line = [...this.state.record.moves];
    this.state.branching = false;
    this.publish({ line: this.state.line, branching: false });
    this.publishGraph();
    void this.goto(Math.min(this.state.cursor, this.state.line.length));
  }

  /** Promotes the displayed branch to the committed record. */
  adoptBranch(): void {
    if (!this.state.branching) return;
    const record = { ...this.state.record, moves: [...this.state.line] };
    this.state.record = record;
    this.state.branching = false;
    this.publish({ record, branching: false });
  }

  setComment(ply: number, text: string): void {
    if (ply < 1 || ply > this.state.line.length) return;
    const comments = [...this.state.record.comments];
    while (comments.length < this.state.line.length) comments.push("");
    comments[ply - 1] = text;
    const record = { ...this.state.record, comments };
    this.state.record = record;
    this.publish({ record });
  }

  async analyze(
    profile: SearchProfile,
    budgetMs: number,
    multiPv: number,
    mode: AnalysisMode = "position",
  ): Promise<void> {
    if (
      this.searchRunning ||
      !this.state.snapshot ||
      ![250, 1000, 3000].includes(budgetMs) ||
      ![1, 3].includes(multiPv)
    )
      return;
    // The pinned Wasm clamps depth to the profile ceiling whatever the host
    // asks, so a mate search differs from a position search in budget only.
    const budget = mode === "mate" ? Math.max(budgetMs, 3000) : budgetMs;
    const generation = ++this.searchGeneration;
    this.searchRunning = true;
    this.searchClient?.dispose();
    const client = this.makeClient();
    this.searchClient = client;
    this.publish({
      phase: "searching",
      update: null,
      progress: emptyProgress(),
      error: null,
      sweep: null,
    });
    try {
      if (!this.manifest || this.manifest.selection !== this.state.selection)
        throw new Error("モデルを再読込してください。");
      const position = this.state.snapshot;
      const request = await analysisRequest(
        position,
        this.manifest,
        profile,
        multiPv,
      );
      this.lastOptionsHash = request.searchOptionsHash;
      const cached = await this.store.get(request);
      if (!this.searchCurrent(generation)) return;
      if (cached !== null) {
        this.storeResult(request, cached.update);
        this.publish({ update: cached.update });
      }
      // Fresh Worker/TT for each bounded analysis; no match clock or automatic move.
      const ready = await client.initialize(this.manifest, false, position);
      if (!this.searchCurrent(generation)) return;
      if (
        ready.snapshot.sfen !== position.sfen ||
        ready.identity.leafSha256 !== position.leafSha256
      )
        throw new Error("解析局面が一致しません。");
      await client.analysisStart(request, profile);
      if (!this.searchCurrent(generation)) return;
      const started = performance.now();
      this.timer = setTimeout(() => this.stop(), budget + 250);
      do {
        const response = await client.analysisStep({
          schema: ANALYSIS_SCHEMA,
          nodes: analysisSliceNodes(profile),
          maxDepth: profile === "quality" ? 9 : 7,
          timestampMs: Date.now(),
        });
        if (!this.searchCurrent(generation)) return;
        for (const update of response.updates) {
          if (
            !updateMatchesRequest(update, request) ||
            update.lines.some(
              (line) =>
                !position.legalMoves.some((move) => move.usi === line.pv[0]),
            )
          )
            throw new Error("解析応答の局面・モデルが一致しません。");
          if (update.depth > 0) {
            this.storeResult(request, update);
            this.publish({ update, graph: this.deriveGraph() });
          }
        }
        this.publish({
          progress: accumulateSlice(this.state.progress, response.slice),
        });
        if (response.slice?.termination === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 16));
      } while (
        this.searchCurrent(generation) &&
        performance.now() - started < budget
      );
      if (!this.searchCurrent(generation)) return;
      await client.analysisStop();
      if (!this.searchCurrent(generation)) return;
      this.endSearch();
      this.publish({ phase: "ready" });
    } catch (error) {
      if (this.searchCurrent(generation)) {
        this.endSearch();
        this.publish({
          phase: "error",
          error:
            error instanceof Error ? error.message : "解析できませんでした。",
        });
      }
    }
  }

  /**
   * 棋譜解析: analyzes every position of the displayed line in sequence with a
   * dedicated worker that advances ply by ply. Results land in the store so
   * the graph and the kifu tab fill in; the displayed cursor never moves.
   */
  async sweep(
    profile: SearchProfile,
    budgetMs: number,
    multiPv: number,
  ): Promise<void> {
    const line = [...this.state.line];
    const initialSfen = this.state.record.initialSfen;
    if (this.searchRunning || line.length === 0) return;
    const generation = ++this.searchGeneration;
    this.searchRunning = true;
    this.searchClient?.dispose();
    const client = this.makeClient();
    this.searchClient = client;
    this.publish({
      phase: "searching",
      sweep: { done: 0, total: line.length + 1 },
      progress: emptyProgress(),
      error: null,
      update: null,
    });
    try {
      if (!this.manifest || this.manifest.selection !== this.state.selection)
        throw new Error("モデルを再読込してください。");
      const ready = await client.initialize(this.manifest, false, {
        initialSfen,
        moves: [],
      });
      if (!this.searchCurrent(generation)) return;
      let position = ready.snapshot;
      this.cacheSnapshot(position);
      for (let ply = 0; ply <= line.length; ply++) {
        const request = await analysisRequest(
          position,
          this.manifest,
          profile,
          multiPv,
        );
        if (!this.searchCurrent(generation)) return;
        this.lastOptionsHash = request.searchOptionsHash;
        const cached = await this.store.get(request);
        if (!this.searchCurrent(generation)) return;
        if (cached !== null) {
          this.storeResult(request, cached.update);
        } else {
          await client.analysisStart(request, profile);
          if (!this.searchCurrent(generation)) return;
          const started = performance.now();
          this.timer = setTimeout(() => this.stop(), budgetMs + 250);
          do {
            const response = await client.analysisStep({
              schema: ANALYSIS_SCHEMA,
              nodes: analysisSliceNodes(profile),
              maxDepth: profile === "quality" ? 9 : 7,
              timestampMs: Date.now(),
            });
            if (!this.searchCurrent(generation)) return;
            for (const update of response.updates) {
              if (
                !updateMatchesRequest(update, request) ||
                update.lines.some(
                  (candidate) =>
                    !position.legalMoves.some(
                      (move) => move.usi === candidate.pv[0],
                    ),
                )
              )
                throw new Error("解析応答の局面・モデルが一致しません。");
              if (update.depth > 0) this.storeResult(request, update);
            }
            if (response.slice?.termination === "completed") break;
            await new Promise((resolve) => setTimeout(resolve, 8));
          } while (
            this.searchCurrent(generation) &&
            performance.now() - started < budgetMs
          );
          if (!this.searchCurrent(generation)) return;
          this.disarmTimer();
          await client.analysisStop();
          if (!this.searchCurrent(generation)) return;
        }
        this.publish({ graph: this.deriveGraph() });
        if (this.state.snapshot?.sfen === position.sfen)
          this.publish({
            update: this.lookupUpdate(position),
            progress: emptyProgress(),
          });
        this.publish({ sweep: { done: ply + 1, total: line.length + 1 } });
        if (ply < line.length) {
          position = await client.move(line[ply]!);
          if (!this.searchCurrent(generation)) return;
          this.cacheSnapshot(position);
        }
      }
      this.endSearch();
      this.publish({ phase: "ready", sweep: null });
    } catch (error) {
      if (this.searchCurrent(generation)) {
        this.endSearch();
        this.publish({
          phase: "error",
          sweep: null,
          error:
            error instanceof Error ? error.message : "解析できませんでした。",
        });
      }
    }
  }

  stop(clear = false): void {
    if (this.searchRunning) {
      // Invalidate the running search silently: the search loop observes the
      // generation bump and returns without publishing an error.
      this.searchGeneration++;
      this.endSearch();
      this.publish({
        phase: "stopped",
        sweep: null,
        ...(clear ? { update: null, progress: emptyProgress() } : {}),
      });
    } else if (clear) {
      this.publish({
        phase: "stopped",
        update: null,
        progress: emptyProgress(),
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }

  private endSearch(): void {
    this.searchRunning = false;
    this.searchClient?.dispose();
    this.searchClient = null;
    this.disarmTimer();
  }

  /** One position's budget watchdog must never outlive that position. */
  private disarmTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private invalidate(): number {
    this.generation++;
    this.searchGeneration++;
    this.abort?.abort();
    this.abort = null;
    this.client?.dispose();
    this.client = null;
    this.endSearch();
    return this.generation;
  }

  private current(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private searchCurrent(generation: number): boolean {
    return !this.disposed && generation === this.searchGeneration;
  }

  private publish(patch: Partial<LearnedAnalysisState>): void {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.onChange(this.state);
  }

  /** Rebuilds the per-ply sample list for the displayed line under the last options. */
  private deriveGraph(): (GraphPoint | null)[] {
    const points: (GraphPoint | null)[] = [];
    let movesKey = "";
    for (let ply = 0; ply <= this.state.line.length; ply++) {
      const snapshot = this.cachedByMoves(
        this.state.record.initialSfen,
        movesKey,
      );
      points.push(snapshot === null ? null : this.pointFor(snapshot, ply));
      if (ply < this.state.line.length)
        movesKey =
          movesKey === ""
            ? this.state.line[ply]!
            : `${movesKey} ${this.state.line[ply]}`;
    }
    return points;
  }

  private pointFor(
    snapshot: PrototypeSnapshot,
    ply: number,
  ): GraphPoint | null {
    const stored = this.lookupUpdate(snapshot);
    if (stored === null || stored.lines.length === 0) return null;
    const best = stored.lines[0]!;
    const sign = snapshot.sideToMove === "black" ? 1 : -1;
    return {
      ply,
      score: best.score * sign,
      mate: best.mateScore !== null,
      depth: stored.depth,
    };
  }

  private cachedByMoves(
    initialSfen: string,
    movesKey: string,
  ): PrototypeSnapshot | null {
    return this.snapshots.get(`${initialSfen}#${movesKey}`) ?? null;
  }

  private cacheSnapshot(snapshot: PrototypeSnapshot): void {
    const key = `${snapshot.initialSfen}#${snapshot.moves.join(" ")}`;
    if (this.snapshots.has(key)) return;
    if (this.snapshots.size >= snapshotCacheLimit) {
      const first = this.snapshots.keys().next().value;
      if (first !== undefined) this.snapshots.delete(first);
    }
    this.snapshots.set(key, snapshot);
  }

  private cachedSnapshot(prefix: string[]): PrototypeSnapshot | null {
    return this.cachedByMoves(this.state.record.initialSfen, prefix.join(" "));
  }

  /** The stored result for this position produced by the most recent search options. */
  private lookupUpdate(snapshot: PrototypeSnapshot): AnalysisUpdate | null {
    if (this.lastOptionsHash === null) return null;
    for (const stored of this.results.get(snapshot.sfen) ?? []) {
      if (
        stored.request.modelHash === snapshot.leafSha256 &&
        stored.request.searchOptionsHash === this.lastOptionsHash
      )
        return stored.update;
    }
    return null;
  }

  private storeResult(request: AnalysisStart, update: AnalysisUpdate): void {
    const list = this.results.get(request.positionSfen) ?? [];
    const index = list.findIndex(
      (stored) =>
        stored.request.modelHash === request.modelHash &&
        stored.request.searchOptionsHash === request.searchOptionsHash,
    );
    if (index >= 0) list[index] = { request, update };
    else list.push({ request, update });
    this.results.set(request.positionSfen, list);
    if (this.results.size > 640) {
      const first = this.results.keys().next().value;
      if (first !== undefined) this.results.delete(first);
    }
    void this.store.put(request, update);
  }

  private publishGraph(): void {
    this.publish({ graph: this.deriveGraph() });
  }
}
