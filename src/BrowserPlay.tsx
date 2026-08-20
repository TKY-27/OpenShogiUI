import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnalysisSummaryStore, updateMatchesRequest } from "./analysis-cache";
import {
  ANALYSIS_SCHEMA,
  MAX_BROWSER_MODEL_BYTES,
  MAX_BROWSER_OPENING_BOOK_BYTES,
  type AnalysisStart,
  type AnalysisUpdate,
  type BrowserSnapshot,
  type EvaluatorChoice,
  type HandEntry,
  type HandPieceKind,
  type ModelSummary,
  type MoveSummary,
  type OpeningBookSummary,
  type OpeningProfile,
  type PieceKind,
  recommendedSearchProfile,
  type SearchProfile,
  type SearchResponse,
  sha256Hex,
  type Side,
} from "./browser-engine";
import { type EngineReadyState, WasmEngineAdapter } from "./engine-adapter";
import type { RestorableModel, RestorableOpeningBook } from "./engine-client";
import { getMessages, type Locale, type Messages } from "./localization";
import {
  PIECE_ASSET_CATALOG,
  pieceAssetPath,
  pieceAssetSet,
  type PieceSetId,
} from "./pieces/catalog";
import {
  type BoardOrientation,
  browserProfileHashMegabytes,
  browserProfileNodeLimit,
  consumeMatchClock,
  DEFAULT_TIME_CONTROL,
  flippedOrientation,
  humanControlsSide,
  initialMatchClock,
  lastMoveHighlight,
  matchClockExpired,
  type MoveHighlight,
  type MatchClock,
  parseUsiMoveShape,
  resourceBudget,
  serializeTimeControl,
  takeOverSide,
  type HumanRole,
  type TimeControlSettings,
} from "./play-settings";

export const BOARD_FILE_LABELS = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
export const BOARD_RANK_LABELS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
] as const;

const PIECE_GLYPHS: Record<PieceKind, string> = {
  pawn: "歩",
  lance: "香",
  knight: "桂",
  silver: "銀",
  gold: "金",
  bishop: "角",
  rook: "飛",
  king: "玉",
  "promoted-pawn": "と",
  "promoted-lance": "杏",
  "promoted-knight": "圭",
  "promoted-silver": "全",
  horse: "馬",
  dragon: "龍",
};

export function pieceFallbackGlyph(kind: PieceKind, side: Side): string {
  return kind === "king" && side === "white" ? "王" : PIECE_GLYPHS[kind];
}

export type DisplayMode = "match" | "analysis";
type BusyState = "initializing" | "moving" | "engine" | "model" | "book";
type AnalysisStatus =
  | "idle"
  | "cached"
  | "live"
  | "stopped"
  | "invalidated"
  | "restarting";
export type BoardSelection =
  | { kind: "board"; index: number }
  | { kind: "hand"; piece: HandPieceKind }
  | null;

interface AnalysisView {
  status: AnalysisStatus;
  update: AnalysisUpdate | null;
  elapsedNs: number | null;
}

interface MoveSource {
  response: SearchResponse;
  openingProfile: OpeningProfile;
}

interface AdapterPair {
  play: WasmEngineAdapter;
  analysis: WasmEngineAdapter;
}

const analysisStore = new AnalysisSummaryStore();

function text(locale: Locale) {
  const ja = locale === "ja";
  return {
    history: ja ? "棋譜" : "Move history",
    initial: ja ? "開始局面" : "Initial position",
    current: ja ? "現在局面へ" : "Return to live game",
    first: ja ? "最初" : "First",
    previous: ja ? "前" : "Previous",
    next: ja ? "次" : "Next",
    last: ja ? "最後" : "Last",
    historical: ja ? "過去局面" : "Historical position",
    liveGame: ja ? "対局中の現在局面" : "Live game position",
    realtime: ja ? "リアルタイム解析" : "Real-time analysis",
    liveAnalysis: ja ? "ライブ解析" : "Live analysis",
    cached: ja ? "キャッシュ済み" : "Cached result",
    stopped: ja ? "停止済み解析" : "Stopped analysis",
    invalidated: ja ? "無効化された結果" : "Invalidated result",
    restarting: ja ? "解析ワーカーを再起動中" : "Restarting analysis worker",
    source: ja ? "探索ソース" : "Source",
    search: ja ? "探索" : "Search",
    book: "定跡",
    seldepth: ja ? "選択的深さ" : "Selective depth",
    nps: "NPS",
    elapsed: ja ? "経過時間" : "Elapsed",
    evaluation: ja ? "評価値" : "Evaluation",
    mate: ja ? "詰み" : "Mate",
    bestMove: ja ? "現在の最善手" : "Current best move",
    modelProfile: ja ? "モデル / プロファイル" : "Model / profile",
    settings: ja ? "設定" : "Settings",
    humanRole: ja ? "人間の役割" : "Human role",
    sente: ja ? "先手" : "Sente",
    gote: ja ? "後手" : "Gote",
    aiVsAi: ja ? "AI同士" : "AI vs AI",
    analysisOnly: ja ? "解析のみ" : "Analysis only",
    orientation: ja ? "盤面の向き" : "Board orientation",
    senteBottom: ja ? "先手が下" : "Sente at bottom",
    goteBottom: ja ? "後手が下" : "Gote at bottom",
    flip: ja ? "反転" : "Flip board",
    takeover: ja ? "この手番を引き継ぐ" : "Take over this side",
    takeoverHint: ja
      ? "手番やSFEN、棋譜は変更しません。"
      : "Does not change side to move, SFEN, or history.",
    timeControl: ja ? "時間設定" : "Time control",
    casual: ja ? "カジュアル（自動・最大20秒）" : "Casual (adaptive, 20s cap)",
    fixed: ja ? "1手固定" : "Fixed per move",
    clock: ja ? "持ち時間" : "Match clock",
    nodes: ja ? "ノード指定" : "Node limit",
    configuredMaximum: ja ? "設定上限" : "Configured maximum",
    actualThinking: ja ? "実消費思考時間" : "Actual thinking time",
    timeLocked: ja
      ? "時間設定は棋譜と時計の整合性を保つため、対局開始後は固定されます。"
      : "Time settings lock after the first move to preserve clock history.",
    mainMinutes: ja ? "持ち時間（分）" : "Main time (minutes)",
    byoyomi: ja ? "秒読み（秒）" : "Byoyomi (seconds)",
    increment: ja ? "加算（秒）" : "Increment (seconds)",
    advanced: ja ? "詳細設定" : "Advanced",
    threads: ja ? "スレッド" : "Threads",
    hash: ja ? "ハッシュ (MB)" : "Hash (MB)",
    analysisHash: ja ? "解析ハッシュ (MB)" : "Analysis hash (MB)",
    hashManaged: ja
      ? "Hash は Wasm 探索プロファイルで固定されます。"
      : "Hash is fixed by the Wasm search profile.",
    pauseAnalysis: ja
      ? "AI思考中は解析を一時停止"
      : "Pause analysis during AI turn",
    openingProfile: ja ? "オープニングプロファイル" : "Opening profile",
    ibishaStrict: ja ? "居飛車厳格" : "Ibisya strict",
    ibishaPreferred: ja ? "居飛車優先" : "Ibisya preferred",
    unrestricted: ja ? "無制限" : "Unrestricted",
    openingHint: ja
      ? "居飛車プロファイルは定跡選択方針で、合法手を制限しません。"
      : "Ibisya profiles affect book selection, never legal moves.",
    chooseBook: ja ? "定跡ファイルを選択" : "Choose opening book",
    removeBook: ja ? "定跡を外す" : "Remove book",
    bookNotLoaded: ja ? "定跡未読込" : "No book loaded",
    pieceSet: ja ? "駒のデザイン" : "Piece set",
    pieceCredits: ja ? "駒のクレジット" : "Piece Credits",
    close: ja ? "閉じる" : "Close",
    newGame: ja ? "新しい対局" : "New game",
    stopAi: ja ? "AI対局を停止" : "Stop AI play",
    analysisUnavailable: ja ? "解析結果はまだありません" : "No analysis yet",
    workerReady: ja ? "準備完了" : "Ready",
    aiThinking: (side: Side) =>
      ja
        ? `${side === "black" ? "先手" : "後手"}AIが考えています…`
        : `${side === "black" ? "Sente" : "Gote"} AI is thinking…`,
    workerCrashed: ja ? "ワーカー障害" : "Worker failure",
    timeExpired: ja
      ? "持ち時間と秒読みを超過しました。対局を停止しました。"
      : "Main time and byoyomi expired. Play has been stopped.",
  };
}

function numberLocale(locale: Locale): string {
  return locale === "ja" ? "ja-JP" : "en-US";
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(value);
}

function formatScore(score: number): string {
  if (score === 0) return "±0";
  return score > 0 ? `+${score}` : String(score);
}

function formatSecondsFromNs(nanoseconds: number): string {
  return `${(nanoseconds / 1_000_000_000).toFixed(2)}s`;
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function configuredMaximum(settings: TimeControlSettings): string {
  switch (settings.mode) {
    case "casual":
      return "20s";
    case "fixed":
      return `${settings.fixedSeconds}s`;
    case "clock":
      return `${settings.mainMinutes}m + ${settings.byoyomiSeconds}s +${settings.incrementSeconds}s`;
    case "nodes":
      return `${settings.nodes.toLocaleString()} nodes`;
  }
}

function boundedInputInteger(
  value: number,
  minimum: number,
  maximum: number,
): number | null {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function selectedMoves(
  snapshot: BrowserSnapshot,
  selection: BoardSelection,
): MoveSummary[] {
  if (selection === null) return [];
  if (selection.kind === "hand") {
    return snapshot.legalMoves.filter(
      (movement) => movement.drop === selection.piece,
    );
  }
  const piece = snapshot.board[selection.index];
  if (piece === null) return [];
  return snapshot.legalMoves.filter(
    (movement) =>
      movement.from?.file === piece.square.file &&
      movement.from.rank === piece.square.rank,
  );
}

export function boardIndex(file: number, rank: number): number {
  return (rank - 1) * 9 + (9 - file);
}

export function isBoardOnlyMode(
  mode: DisplayMode,
  matchStarted: boolean,
): boolean {
  return mode === "match" && matchStarted;
}

function destinationIndex(movement: MoveSummary): number {
  return boardIndex(movement.to.file, movement.to.rank);
}

function deviceProfile(): SearchProfile {
  if (typeof navigator === "undefined") return "balanced";
  const extendedNavigator = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return recommendedSearchProfile({
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    deviceMemoryGiB: extendedNavigator.deviceMemory ?? null,
    reducedData: extendedNavigator.connection?.saveData ?? false,
  });
}

function persistedPieceSet(): PieceSetId {
  if (typeof localStorage === "undefined") return "kanji_brown";
  const value = localStorage.getItem("open-shogi-ui/piece-set");
  return PIECE_ASSET_CATALOG.some(({ id }) => id === value)
    ? (value as PieceSetId)
    : "kanji_brown";
}

function PieceView({
  kind,
  side,
  setId,
  flipped,
}: {
  kind: PieceKind;
  side: Side;
  setId: PieceSetId;
  flipped: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const glyph = pieceFallbackGlyph(kind, side);
  useEffect(() => setFailed(false), [kind, setId, side]);
  return (
    <span
      className={`piece-frame ${flipped ? "piece-frame--flipped" : ""}`}
      lang="ja"
    >
      {failed ? (
        <span className={`shogi-piece shogi-piece--${side}`}>{glyph}</span>
      ) : (
        <img
          alt={glyph}
          className="piece-image"
          draggable={false}
          height="96"
          onError={() => setFailed(true)}
          src={pieceAssetPath(setId, side, kind)}
          width="84"
        />
      )}
    </span>
  );
}

function squareIndex(square: { file: number; rank: number } | null): number {
  return square === null ? -1 : boardIndex(square.file, square.rank);
}

function HandStand({
  side,
  entries,
  selection,
  legalDrops,
  disabled,
  messages,
  orientation,
  pieceSet,
  onSelect,
}: {
  side: Side;
  entries: HandEntry[];
  selection: BoardSelection;
  legalDrops: ReadonlySet<HandPieceKind>;
  disabled: boolean;
  messages: Messages;
  orientation: BoardOrientation;
  pieceSet: PieceSetId;
  onSelect: (piece: HandPieceKind) => void;
}) {
  const pieces = entries.filter(({ count }) => count > 0);
  return (
    <section className={`hand-stand hand-stand--${side}`}>
      <h2>{messages.play.hand(side)}</h2>
      <div className="hand-stand__pieces">
        {pieces.length === 0 ? (
          <p>{messages.play.emptyHand}</p>
        ) : (
          pieces.map(({ piece, count }) => (
            <button
              aria-pressed={
                selection?.kind === "hand" && selection.piece === piece
              }
              className="hand-piece"
              disabled={disabled || !legalDrops.has(piece)}
              key={piece}
              onClick={() => onSelect(piece)}
              type="button"
            >
              <PieceView
                flipped={orientation === "gote-bottom"}
                kind={piece}
                setId={pieceSet}
                side={side}
              />
              <span aria-label={`${messages.play.pieceName[piece]} ${count}`}>
                ×{count}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

export function ShogiBoard({
  snapshot,
  selection,
  disabled,
  messages,
  orientation = "sente-bottom",
  lastMove = null,
  pv = [],
  pieceSet = "kanji_brown",
  onSquare,
}: {
  snapshot: BrowserSnapshot;
  selection: BoardSelection;
  disabled: boolean;
  messages: Messages;
  orientation?: BoardOrientation;
  lastMove?: MoveHighlight | null;
  pv?: string[];
  pieceSet?: PieceSetId;
  onSquare: (index: number) => void;
}) {
  const destinations = useMemo(
    () => new Set(selectedMoves(snapshot, selection).map(destinationIndex)),
    [selection, snapshot],
  );
  const pvSquares = useMemo(() => {
    const squares = new Set<number>();
    for (const movement of pv.slice(0, 8)) {
      const parsed = parseUsiMoveShape(movement);
      if (parsed.from !== null) squares.add(squareIndex(parsed.from));
      squares.add(squareIndex(parsed.to));
    }
    return squares;
  }, [pv]);
  const order = Array.from({ length: 81 }, (_, index) =>
    orientation === "sente-bottom" ? index : 80 - index,
  );
  const fileLabels =
    orientation === "sente-bottom"
      ? BOARD_FILE_LABELS
      : [...BOARD_FILE_LABELS].reverse();
  const rankLabels =
    orientation === "sente-bottom"
      ? BOARD_RANK_LABELS
      : [...BOARD_RANK_LABELS].reverse();
  const lastFrom = squareIndex(lastMove?.from ?? null);
  const lastTo = squareIndex(lastMove?.to ?? null);
  const checkedKing =
    snapshot.terminal?.kind === "checkmate"
      ? snapshot.board.findIndex(
          (piece) =>
            piece?.kind === "king" && piece.side === snapshot.sideToMove,
        )
      : -1;

  return (
    <div className="board-coordinate-grid">
      <div aria-hidden="true" className="file-coordinates">
        {fileLabels.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      <div aria-label={messages.play.title} className="shogi-board" role="grid">
        {Array.from({ length: 9 }, (_, visualRank) => (
          <div className="board-row" key={rankLabels[visualRank]} role="row">
            {order.slice(visualRank * 9, visualRank * 9 + 9).map((index) => {
              const piece = snapshot.board[index];
              const file = piece?.square.file ?? 9 - (index % 9);
              const rankNumber =
                piece?.square.rank ?? Math.floor(index / 9) + 1;
              const rank = BOARD_RANK_LABELS[rankNumber - 1];
              const isSelected =
                selection?.kind === "board" && selection.index === index;
              const isDestination = destinations.has(index);
              const states = [
                isSelected ? messages.play.selected : null,
                isDestination ? messages.play.legalDestination : null,
                index === lastFrom ? "last move origin" : null,
                index === lastTo ? "last move destination" : null,
                index === checkedKing ? "checked king" : null,
                pvSquares.has(index) ? "analysis PV preview" : null,
              ].filter(Boolean);
              const pieceLabel =
                piece === null
                  ? ""
                  : `${piece.side === "black" ? messages.play.black : messages.play.white}${messages.play.pieceName[piece.kind]}`;
              const classes = [
                "board-square",
                isSelected && "board-square--selected",
                isDestination && "board-square--destination",
                index === lastFrom && "board-square--last-origin",
                index === lastTo && "board-square--last-destination",
                index === lastTo && lastMove?.drop && "board-square--last-drop",
                index === lastTo &&
                  lastMove?.capture &&
                  "board-square--last-capture",
                (index === lastFrom || index === lastTo) &&
                  lastMove?.promotion &&
                  "board-square--last-promotion",
                index === checkedKing && "board-square--checked-king",
                pvSquares.has(index) && "board-square--pv",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  aria-label={[
                    messages.play.squareLabel(file, rank),
                    pieceLabel,
                    states.join(", "),
                  ]
                    .filter(Boolean)
                    .join("、")}
                  aria-selected={isSelected}
                  className={classes}
                  data-file={file}
                  data-kind={piece?.kind}
                  data-rank={rankNumber}
                  data-side={piece?.side}
                  disabled={disabled}
                  key={index}
                  onClick={() => onSquare(index)}
                  role="gridcell"
                  type="button"
                >
                  {piece === null ? null : (
                    <PieceView
                      flipped={orientation === "gote-bottom"}
                      kind={piece.kind}
                      setId={pieceSet}
                      side={piece.side}
                    />
                  )}
                  {isDestination ? (
                    <span aria-hidden="true" className="destination-mark" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="rank-coordinates">
        {rankLabels.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  disabled = false,
  onSelect,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <fieldset className="segmented-control">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            disabled={disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AnalysisPanel({
  locale,
  enabled,
  view,
  profile,
  evaluator,
  lastSearch,
  onToggle,
  children,
}: {
  locale: Locale;
  enabled: boolean;
  view: AnalysisView;
  profile: SearchProfile;
  evaluator: EvaluatorChoice;
  lastSearch: MoveSource | null;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
}) {
  const labels = text(locale);
  const update = view.update;
  const search = lastSearch?.response ?? null;
  const statusLabel =
    view.status === "live"
      ? labels.liveAnalysis
      : view.status === "cached"
        ? labels.cached
        : view.status === "invalidated"
          ? labels.invalidated
          : view.status === "restarting"
            ? labels.restarting
            : view.status === "stopped"
              ? labels.stopped
              : labels.analysisUnavailable;
  const elapsed =
    view.elapsedNs === null ? null : view.elapsedNs / 1_000_000_000;
  return (
    <aside className="analysis-panel" aria-label={labels.realtime}>
      <section className="analysis-results" aria-labelledby="analysis-title">
        <div className="analysis-results__heading">
          <div>
            <h2 id="analysis-title">{labels.realtime}</h2>
            <p className={`analysis-state analysis-state--${view.status}`}>
              {statusLabel}
            </p>
          </div>
          <label className="toggle-control">
            <input
              aria-label={labels.realtime}
              checked={enabled}
              onChange={(event) => onToggle(event.currentTarget.checked)}
              type="checkbox"
            />
            <span aria-hidden="true" />
          </label>
        </div>
        {update === null ? (
          <p className="analysis-empty">{labels.analysisUnavailable}</p>
        ) : (
          <>
            <dl className="analysis-metrics">
              <Metric label={getMessages(locale).play.depth}>
                {update.depth}
              </Metric>
              <Metric label={labels.seldepth}>—</Metric>
              <Metric label={getMessages(locale).play.nodes}>
                {formatNumber(update.nodes, locale)}
              </Metric>
              <Metric label={labels.nps}>
                {formatNumber(update.nps, locale)}
              </Metric>
              <Metric label={labels.elapsed}>
                {elapsed === null ? "—" : `${elapsed.toFixed(2)}s`}
              </Metric>
              <Metric label={labels.evaluation}>
                {formatScore(update.score)}
              </Metric>
              <Metric label={labels.mate}>{update.mateScore ?? "—"}</Metric>
              <Metric label={labels.bestMove}>
                {update.lines[0]?.pv[0] ?? "—"}
              </Metric>
              <Metric label={labels.modelProfile}>
                {evaluator} / {profile}
              </Metric>
              <Metric label={labels.source}>{labels.search}</Metric>
            </dl>
            <ol className="analysis-lines">
              {update.lines.map((line) => (
                <li key={line.rank}>
                  <div className="analysis-line__score">
                    <span>#{line.rank}</span>
                    <strong>
                      {line.mateScore === null
                        ? formatScore(line.score)
                        : `${labels.mate} ${line.mateScore}`}
                    </strong>
                  </div>
                  <p className="analysis-line__pv">{line.pv.join(" ")}</p>
                  <small>
                    d{line.depth} · {formatNumber(line.nodes, locale)} nodes
                  </small>
                </li>
              ))}
            </ol>
          </>
        )}
        {search === null ? null : (
          <div
            className={`last-search-source last-search-source--${search.source}`}
          >
            <strong>
              {search.source === "book" ? labels.book : labels.search}
            </strong>
            <span>{search.bestMove ?? "—"}</span>
            {search.source === "book" ? (
              <small>
                {search.openingBookMove?.openingClassification} ·{" "}
                {lastSearch?.openingProfile ?? "—"}
              </small>
            ) : (
              <small>
                d{search.depth} · {formatNumber(search.nodes, locale)} nodes
              </small>
            )}
          </div>
        )}
      </section>
      {children}
    </aside>
  );
}

function MoveHistory({
  locale,
  snapshots,
  displayedIndex,
  moveSources,
  onSelect,
}: {
  locale: Locale;
  snapshots: BrowserSnapshot[];
  displayedIndex: number;
  moveSources: Array<MoveSource | null>;
  onSelect: (index: number) => void;
}) {
  const labels = text(locale);
  return (
    <aside className="history-rail" aria-label={labels.history}>
      <div className="rail-heading">
        <h2>{labels.history}</h2>
        <span>
          {displayedIndex === snapshots.length - 1
            ? labels.liveGame
            : labels.historical}
        </span>
      </div>
      <ol className="move-list">
        {snapshots.map((snapshot, index) => {
          const movement = index === 0 ? labels.initial : snapshot.moves.at(-1);
          return (
            <li key={`${index}-${movement}`}>
              <button
                aria-current={index === displayedIndex ? "step" : undefined}
                onClick={() => onSelect(index)}
                type="button"
              >
                <span>{index === 0 ? "#" : index}</span>
                <strong>{movement}</strong>
                {moveSources[index]?.response.source === "book" ? (
                  <em>{labels.book}</em>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="history-controls">
        <button
          aria-label={labels.first}
          disabled={displayedIndex === 0}
          onClick={() => onSelect(0)}
          type="button"
        >
          |◀
        </button>
        <button
          aria-label={labels.previous}
          disabled={displayedIndex === 0}
          onClick={() => onSelect(displayedIndex - 1)}
          type="button"
        >
          ◀
        </button>
        <button
          aria-label={labels.next}
          disabled={displayedIndex === snapshots.length - 1}
          onClick={() => onSelect(displayedIndex + 1)}
          type="button"
        >
          ▶
        </button>
        <button
          aria-label={labels.last}
          disabled={displayedIndex === snapshots.length - 1}
          onClick={() => onSelect(snapshots.length - 1)}
          type="button"
        >
          ▶|
        </button>
        <button
          disabled={displayedIndex === snapshots.length - 1}
          onClick={() => onSelect(snapshots.length - 1)}
          type="button"
        >
          {labels.current}
        </button>
      </div>
    </aside>
  );
}

function CreditsDialog({
  locale,
  onClose,
}: {
  locale: Locale;
  onClose: () => void;
}) {
  const labels = text(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby="piece-credits-title"
      aria-modal="true"
      className="credits-dialog"
      onCancel={onClose}
      onClose={onClose}
      ref={dialogRef}
    >
      <div>
        <header>
          <h2 id="piece-credits-title">{labels.pieceCredits}</h2>
          <button onClick={() => dialogRef.current?.close()} type="button">
            {labels.close}
          </button>
        </header>
        <p>
          Artwork from WandererXII/lishogi, commit
          acb3b12286dd41bc88edfa81172e6a5e7f68c52b. CC BY 4.0. Files are
          unmodified. No endorsement is implied.
        </p>
        <ul>
          {PIECE_ASSET_CATALOG.map((set) => (
            <li key={set.id}>
              <strong>{set.label}</strong>
              <span>
                {set.creators.join(", ")} · {set.license}
              </span>
            </li>
          ))}
        </ul>
        <p>
          <a
            href="https://github.com/WandererXII/lishogi/tree/acb3b12286dd41bc88edfa81172e6a5e7f68c52b/ui/%40build/pieces/assets/standard"
            rel="external"
          >
            Pinned source
          </a>
          {" · "}
          <a href="/licenses/lishogi-COPYING.md" rel="license">
            Upstream COPYING.md
          </a>
          {" · "}
          <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">
            CC BY 4.0
          </a>
        </p>
      </div>
    </dialog>
  );
}

async function sha256Text(value: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(value).buffer);
}

export async function buildAnalysisStart(
  snapshot: BrowserSnapshot,
  profile: SearchProfile,
  evaluator: EvaluatorChoice,
  model: ModelSummary | null,
  openingProfile: OpeningProfile,
  multiPv: number,
  playHashMegabytes: number,
  analysisHashMegabytes: number,
): Promise<AnalysisStart> {
  return {
    schema: ANALYSIS_SCHEMA,
    positionSfen: snapshot.sfen,
    modelHash:
      model?.artifactSha256 ??
      (await sha256Text("open-shogi-overall-champion/v1")),
    evaluatorConfigHash: await sha256Text(`evaluator:${evaluator}`),
    featureSchemaHash: await sha256Text(
      model === null
        ? "open-shogi-handcrafted-features/v1"
        : `osaval-feature-schema/${model.featureSchemaVersion}`,
    ),
    evaluationSemanticsHash: await sha256Text(
      `open-shogi-evaluation-semantics/v1:${evaluator}`,
    ),
    searchOptionsHash: await sha256Text(
      JSON.stringify({ profile, playHashMegabytes, analysisHashMegabytes }),
    ),
    openingProfileHash: await sha256Text(`opening-profile:${openingProfile}`),
    multiPv,
  };
}

export function BrowserPlay({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const labels = text(locale);
  const errorMessageRef = useRef(messages.play.error);
  const workerCrashedMessageRef = useRef(labels.workerCrashed);
  errorMessageRef.current = messages.play.error;
  workerCrashedMessageRef.current = labels.workerCrashed;
  const adaptersRef = useRef<AdapterPair | null>(null);
  const operationRef = useRef(0);
  const analysisRequestRef = useRef(0);
  const aiRequestRef = useRef(false);
  const turnStartedAtRef = useRef(Date.now());
  const promotionDialogRef = useRef<HTMLDialogElement | null>(null);
  const promotionFocusRef = useRef<HTMLElement | null>(null);
  const [history, setHistory] = useState<BrowserSnapshot[]>([]);
  const [moveSources, setMoveSources] = useState<Array<MoveSource | null>>([]);
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [busy, setBusy] = useState<BusyState | null>("initializing");
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [promotionMoves, setPromotionMoves] = useState<MoveSummary[] | null>(
    null,
  );
  const [profile, setProfile] = useState<SearchProfile>(deviceProfile);
  const [multiPv, setMultiPv] = useState(3);
  const [evaluator, setEvaluator] =
    useState<EvaluatorChoice>("overall-champion");
  const [humanRole, setHumanRole] = useState<HumanRole>("sente");
  const [orientation, setOrientation] =
    useState<BoardOrientation>("sente-bottom");
  const [timeSettings, setTimeSettings] = useState<TimeControlSettings>({
    ...DEFAULT_TIME_CONTROL,
    nodes: browserProfileNodeLimit(profile),
  });
  const [matchClock, setMatchClock] = useState<MatchClock>(() =>
    initialMatchClock(DEFAULT_TIME_CONTROL),
  );
  const [clockHistory, setClockHistory] = useState<MatchClock[]>(() => [
    initialMatchClock(DEFAULT_TIME_CONTROL),
  ]);
  const [openingProfile, setOpeningProfile] =
    useState<OpeningProfile>("ibisha_strict");
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [analysisView, setAnalysisView] = useState<AnalysisView>({
    status: "idle",
    update: null,
    elapsedNs: null,
  });
  const [analysisEpoch, setAnalysisEpoch] = useState(0);
  const [playThinking, setPlayThinking] = useState(false);
  const [lastSearch, setLastSearch] = useState<MoveSource | null>(null);
  const [model, setModel] = useState<RestorableModel | null>(null);
  const [modelSummary, setModelSummary] = useState<ModelSummary | null>(null);
  const [modelFileName, setModelFileName] = useState<string | null>(null);
  const [openingBookSummary, setOpeningBookSummary] =
    useState<OpeningBookSummary | null>(null);
  const [openingBookFileName, setOpeningBookFileName] = useState<string | null>(
    null,
  );
  const [openingBook, setOpeningBook] = useState<RestorableOpeningBook | null>(
    null,
  );
  const [pieceSet, setPieceSet] = useState<PieceSetId>(persistedPieceSet);
  const [pieceCreditsOpen, setPieceCreditsOpen] = useState(false);
  const [pauseAnalysisDuringAiTurn, setPauseAnalysisDuringAiTurn] =
    useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [playWorkerState, setPlayWorkerState] =
    useState<EngineReadyState>("new");
  const [analysisWorkerState, setAnalysisWorkerState] =
    useState<EngineReadyState>("new");
  const appliedOpeningProfileRef = useRef<OpeningProfile | null>(null);

  const liveSnapshot = history.at(-1) ?? null;
  const displayedSnapshot = history[displayedIndex] ?? liveSnapshot;
  const isLivePosition = displayedIndex === history.length - 1;
  const currentMoveSource = moveSources[displayedIndex] ?? null;
  const displayedClock = clockHistory[displayedIndex] ?? matchClock;
  const playHash = browserProfileHashMegabytes(profile);
  const analysisHash = playHash;
  const timeLocked = history.length > 1;
  const budget = resourceBudget(
    playHash,
    analysisHash,
    pauseAnalysisDuringAiTurn,
    analysisEnabled,
  );

  useEffect(() => {
    const play = new WasmEngineAdapter("play", (state, message) => {
      setPlayWorkerState(state);
      if (state === "crashed")
        setNotice(message ?? workerCrashedMessageRef.current);
    });
    const analysis = new WasmEngineAdapter("analysis", (state, message) => {
      setAnalysisWorkerState(state);
      if (state === "crashed")
        setNotice(message ?? workerCrashedMessageRef.current);
    });
    adaptersRef.current = { play, analysis };
    let active = true;
    void Promise.all([play.initialize(), analysis.initialize()]).then(
      ([initial]) => {
        if (!active) return;
        setHistory([initial]);
        setMoveSources([null]);
        setClockHistory([initialMatchClock(DEFAULT_TIME_CONTROL)]);
        setDisplayedIndex(0);
        turnStartedAtRef.current = Date.now();
        setBusy(null);
      },
      (error: unknown) => {
        if (!active) return;
        setNotice(
          error instanceof Error ? error.message : errorMessageRef.current,
        );
        setBusy(null);
      },
    );
    return () => {
      active = false;
      analysisRequestRef.current += 1;
      adaptersRef.current = null;
      play.dispose();
      analysis.dispose();
    };
  }, []);

  useEffect(() => {
    if (typeof localStorage !== "undefined")
      localStorage.setItem("open-shogi-ui/piece-set", pieceSet);
  }, [pieceSet]);

  useEffect(() => {
    const dialog = promotionDialogRef.current;
    if (dialog === null) return;
    if (promotionMoves !== null && !dialog.open) dialog.showModal();
    if (promotionMoves === null && dialog.open) dialog.close();
  }, [promotionMoves]);

  useEffect(() => {
    if (timeLocked) return;
    const initial = initialMatchClock(timeSettings);
    setMatchClock(initial);
    setClockHistory((current) => current.map(() => initial));
    turnStartedAtRef.current = Date.now();
  }, [
    timeLocked,
    timeSettings.byoyomiSeconds,
    timeSettings.incrementSeconds,
    timeSettings.mainMinutes,
    timeSettings.mode,
  ]);

  useEffect(() => {
    const play = adaptersRef.current?.play;
    if (
      play === undefined ||
      play.readyState !== "ready" ||
      appliedOpeningProfileRef.current === openingProfile
    )
      return;
    const requestedProfile = openingProfile;
    void play
      .configureOpening(requestedProfile)
      .then(() => {
        if (adaptersRef.current?.play === play)
          appliedOpeningProfileRef.current = requestedProfile;
      })
      .catch((error: unknown) => {
        setNotice(
          error instanceof Error ? error.message : errorMessageRef.current,
        );
      });
  }, [openingProfile, playWorkerState]);

  useEffect(() => {
    const adapter = adaptersRef.current?.play;
    if (
      playWorkerState !== "crashed" ||
      adapter === undefined ||
      liveSnapshot === null
    )
      return;
    const operation = ++operationRef.current;
    setBusy("initializing");
    appliedOpeningProfileRef.current = null;
    void adapter
      .restart(
        { initialSfen: liveSnapshot.initialSfen, moves: liveSnapshot.moves },
        model,
        openingBook,
      )
      .then(async (restored) => {
        await adapter.configureOpening(openingProfile);
        appliedOpeningProfileRef.current = openingProfile;
        if (operationRef.current !== operation) return;
        setHistory((current) => [...current.slice(0, -1), restored]);
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (operationRef.current === operation) {
          setNotice(
            error instanceof Error ? error.message : errorMessageRef.current,
          );
        }
      })
      .finally(() => {
        if (operationRef.current === operation) setBusy(null);
      });
  }, [liveSnapshot, model, openingBook, openingProfile, playWorkerState]);

  useEffect(() => {
    if (displayedSnapshot === null) return;
    const adapter = adaptersRef.current?.analysis;
    if (adapter === undefined) return;
    const analysisAdapter = adapter;
    const requestId = ++analysisRequestRef.current;
    let cancelled = false;

    async function stopAndLabel() {
      try {
        if (
          analysisAdapter.readyState === "ready" ||
          analysisAdapter.readyState === "busy"
        )
          await analysisAdapter.analysisStop();
      } catch {
        // Stop before the first start is a harmless closed-protocol error.
      }
      if (!cancelled && analysisRequestRef.current === requestId) {
        setAnalysisView((current) => ({ ...current, status: "stopped" }));
      }
    }

    if (
      !analysisEnabled ||
      budget.analysisThreads === 0 ||
      (playThinking && budget.analysisPauseDuringAiTurn)
    ) {
      void stopAndLabel();
      return () => {
        cancelled = true;
      };
    }

    setAnalysisView((current) => ({
      status: current.update === null ? "idle" : "invalidated",
      update: current.update,
      elapsedNs: null,
    }));

    async function publish(
      update: AnalysisUpdate,
      request: AnalysisStart,
      status: AnalysisStatus,
      elapsedNs: number | null = null,
    ) {
      if (
        cancelled ||
        analysisRequestRef.current !== requestId ||
        !updateMatchesRequest(update, request)
      )
        return;
      setAnalysisView((current) => ({
        status,
        update,
        elapsedNs: elapsedNs ?? current.elapsedNs,
      }));
      await analysisStore.put(request, update);
    }

    async function startLoop() {
      const request = await buildAnalysisStart(
        displayedSnapshot,
        profile,
        evaluator,
        modelSummary,
        openingProfile,
        multiPv,
        playHash,
        analysisHash,
      );
      const persisted = await analysisStore.get(request);
      if (persisted !== null)
        await publish(persisted.update, request, "cached");
      if (cancelled || analysisRequestRef.current !== requestId) return;
      const started = await analysisAdapter.analysisStart(
        profile,
        evaluator,
        request,
      );
      for (const update of started.updates)
        await publish(
          update,
          request,
          update.source === "cache" ? "cached" : "live",
        );
      const sliceNodes =
        profile === "eco" ? 1_500 : profile === "balanced" ? 4_000 : 12_000;
      let elapsedNs = 0;
      while (!cancelled && analysisRequestRef.current === requestId) {
        const response = await analysisAdapter.analysisStep({
          schema: ANALYSIS_SCHEMA,
          nodes: sliceNodes,
          maxDepth: profile === "eco" ? 5 : profile === "balanced" ? 7 : 9,
          timestampMs: Date.now(),
        });
        elapsedNs += response.slice?.elapsedNs ?? 0;
        for (const update of response.updates)
          await publish(update, request, "live", elapsedNs);
        await new Promise((resolve) => window.setTimeout(resolve, 30));
      }
    }

    void startLoop().catch(async (error: unknown) => {
      if (cancelled || analysisRequestRef.current !== requestId) return;
      setAnalysisView((current) => ({ ...current, status: "restarting" }));
      if (analysisAdapter.readyState !== "crashed") {
        try {
          const failed = await analysisAdapter.analysisWorkerFailed();
          const restarted = await analysisAdapter.analysisRestart();
          const request = await buildAnalysisStart(
            displayedSnapshot,
            profile,
            evaluator,
            modelSummary,
            openingProfile,
            multiPv,
            playHash,
            analysisHash,
          );
          for (const update of [...failed.updates, ...restarted.updates])
            await publish(update, request, "cached");
          setNotice(null);
          setAnalysisEpoch((value) => value + 1);
          return;
        } catch {
          // A protocol-level recovery failure falls through to physical restart.
        }
      }
      try {
        await analysisAdapter.restart(
          {
            initialSfen: displayedSnapshot.initialSfen,
            moves: displayedSnapshot.moves,
          },
          model,
        );
        if (!cancelled && analysisRequestRef.current === requestId) {
          setNotice(null);
          setAnalysisEpoch((value) => value + 1);
        }
      } catch (restartError) {
        if (cancelled || analysisRequestRef.current !== requestId) return;
        setNotice(
          restartError instanceof Error
            ? restartError.message
            : error instanceof Error
              ? error.message
              : errorMessageRef.current,
        );
        setAnalysisView((current) => ({ ...current, status: "stopped" }));
      }
    });
    return () => {
      cancelled = true;
      void analysisAdapter.analysisStop().catch(() => undefined);
    };
  }, [
    analysisEnabled,
    analysisEpoch,
    analysisHash,
    budget.analysisPauseDuringAiTurn,
    budget.analysisThreads,
    displayedSnapshot,
    evaluator,
    model,
    modelSummary,
    multiPv,
    openingProfile,
    playHash,
    playThinking,
    profile,
  ]);

  useEffect(() => {
    const adapter = adaptersRef.current?.play;
    if (
      adapter === undefined ||
      adapter.readyState !== "ready" ||
      appliedOpeningProfileRef.current !== openingProfile ||
      liveSnapshot === null ||
      busy !== null ||
      aiRequestRef.current ||
      liveSnapshot.terminal !== null ||
      humanRole === "analysis-only" ||
      humanControlsSide(humanRole, liveSnapshot.sideToMove)
    )
      return;
    aiRequestRef.current = true;
    const operation = ++operationRef.current;
    setBusy("engine");
    setPlayThinking(true);
    void adapter
      .search(
        profile,
        evaluator,
        Math.min(multiPv, 3),
        serializeTimeControl(
          timeSettings,
          matchClock,
          browserProfileNodeLimit(profile),
        ),
      )
      .then(async (response) => {
        if (operationRef.current !== operation || response.bestMove === null)
          return;
        const updatedClock =
          timeSettings.mode === "clock"
            ? consumeMatchClock(
                matchClock,
                liveSnapshot.sideToMove,
                response.elapsedNs / 1_000_000,
                timeSettings.incrementSeconds,
              )
            : null;
        const source = { response, openingProfile } satisfies MoveSource;
        const next = await adapter.playMove(response.bestMove);
        if (operationRef.current !== operation) return;
        if (updatedClock !== null) setMatchClock(updatedClock);
        setLastSearch(source);
        setHistory((current) => [...current, next]);
        setMoveSources((current) => [...current, source]);
        setClockHistory((current) => [...current, updatedClock ?? matchClock]);
        setDisplayedIndex(next.moves.length);
        turnStartedAtRef.current = Date.now();
      })
      .catch((error: unknown) => {
        if (operationRef.current === operation)
          setNotice(
            error instanceof Error ? error.message : errorMessageRef.current,
          );
      })
      .finally(() => {
        if (operationRef.current === operation) setBusy(null);
        aiRequestRef.current = false;
        setPlayThinking(false);
      });
  }, [
    busy,
    evaluator,
    humanRole,
    liveSnapshot,
    matchClock,
    multiPv,
    openingProfile,
    playWorkerState,
    profile,
    timeSettings,
  ]);

  const legalSelectionMoves = useMemo(
    () =>
      displayedSnapshot === null
        ? []
        : selectedMoves(displayedSnapshot, selection),
    [displayedSnapshot, selection],
  );
  const legalDrops = useMemo(
    () =>
      new Set(
        displayedSnapshot?.legalMoves
          .map(({ drop }) => drop)
          .filter((piece): piece is HandPieceKind => piece !== null) ?? [],
      ),
    [displayedSnapshot],
  );
  const humanCanMove =
    displayedSnapshot !== null &&
    isLivePosition &&
    busy === null &&
    displayedSnapshot.terminal === null &&
    humanControlsSide(humanRole, displayedSnapshot.sideToMove);
  const lastMove = lastMoveHighlight(history, displayedIndex);
  const pv = analysisView.update?.lines[0]?.pv ?? [];

  function selectHistory(index: number) {
    setDisplayedIndex(Math.max(0, Math.min(index, history.length - 1)));
    setSelection(null);
    setPromotionMoves(null);
  }

  async function applyMove(movement: string) {
    const adapter = adaptersRef.current?.play;
    if (adapter === undefined || !humanCanMove) return;
    const movingSide = displayedSnapshot?.sideToMove ?? "black";
    const elapsedMs = Date.now() - turnStartedAtRef.current;
    if (
      timeSettings.mode === "clock" &&
      matchClockExpired(
        matchClock,
        movingSide,
        elapsedMs,
        timeSettings.byoyomiSeconds,
      )
    ) {
      setNotice(labels.timeExpired);
      setHumanRole("analysis-only");
      return;
    }
    const operation = ++operationRef.current;
    const updatedClock =
      timeSettings.mode === "clock"
        ? consumeMatchClock(
            matchClock,
            movingSide,
            elapsedMs,
            timeSettings.incrementSeconds,
          )
        : null;
    setBusy("moving");
    setSelection(null);
    setPromotionMoves(null);
    setNotice(null);
    try {
      const next = await adapter.playMove(movement);
      if (operationRef.current !== operation) return;
      if (updatedClock !== null) setMatchClock(updatedClock);
      setHistory((current) => [...current, next]);
      setMoveSources((current) => [...current, null]);
      setClockHistory((current) => [...current, updatedClock ?? matchClock]);
      setDisplayedIndex(next.moves.length);
      setLastSearch(null);
      turnStartedAtRef.current = Date.now();
    } catch (error) {
      if (operationRef.current === operation)
        setNotice(error instanceof Error ? error.message : messages.play.error);
    } finally {
      if (operationRef.current === operation) setBusy(null);
    }
  }

  function chooseMove(candidates: MoveSummary[]) {
    if (candidates.length === 1) void applyMove(candidates[0].usi);
    else if (candidates.length > 1) {
      promotionFocusRef.current =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setPromotionMoves(candidates);
    }
  }

  function selectSquare(index: number) {
    if (!humanCanMove || displayedSnapshot === null) return;
    const candidates = legalSelectionMoves.filter(
      (movement) => destinationIndex(movement) === index,
    );
    if (candidates.length > 0) return chooseMove(candidates);
    const piece = displayedSnapshot.board[index];
    if (piece?.side === displayedSnapshot.sideToMove) {
      const nextSelection: BoardSelection = { kind: "board", index };
      setSelection(
        selectedMoves(displayedSnapshot, nextSelection).length > 0
          ? nextSelection
          : null,
      );
    } else setSelection(null);
  }

  async function resetGame() {
    const adapter = adaptersRef.current?.play;
    if (adapter === undefined || busy !== null) return;
    setBusy("moving");
    setNotice(null);
    try {
      const snapshot = await adapter.reset();
      setHistory([snapshot]);
      setMoveSources([null]);
      setDisplayedIndex(0);
      setLastSearch(null);
      setSelection(null);
      const initial = initialMatchClock(timeSettings);
      setMatchClock(initial);
      setClockHistory([initial]);
      turnStartedAtRef.current = Date.now();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : messages.play.error);
    } finally {
      setBusy(null);
    }
  }

  async function loadModel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const adapters = adaptersRef.current;
    if (file === undefined || adapters === null || busy !== null) return;
    if (file.size === 0 || file.size > MAX_BROWSER_MODEL_BYTES) {
      setNotice(`OSAVAL model must be 1..${MAX_BROWSER_MODEL_BYTES} bytes`);
      return;
    }
    setBusy("model");
    try {
      const bytes = await file.arrayBuffer();
      const expectedArtifactSha256 = await sha256Hex(bytes);
      const restorable = { bytes, expectedArtifactSha256 };
      const [summary] = await Promise.all([
        adapters.play.loadModel(restorable),
        adapters.analysis.loadModel(restorable),
      ]);
      setModel(restorable);
      setModelSummary(summary);
      setModelFileName(file.name);
      setEvaluator("model");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : messages.play.error);
    } finally {
      setBusy(null);
    }
  }

  async function unloadModel() {
    const adapters = adaptersRef.current;
    if (adapters === null || busy !== null) return;
    setBusy("model");
    try {
      const [snapshot] = await Promise.all([
        adapters.play.unloadModel(),
        adapters.analysis.unloadModel(),
      ]);
      setHistory((current) => [...current.slice(0, -1), snapshot]);
      setModel(null);
      setModelSummary(null);
      setModelFileName(null);
      setEvaluator("overall-champion");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : messages.play.error);
    } finally {
      setBusy(null);
    }
  }

  async function loadOpeningBook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const adapter = adaptersRef.current?.play;
    if (file === undefined || adapter === undefined || busy !== null) return;
    if (file.size === 0 || file.size > MAX_BROWSER_OPENING_BOOK_BYTES) {
      setNotice(
        `Opening book must be 1..${MAX_BROWSER_OPENING_BOOK_BYTES} bytes`,
      );
      return;
    }
    setBusy("book");
    try {
      const bytes = await file.arrayBuffer();
      const expectedArtifactSha256 = await sha256Hex(bytes);
      const restorable = {
        bytes,
        expectedArtifactSha256,
      } satisfies RestorableOpeningBook;
      const summary = await adapter.loadOpeningBook(restorable);
      setOpeningBook(restorable);
      setOpeningBookSummary(summary);
      setOpeningBookFileName(file.name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : messages.play.error);
    } finally {
      setBusy(null);
    }
  }

  async function unloadOpeningBook() {
    const adapter = adaptersRef.current?.play;
    if (adapter === undefined || busy !== null) return;
    setBusy("book");
    try {
      const snapshot = await adapter.unloadOpeningBook();
      setHistory((current) => [...current.slice(0, -1), snapshot]);
      setOpeningBookSummary(null);
      setOpeningBookFileName(null);
      setOpeningBook(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : messages.play.error);
    } finally {
      setBusy(null);
    }
  }

  async function restartPlayAs(nextRole: HumanRole) {
    const adapter = adaptersRef.current?.play;
    setHumanRole(nextRole);
    if (adapter === undefined || liveSnapshot === null) return;
    const operation = ++operationRef.current;
    aiRequestRef.current = false;
    setPlayThinking(false);
    setBusy("initializing");
    appliedOpeningProfileRef.current = null;
    try {
      const restored = await adapter.restart(
        { initialSfen: liveSnapshot.initialSfen, moves: liveSnapshot.moves },
        model,
        openingBook,
      );
      await adapter.configureOpening(openingProfile);
      appliedOpeningProfileRef.current = openingProfile;
      if (operationRef.current !== operation) return;
      setHistory((current) => [...current.slice(0, -1), restored]);
      setNotice(null);
    } catch (error) {
      if (operationRef.current === operation) {
        setNotice(
          error instanceof Error ? error.message : errorMessageRef.current,
        );
      }
    } finally {
      if (operationRef.current === operation) setBusy(null);
    }
  }

  async function takeOverCurrentSide() {
    if (displayedSnapshot === null || !isLivePosition) return;
    const nextRole = takeOverSide(displayedSnapshot.sideToMove);
    if (busy === "engine") {
      await restartPlayAs(nextRole);
    } else if (busy === null) {
      setHumanRole(nextRole);
    }
  }

  const status =
    busy === "initializing"
      ? messages.play.initialization
      : busy === "engine"
        ? labels.aiThinking(liveSnapshot?.sideToMove ?? "white")
        : busy === "moving" || busy === "model" || busy === "book"
          ? messages.play.searching
          : labels.workerReady;

  return (
    <main className="analysis-workspace" aria-labelledby="browser-play-title">
      <header className="workspace-commandbar">
        <div>
          <h1 id="browser-play-title">{messages.play.title}</h1>
          <p aria-live="polite" role="status">
            {status} · play {playWorkerState} · analysis {analysisWorkerState}
          </p>
        </div>
        <div className="commandbar-actions">
          <button
            disabled={busy !== null}
            onClick={() => void resetGame()}
            type="button"
          >
            {labels.newGame}
          </button>
          {humanRole === "ai-vs-ai" ? (
            <button
              onClick={() => void restartPlayAs("analysis-only")}
              type="button"
            >
              {labels.stopAi}
            </button>
          ) : null}
        </div>
      </header>
      {notice === null ? null : (
        <p className="play-notice" role="alert">
          {notice}
        </p>
      )}
      <div className="analysis-layout">
        <MoveHistory
          displayedIndex={displayedIndex}
          locale={locale}
          moveSources={moveSources}
          onSelect={selectHistory}
          snapshots={history}
        />
        <section className="board-area" aria-label={messages.play.title}>
          {displayedSnapshot === null ? (
            <div className="board-loading">{messages.play.initialization}</div>
          ) : (
            <>
              <div className={`board-stage board-stage--${orientation}`}>
                <HandStand
                  disabled={
                    !humanCanMove || displayedSnapshot.sideToMove !== "white"
                  }
                  entries={displayedSnapshot.hands.white}
                  legalDrops={legalDrops}
                  messages={messages}
                  onSelect={(piece) =>
                    setSelection((current) =>
                      current?.kind === "hand" && current.piece === piece
                        ? null
                        : { kind: "hand", piece },
                    )
                  }
                  orientation={orientation}
                  pieceSet={pieceSet}
                  selection={selection}
                  side="white"
                />
                <ShogiBoard
                  disabled={!humanCanMove}
                  lastMove={lastMove}
                  messages={messages}
                  onSquare={selectSquare}
                  orientation={orientation}
                  pieceSet={pieceSet}
                  pv={pv}
                  selection={selection}
                  snapshot={displayedSnapshot}
                />
                <HandStand
                  disabled={
                    !humanCanMove || displayedSnapshot.sideToMove !== "black"
                  }
                  entries={displayedSnapshot.hands.black}
                  legalDrops={legalDrops}
                  messages={messages}
                  onSelect={(piece) =>
                    setSelection((current) =>
                      current?.kind === "hand" && current.piece === piece
                        ? null
                        : { kind: "hand", piece },
                    )
                  }
                  orientation={orientation}
                  pieceSet={pieceSet}
                  selection={selection}
                  side="black"
                />
              </div>
              <div className="board-meta">
                <p>
                  <span>{messages.play.sideToMove}</span>
                  <strong>
                    {displayedSnapshot.sideToMove === "black"
                      ? labels.sente
                      : labels.gote}
                  </strong>
                </p>
                <p>
                  <span>{messages.play.moveNumber}</span>
                  <strong>
                    {formatNumber(displayedSnapshot.moveNumber, locale)}
                  </strong>
                </p>
                <p>
                  <span>{labels.configuredMaximum}</span>
                  <strong>{configuredMaximum(timeSettings)}</strong>
                </p>
                <p>
                  <span>{labels.actualThinking}</span>
                  <strong>
                    {currentMoveSource === null
                      ? "—"
                      : formatSecondsFromNs(
                          currentMoveSource.response.elapsedNs,
                        )}
                  </strong>
                </p>
                {timeSettings.mode === "clock" ? (
                  <>
                    <p>
                      <span>{labels.sente}</span>
                      <strong>{formatClock(displayedClock.blackTimeMs)}</strong>
                    </p>
                    <p>
                      <span>{labels.gote}</span>
                      <strong>{formatClock(displayedClock.whiteTimeMs)}</strong>
                    </p>
                  </>
                ) : null}
              </div>
            </>
          )}
          <div className="highlight-legend" aria-label="Board highlight legend">
            <span className="legend-last">Last move</span>
            <span className="legend-selection">Selection</span>
            <span className="legend-legal">Legal</span>
            <span className="legend-check">Check</span>
            <span className="legend-pv">PV</span>
          </div>
          <dialog
            aria-labelledby="promotion-choice-title"
            aria-modal="true"
            className="promotion-choice"
            onCancel={() => setPromotionMoves(null)}
            onClose={() => {
              setPromotionMoves(null);
              promotionFocusRef.current?.focus();
              promotionFocusRef.current = null;
            }}
            ref={promotionDialogRef}
          >
            <p id="promotion-choice-title">{messages.play.promoteQuestion}</p>
            <div>
              {promotionMoves?.map((movement, index) => (
                <button
                  autoFocus={index === 0}
                  key={movement.usi}
                  onClick={() => void applyMove(movement.usi)}
                  type="button"
                >
                  {movement.promote
                    ? messages.play.promote
                    : messages.play.doNotPromote}
                </button>
              ))}
              <button onClick={() => setPromotionMoves(null)} type="button">
                {messages.play.cancel}
              </button>
            </div>
          </dialog>
        </section>
        <AnalysisPanel
          enabled={analysisEnabled}
          evaluator={evaluator}
          lastSearch={currentMoveSource ?? (isLivePosition ? lastSearch : null)}
          locale={locale}
          onToggle={setAnalysisEnabled}
          profile={profile}
          view={analysisView}
        >
          <section className="play-settings" aria-labelledby="settings-title">
            <h2 id="settings-title">{labels.settings}</h2>
            <SegmentedControl
              disabled={busy !== null}
              label={labels.humanRole}
              onSelect={setHumanRole}
              options={[
                { value: "sente", label: labels.sente },
                { value: "gote", label: labels.gote },
                { value: "ai-vs-ai", label: labels.aiVsAi },
                { value: "analysis-only", label: labels.analysisOnly },
              ]}
              value={humanRole}
            />
            <SegmentedControl
              label={labels.orientation}
              onSelect={setOrientation}
              options={[
                { value: "sente-bottom", label: labels.senteBottom },
                { value: "gote-bottom", label: labels.goteBottom },
              ]}
              value={orientation}
            />
            <div className="inline-actions">
              <button
                onClick={() => setOrientation(flippedOrientation)}
                type="button"
              >
                {labels.flip}
              </button>
              <button
                disabled={
                  !isLivePosition ||
                  displayedSnapshot === null ||
                  (busy !== null && busy !== "engine")
                }
                onClick={() => void takeOverCurrentSide()}
                type="button"
              >
                {labels.takeover}
              </button>
            </div>
            <small>{labels.takeoverHint}</small>
            <label className="select-field">
              <span>{labels.timeControl}</span>
              <select
                disabled={busy !== null || timeLocked}
                onChange={(event) => {
                  const mode = event.currentTarget
                    .value as TimeControlSettings["mode"];
                  setTimeSettings((current) => ({
                    ...current,
                    mode,
                  }));
                }}
                value={timeSettings.mode}
              >
                <option value="casual">{labels.casual}</option>
                <option value="fixed">{labels.fixed}</option>
                <option value="clock">{labels.clock}</option>
                <option value="nodes">{labels.nodes}</option>
              </select>
            </label>
            {timeLocked ? <small>{labels.timeLocked}</small> : null}
            {timeSettings.mode === "fixed" ? (
              <SegmentedControl
                disabled={busy !== null || timeLocked}
                label={labels.fixed}
                onSelect={(fixedSeconds) =>
                  setTimeSettings((current) => ({ ...current, fixedSeconds }))
                }
                options={([0.5, 1, 2, 5, 10, 20] as const).map((value) => ({
                  value,
                  label: `${value}s`,
                }))}
                value={timeSettings.fixedSeconds}
              />
            ) : null}
            {timeSettings.mode === "clock" ? (
              <div className="numeric-grid">
                {(
                  [
                    ["mainMinutes", labels.mainMinutes],
                    ["byoyomiSeconds", labels.byoyomi],
                    ["incrementSeconds", labels.increment],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      disabled={busy !== null || timeLocked}
                      min="0"
                      onChange={(event) => {
                        const maximum = key === "mainMinutes" ? 10_080 : 3_600;
                        const value = boundedInputInteger(
                          event.currentTarget.valueAsNumber,
                          0,
                          maximum,
                        );
                        if (value === null) return;
                        setTimeSettings((current) => ({
                          ...current,
                          [key]: value,
                        }));
                      }}
                      type="number"
                      value={timeSettings[key]}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {timeSettings.mode === "nodes" ? (
              <label className="number-field">
                <span>{labels.nodes}</span>
                <input
                  disabled={busy !== null || timeLocked}
                  max={browserProfileNodeLimit(profile)}
                  min="1"
                  onChange={(event) => {
                    const nodes = boundedInputInteger(
                      event.currentTarget.valueAsNumber,
                      1,
                      browserProfileNodeLimit(profile),
                    );
                    if (nodes === null) return;
                    setTimeSettings((current) => ({
                      ...current,
                      nodes,
                    }));
                  }}
                  type="number"
                  value={timeSettings.nodes}
                />
              </label>
            ) : null}
            <label className="select-field">
              <span>{labels.openingProfile}</span>
              <select
                disabled={busy !== null}
                onChange={(event) =>
                  setOpeningProfile(event.currentTarget.value as OpeningProfile)
                }
                value={openingProfile}
              >
                <option value="ibisha_strict">{labels.ibishaStrict}</option>
                <option value="ibisha_preferred">
                  {labels.ibishaPreferred}
                </option>
                <option value="unrestricted">{labels.unrestricted}</option>
              </select>
              <small>{labels.openingHint}</small>
            </label>
            <details>
              <summary>{labels.advanced}</summary>
              <label className="select-field">
                <span>{messages.play.searchProfile}</span>
                <select
                  disabled={
                    busy !== null ||
                    (timeLocked && timeSettings.mode === "nodes")
                  }
                  onChange={(event) => {
                    const nextProfile = event.currentTarget
                      .value as SearchProfile;
                    setProfile(nextProfile);
                    setTimeSettings((current) => ({
                      ...current,
                      nodes: Math.min(
                        current.nodes,
                        browserProfileNodeLimit(nextProfile),
                      ),
                    }));
                  }}
                  value={profile}
                >
                  <option value="eco">Eco</option>
                  <option value="balanced">Balanced</option>
                  <option value="quality">Quality</option>
                </select>
              </label>
              <label className="number-field">
                <span>MultiPV</span>
                <input
                  disabled={busy !== null}
                  max="10"
                  min="1"
                  onChange={(event) => {
                    const value = boundedInputInteger(
                      event.currentTarget.valueAsNumber,
                      1,
                      10,
                    );
                    if (value !== null) setMultiPv(value);
                  }}
                  type="number"
                  value={multiPv}
                />
              </label>
              <label className="number-field">
                <span>{labels.threads}</span>
                <input disabled type="number" value="1" />
              </label>
              <label className="number-field">
                <span>{labels.hash}</span>
                <input disabled type="number" value={playHash} />
              </label>
              <label className="number-field">
                <span>{labels.analysisHash}</span>
                <input disabled type="number" value={analysisHash} />
              </label>
              <small>{labels.hashManaged}</small>
              <label className="check-field">
                <input
                  checked={pauseAnalysisDuringAiTurn}
                  onChange={(event) =>
                    setPauseAnalysisDuringAiTurn(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                {labels.pauseAnalysis}
              </label>
            </details>
            <div className="artifact-control">
              <div>
                <span>{messages.play.localModel}</span>
                <strong>{modelFileName ?? messages.play.modelNotLoaded}</strong>
              </div>
              <label htmlFor="model-file">{messages.play.chooseModel}</label>
              <input
                accept=".osaval,application/octet-stream"
                id="model-file"
                onChange={(event) => void loadModel(event)}
                type="file"
              />
              {modelSummary === null ? null : (
                <button onClick={() => void unloadModel()} type="button">
                  {messages.play.removeModel}
                </button>
              )}
            </div>
            <div className="artifact-control">
              <div>
                <span>{labels.book}</span>
                <strong>{openingBookFileName ?? labels.bookNotLoaded}</strong>
              </div>
              <label htmlFor="book-file">{labels.chooseBook}</label>
              <input
                accept=".gz,application/gzip,application/octet-stream"
                id="book-file"
                onChange={(event) => void loadOpeningBook(event)}
                type="file"
              />
              {openingBookSummary === null ? null : (
                <button onClick={() => void unloadOpeningBook()} type="button">
                  {labels.removeBook}
                </button>
              )}
            </div>
            <div className="piece-set-control">
              <label className="select-field">
                <span>{labels.pieceSet}</span>
                <select
                  onChange={(event) =>
                    setPieceSet(event.currentTarget.value as PieceSetId)
                  }
                  value={pieceSet}
                >
                  {PIECE_ASSET_CATALOG.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="piece-preview">
                <PieceView
                  flipped={false}
                  kind="king"
                  setId={pieceSet}
                  side="black"
                />
                <PieceView
                  flipped={false}
                  kind="rook"
                  setId={pieceSet}
                  side="white"
                />
                <span>{pieceAssetSet(pieceSet).creators.join(", ")}</span>
              </div>
              <button onClick={() => setPieceCreditsOpen(true)} type="button">
                {labels.pieceCredits}
              </button>
            </div>
          </section>
        </AnalysisPanel>
      </div>
      {pieceCreditsOpen ? (
        <CreditsDialog
          locale={locale}
          onClose={() => setPieceCreditsOpen(false)}
        />
      ) : null}
    </main>
  );
}
