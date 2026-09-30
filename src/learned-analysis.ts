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
  /** True while the user's position-analysis intent persists across moves. */
  autoFollow: boolean;
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
  autoFollow: false,
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

/**
 * Identity of a search context: the root SFEN alone cannot distinguish two
 * histories that end in the same position, and the pure search is
 * history-dependent (repetition and perpetual-check detection walk the move
 * list). Cache keys, request memos and search ownership therefore bind the
 * initial SFEN and the full move list, never the SFEN by itself.
 */
export function positionHistoryIdentity(
  position: Pick<PrototypeSnapshot, "initialSfen" | "moves">,
): string {
  return `${position.initialSfen}#${position.moves.join(" ")}`;
}

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
  const memoKey = `${positionHistoryIdentity(snapshot)}|${snapshot.sfen}|${snapshot.leafSha256}|${profile}|${multiPv}|${runtime}`;
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
  /** True while a navigation reposition is in flight; navPosition is stale then. */
  private navSyncing = false;
  /** Cursor of the snapshot actually on display during a sync. */
  private displayedCursor = 0;
  private manifest: PrototypeManifest | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /**
   * Ownership token for record loads. Every load, model switch and dispose
   * bumps it; only the operation that still owns the token may publish the
   * record, roll back, navigate or re-arm analysis when it resumes.
   */
  private loadSequence = 0;
  /** Selection plus artifact hashes of the last verified manifest. */
  private loadedModelIdentity: string | null = null;
  private readonly snapshots = new Map<string, PrototypeSnapshot>();
  private readonly results = new Map<string, StoredResult[]>();
  private readonly store: AnalysisSummaryStore;
  /** Identity of the most recent search; displayed results must match it. */
  private lastOptionsHash: string | null = null;
  /**
   * The armed position-analysis intent: while set, every newly displayed
   * position starts its own bounded analysis with these options. Mate search
   * and the full-record sweep are one-shot activities and clear it.
   */
  private autoFollowOptions: {
    profile: SearchProfile;
    budgetMs: number;
    multiPv: number;
  } | null = null;
  /** History identity the running search belongs to, for supersede decisions. */
  private searchPositionIdentity: string | null = null;
  /** Which activity owns the search channel; null while idle. */
  private searchKind: "position" | "sweep" | null = null;

  constructor(
    private readonly onChange: (state: LearnedAnalysisState) => void,
    private readonly makeClient = () => new PrototypeWorkerClient(),
    private readonly loadManifest = loadPrototypeManifest,
    store: AnalysisSummaryStore = new AnalysisSummaryStore(),
  ) {
    this.store = store;
  }

  /**
   * Public entry for model loads and switches. It supersedes any in-flight
   * record load: only the newest user operation may settle the record.
   */
  async prepare(
    selection = this.state.selection,
    position: Pick<PrototypeSnapshot, "initialSfen" | "moves"> | null = null,
  ): Promise<void> {
    this.loadSequence++;
    await this.prepareInternal(selection, position);
  }

  private async prepareInternal(
    selection = this.state.selection,
    position: Pick<PrototypeSnapshot, "initialSfen" | "moves"> | null = null,
  ): Promise<void> {
    const generation = this.invalidate();
    const abort = new AbortController();
    this.abort = abort;
    // The pending record is published only with the verified ready state: a
    // failed or superseded load never leaves half-imported state behind, and
    // a concurrent newer operation still observes the previous consistent
    // record as its own rollback target.
    const pending =
      position === null
        ? null
        : {
            initialSfen: position.initialSfen,
            moves: [...position.moves],
          };
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
        initialSfen: pending?.initialSfen ?? this.state.record.initialSfen,
        moves: pending
          ? pending.moves
          : this.state.line.slice(0, this.state.cursor),
      });
      if (!this.current(generation)) return;
      // Cached snapshots and results embed the previous model's leaf
      // identity. They are dropped only once the new model has actually
      // loaded, so a failed switch leaves the previous model's coherent
      // caches in place while a successful switch can never show an old
      // model's evaluation under the new one.
      const modelIdentity = `${manifest.selection}:${manifest.artifacts["engine.js"].sha256}:${manifest.artifacts["engine.wasm"].sha256}:${manifest.artifacts["leaf.osaval03"].sha256}`;
      if (modelIdentity !== this.loadedModelIdentity) {
        this.snapshots.clear();
        this.results.clear();
        this.lastOptionsHash = null;
        this.loadedModelIdentity = modelIdentity;
      }
      this.manifest = manifest;
      this.publish({
        phase: "ready",
        snapshot: ready.snapshot,
        identity: ready.identity,
        ...(pending !== null
          ? {
              record: {
                initialSfen: pending.initialSfen,
                moves: [...pending.moves],
                blackName: null,
                whiteName: null,
                comments: [],
                endingNote: null,
              },
              line: [...pending.moves],
              cursor: pending.moves.length,
              branching: false,
            }
          : {}),
      });
      this.navPosition = this.state.cursor;
      this.cacheSnapshot(ready.snapshot);
      this.displayedCursor = this.state.cursor;
      this.publishGraph();
      // A model switch (no explicit position) keeps the displayed position;
      // an armed auto-follow restarts it with the new runtime.
      if (position === null) this.autoAnalyzeCurrent();
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
   *
   * Every await below re-checks operation ownership: a load that was
   * superseded by another load, a reset, a model switch or dispose returns
   * without publishing, rolling back or re-arming anything.
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
    const token = ++this.loadSequence;
    await this.prepareInternal(this.state.selection, {
      initialSfen: source.initialSfen,
      moves: source.moves,
    });
    if (token !== this.loadSequence || this.disposed) return;
    if (this.state.phase === "error") {
      // The failed load never mutated the committed record; re-derive the
      // graph for the still-committed line and leave the error visible.
      this.publishGraph();
      return;
    }
    if (this.state.phase !== "ready") return;
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
    if (cursorAfter === "start" && this.state.cursor > 0) {
      await this.goto(0);
    } else {
      this.autoAnalyzeCurrent();
    }
  }

  /** Moves the displayed position without touching record or line. */
  async goto(cursor: number): Promise<void> {
    // Navigation during a model load would supersede the load's generation
    // and leave the session wedged in "loading": the load is the active
    // operation and owns the display until it settles. Graph points and the
    // ply slider stay clickable, so the guard lives here, not in the UI.
    if (this.state.phase === "loading") return;
    const target = Math.max(
      0,
      Math.min(Math.round(cursor), this.state.line.length),
    );
    if (
      target === this.state.cursor &&
      this.state.snapshot !== null &&
      // A stale navPosition (branch discard, failed sync) needs a re-sync
      // even though the display already shows this cursor.
      this.navPosition === target &&
      !this.navSyncing
    )
      return;
    const prefix = this.state.line.slice(0, target);
    const cached = this.cachedSnapshot(prefix);
    this.state.cursor = target;
    this.publish({
      cursor: target,
      // Keep the previous board on display until the synced snapshot for the
      // new cursor arrives; a blank board would flash on every jump.
      snapshot: cached ?? this.state.snapshot,
      update: cached === null ? null : this.lookupUpdate(cached),
      progress: emptyProgress(),
    });
    if (cached !== null) this.displayedCursor = target;
    // Re-position the navigation worker in the background; navigation to a
    // cached position stays instant, and a superseded sync is discarded.
    const generation = ++this.generation;
    if (!this.manifest || this.disposed) return;
    try {
      if (
        this.navPosition === target &&
        this.client !== null &&
        !this.navSyncing
      )
        return;
      // A superseded sync may still be replacing this.client; until it
      // settles, navPosition does not describe any live worker, so the sync
      // must not be skipped and must not reuse the single-step fast path.
      const wasSyncing = this.navSyncing;
      this.navSyncing = true;
      // The armed analysis intent follows the displayed position. Only a
      // display that already shows the target starts immediately; a stale
      // display waits for the sync so its analysis is not spawned just to be
      // superseded when the true position lands.
      this.autoAnalyzeCurrent();
      let synced: PrototypeSnapshot | null = null;
      if (
        !wasSyncing &&
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
      this.navSyncing = false;
      if (synced !== null) {
        this.cacheSnapshot(synced);
        if (this.state.cursor === target) {
          this.displayedCursor = target;
          this.publish({
            snapshot: synced,
            update: this.lookupUpdate(synced),
          });
          this.autoAnalyzeCurrent();
        }
      }
    } catch {
      // A superseded or failed sync surfaces on the next operation instead of
      // clobbering the view the user is looking at. The unknown position
      // forces a fresh worker on the next sync; a newer sync owns the flag.
      if (this.current(generation)) {
        this.navPosition = -1;
        this.navSyncing = false;
      }
    }
  }

  /**
   * Plays a movement from the board. At the end of the committed line it
   * extends the record; anywhere else it forks a preview branch and never
   * overwrites the record silently.
   */
  async move(usi: string): Promise<void> {
    // A move during a model load would extend the old record while the load
    // owns the display; the board is disabled in the UI, and this guard
    // keeps the session-level contract intact.
    if (this.state.phase === "loading") return;
    const position = this.state.snapshot;
    if (!position?.legalMoves.some((candidate) => candidate.usi === usi))
      return;
    // The board can transiently show a position other than the one the cursor
    // names: an uncached navigation sync is in flight, or a discarded branch
    // whose committed replacement is still syncing. A click resolved against
    // that display can be legal there yet illegal at the position the record
    // would receive it at, so compare content, not cursor depth (a discarded
    // branch end can share the committed cursor's depth). Drop it; the synced
    // board re-enables moves the instant it lands.
    const displayCurrent =
      position.initialSfen === this.state.record.initialSfen &&
      position.moves.join(" ") ===
        this.state.line.slice(0, this.state.cursor).join(" ");
    if (!displayCurrent) return;
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
    // The cursor may be numerically unchanged (branch end == record end), so
    // the restored committed position is published here; goto would otherwise
    // see the same cursor and keep the discarded branch on the board.
    const cursor = Math.min(this.state.cursor, this.state.line.length);
    this.state.cursor = cursor;
    const cached = this.cachedSnapshot(this.state.line.slice(0, cursor));
    this.publish({
      line: this.state.line,
      branching: false,
      cursor,
      // Keep the discarded board on display rather than blanking when the
      // committed snapshot is not cached; the sync below replaces it.
      snapshot: cached ?? this.state.snapshot,
      update: cached === null ? null : this.lookupUpdate(cached),
      progress: emptyProgress(),
    });
    if (cached !== null) this.displayedCursor = cursor;
    this.publishGraph();
    // The navigation worker still sits at the branch end, and depth alone
    // cannot distinguish that from the committed position of the same
    // length. Force a fresh sync so the next step cannot extend a discarded
    // branch in place.
    this.navPosition = -1;
    void this.goto(cursor);
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
      this.state.phase === "loading" ||
      !this.state.snapshot ||
      ![250, 1000, 3000].includes(budgetMs) ||
      ![1, 3].includes(multiPv)
    )
      return;
    // Starting position analysis arms auto-follow: subsequent positions keep
    // analyzing until the user stops. Mate search is a one-shot activity and
    // disarms an armed intent instead of becoming continuous.
    const armed = mode === "position";
    this.autoFollowOptions = armed ? { profile, budgetMs, multiPv } : null;
    // The pinned Wasm clamps depth to the profile ceiling whatever the host
    // asks, so a mate search differs from a position search in budget only.
    const budget = mode === "mate" ? Math.max(budgetMs, 3000) : budgetMs;
    const generation = ++this.searchGeneration;
    this.searchRunning = true;
    this.searchKind = "position";
    this.searchClient?.dispose();
    const client = this.makeClient();
    this.searchClient = client;
    this.publish({
      phase: "searching",
      autoFollow: armed,
      update: null,
      progress: emptyProgress(),
      error: null,
      sweep: null,
    });
    try {
      if (!this.manifest || this.manifest.selection !== this.state.selection)
        throw new Error("モデルを再読込してください。");
      const position = this.state.snapshot;
      const historyIdentity = positionHistoryIdentity(position);
      this.searchPositionIdentity = historyIdentity;
      const request = await analysisRequest(
        position,
        this.manifest,
        profile,
        multiPv,
      );
      // The hashing await can outlive a supersede; a dead search must not
      // re-stamp the display's options identity over the newer search's.
      if (!this.searchCurrent(generation)) return;
      this.lastOptionsHash = request.searchOptionsHash;
      const cached = await this.store.get(request, historyIdentity);
      if (!this.searchCurrent(generation)) return;
      if (cached !== null) {
        this.storeResult(request, cached.update, historyIdentity);
        this.publishResultIfDisplayed(cached.update, historyIdentity);
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
      this.timer = setTimeout(() => this.deadlineReached(), budget + 250);
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
            this.storeResult(request, update, historyIdentity);
            this.publishResultIfDisplayed(update, historyIdentity);
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
    // The sweep is its own activity: navigation during it must not restart
    // it, and an armed position-analysis intent does not survive it.
    this.autoFollowOptions = null;
    const generation = ++this.searchGeneration;
    this.searchRunning = true;
    this.searchKind = "sweep";
    this.searchClient?.dispose();
    const client = this.makeClient();
    this.searchClient = client;
    this.publish({
      phase: "searching",
      autoFollow: false,
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
        const historyIdentity = positionHistoryIdentity(position);
        if (!this.searchCurrent(generation)) return;
        this.lastOptionsHash = request.searchOptionsHash;
        const cached = await this.store.get(request, historyIdentity);
        if (!this.searchCurrent(generation)) return;
        if (cached !== null) {
          this.storeResult(request, cached.update, historyIdentity);
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
              if (update.depth > 0)
                this.storeResult(request, update, historyIdentity);
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
        // The displayed position may share the ply's SFEN through a different
        // branch; only the same full history may take over the score panel.
        if (
          this.state.snapshot !== null &&
          positionHistoryIdentity(this.state.snapshot) === historyIdentity
        )
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

  /**
   * Explicit stop. It ends the running search if any and always disarms the
   * auto-follow intent: after Stop, moving pieces, changing settings,
   * switching models or loading records stays stopped until Start is pressed
   * again.
   */
  stop(clear = false): void {
    this.autoFollowOptions = null;
    if (this.searchRunning) {
      // Invalidate the running search silently: the search loop observes the
      // generation bump and returns without publishing an error.
      this.searchGeneration++;
      this.endSearch();
    }
    this.publish({
      phase: "stopped",
      sweep: null,
      autoFollow: false,
      ...(clear ? { update: null, progress: emptyProgress() } : {}),
    });
  }

  /**
   * Applies changed analysis settings. With auto-follow armed, the displayed
   * position restarts cleanly under the new options; otherwise this keeps the
   * previous behavior of stopping the current analysis.
   */
  applyAnalysisOptions(
    profile: SearchProfile,
    budgetMs: number,
    multiPv: number,
  ): void {
    if (this.autoFollowOptions === null) {
      this.stop(true);
      return;
    }
    this.autoFollowOptions = { profile, budgetMs, multiPv };
    this.supersedeSearch();
    void this.analyze(profile, budgetMs, multiPv, "position");
  }

  dispose(): void {
    this.disposed = true;
    // A record load that resumes after this point must not publish into a
    // disposed session, even one recreated for a fresh mount.
    this.loadSequence++;
    this.invalidate();
  }

  /**
   * Starts the armed bounded analysis for the currently displayed position,
   * if one is due. Called after navigation and model switches; never plays a
   * move. A running search for another position is superseded synchronously,
   * so rapid navigation leaves exactly one live search client.
   */
  private autoAnalyzeCurrent(): void {
    const options = this.autoFollowOptions;
    const position = this.state.snapshot;
    if (options === null || this.disposed || position === null) return;
    if (position.terminal !== null) return;
    if (this.searchRunning) {
      // A sweep advances plies on its own; navigation must never kill it or
      // race it with a position search.
      if (this.searchKind === "sweep") return;
      // The displayed position is already being analyzed. History counts:
      // the same final SFEN reached through a different line is a different
      // search context and supersedes.
      if (this.searchPositionIdentity === positionHistoryIdentity(position))
        return;
      this.supersedeSearch();
    }
    // While a sync is flying, the on-display snapshot may still be the
    // previous cursor's position; analyzing it again would only be
    // superseded. The sync completion re-runs this for the true target.
    if (this.navSyncing && this.displayedCursor !== this.state.cursor) return;
    // Start only from a display state a search can own: a loading model has
    // its own completion trigger, and an error waits for the user to retry.
    if (this.state.phase !== "ready" && this.state.phase !== "searching")
      return;
    void this.analyze(options.profile, options.budgetMs, options.multiPv);
  }

  /** Synchronously kills the running search so a newer one can start. */
  private supersedeSearch(): void {
    if (!this.searchRunning) return;
    this.searchGeneration++;
    this.endSearch();
  }

  /**
   * Publishes a finished result only when it belongs to the currently
   * displayed position: same canonical SFEN *and* the same move history —
   * two histories can share a final SFEN and must not trade results.
   * A result for a superseded position stays in the store (lookupUpdate
   * shows it when that exact position returns) but can never appear as the
   * displayed position's score.
   */
  private publishResultIfDisplayed(
    update: AnalysisUpdate,
    historyIdentity: string,
  ): void {
    if (update.canonicalPosition !== this.state.snapshot?.sfen) return;
    if (historyIdentity !== positionHistoryIdentity(this.state.snapshot!))
      return;
    this.publish({ update, graph: this.deriveGraph() });
  }

  /**
   * Per-position budget watchdog. Ends only this position's search; the
   * auto-follow intent stays armed for the next position, exactly like the
   * normal bounded completion path.
   */
  private deadlineReached(): void {
    if (!this.searchRunning) return;
    this.searchGeneration++;
    this.endSearch();
    this.publish({ phase: "ready" });
  }

  private endSearch(): void {
    this.searchRunning = false;
    this.searchPositionIdentity = null;
    this.searchKind = null;
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
    this.navSyncing = false;
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
    for (const stored of this.results.get(positionHistoryIdentity(snapshot)) ??
      []) {
      if (
        stored.request.modelHash === snapshot.leafSha256 &&
        stored.request.searchOptionsHash === this.lastOptionsHash
      )
        return stored.update;
    }
    return null;
  }

  private storeResult(
    request: AnalysisStart,
    update: AnalysisUpdate,
    historyIdentity: string,
  ): void {
    const list = this.results.get(historyIdentity) ?? [];
    const index = list.findIndex(
      (stored) =>
        stored.request.modelHash === request.modelHash &&
        stored.request.searchOptionsHash === request.searchOptionsHash,
    );
    if (index >= 0) list[index] = { request, update };
    else list.push({ request, update });
    this.results.set(historyIdentity, list);
    if (this.results.size > 640) {
      const first = this.results.keys().next().value;
      if (first !== undefined) this.results.delete(first);
    }
    void this.store.put(request, update, historyIdentity);
  }

  private publishGraph(): void {
    this.publish({ graph: this.deriveGraph() });
  }
}
