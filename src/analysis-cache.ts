import {
  parseAnalysisUpdate,
  type AnalysisStart,
  type AnalysisUpdate,
} from "./browser-engine";

const DATABASE_NAME = "open-shogi-ui";
const DATABASE_VERSION = 1;
const STORE_NAME = "analysis-summaries";
const MAX_PERSISTED_SUMMARIES = 128;
const ENGINE_SNAPSHOT_SHA256 =
  "ac6e26e539a7792cc9d53d3bbbd99e3113d97a65ea76d433c9f8daa6280d131d";

export interface CachedAnalysisSummary {
  key: string;
  savedAtMs: number;
  update: AnalysisUpdate;
}

export function analysisCacheIdentity(request: AnalysisStart): string {
  return [
    request.schema,
    request.positionSfen,
    request.modelHash,
    request.evaluatorConfigHash,
    request.featureSchemaHash,
    request.evaluationSemanticsHash,
    request.searchOptionsHash,
    request.openingProfileHash,
    String(request.multiPv),
    ENGINE_SNAPSHOT_SHA256,
  ].join("|");
}

export function updateMatchesRequest(
  update: AnalysisUpdate,
  request: AnalysisStart,
): boolean {
  return (
    update.canonicalPosition === request.positionSfen &&
    update.modelHash === request.modelHash &&
    update.evaluatorConfigHash === request.evaluatorConfigHash &&
    update.featureSchemaHash === request.featureSchemaHash &&
    update.evaluationSemanticsHash === request.evaluationSemanticsHash &&
    update.searchOptionsHash === request.searchOptionsHash &&
    update.openingProfileHash === request.openingProfileHash &&
    update.multiPv === request.multiPv
  );
}

export class AnalysisSummaryStore {
  private readonly memory = new Map<string, CachedAnalysisSummary>();
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  async get(request: AnalysisStart): Promise<CachedAnalysisSummary | null> {
    const key = analysisCacheIdentity(request);
    const memory = this.memory.get(key);
    if (memory !== undefined) return memory;
    const database = await this.database();
    if (database === null) return null;
    try {
      const value = await requestValue<unknown>(
        database
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(key),
      );
      const parsed = parseCachedSummary(value, key);
      if (parsed === null || !updateMatchesRequest(parsed.update, request)) {
        return null;
      }
      this.memory.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  async put(request: AnalysisStart, update: AnalysisUpdate): Promise<void> {
    if (!updateMatchesRequest(update, request) || update.depth === 0) return;
    const entry: CachedAnalysisSummary = {
      key: analysisCacheIdentity(request),
      savedAtMs: Date.now(),
      update,
    };
    this.memory.set(entry.key, entry);
    const database = await this.database();
    if (database === null) return;
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
      await transactionDone(transaction);
      await this.prune(database);
    } catch {
      // The in-memory result remains usable when persistence is unavailable.
    }
  }

  clearMemory(): void {
    this.memory.clear();
  }

  private async database(): Promise<IDBDatabase | null> {
    if (this.databasePromise !== null) return this.databasePromise;
    this.databasePromise = openDatabase();
    return this.databasePromise;
  }

  private async prune(database: IDBDatabase): Promise<void> {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const [values, keys] = await Promise.all([
      requestValue<unknown[]>(store.getAll()),
      requestValue<IDBValidKey[]>(store.getAllKeys()),
    ]);
    const entries: CachedAnalysisSummary[] = [];
    values.forEach((value, index) => {
      const key = keys[index];
      if (key === undefined) return;
      let parsed: CachedAnalysisSummary | null = null;
      if (typeof key === "string") {
        try {
          parsed = parseCachedSummary(value, key);
        } catch {
          parsed = null;
        }
      }
      if (parsed === null) store.delete(key);
      else entries.push(parsed);
    });
    entries
      .sort((left, right) => right.savedAtMs - left.savedAtMs)
      .slice(MAX_PERSISTED_SUMMARIES)
      .forEach(({ key }) => store.delete(key));
    await transactionDone(transaction);
  }
}

function parseCachedSummary(
  value: unknown,
  expectedKey: string,
): CachedAnalysisSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "key" ||
    keys[1] !== "savedAtMs" ||
    keys[2] !== "update" ||
    record.key !== expectedKey ||
    typeof record.savedAtMs !== "number" ||
    !Number.isSafeInteger(record.savedAtMs) ||
    record.savedAtMs < 0
  )
    return null;
  return {
    key: expectedKey,
    savedAtMs: record.savedAtMs,
    update: parseAnalysisUpdate(record.update),
  };
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => resolve(null));
    request.addEventListener("blocked", () => resolve(null));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}
