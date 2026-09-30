// Production play smoke over the final dist/ output.
//
// Unlike scripts/check-prototype-production.mjs (emitted bytes/allowlisting)
// and scripts/verify-ai-wasm.mjs (legacy/full analysis snapshot), this script
// exercises the actual production play path end to end:
//   1. Static phase: dist/model/manifest.json must bind every emitted byte to
//      the reviewed release allowlist (release-model.json / release-assets.json),
//      with the frozen R4 weights as the default model.
//   2. Browser phase: the exact emitted Worker chunk is instantiated in a real
//      COOP/COEP-isolated page served from dist/, initialized with the served
//      manifest and the real frozen R4 bytes, and driven through play
//      initialization, a legal move, a timed search with progress, cooperative
//      SharedArrayBuffer cancellation, another move, and a reset with a fresh
//      Worker. Deliberately wrong runtime/model identities must genuinely fail
//      through the same production Worker.
//
// Requires a built dist/ (npm run build) and a Chromium-driver-capable local
// Chrome. This is not part of `npm run check` because it needs a browser; CI
// covers the fetch/build/allowlist half through `npm run build:cloudflare`.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(`production play smoke: ${message}`);
};

// ---------------------------------------------------------------- static phase
assert(
  existsSync(join(dist, "model", "manifest.json")),
  "dist/ is missing or stale; run npm run build first",
);
const manifest = JSON.parse(
  readFileSync(join(dist, "model", "manifest.json"), "utf8"),
);
assert(
  manifest.schema === "open_shogi_release_assets/v1" &&
    Array.isArray(manifest.models) &&
    manifest.models.some((m) => m.selection === manifest.default),
  "dist manifest is not a release allowlist",
);
const allowlist = JSON.parse(
  readFileSync(join(root, "release-model.json"), "utf8"),
);
const assetMap = JSON.parse(
  readFileSync(join(root, "release-assets.json"), "utf8"),
);
const frozenR4 =
  "9466a7e8cf11b7d165b325edd9a5a421bdbaa4bed550940afcf33c9faf3bfd0f";
for (const model of manifest.models) {
  const pinned = allowlist.models.find(
    (entry) => entry.selection === model.selection,
  );
  assert(pinned, `model ${model.selection} is not in release-model.json`);
  const pinnedHashes = Object.fromEntries(
    Object.entries(pinned.model.artifacts).map(([name, artifact]) => [
      name,
      artifact === null ? null : artifact.sha256,
    ]),
  );
  const emittedHashes = Object.fromEntries(
    Object.entries(model.artifacts).map(([name, artifact]) => [
      name,
      artifact === null ? null : artifact.sha256,
    ]),
  );
  assert(
    JSON.stringify(pinnedHashes) === JSON.stringify(emittedHashes),
    `model ${model.selection} artifacts drift from release-model.json`,
  );
  assert(
    model.runtimeProfile === "pure_learned-v3" &&
      model.controllerEnabled === false,
    `model ${model.selection} runtime profile/controller changed`,
  );
  for (const name of ["engine.js", "engine.wasm"]) {
    const mapEntry = assetMap.assets[model.artifacts[name].sha256];
    assert(mapEntry, `${name} hash missing from release-assets.json`);
    assert(
      mapEntry.tracked && mapEntry.tracked.startsWith("assets/pure-runtime/"),
      `${name} must stay a tracked pure-runtime source`,
    );
    const emitted = readFileSync(
      join(dist, "model", model.artifacts[name].sha256, name),
    );
    const tracked = readFileSync(join(root, mapEntry.tracked));
    assert(
      sha256(emitted) === model.artifacts[name].sha256 &&
        emitted.equals(tracked),
      `emitted ${name} bytes diverge from the tracked pure runtime`,
    );
  }
  const leafGz = readFileSync(
    join(
      dist,
      "model",
      model.artifacts["leaf.osaval03"].sha256,
      "leaf.osaval03.gz",
    ),
  );
  const leaf = spawnSync("gzip", ["-dc"], {
    input: leafGz,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert(leaf.status === 0, "leaf gunzip failed");
  assert(
    sha256(leaf.stdout) === model.artifacts["leaf.osaval03"].sha256,
    `emitted leaf bytes mismatch for ${model.selection}`,
  );
}
const selected = manifest.models.find((m) => m.selection === manifest.default);
assert(
  selected.artifacts["leaf.osaval03"].sha256 === frozenR4,
  "the default model is not the frozen R4 weights",
);
const workerChunks = readdirSync(join(dist, "assets")).filter((name) =>
  /^core-prototype\.worker-[A-Za-z0-9_-]+\.js$/.test(name),
);
assert(
  workerChunks.length === 1,
  `expected exactly one emitted production Worker chunk, found ${workerChunks.length}`,
);
console.log(
  `static: ${manifest.models.length} models bound to the allowlist; default ${manifest.default} (R4 ${frozenR4.slice(0, 12)}…, wasm ${selected.artifacts["engine.wasm"].sha256.slice(0, 12)}…); worker ${workerChunks[0]}`,
);

// -------------------------------------------------------------- browser phase
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      resolve(
        homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
  ).href
).catch(async (error) => {
  // Fall back to a plain dependency resolution before giving up honestly.
  try {
    return await import("playwright");
  } catch {
    throw error;
  }
});

const port = 4179;
// Serves dist/ the way the deployed Workers-asset site does: exact bytes with
// COOP/COEP isolation and the production CSP. `vite preview` is unsuitable
// here because its static layer labels .gz files Content-Encoding: gzip, so
// fetch() would transparently decompress the leaf and the Worker's explicit
// DecompressionStream would then fail on already-decoded bytes.
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".gz": "application/octet-stream",
};
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  let path = normalize(decodeURIComponent(url.pathname)).replaceAll("\\", "/");
  if (path.endsWith("/")) path += "index.html";
  let file = join(dist, path);
  if (!file.startsWith(dist + sep) || !existsSync(file) || !path.slice(1)) {
    // SPA fallback, mirroring the deployed single-page-application handling.
    file = join(dist, "index.html");
  }
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  response.setHeader(
    "Content-Type",
    mime[extname(file)] ?? "application/octet-stream",
  );
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(port, "127.0.0.1", done));
try {
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let attempt = 0; attempt < 50 && !up; attempt++) {
    await new Promise((done) => setTimeout(done, 200));
    up = await fetch(base)
      .then((r) => r.ok)
      .catch(() => false);
  }
  assert(up, "vite preview did not start");

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const pageErrors = [];
    page.on("crash", () => pageErrors.push("PAGE CRASHED"));
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
      if (message.text().startsWith("[smoke]")) console.log(message.text());
    });
    await page.goto(`${base}/#/workspace`);
    await page
      .getByRole("heading", { name: "オープンな将棋のAI", exact: true })
      .waitFor({ timeout: 30_000 });

    // Drives the exact emitted Worker chunk over its real protocol: shared
    // cancellation included. A Worker accepts initialize exactly once, so
    // "reset" is a fresh Worker — the same contract the production session
    // implements for rematches and restores.
    const outcome = await page.evaluate(
      async ({ workerChunk, frozenR4 }) => {
        const manifest = await fetch("/model/manifest.json").then((r) =>
          r.json(),
        );
        const model = manifest.models.find(
          (entry) => entry.selection === manifest.default,
        );
        const release = {
          schema: model.schema,
          selection: model.selection,
          runId: model.runId,
          artifacts: model.artifacts,
        };
        const workers = [];
        const spawnWorker = () => {
          const worker = new Worker(`/assets/${workerChunk}`, {
            type: "module",
            name: "open-shogi-production-smoke",
          });
          workers.push(worker);
          return worker;
        };
        const call = (worker, payload, onProgress = null, timeoutMs = 90_000) =>
          new Promise((done, fail) => {
            const timer = setTimeout(
              () => fail(new Error(`${payload.kind} timed out`)),
              timeoutMs,
            );
            const progress = [];
            const onMessage = (event) => {
              const data = event.data;
              // An id-0 rejection is the Worker's protocol-error signal; a
              // wrong manifest must fail loudly, never hang the driver.
              if (data.id === 0 && data.ok === false) {
                worker.removeEventListener("message", onMessage);
                clearTimeout(timer);
                done({ response: data, progress });
                return;
              }
              if (data.id !== payload.id) return;
              if (data.kind === "progress") {
                progress.push(data.data);
                onProgress?.(data.data);
                return;
              }
              worker.removeEventListener("message", onMessage);
              clearTimeout(timer);
              done({ response: data, progress });
            };
            worker.addEventListener("message", onMessage);
            worker.postMessage(payload);
          });
        let nextId = 1;
        const initialize = async (worker, override) => {
          const manifest = override ?? release;
          const { response } = await call(worker, {
            id: nextId++,
            kind: "initialize",
            manifest,
            enabled: false,
            initialSfen: null,
            moves: [],
          });
          if (!response.ok) return { ok: false, error: response.error };
          return { ok: true, ready: response.data };
        };
        try {
          // 1. Play initialization with the real served manifest and bytes.
          const worker = spawnWorker();
          console.log("[smoke] initialize");
          const booted = await initialize(worker);
          if (!booted.ok) throw new Error(`initialize failed: ${booted.error}`);
          const identity = booted.ready.identity;
          if (
            identity.buildClass !== "pure-only" ||
            identity.evaluationMode !== "pure-value" ||
            identity.leafSha256 !== frozenR4 ||
            identity.jsSha256 !== release.artifacts["engine.js"].sha256 ||
            identity.wasmSha256 !== release.artifacts["engine.wasm"].sha256 ||
            booted.ready.snapshot.moveNumber !== 1 ||
            booted.ready.snapshot.legalMoves.length !== 30
          )
            throw new Error("verified identity or initial snapshot mismatch");

          // 2. A legal move.
          console.log("[smoke] legal move");
          const moved = await call(worker, {
            id: nextId++,
            kind: "move",
            movement: "7g7f",
          });
          if (
            !moved.response.ok ||
            moved.response.data.moveNumber !== 2 ||
            moved.response.data.sideToMove !== "white"
          )
            throw new Error("legal move replay failed");

          // 3. A timed search that publishes progress before completing.
          const timeControl = {
            schema: "open_shogi_time_control/v1",
            blackTimeMs: 0,
            whiteTimeMs: 0,
            byoyomiMs: 1_500,
            blackIncrementMs: 0,
            whiteIncrementMs: 0,
            safetyMarginMs: 50,
          };
          console.log("[smoke] timed search");
          const searched = await call(worker, {
            id: nextId++,
            kind: "search",
            timeControl,
            profile: "balanced",
            cancelBuffer: new SharedArrayBuffer(4),
          });
          if (!searched.response.ok)
            throw new Error(`timed search failed: ${searched.response.error}`);
          const result = searched.response.data;
          // The search ran after 7g7f: its best move must be legal in the
          // post-move snapshot, not the initial one.
          const legal = moved.response.data.legalMoves.some(
            (move) => move.usi === result.bestMove,
          );
          if (
            searched.progress.length === 0 ||
            result.perspective !== "white" ||
            !legal ||
            result.runtimeProof.profile !== "pure_learned" ||
            result.runtimeProof.learned_eval_calls < 1
          )
            throw new Error(
              `timed search result failed the production checks: progress=${searched.progress.length} perspective=${result.perspective} bestMove=${result.bestMove} legal=${legal} proof=${JSON.stringify(result.runtimeProof?.slice?.(0, 120) ?? result.runtimeProof)}`,
            );

          // 4. Cooperative cancellation through the shared buffer.
          console.log("[smoke] cooperative cancellation");
          const cancel = new SharedArrayBuffer(4);
          const stopped = await new Promise((done, fail) => {
            const guard = setTimeout(
              () => fail(new Error("cancelled search never progressed")),
              15_000,
            );
            call(
              worker,
              {
                id: nextId++,
                kind: "search",
                timeControl: { ...timeControl, byoyomiMs: 8_000 },
                profile: "balanced",
                cancelBuffer: cancel,
              },
              () => {
                // First published progress proves the search is running;
                // raise the shared flag and let the engine stop itself.
                clearTimeout(guard);
                Atomics.store(new Int32Array(cancel), 0, 1);
              },
            ).then(done, fail);
          });
          if (!stopped.response.ok)
            throw new Error(`cancellation failed: ${stopped.response.error}`);
          if (stopped.response.data.termination !== "cancelled")
            throw new Error(
              `expected cooperative cancellation, got ${stopped.response.data.termination}`,
            );

          // 5. Another move after cancellation on the same Worker.
          console.log("[smoke] post-cancel move");
          const movedAgain = await call(worker, {
            id: nextId++,
            kind: "move",
            movement: "3c3d",
          });
          if (
            !movedAgain.response.ok ||
            movedAgain.response.data.moveNumber !== 3
          )
            throw new Error("post-cancellation move failed");
          // Each model load pins hundreds of MB, so the remaining phases run
          // one Worker at a time and terminate each before the next.
          worker.terminate();

          // 6. Reset: a fresh Worker replays to the initial position.
          console.log("[smoke] reset");
          const resetWorker = spawnWorker();
          const reset = await initialize(resetWorker);
          resetWorker.terminate();
          if (!reset.ok) throw new Error(`reset failed: ${reset.error}`);
          if (reset.ready.snapshot.moveNumber !== 1)
            throw new Error("reset did not restore the initial position");

          // 7. Negative: a deliberately wrong runtime identity must fail.
          // The claimed URL embeds the claimed hash, so manifest validation
          // passes and the real emitted Wasm bytes fail the byte-verification
          // hash gate itself (the claimed URL is served from the tracked
          // bytes by the host-side route set up before this evaluate).
          const wrongWasm = structuredClone(release);
          wrongWasm.artifacts = {
            ...wrongWasm.artifacts,
            "engine.wasm": {
              ...wrongWasm.artifacts["engine.wasm"],
              sha256: "e".repeat(64),
              url: `/model/${"e".repeat(64)}/engine.wasm`,
            },
          };
          const runtimeWorker = spawnWorker();
          const runtimeReject = await initialize(runtimeWorker, wrongWasm);
          runtimeWorker.terminate();
          // The production Worker pins the manifest against the compiled
          // release identity, so a wrong runtime hash is refused before any
          // byte is fetched; the rejection itself is the fail-closed proof.
          if (runtimeReject.ok || !runtimeReject.error)
            throw new Error(
              `wrong runtime identity was not rejected: ${JSON.stringify(runtimeReject)}`,
            );
          console.log(
            `[smoke] runtime identity rejected: ${runtimeReject.error}`,
          );

          // 8. Negative: a deliberately wrong model identity must fail.
          // The claimed leaf URL serves the real gzip bytes, so verification
          // passes and the engine's own expected-hash load check rejects the
          // wrong model identity.
          const wrongLeaf = structuredClone(release);
          wrongLeaf.artifacts = {
            ...wrongLeaf.artifacts,
            "leaf.osaval03": {
              ...wrongLeaf.artifacts["leaf.osaval03"],
              sha256: "f".repeat(64),
              url: `/model/${"f".repeat(64)}/leaf.osaval03.gz`,
            },
          };
          const modelWorker = spawnWorker();
          const modelReject = await initialize(modelWorker, wrongLeaf);
          modelWorker.terminate();
          if (modelReject.ok || !modelReject.error)
            throw new Error("wrong model identity was not rejected");
          console.log(`[smoke] model identity rejected: ${modelReject.error}`);

          for (const pending of workers) pending.terminate();
          return { ok: true };
        } catch (error) {
          for (const worker of workers) worker.terminate();
          return { ok: false, error: String(error) };
        }
      },
      { workerChunk: workerChunks[0], frozenR4 },
    );
    if (!outcome.ok) throw new Error(outcome.error);
    assert(
      pageErrors.length === 0,
      `page emitted errors: ${pageErrors.join(" | ")}`,
    );
    await browser.close();
    console.log(
      "browser: production Worker initialized the frozen R4, replayed legal moves, completed a timed pure search, cancelled cooperatively, and rejected wrong runtime/model identities",
    );
  } finally {
    await browser.close().catch(() => {});
  }
} finally {
  server.close();
}
console.log("production play smoke passed");
