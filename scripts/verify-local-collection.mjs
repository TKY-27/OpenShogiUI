import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import { createServer } from "vite";

// Isolated local D1 only: no account, remote bindings, persistent data or model.
const platform = await getPlatformProxy({
  configPath: "wrangler.jsonc",
  persist: false,
  remoteBindings: false,
  envFiles: [],
});
const vite = await createServer({
  configFile: false,
  cacheDir: "local/collection-vite",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null },
});
try {
  const { createHandler, cleanup } =
    await vite.ssrLoadModule("/worker/index.ts");
  const db = platform.env.DB;
  const migration = await readFile("worker/migrations/0001_games.sql", "utf8");
  await db.batch(
    migration
      .split(";")
      .filter((sql) => sql.trim())
      .map((sql) => db.prepare(sql)),
  );
  const operations = [];
  const measuredDb = {
    prepare(sql) {
      let query = db.prepare(sql);
      const run = async () => {
        const result = await query.all();
        operations.push({
          operation: sql.split(" ")[0],
          rowsRead: result.meta.rows_read,
          rowsWritten: result.meta.rows_written,
        });
        return result;
      };
      return {
        bind(...values) {
          query = query.bind(...values);
          return this;
        },
        async first() {
          return (await run()).results[0] ?? null;
        },
        run,
      };
    },
  };
  const model = {
    modelId: "r4-c4-local-fixture",
    modelSha256: "1".repeat(64),
    jsSha256: "2".repeat(64),
    wasmSha256: "3".repeat(64),
  };
  const env = {
    COLLECTION_ENABLED: "true",
    COLLECTION_CONTACT: "local-test-only",
    COLLECTION_NOTICE_VERSION: "2026-09-21-v1",
    COLLECTION_ALLOWLIST: JSON.stringify([model]),
    DB: measuredDb,
  };
  const payload = {
    schema: "open_shogi_submission/v1",
    gameId: crypto.randomUUID(),
    consentVersion: env.COLLECTION_NOTICE_VERSION,
    model,
    humanSide: "black",
    winner: "white",
    reason: "resignation",
    settings: {
      preset: "blitz3",
      profile: "balanced",
      controller: false,
      ponder: false,
    },
    moves: ["7g7f", "3c3d"],
  };
  const request = (value) =>
    new Request("http://127.0.0.1/api/games", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
  const now = Date.now();
  const handle = createHandler(() => now);
  assert.equal((await handle(request(payload), env)).status, 201);
  assert.equal(operations.length, 1);
  const insert = operations[0];
  assert(insert.rowsWritten > 1, "index maintenance also consumes writes");
  operations.length = 0;
  assert.equal((await handle(request(payload), env)).status, 200);
  const duplicate = [...operations];
  assert.equal(
    (await handle(request({ ...payload, moves: [] }), env)).status,
    409,
  );
  assert.equal(
    (await handle(request({ ...payload, gameId: crypto.randomUUID() }), env))
      .status,
    200,
  );
  assert.equal(
    (await handle(request({ ...payload, email: "unwanted" }), env)).status,
    400,
  );
  const row = await db.prepare("SELECT * FROM unverified_games").first();
  assert.deepEqual(JSON.parse(row.payload), payload);
  assert.equal(row.expires_at - row.received_at, 30 * 86400);
  const storage = await db
    .prepare(
      "SELECT length(CAST(payload AS BLOB)) AS payload_bytes FROM unverified_games WHERE game_id = ?",
    )
    .bind(payload.gameId)
    .first();
  const plans = await Promise.all(
    [
      "EXPLAIN QUERY PLAN SELECT payload_hash FROM unverified_games WHERE game_id = ?",
      "EXPLAIN QUERY PLAN SELECT game_id FROM unverified_games WHERE expires_at <= ? ORDER BY expires_at LIMIT ?",
    ].map((sql, i) =>
      db
        .prepare(sql)
        .bind(...(i ? [row.expires_at, 500] : [payload.gameId]))
        .all(),
    ),
  );
  assert(
    plans.every((plan) =>
      plan.results.every(
        (row) => !String(row.detail).includes("SCAN unverified_games"),
      ),
    ),
  );
  operations.length = 0;
  await cleanup(env, row.expires_at);
  const expiry = [...operations];
  assert.equal(
    await db.prepare("SELECT game_id FROM unverified_games").first(),
    null,
  );
  assert.equal(
    (await handle(request(payload), { ...env, COLLECTION_ENABLED: "false" }))
      .status,
    503,
  );
  assert.equal(
    (await handle(request(payload), { ...env, DB: undefined })).status,
    503,
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        source: "local D1 emulator; not production billing or CPU",
        insert,
        duplicate,
        expiry,
        storage,
        plans: plans.map((plan) => plan.results),
      },
      null,
      2,
    ),
  );
} finally {
  await vite.close();
  await platform.dispose();
}
