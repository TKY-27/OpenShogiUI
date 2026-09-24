import {
  ArenaReportErrorCode,
  ArenaReportValidationError,
} from "./arena-report";
import type { PieceKind, SearchProfile, Side } from "./browser-engine";

export type Locale = "ja" | "en";
export const DEFAULT_LOCALE: Locale = "ja";

export interface Messages {
  header: {
    primaryNavigation: string;
    workspace: string;
    match: string;
    browserPlay: string;
    evaluationLab: string;
    language: string;
    japanese: string;
    english: string;
  };
  play: {
    title: string;
    boardLabel: string;
    description: string;
    localNote: string;
    matchMode: string;
    analysisMode: string;
    modeLabel: string;
    matchSetup: string;
    startMatch: string;
    stopMatch: string;
    newPosition: string;
    analyze: string;
    stopSearch: string;
    playBestMove: string;
    settings: string;
    searchProfile: string;
    profileName: Record<SearchProfile, string>;
    evaluator: string;
    handcrafted: string;
    localModel: string;
    chooseModel: string;
    removeModel: string;
    modelNotLoaded: string;
    multiPv: string;
    multiPvHelp: string;
    boardOnlyNote: string;
    initialization: string;
    ready: string;
    searching: string;
    engineTurn: string;
    yourTurn: string;
    terminal: string;
    error: string;
    noAnalysis: string;
    analysisHint: string;
    score: string;
    depth: string;
    nodes: string;
    principalVariation: string;
    sideToMove: string;
    moveNumber: string;
    black: string;
    white: string;
    hand: (side: Side) => string;
    emptyHand: string;
    pieceName: Record<PieceKind, string>;
    squareLabel: (file: number, rank: string) => string;
    selected: string;
    legalDestination: string;
    promoteQuestion: string;
    promote: string;
    doNotPromote: string;
    cancel: string;
    modelReady: (fileName: string) => string;
    deviceChoice: string;
    supplementalLines: string;
  };
  match: {
    title: string;
    subtitle: string;
    setupHeading: string;
    timeControl: string;
    preset: Record<"blitz3" | "rapid10" | "unlimited", string>;
    presetDetail: Record<"blitz3" | "rapid10" | "unlimited", string>;
    yourSide: string;
    sente: string;
    gote: string;
    strength: string;
    engineAllocatesTime: string;
    casualCap: string;
    start: string;
    resign: string;
    resignConfirm: string;
    confirm: string;
    cancel: string;
    flip: string;
    takeback: string;
    takebackClockNote: string;
    rematch: string;
    exit: string;
    moveNumber: string;
    yourTurn: string;
    engineThinking: string;
    preparing: string;
    you: string;
    engine: string;
    result: Record<"win" | "loss", string>;
    reason: Record<"checkmate" | "timeout" | "resignation", string>;
    remainingTime: (clock: string) => string;
    exportKif: string;
    exportUsi: string;
  };
  workspace: {
    headline: string;
    summary: string;
    releaseStatus: Record<"candidate", string>;
    title: string;
    adapter: string;
    play: string;
    delivery: string;
    ready: string;
    inProgress: string;
    startHeading: string;
    startMatch: string;
    startMatchDetail: string;
    startAnalysis: string;
    startAnalysisDetail: string;
    startLab: string;
    startLabDetail: string;
  };
  lab: {
    title: string;
    description: string;
    browserNote: string;
    arenaReport: string;
    chooseReport: string;
    expectedSchema: string;
    compatibleSchema: string;
    idle: string;
    loading: (fileName: string) => string;
    ready: (fileName: string, loadedAt: string, byteSize: string) => string;
    invalid: (fileName: string, detail: string) => string;
    fileTooLarge: (maximumSize: string) => string;
    reportCouldNotBeRead: string;
    runSummary: string;
    schema: string;
    limit: string;
    seed: string;
    engine: string;
    commit: string;
    started: string;
    completed: string;
    initialSfen: string;
    maxPliesLabel: string;
    configHash: string;
    budget: string;
    unavailable: string;
    enabled: string;
    disabled: string;
    playerIdentities: string;
    playerIdentityCaption: string;
    playerA: string;
    playerB: string;
    evaluator: string;
    searchDepth: string;
    hashMemory: string;
    transposition: string;
    opening: string;
    modelArtifact: string;
    payloadHash: string;
    architecture: string;
    quantization: string;
    openingIdentity: string;
    searchMetrics: string;
    metricsCaption: string;
    metricsValidationNote: string;
    games: string;
    finishRate: string;
    searchWins: string;
    playerAWins: string;
    playerBWins: string;
    wins: string;
    draws: string;
    nodesPerSecond: string;
    averageDepth: string;
    ttHitRate: string;
    cutoffRate: string;
    pruningRate: string;
    timePerMove: string;
    peakMemory: string;
    illegalMoves: string;
    neuralCalls: string;
    neuralTime: string;
    averageInferenceTime: string;
    playerMetrics: string;
    playerMetricsCaption: string;
    searchNodes: string;
    searchElapsed: string;
    searches: string;
    gameRange: (first: string, last: string, total: string) => string;
    noImportedGames: string;
    gamePagination: string;
    previousPage: string;
    nextPage: string;
    pageStatus: (page: string, totalPages: string) => string;
    game: string;
    black: string;
    white: string;
    result: string;
    moves: string;
    csaHash: string;
    csaSize: string;
    blackWin: string;
    whiteWin: string;
    draw: string;
    maxPlies: string;
  };
  validation: Record<
    ArenaReportErrorCode,
    (details: Record<string, string | number>) => string
  >;
  footer: string;
}

const englishValidation: Messages["validation"] = {
  "invalid-json": () => "The selected file is not valid JSON.",
  "unsupported-field": ({ key, path }) =>
    `${path} contains unsupported field "${key}".`,
  "missing-field": ({ key, path }) =>
    `${path} is missing required field "${key}".`,
  "expected-object": ({ path }) => `${path} must be an object.`,
  "expected-boolean": ({ path }) => `${path} must be a boolean.`,
  "non-empty-string": ({ path }) => `${path} must be a non-empty string.`,
  "string-too-long": ({ maximum, path }) =>
    `${path} must not exceed ${maximum} characters.`,
  "non-negative-integer": ({ path }) =>
    `${path} must be a non-negative safe integer.`,
  "positive-integer": ({ maximum, path }) =>
    `${path} must be between 1 and ${maximum}.`,
  "non-negative-number": ({ path }) =>
    `${path} must be a finite, non-negative number.`,
  "unit-rate": ({ path }) => `${path} must be between 0 and 1.`,
  "invalid-timestamp": ({ path }) => `${path} must be an ISO-8601 timestamp.`,
  "invalid-commit": ({ path }) =>
    `${path} must be a 7 to 64 character hexadecimal object ID or null.`,
  "invalid-player": ({ path }) =>
    `${path} must identify a random player or search profile.`,
  "invalid-enum": ({ path, values }) => `${path} must be one of: ${values}.`,
  "invalid-sha256": ({ path }) => `${path} must be a lowercase SHA-256.`,
  "invalid-sfen": ({ path }) =>
    `${path} must use canonical initial-position SFEN syntax.`,
  "game-limit": ({ maximum, path }) =>
    `${path} must be between 1 and ${maximum}.`,
  "completion-before-start": () =>
    "run.completedAt must not precede run.startedAt.",
  "unsupported-result": ({ path }) =>
    `${path}.result is not a supported arena result.`,
  "games-array": ({ maximum }) =>
    `games must be an array with at most ${maximum} entries.`,
  "schema-mismatch": ({ schema }) =>
    `report.schema must use a supported schema: ${schema}.`,
  "games-over-limit": () => "games must not exceed run.gameLimit.",
  "games-count-mismatch": () =>
    "metrics.games must equal the number of imported games.",
  "finished-games-over-total": () =>
    "metrics.finishedGames must not exceed metrics.games.",
  "search-wins-over-finished": () =>
    "metrics.searchWins must not exceed metrics.finishedGames.",
  "draws-over-finished": () =>
    "metrics.draws must not exceed metrics.finishedGames.",
  "outcomes-over-finished": () =>
    "search wins and draws must not exceed finished games.",
  "duplicate-game-id": () => "games must have unique ids.",
  "non-contiguous-game-id": ({ expected, path }) =>
    `${path} must equal ${expected}.`,
  "finished-games-mismatch": () =>
    "metrics.finishedGames must match the imported game results.",
  "draws-mismatch": () => "metrics.draws must match the imported game results.",
  "search-wins-mismatch": () =>
    "metrics.searchWins must match search player victories.",
  "player-wins-mismatch": () =>
    "metrics A/B wins must match the imported game results.",
  "identity-mismatch": ({ path }) =>
    `${path} does not match the immutable run identity.`,
  "schedule-mismatch": ({ path }) =>
    `${path} does not match the deterministic A/B color schedule.`,
  "game-invariant": ({ path }) => `${path} violates the arena game invariants.`,
  "aggregate-mismatch": ({ path }) =>
    `${path} does not match the imported game counters.`,
  "completed-run-incomplete": () =>
    "A completed v2 run must contain run.gameLimit games.",
};

const japaneseValidation: Messages["validation"] = {
  "invalid-json": () => "選択したファイルは有効なJSONではありません。",
  "unsupported-field": ({ key, path }) =>
    `${path} に未対応のフィールド「${key}」があります。`,
  "missing-field": ({ key, path }) =>
    `${path} に必須フィールド「${key}」がありません。`,
  "expected-object": ({ path }) =>
    `${path} はオブジェクトである必要があります。`,
  "expected-boolean": ({ path }) => `${path} は真偽値である必要があります。`,
  "non-empty-string": ({ path }) =>
    `${path} は空でない文字列である必要があります。`,
  "string-too-long": ({ maximum, path }) =>
    `${path} は${maximum}文字以内である必要があります。`,
  "non-negative-integer": ({ path }) =>
    `${path} は0以上の安全な整数である必要があります。`,
  "positive-integer": ({ maximum, path }) =>
    `${path} は1以上${maximum}以下である必要があります。`,
  "non-negative-number": ({ path }) =>
    `${path} は0以上の有限な数値である必要があります。`,
  "unit-rate": ({ path }) => `${path} は0以上1以下である必要があります。`,
  "invalid-timestamp": ({ path }) =>
    `${path} はISO 8601形式の日時である必要があります。`,
  "invalid-commit": ({ path }) =>
    `${path} は7〜64桁の16進オブジェクトIDまたはnullである必要があります。`,
  "invalid-player": ({ path }) =>
    `${path} はrandomまたはsearchプロファイルである必要があります。`,
  "invalid-enum": ({ path, values }) =>
    `${path} は次のいずれかである必要があります: ${values}。`,
  "invalid-sha256": ({ path }) =>
    `${path} は小文字のSHA-256である必要があります。`,
  "invalid-sfen": ({ path }) =>
    `${path} は正規化済みの初期局面SFEN構文である必要があります。`,
  "game-limit": ({ maximum, path }) =>
    `${path} は1以上${maximum}以下である必要があります。`,
  "completion-before-start": () =>
    "run.completedAt は run.startedAt より前にできません。",
  "unsupported-result": ({ path }) => `${path}.result は未対応の対局結果です。`,
  "games-array": ({ maximum }) =>
    `games は最大${maximum}件の配列である必要があります。`,
  "schema-mismatch": ({ schema }) =>
    `report.schema は対応スキーマ（${schema}）のいずれかである必要があります。`,
  "games-over-limit": () => "games は run.gameLimit を超えられません。",
  "games-count-mismatch": () =>
    "metrics.games はインポートした対局数と一致する必要があります。",
  "finished-games-over-total": () =>
    "metrics.finishedGames は metrics.games を超えられません。",
  "search-wins-over-finished": () =>
    "metrics.searchWins は metrics.finishedGames を超えられません。",
  "draws-over-finished": () =>
    "metrics.draws は metrics.finishedGames を超えられません。",
  "outcomes-over-finished": () =>
    "探索側の勝利数と引き分け数の合計は完局数を超えられません。",
  "duplicate-game-id": () => "games のidは重複できません。",
  "non-contiguous-game-id": ({ expected, path }) =>
    `${path} は${expected}である必要があります。`,
  "finished-games-mismatch": () =>
    "metrics.finishedGames はインポートした対局結果と一致する必要があります。",
  "draws-mismatch": () =>
    "metrics.draws はインポートした対局結果と一致する必要があります。",
  "search-wins-mismatch": () =>
    "metrics.searchWins は探索側の勝利数と一致する必要があります。",
  "player-wins-mismatch": () =>
    "metrics のA/B勝利数は対局結果と一致する必要があります。",
  "identity-mismatch": ({ path }) =>
    `${path} は不変の実行識別情報と一致する必要があります。`,
  "schedule-mismatch": ({ path }) =>
    `${path} は決定的なA/B先後割当と一致する必要があります。`,
  "game-invariant": ({ path }) => `${path} が対局の不変条件に違反しています。`,
  "aggregate-mismatch": ({ path }) =>
    `${path} は対局ごとのカウンタ集計と一致する必要があります。`,
  "completed-run-incomplete": () =>
    "完了済みv2実行には run.gameLimit 局が必要です。",
};

const messages: Record<Locale, Messages> = {
  ja: {
    header: {
      primaryNavigation: "メインナビゲーション",
      workspace: "ホーム",
      match: "対局",
      browserPlay: "開発用盤面",
      evaluationLab: "評価ラボ",
      language: "表示言語",
      japanese: "日本語",
      english: "English",
    },
    workspace: {
      headline: "オープンな将棋のAI",
      summary:
        "OpenShogiAIと対局し、学習モデルで指し手や読み筋を確認できます。",
      releaseStatus: { candidate: "" },
      title: "OpenShogiAI",
      adapter: "AI連携境界",
      play: "対局と局面解析",
      delivery: "静的サイト配信",
      ready: "準備完了",
      inProgress: "進行中",
      startHeading: "はじめる",
      startMatch: "AIと対局",
      startMatchDetail: "3分切れ負け・10分切れ負け",
      startAnalysis: "局面を解析",
      startAnalysisDetail: "評価値・候補手・棋譜の確認",
      startLab: "評価ラボ",
      startLabDetail: "ローカル対局レポートの検証",
    },
    match: {
      title: "対局",
      subtitle: "盤だけで指す。解析は表示しません。",
      setupHeading: "対局設定",
      timeControl: "持ち時間",
      preset: {
        blitz3: "3分切れ負け",
        rapid10: "10分切れ負け",
        unlimited: "時間無制限",
      },
      presetDetail: {
        blitz3: "秒読み・加算なし",
        rapid10: "秒読み・加算なし",
        unlimited: "時計を表示しません",
      },
      yourSide: "あなたの手番",
      sente: "先手",
      gote: "後手",
      strength: "AIの探索設定",
      engineAllocatesTime:
        "1手ごとの使用時間はエンジンが残り時間から自分で決めます。",
      casualCap: "時間無制限では、エンジンは1手あたり最大20秒で指します。",
      start: "対局開始",
      resign: "投了",
      resignConfirm: "投了しますか？この操作は取り消せません。",
      confirm: "投了する",
      cancel: "キャンセル",
      flip: "盤を反転",
      takeback: "待った",
      takebackClockNote: "持ち時間ありの対局では、消費した時間は戻りません。",
      rematch: "もう一局",
      exit: "対局を終える",
      moveNumber: "手数",
      yourTurn: "あなたの手番です",
      engineThinking: "AIが考えています…",
      preparing: "エンジンを準備しています…",
      you: "あなた",
      engine: "AI",
      result: { win: "あなたの勝ち", loss: "あなたの負け" },
      reason: {
        checkmate: "詰み",
        timeout: "時間切れ",
        resignation: "投了",
      },
      remainingTime: (clock) => `残り ${clock}`,
      exportKif: "KIFを保存",
      exportUsi: "USIを保存",
    },
    play: {
      title: "局面解析",
      boardLabel: "将棋盤",
      description: "盤面・合法手・探索を、この端末のWeb Worker内で実行します。",
      localNote: "棋譜とモデルは外部へ送信されません。",
      matchMode: "真剣対戦",
      analysisMode: "局面解析",
      modeLabel: "表示モード",
      matchSetup: "対局設定",
      startMatch: "対局を始める",
      stopMatch: "対局を中断",
      newPosition: "初期局面へ戻す",
      analyze: "この局面を解析",
      stopSearch: "探索を停止",
      playBestMove: "最善手を指す",
      settings: "解析設定",
      searchProfile: "端末設定",
      profileName: { eco: "省電力", balanced: "標準", quality: "高品質" },
      evaluator: "評価方式",
      handcrafted: "手作業評価",
      localModel: "ローカルモデル",
      chooseModel: "OSAVALを選択",
      removeModel: "モデルを外す",
      modelNotLoaded: "モデル未選択",
      multiPv: "表示する候補手",
      multiPvHelp: "最善手は通常探索、2本目以降は比較用の限定探索です。",
      boardOnlyNote:
        "対局開始後は評価値・読み筋・解析設定を隠し、盤と持駒だけを表示します。",
      initialization: "エンジンを準備しています…",
      ready: "準備完了",
      searching: "探索中…",
      engineTurn: "後手が考えています…",
      yourTurn: "あなたの手番です",
      terminal: "対局終了",
      error: "処理を完了できませんでした",
      noAnalysis: "まだ解析していません",
      analysisHint: "盤面を進めるか、「この局面を解析」を選んでください。",
      score: "評価値",
      depth: "深さ",
      nodes: "ノード",
      principalVariation: "読み筋",
      sideToMove: "手番",
      moveNumber: "手数",
      black: "先手",
      white: "後手",
      hand: (side) => `${side === "black" ? "先手" : "後手"}持駒`,
      emptyHand: "なし",
      pieceName: {
        pawn: "歩",
        lance: "香",
        knight: "桂",
        silver: "銀",
        gold: "金",
        bishop: "角",
        rook: "飛",
        king: "玉",
        "promoted-pawn": "と",
        "promoted-lance": "成香",
        "promoted-knight": "成桂",
        "promoted-silver": "成銀",
        horse: "馬",
        dragon: "龍",
      },
      squareLabel: (file, rank) => `${file}${rank}`,
      selected: "選択中",
      legalDestination: "移動可能",
      promoteQuestion: "成りますか？",
      promote: "成る",
      doNotPromote: "成らない",
      cancel: "キャンセル",
      modelReady: (fileName) => `${fileName} を検証しました`,
      deviceChoice: "端末性能から初期値を選択",
      supplementalLines: "比較候補",
    },
    lab: {
      title: "評価ラボ",
      description:
        "ローカルのRustエンジンが生成した再現可能な対局結果を確認します。",
      browserNote:
        "正規化SFEN構文・スキーマ・集計を検証 · CSA・モデル・定跡ファイルの内容と完全な将棋合法性は未検証",
      arenaReport: "対局レポート",
      chooseReport: "JSONレポートを選択",
      expectedSchema: "想定スキーマ",
      compatibleSchema: "v1も読み込み可能",
      idle: "確認するローカル対局レポートを選択してください。",
      loading: (fileName) => `${fileName} を読み込んでいます…`,
      ready: (fileName, loadedAt, byteSize) =>
        `${fileName} を読み込みました · ${loadedAt} · ${byteSize}`,
      invalid: (fileName, detail) => `${fileName}: ${detail}`,
      fileTooLarge: (maximumSize) =>
        `ファイルサイズは${maximumSize}以下である必要があります。`,
      reportCouldNotBeRead: "レポートを読み込めませんでした。",
      runSummary: "実行概要",
      schema: "スキーマ",
      limit: "上限",
      seed: "シード",
      engine: "エンジン",
      commit: "コミット",
      started: "開始日時",
      completed: "完了日時",
      initialSfen: "初期局面SFEN",
      maxPliesLabel: "最大手数",
      configHash: "設定SHA-256",
      budget: "探索予算",
      unavailable: "取得不可",
      enabled: "有効",
      disabled: "無効",
      playerIdentities: "A/Bプレイヤー識別情報",
      playerIdentityCaption: "実行時に固定されたA/Bプレイヤー設定",
      playerA: "プレイヤーA",
      playerB: "プレイヤーB",
      evaluator: "評価関数",
      searchDepth: "探索深さ",
      hashMemory: "ハッシュメモリ",
      transposition: "置換表",
      opening: "定跡",
      modelArtifact: "モデル成果物",
      payloadHash: "モデルpayload SHA-256",
      architecture: "アーキテクチャ版",
      quantization: "量子化",
      openingIdentity: "定跡成果物識別情報",
      searchMetrics: "探索指標",
      metricsCaption: "ローカル対局実行で記録された指標",
      metricsValidationNote:
        "ノード/秒・平均深さ・1手あたり時間はカウンタから再計算します。TTヒット率・カットオフ率・枝刈り率は0〜100%の範囲のみ検査します。",
      games: "対局数",
      finishRate: "完局率",
      searchWins: "探索側の勝利",
      playerAWins: "Aの勝利",
      playerBWins: "Bの勝利",
      wins: "勝利",
      draws: "引き分け",
      nodesPerSecond: "ノード / 秒",
      averageDepth: "平均深さ",
      ttHitRate: "TTヒット率",
      cutoffRate: "カットオフ率",
      pruningRate: "枝刈り率",
      timePerMove: "1手あたり時間",
      peakMemory: "最大メモリ",
      illegalMoves: "不正着手",
      neuralCalls: "ニューラル推論回数",
      neuralTime: "ニューラル推論時間",
      averageInferenceTime: "1推論あたり時間",
      playerMetrics: "A/B探索・推論指標",
      playerMetricsCaption: "プレイヤー別の探索・ニューラル推論カウンタ",
      searchNodes: "探索ノード",
      searchElapsed: "探索時間",
      searches: "探索回数",
      gameRange: (first, last, total) =>
        `${total}局中${first}〜${last}局を表示`,
      noImportedGames: "表示する対局はありません",
      gamePagination: "対局一覧のページ移動",
      previousPage: "前へ",
      nextPage: "次へ",
      pageStatus: (page, totalPages) => `${totalPages}ページ中${page}ページ`,
      game: "対局",
      black: "先手",
      white: "後手",
      result: "結果",
      moves: "手数",
      csaHash: "CSA SHA-256",
      csaSize: "CSAサイズ",
      blackWin: "先手勝ち",
      whiteWin: "後手勝ち",
      draw: "引き分け",
      maxPlies: "最大手数到達",
    },
    validation: japaneseValidation,
    footer: "AGPL-3.0-only · モデルおよびデータセットは含まれていません",
  },
  en: {
    header: {
      primaryNavigation: "Primary navigation",
      workspace: "Home",
      match: "Match",
      browserPlay: "Development board",
      evaluationLab: "Evaluation Lab",
      language: "Display language",
      japanese: "日本語",
      english: "English",
    },
    workspace: {
      headline: "An open shogi AI",
      summary:
        "Play and analyze with the OpenShogiAI WebAssembly engine, then inspect local evaluation reports.",
      releaseStatus: { candidate: "Clean-history release candidate" },
      title: "OpenShogiAI",
      adapter: "AI integration boundary",
      play: "Play and position analysis",
      delivery: "Static site delivery",
      ready: "Ready",
      inProgress: "In progress",
      startHeading: "Start",
      startMatch: "Play the AI",
      startMatchDetail: "3-minute or 10-minute sudden death",
      startAnalysis: "Analyze a position",
      startAnalysisDetail: "Evaluation, candidate lines, and move history",
      startLab: "Evaluation Lab",
      startLabDetail: "Inspect local arena reports",
    },
    match: {
      title: "Match",
      subtitle: "Just the board. No analysis is shown.",
      setupHeading: "Match setup",
      timeControl: "Time control",
      preset: {
        blitz3: "3 min sudden death",
        rapid10: "10 min sudden death",
        unlimited: "Untimed",
      },
      presetDetail: {
        blitz3: "No byoyomi, no increment",
        rapid10: "No byoyomi, no increment",
        unlimited: "No clock is shown",
      },
      yourSide: "Your side",
      sente: "Sente",
      gote: "Gote",
      strength: "AI search profile",
      engineAllocatesTime:
        "The engine decides how long to think for each move from its own remaining time.",
      casualCap:
        "When untimed, the engine plays with a 20 second cap per move.",
      start: "Start match",
      resign: "Resign",
      resignConfirm: "Resign this match? This cannot be undone.",
      confirm: "Resign",
      cancel: "Cancel",
      flip: "Flip board",
      takeback: "Take back",
      takebackClockNote:
        "In a timed match, time already spent is not returned.",
      rematch: "Play again",
      exit: "Leave match",
      moveNumber: "Move",
      yourTurn: "Your turn",
      engineThinking: "The AI is thinking…",
      preparing: "Preparing engine…",
      you: "You",
      engine: "AI",
      result: { win: "You win", loss: "You lose" },
      reason: {
        checkmate: "Checkmate",
        timeout: "Time forfeit",
        resignation: "Resignation",
      },
      remainingTime: (clock) => `${clock} left`,
      exportKif: "Save KIF",
      exportUsi: "Save USI",
    },
    play: {
      title: "Position analysis",
      boardLabel: "Shogi board",
      description:
        "Run the board, legal moves, and search inside a Web Worker on this device.",
      localNote: "Game records and model files never leave this browser.",
      matchMode: "Serious match",
      analysisMode: "Position analysis",
      modeLabel: "Display mode",
      matchSetup: "Match setup",
      startMatch: "Start match",
      stopMatch: "Stop match",
      newPosition: "Return to start",
      analyze: "Analyze position",
      stopSearch: "Stop search",
      playBestMove: "Play best move",
      settings: "Analysis settings",
      searchProfile: "Device profile",
      profileName: { eco: "Eco", balanced: "Balanced", quality: "Quality" },
      evaluator: "Evaluator",
      handcrafted: "Handcrafted",
      localModel: "Local model",
      chooseModel: "Choose OSAVAL",
      removeModel: "Remove model",
      modelNotLoaded: "No model selected",
      multiPv: "Candidate lines",
      multiPvHelp:
        "The best line uses the full search; additional lines use bounded comparison searches.",
      boardOnlyNote:
        "After a match starts, evaluation, PVs, and settings are hidden so only the board and hands remain.",
      initialization: "Preparing engine…",
      ready: "Ready",
      searching: "Searching…",
      engineTurn: "White is thinking…",
      yourTurn: "Your turn",
      terminal: "Game over",
      error: "The operation could not be completed",
      noAnalysis: "No analysis yet",
      analysisHint: "Play a move or choose Analyze position.",
      score: "Evaluation",
      depth: "Depth",
      nodes: "Nodes",
      principalVariation: "Principal variation",
      sideToMove: "Side to move",
      moveNumber: "Move",
      black: "Black",
      white: "White",
      hand: (side) => `${side === "black" ? "Black" : "White"} hand`,
      emptyHand: "Empty",
      pieceName: {
        pawn: "Pawn",
        lance: "Lance",
        knight: "Knight",
        silver: "Silver",
        gold: "Gold",
        bishop: "Bishop",
        rook: "Rook",
        king: "King",
        "promoted-pawn": "Tokin",
        "promoted-lance": "Promoted lance",
        "promoted-knight": "Promoted knight",
        "promoted-silver": "Promoted silver",
        horse: "Horse",
        dragon: "Dragon",
      },
      squareLabel: (file, rank) => `${file}${rank}`,
      selected: "Selected",
      legalDestination: "Legal destination",
      promoteQuestion: "Promote this piece?",
      promote: "Promote",
      doNotPromote: "Do not promote",
      cancel: "Cancel",
      modelReady: (fileName) => `Validated ${fileName}`,
      deviceChoice: "Initial choice based on this device",
      supplementalLines: "Comparison lines",
    },
    lab: {
      title: "Evaluation Lab",
      description:
        "Inspect reproducible arena runs produced by the local Rust engine.",
      browserNote:
        "Canonical SFEN syntax, schema, and aggregates validated · CSA, model, and opening file contents and full shogi legality are not verified",
      arenaReport: "Arena report",
      chooseReport: "Choose JSON report",
      expectedSchema: "Expected schema",
      compatibleSchema: "v1 remains supported",
      idle: "Select a local arena report to inspect it here.",
      loading: (fileName) => `Reading ${fileName}…`,
      ready: (fileName, loadedAt, byteSize) =>
        `Loaded ${fileName} · ${loadedAt} · ${byteSize}`,
      invalid: (fileName, detail) => `${fileName}: ${detail}`,
      fileTooLarge: (maximumSize) => `Files must be ${maximumSize} or smaller.`,
      reportCouldNotBeRead: "The report could not be read.",
      runSummary: "Run summary",
      schema: "Schema",
      limit: "Limit",
      seed: "Seed",
      engine: "Engine",
      commit: "Commit",
      started: "Started",
      completed: "Completed",
      initialSfen: "Initial SFEN",
      maxPliesLabel: "Max plies",
      configHash: "Config SHA-256",
      budget: "Search budget",
      unavailable: "Unavailable",
      enabled: "Enabled",
      disabled: "Disabled",
      playerIdentities: "A/B player identities",
      playerIdentityCaption: "A/B player settings fixed for this run",
      playerA: "Player A",
      playerB: "Player B",
      evaluator: "Evaluator",
      searchDepth: "Search depth",
      hashMemory: "Hash memory",
      transposition: "Transposition table",
      opening: "Opening",
      modelArtifact: "Model artifact",
      payloadHash: "Model payload SHA-256",
      architecture: "Architecture version",
      quantization: "Quantization",
      openingIdentity: "Opening artifact identity",
      searchMetrics: "Search metrics",
      metricsCaption: "Metrics captured by the local arena run",
      metricsValidationNote:
        "Nodes per second, average depth, and time per move are recomputed from counters. TT hit, cutoff, and pruning rates are checked only for the 0–100% range.",
      games: "Games",
      finishRate: "Finish rate",
      searchWins: "Search wins",
      playerAWins: "A wins",
      playerBWins: "B wins",
      wins: "Wins",
      draws: "Draws",
      nodesPerSecond: "Nodes / sec",
      averageDepth: "Average depth",
      ttHitRate: "TT hit rate",
      cutoffRate: "Cutoff rate",
      pruningRate: "Pruning rate",
      timePerMove: "Time / move",
      peakMemory: "Peak memory",
      illegalMoves: "Illegal moves",
      neuralCalls: "Neural inference calls",
      neuralTime: "Neural inference time",
      averageInferenceTime: "Time / inference",
      playerMetrics: "A/B search and inference",
      playerMetricsCaption: "Per-player search and neural inference counters",
      searchNodes: "Search nodes",
      searchElapsed: "Search time",
      searches: "Searches",
      gameRange: (first, last, total) =>
        `Showing games ${first}–${last} of ${total}`,
      noImportedGames: "No games to display",
      gamePagination: "Game list pagination",
      previousPage: "Previous",
      nextPage: "Next",
      pageStatus: (page, totalPages) => `Page ${page} of ${totalPages}`,
      game: "Game",
      black: "Black",
      white: "White",
      result: "Result",
      moves: "Moves",
      csaHash: "CSA SHA-256",
      csaSize: "CSA size",
      blackWin: "Black win",
      whiteWin: "White win",
      draw: "Draw",
      maxPlies: "Max plies",
    },
    validation: englishValidation,
    footer: "AGPL-3.0-only · No model or dataset included",
  },
};

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

export interface LanguageTarget {
  lang: string;
}

export function applyDocumentLanguage(
  locale: Locale,
  target: LanguageTarget = document.documentElement,
): void {
  target.lang = locale;
}

export type LocaleAction = { type: "select"; locale: Locale };

export function localeReducer(_locale: Locale, action: LocaleAction): Locale {
  return action.locale;
}

export function localizeArenaReportError(
  error: unknown,
  locale: Locale,
): string {
  const selectedMessages = getMessages(locale);
  if (error instanceof ArenaReportValidationError) {
    return selectedMessages.validation[error.code](error.details);
  }

  return selectedMessages.lab.reportCouldNotBeRead;
}
