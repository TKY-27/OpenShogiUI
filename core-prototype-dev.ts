import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

export const PROTOTYPE_PREFIX = "/__core-prototype/";
export const FROZEN_LEAF_SHA256 =
  "859e922b3f503ddeecf0afeb9a05fccac080a9faca3b19fce9d8253c9039c480";

const artifacts = {
  "engine.js": {
    path: "target/pure/bindings/open_shogi_wasm.js",
    maximum: 2 * 1024 * 1024,
    mime: "text/javascript",
  },
  "engine.wasm": {
    path: "target/pure/bindings/open_shogi_wasm_bg.wasm",
    maximum: 32 * 1024 * 1024,
    mime: "application/wasm",
  },
  "leaf.osaval03": {
    path: "local/frozen/baseline/model.osaval03",
    maximum: 64 * 1024 * 1024,
    mime: "application/octet-stream",
  },
  "controller.json": {
    path: "local/core-prototype/controller.json",
    maximum: 16_384,
    mime: "application/json",
  },
} as const;

type ArtifactName = keyof typeof artifacts;

export function prototypeRequestAllowed(
  request: Pick<IncomingMessage, "headers" | "method"> & {
    socket: { remoteAddress?: string };
  },
): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      request.socket.remoteAddress ?? "",
    )
  )
    return false;
  const host = request.headers.host;
  if (
    !host ||
    !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/.test(host)
  )
    return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  if (
    request.headers.origin !== undefined &&
    request.headers.origin !== `http://${host}`
  )
    return false;
  return true;
}

export async function readPrototypeArtifact(aiRoot: string, name: string) {
  if (!Object.hasOwn(artifacts, name))
    throw new Error("Unknown prototype artifact");
  const spec = artifacts[name as ArtifactName];
  const root = await realpath(aiRoot);
  const path = await realpath(resolve(root, spec.path));
  // Resolve links before opening; an allowlisted name never authorizes another tree.
  if (!path.startsWith(`${root}${sep}`))
    throw new Error("Artifact escapes the AI checkout");
  const info = await stat(path);
  if (!info.isFile() || info.size === 0 || info.size > spec.maximum)
    throw new Error("Invalid artifact size");
  const bytes = await readFile(path);
  if (bytes.length !== info.size)
    throw new Error("Artifact changed while reading");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (name === "leaf.osaval03" && sha256 !== FROZEN_LEAF_SHA256)
    throw new Error("Frozen leaf hash mismatch");
  return { bytes, sha256, mime: spec.mime };
}

/** Local development adapter only. No artifact is imported or emitted by Rollup. */
export function corePrototypeDev(): Plugin {
  const uiRoot = dirname(fileURLToPath(import.meta.url));
  const aiRoot = resolve(uiRoot, "../OpenShogiAI");
  return {
    name: "local-core-prototype",
    apply: "serve",
    config: () => ({ server: { host: "127.0.0.1", fs: { allow: [uiRoot] } } }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(PROTOTYPE_PREFIX)) return next();
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (!prototypeRequestAllowed(request)) {
          response.statusCode = 403;
          response.end("Local prototype requests only");
          return;
        }
        void (async () => {
          const url = new URL(request.url!, `http://${request.headers.host}`);
          const name = url.pathname.slice(PROTOTYPE_PREFIX.length);
          if (name === "manifest.json" && !url.search) {
            const entries = await Promise.all(
              Object.keys(artifacts).map(async (name) => {
                const artifact = await readPrototypeArtifact(aiRoot, name);
                return [
                  name,
                  {
                    url: `${PROTOTYPE_PREFIX}${name}?sha256=${artifact.sha256}`,
                    sha256: artifact.sha256,
                    size: artifact.bytes.length,
                  },
                ];
              }),
            );
            response.setHeader("Content-Type", "application/json");
            response.end(
              request.method === "HEAD"
                ? undefined
                : JSON.stringify({
                    schema: "open_shogi_core_prototype_assets/v1",
                    artifacts: Object.fromEntries(entries),
                  }),
            );
            return;
          }
          if (
            url.searchParams.size !== 1 ||
            !/^[a-f0-9]{64}$/.test(url.searchParams.get("sha256") ?? "")
          )
            throw new Error("Artifact hash is required");
          const artifact = await readPrototypeArtifact(aiRoot, name);
          if (artifact.sha256 !== url.searchParams.get("sha256"))
            throw new Error("Artifact changed; reload the prototype");
          response.setHeader("Content-Type", artifact.mime);
          response.setHeader("Content-Length", artifact.bytes.length);
          response.end(request.method === "HEAD" ? undefined : artifact.bytes);
        })().catch(() => {
          response.statusCode = 503;
          // Filesystem paths and underlying errors stay off the HTTP boundary.
          response.end(
            "Prototype artifacts unavailable or changed. Build the pure engine and controller locally, then retry.",
          );
        });
      });
    },
  };
}
