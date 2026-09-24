import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createHandler,
  cleanup,
  type CollectionEnv,
  type Statement,
} from "./index";
import { CONSENT_VERSION } from "../src/collection-schema";
const model = {
  modelId: "r4-c4-local-fixture",
  modelSha256: "1".repeat(64),
  jsSha256: "2".repeat(64),
  wasmSha256: "3".repeat(64),
};
const payload = () => ({
  schema: "open_shogi_submission/v1",
  gameId: crypto.randomUUID(),
  consentVersion: CONSENT_VERSION,
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
});
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("./migrations/0001_games.sql", import.meta.url),
      "utf8",
    ),
  );
  const env: CollectionEnv = {
    COLLECTION_ENABLED: "true",
    COLLECTION_CONTACT: "local-test-only",
    COLLECTION_NOTICE_VERSION: CONSENT_VERSION,
    COLLECTION_ALLOWLIST: JSON.stringify([model]),
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        let bindings: (string | number)[] = [];
        return {
          bind(...values) {
            bindings = values;
            return this;
          },
          async first<T>() {
            return (statement.get(...bindings) as T) ?? null;
          },
          async run() {
            return statement.run(...bindings);
          },
        } satisfies Statement;
      },
    },
  };
  return { db, env };
}
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1/api/games", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe("local collection API trust boundary", () => {
  it("stores only the closed payload and deduplicates atomically without read-before-write", async () => {
    const { db, env } = fixture();
    try {
      const handle = createHandler();
      const game = payload();
      expect((await handle(request(game), env)).status).toBe(201);
      expect((await handle(request(game), env)).status).toBe(200);
      expect(
        (
          await handle(
            request({ ...game, winner: "black", reason: "engine-resignation" }),
            env,
          )
        ).status,
      ).toBe(409);
      expect(
        (await handle(request({ ...game, gameId: crypto.randomUUID() }), env))
          .status,
      ).toBe(200);
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM unverified_games").get()?.n,
      ).toBe(1);
      const stored = db.prepare("SELECT * FROM unverified_games").get()!;
      expect(JSON.parse(String(stored.payload))).toEqual(game);
      expect(Object.keys(stored).sort()).toEqual([
        "expires_at",
        "game_id",
        "payload",
        "payload_hash",
        "received_at",
        "record_hash",
      ]);
      expect(Number(stored.expires_at) - Number(stored.received_at)).toBe(
        30 * 86400,
      );
      await cleanup(env, Number(stored.expires_at));
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM unverified_games").get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });
  it.each([
    "name",
    "email",
    "url",
    "comments",
    "headers",
    "fileName",
    "diagnostics",
  ])("rejects extra field %s", async (field) => {
    const { db, env } = fixture();
    try {
      expect(
        (await createHandler()(request({ ...payload(), [field]: "test" }), env))
          .status,
      ).toBe(400);
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM unverified_games").get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });
  it("rejects invalid models, moves, limits, consent, outcomes and nested extra fields", async () => {
    const { db, env } = fixture();
    try {
      for (const change of [
        { model: { ...model, modelId: "r4-c3" } },
        { model: { ...model, wasmSha256: "4".repeat(64) } },
        { moves: Array(513).fill("7g7f") },
        { moves: ["oops"] },
        { settings: { ...payload().settings, profile: "infinite" } },
        { settings: { ...payload().settings, email: "private" } },
        { consentVersion: "old" },
        { reason: "timeout" },
        { winner: "black" },
        { humanSide: ["black"] },
        { winner: ["white"] },
        { reason: ["resignation"] },
        { settings: { ...payload().settings, profile: ["balanced"] } },
      ])
        expect(
          (await createHandler()(request({ ...payload(), ...change }), env))
            .status,
        ).toBe(400);
    } finally {
      db.close();
    }
  });
  it("bounds bytes actually read, rejects encoding/method/origin, and has no read API", async () => {
    const { db, env } = fixture();
    try {
      const h = createHandler();
      expect(
        (await h(new Request("http://127.0.0.1/api/games"), env)).status,
      ).toBe(405);
      expect(
        (
          await h(
            request(payload(), { Origin: "https://elsewhere.invalid" }),
            env,
          )
        ).status,
      ).toBe(403);
      expect(
        (await h(request(payload(), { "Content-Encoding": "gzip" }), env))
          .status,
      ).toBe(415);
      expect(
        (await h(request("x".repeat(13000), { "Content-Length": "1" }), env))
          .status,
      ).toBe(413);
      expect(
        (await h(request(payload(), { "Content-Type": "text/plain" }), env))
          .status,
      ).toBe(415);
      expect(
        (await h(new Request("http://127.0.0.1/api/list"), env)).status,
      ).toBe(404);
    } finally {
      db.close();
    }
  });
  it("fails closed for OFF, missing DB and D1 errors; burst guard affects only API", async () => {
    const { db, env } = fixture();
    try {
      expect(
        (
          await createHandler()(request(payload()), {
            ...env,
            COLLECTION_ENABLED: "false",
          })
        ).status,
      ).toBe(503);
      expect(
        (await createHandler()(request(payload()), { ...env, DB: undefined }))
          .status,
      ).toBe(503);
      expect(
        (
          await createHandler()(request(payload()), {
            ...env,
            DB: {
              prepare() {
                throw Error("D1 quota");
              },
            },
          })
        ).status,
      ).toBe(503);
      const h = createHandler();
      for (let i = 0; i < 12; i++) await h(request(payload()), env);
      expect((await h(request(payload()), env)).status).toBe(429);
    } finally {
      db.close();
    }
  });
});
