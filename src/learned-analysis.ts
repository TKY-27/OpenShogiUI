import {
  ANALYSIS_SCHEMA,
  sha256Hex,
  type AnalysisStart,
  type AnalysisUpdate,
  type SearchProfile,
} from "./browser-engine";
import { updateMatchesRequest } from "./analysis-cache";
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
export interface LearnedAnalysisState {
  selection: PrototypeSelection;
  snapshot: PrototypeSnapshot | null;
  identity: RuntimeIdentity | null;
  phase: "loading" | "ready" | "searching" | "stopped" | "error";
  update: AnalysisUpdate | null;
  progress: AnalysisProgress;
  error: string | null;
}
export const initialAnalysisState = (): LearnedAnalysisState => ({
  selection: DEFAULT_SELECTION,
  snapshot: null,
  identity: null,
  phase: "loading",
  update: null,
  progress: emptyProgress(),
  error: null,
});
const hashText = (text: string) =>
  sha256Hex(new TextEncoder().encode(text).buffer);
export async function analysisRequest(
  snapshot: PrototypeSnapshot,
  manifest: PrototypeManifest,
  profile: SearchProfile,
  multiPv: number,
): Promise<AnalysisStart> {
  // UI cache namespaces bind the runtime bytes, not guessed engine feature-version numbers.
  const runtime = `${manifest.artifacts["engine.js"].sha256}:${manifest.artifacts["engine.wasm"].sha256}`;
  return {
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
  };
}
export class LearnedAnalysisSession {
  state = initialAnalysisState();
  private generation = 0;
  private client: PrototypeWorkerClient | null = null;
  private manifest: PrototypeManifest | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  constructor(
    private readonly onChange: (state: LearnedAnalysisState) => void,
    private readonly makeClient = () => new PrototypeWorkerClient(),
    private readonly loadManifest = loadPrototypeManifest,
  ) {}
  async prepare(
    selection = this.state.selection,
    position: Pick<PrototypeSnapshot, "initialSfen" | "moves"> | null = this
      .state.snapshot,
  ): Promise<void> {
    const generation = this.invalidate();
    const abort = new AbortController();
    this.abort = abort;
    this.publish({
      selection,
      identity: null,
      phase: "loading",
      update: null,
      progress: emptyProgress(),
      error: null,
    });
    try {
      const manifest = await this.loadManifest(selection, abort.signal);
      if (!this.current(generation)) return;
      const client = this.makeClient();
      this.client = client;
      const ready = await client.initialize(manifest, false, position);
      if (!this.current(generation)) return;
      this.manifest = manifest;
      this.publish({
        phase: "ready",
        snapshot: ready.snapshot,
        identity: ready.identity,
      });
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
  async move(usi: string): Promise<void> {
    const position = this.state.snapshot;
    if (!position?.legalMoves.some((move) => move.usi === usi)) return;
    await this.prepare(this.state.selection, {
      initialSfen: position.initialSfen,
      moves: [...position.moves, usi],
    });
  }
  async analyze(
    profile: SearchProfile,
    budgetMs: number,
    multiPv: number,
  ): Promise<void> {
    if (
      this.state.phase === "searching" ||
      !this.state.snapshot ||
      ![250, 1000, 3000].includes(budgetMs) ||
      ![1, 3].includes(multiPv)
    )
      return;
    const generation = this.invalidate();
    this.publish({
      phase: "searching",
      update: null,
      progress: emptyProgress(),
      error: null,
    });
    try {
      if (!this.manifest || this.manifest.selection !== this.state.selection)
        throw new Error("モデルを再読込してください。");
      const position = this.state.snapshot!;
      const client = this.makeClient();
      this.client = client;
      // Fresh Worker/TT for each bounded analysis; no match clock or automatic move.
      const ready = await client.initialize(this.manifest, false, position);
      if (!this.current(generation)) return;
      if (
        ready.snapshot.sfen !== position.sfen ||
        ready.identity.leafSha256 !== position.leafSha256
      )
        throw new Error("解析局面が一致しません。");
      const request = await analysisRequest(
        position,
        this.manifest,
        profile,
        multiPv,
      );
      if (!this.current(generation)) return;
      await client.analysisStart(request, profile);
      if (!this.current(generation)) return;
      const started = performance.now();
      this.timer = setTimeout(() => this.stop(), budgetMs + 250);
      do {
        const response = await client.analysisStep({
          schema: ANALYSIS_SCHEMA,
          nodes: analysisSliceNodes(profile),
          maxDepth: profile === "quality" ? 9 : 7,
          timestampMs: Date.now(),
        });
        if (!this.current(generation)) return;
        for (const update of response.updates) {
          if (
            !updateMatchesRequest(update, request) ||
            update.lines.some(
              (line) =>
                !position.legalMoves.some((move) => move.usi === line.pv[0]),
            )
          )
            throw new Error("解析応答の局面・モデルが一致しません。");
          if (update.depth > 0) this.publish({ update });
        }
        this.publish({
          progress: accumulateSlice(this.state.progress, response.slice),
        });
        if (response.slice?.termination === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 16));
      } while (
        this.current(generation) &&
        performance.now() - started < budgetMs
      );
      if (!this.current(generation)) return;
      await client.analysisStop();
      if (!this.current(generation)) return;
      this.invalidate();
      this.publish({ phase: "ready" });
    } catch (error) {
      if (this.current(generation)) {
        this.invalidate();
        this.publish({
          phase: "error",
          error:
            error instanceof Error ? error.message : "解析できませんでした。",
        });
      }
    }
  }
  stop(clear = false): void {
    this.invalidate();
    this.publish({
      phase: "stopped",
      ...(clear ? { update: null, progress: emptyProgress() } : {}),
    });
  }
  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
  private invalidate(): number {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.client?.dispose();
    this.client = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    return this.generation;
  }
  private current(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }
  private publish(patch: Partial<LearnedAnalysisState>): void {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.onChange(this.state);
  }
}
