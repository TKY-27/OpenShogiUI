import {
  CONSENT_VERSION,
  MAX_COLLECTION_BYTES,
  RETENTION_DAYS,
  parseCollectionIdentity,
  parseSubmission,
} from "../src/collection-schema";

// A minimal D1 boundary also lets local tests exercise the exact Worker handler.
export interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface CollectionEnv {
  DB?: { prepare(sql: string): Statement };
  COLLECTION_ENABLED?: string;
  COLLECTION_ALLOWLIST?: string;
  COLLECTION_NOTICE_VERSION?: string;
  COLLECTION_CONTACT?: string;
}
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
const reply = (status: number, code: string) =>
  new Response(JSON.stringify({ status: code }), { status, headers });
const digest = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_COLLECTION_BYTES) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
/** ponytail: per-isolate burst guard, not global; reassess edge-wide protection before expanding collection. No per-person identifier. */
export function createHandler(now = () => Date.now()) {
  let windowStart = 0,
    requests = 0;
  return async (request: Request, env: CollectionEnv): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== "/api/games") return reply(404, "not_found");
    if (request.method !== "POST") return reply(405, "method");
    if (
      env.COLLECTION_ENABLED !== "true" ||
      env.COLLECTION_NOTICE_VERSION !== CONSENT_VERSION ||
      !env.COLLECTION_CONTACT
    )
      return reply(503, "disabled");
    if (
      request.headers.get("origin") !== url.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return reply(403, "origin");
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        request.headers.get("content-type") ?? "",
      ) ||
      request.headers.has("content-encoding")
    )
      return reply(415, "content_type");
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      requests = 0;
    }
    if (++requests > 12) return reply(429, "busy");
    if (!env.DB) return reply(503, "unavailable");
    let allowlist;
    try {
      const configured: unknown = JSON.parse(env.COLLECTION_ALLOWLIST ?? "[]");
      if (
        !Array.isArray(configured) ||
        configured.length === 0 ||
        configured.length > 4
      )
        return reply(503, "disabled");
      allowlist = configured.map(parseCollectionIdentity);
    } catch {
      return reply(503, "disabled");
    }
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      return reply(
        error instanceof Error && error.message === "size" ? 413 : 400,
        "body",
      );
    }
    let submission;
    try {
      submission = parseSubmission(JSON.parse(body), allowlist);
    } catch {
      return reply(400, "invalid");
    }
    try {
      const payload = JSON.stringify(submission);
      const payloadHash = await digest(payload);
      // Starting position is fixed by the schema. Different UUIDs/settings cannot multiply the same move sequence.
      const recordHash = await digest(JSON.stringify(submission.moves));
      const received = Math.floor(now() / 1000),
        expires = received + RETENTION_DAYS * 86400;
      const inserted = await env.DB.prepare(
        "INSERT INTO unverified_games (game_id, payload_hash, record_hash, payload, received_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING game_id",
      )
        .bind(
          submission.gameId,
          payloadHash,
          recordHash,
          payload,
          received,
          expires,
        )
        .first<{ game_id: string }>();
      if (inserted) return reply(201, "accepted");
      const existing = await env.DB.prepare(
        "SELECT payload_hash FROM unverified_games WHERE game_id = ?",
      )
        .bind(submission.gameId)
        .first<{ payload_hash: string }>();
      if (existing && existing.payload_hash !== payloadHash)
        return reply(409, "conflict");
      return reply(200, "duplicate");
    } catch {
      return reply(503, "unavailable");
    }
  };
}
// Retention cleanup runs even while COLLECTION_ENABLED=false: accepted rows
// must still expire on schedule whenever the D1 binding exists. Bounded
// batches with a per-run budget keep each daily cron invocation small; a
// backlog beyond the budget drains on the following scheduled runs instead of
// growing an unbounded single DELETE. "30 days" therefore means deleted on a
// later cron run at the latest, not a guaranteed instant purge at expiry.
const CLEANUP_BATCH_ROWS = 500;
const CLEANUP_MAX_BATCHES = 20;
/** D1 returns { meta: { changes } }; node:sqlite returns { changes }. Unknown shapes assume a full batch so draining continues. */
function deletedRows(result: unknown, fallback: number): number {
  const shape = result as {
    changes?: unknown;
    meta?: { changes?: unknown };
  } | null;
  const changes = shape?.meta?.changes ?? shape?.changes;
  return typeof changes === "bigint"
    ? Number(changes)
    : typeof changes === "number"
      ? changes
      : fallback;
}
export async function cleanup(
  env: CollectionEnv,
  nowSeconds: number,
  budget: { batchRows?: number; maxBatches?: number } = {},
): Promise<void> {
  if (!env.DB) return;
  const batchRows = Math.min(
    Math.max(budget.batchRows ?? CLEANUP_BATCH_ROWS, 1),
    1000,
  );
  const maxBatches = Math.max(budget.maxBatches ?? CLEANUP_MAX_BATCHES, 1);
  for (let batch = 0; batch < maxBatches; batch++) {
    const deleted = deletedRows(
      await env.DB.prepare(
        "DELETE FROM unverified_games WHERE game_id IN (SELECT game_id FROM unverified_games WHERE expires_at <= ? ORDER BY expires_at LIMIT ?)",
      )
        .bind(nowSeconds, batchRows)
        .run(),
      batchRows,
    );
    if (deleted < batchRows) break;
  }
}
export default {
  fetch: createHandler(),
  async scheduled(_event: unknown, env: CollectionEnv) {
    try {
      await cleanup(env, Math.floor(Date.now() / 1000));
    } catch {
      /* No request, payload or secret logging. Retry on the next scheduled run. */
    }
  },
};
