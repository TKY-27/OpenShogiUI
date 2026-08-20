import type { AnalysisStart, AnalysisUpdate } from "./browser-engine";

const DATABASE_NAME = "open-shogi-ui";
const DATABASE_VERSION = 1;
const STORE_NAME = "analysis-summaries";
const MAX_PERSISTED_SUMMARIES = 128;

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
    let value: CachedAnalysisSummary | undefined;
    try {
      value = await requestValue<CachedAnalysisSummary | undefined>(
        database
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(key),
      );
    } catch {
      return null;
    }
    if (value === undefined || !updateMatchesRequest(value.update, request)) {
      return null;
    }
    this.memory.set(key, value);
    return value;
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
    const entries = await requestValue<CachedAnalysisSummary[]>(store.getAll());
    entries
      .sort((left, right) => right.savedAtMs - left.savedAtMs)
      .slice(MAX_PERSISTED_SUMMARIES)
      .forEach(({ key }) => store.delete(key));
    await transactionDone(transaction);
  }
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
