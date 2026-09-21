import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

export const PROTOTYPE_PREFIX = "/__core-prototype/";
const RUNTIME_HASHES: Record<string, string> = {
  "engine.js":
    "907da1421263a2cbc621297095d13ccd3f707942b1e6f09bd7a2b2512efeee2e",
  "engine.wasm":
    "ab7fcf0e2433afeea630dbf029f6dc2e9c1130ea315ae189805cda80e1ef8b3a",
  "controller.json":
    "66110bae4ef5fbedd6a3c5537813f0fae5b9276b576a745b2364b4a093141b63",
};
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

interface CandidateArtifact {
  path: string;
  sha256: string;
}
interface CandidateDescriptor {
  schema: "open_shogi_development_candidate/v1";
  runId: string;
  leaf: CandidateArtifact;
  controller: CandidateArtifact | null;
}
async function containedFile(
  root: string,
  path: string,
  maximum: number,
): Promise<Buffer> {
  const resolved = await realpath(resolve(root, path));
  if (!resolved.startsWith(`${root}${sep}`))
    throw new Error("Artifact escapes the AI checkout");
  const info = await stat(resolved);
  if (!info.isFile() || info.size === 0 || info.size > maximum)
    throw new Error("Invalid artifact size");
  const bytes = await readFile(resolved);
  if (bytes.length !== info.size)
    throw new Error("Artifact changed while reading");
  return bytes;
}
export async function readCandidateDescriptor(
  aiRoot: string,
  selection:
    | "candidate"
    | "defense"
    | "r4c1"
    | "r4c2"
    | "r4c3"
    | "r4c4" = "candidate",
): Promise<CandidateDescriptor> {
  if (
    selection !== "candidate" &&
    selection !== "defense" &&
    selection !== "r4c1" &&
    selection !== "r4c2" &&
    selection !== "r4c3" &&
    selection !== "r4c4"
  )
    throw new Error("Invalid candidate selection");
  if (selection === "r4c2") selection = "defense";
  const root = await realpath(aiRoot);
  const value = JSON.parse(
    (
      await containedFile(root, `local/core-prototype/${selection}.json`, 8192)
    ).toString(),
  ) as CandidateDescriptor;
  if (
    value === null ||
    typeof value !== "object" ||
    Object.keys(value).sort().join() !== "controller,leaf,runId,schema" ||
    value.schema !== "open_shogi_development_candidate/v1" ||
    !/^[a-zA-Z0-9._-]{1,96}$/.test(value.runId)
  )
    throw new Error("Invalid candidate descriptor");
  for (const artifact of [value.leaf, value.controller]) {
    if (artifact === null) continue;
    if (
      typeof artifact !== "object" ||
      Object.keys(artifact).sort().join() !== "path,sha256" ||
      typeof artifact.path !== "string" ||
      !artifact.path.startsWith("local/") ||
      artifact.path.includes("..") ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    )
      throw new Error("Invalid candidate artifact");
  }
  if (value.leaf === null) throw new Error("Candidate leaf is required");
  return value;
}
export async function readPrototypeArtifact(
  aiRoot: string,
  name: string,
  selection:
    | "baseline"
    | "candidate"
    | "defense"
    | "r4c1"
    | "r4c2"
    | "r4c3"
    | "r4c4" = "baseline",
) {
  if (!Object.hasOwn(artifacts, name))
    throw new Error("Unknown prototype artifact");
  const spec = artifacts[name as ArtifactName];
  const root = await realpath(aiRoot);
  let path: string = spec.path;
  let expected: string | null =
    name === "leaf.osaval03" ? FROZEN_LEAF_SHA256 : null;
  if (
    selection !== "baseline" &&
    (name === "leaf.osaval03" || name === "controller.json")
  ) {
    const descriptor = await readCandidateDescriptor(root, selection);
    const artifact =
      name === "leaf.osaval03" ? descriptor.leaf : descriptor.controller;
    if (artifact === null)
      throw new Error("Candidate has no matching controller");
    path = artifact.path;
    expected = artifact.sha256;
  }
  const bytes = await containedFile(root, path, spec.maximum);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expected !== null && sha256 !== expected)
    throw new Error("Selected artifact hash mismatch");
  return { bytes, sha256, mime: spec.mime };
}

/** Local development adapter only. No artifact is imported or emitted by Rollup. */
export function corePrototypeDev(): Plugin {
  const uiRoot = dirname(fileURLToPath(import.meta.url));
  const aiRoot = resolve(uiRoot, "../OpenShogiAI");
  return {
    name: "local-core-prototype",
    apply: "serve",
    config: () => ({
      server: {
        host: "127.0.0.1",
        fs: { allow: [uiRoot] },
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        },
      },
    }),
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
          const parts = url.pathname.slice(PROTOTYPE_PREFIX.length).split("/");
          const [requestedSelection, name] = parts;
          const selection =
            requestedSelection === "r4c2" ? "defense" : requestedSelection;
          if (
            parts.length !== 2 ||
            (selection !== "baseline" &&
              selection !== "candidate" &&
              selection !== "defense" &&
              selection !== "r4c1" &&
              selection !== "r4c2" &&
              selection !== "r4c3" &&
              selection !== "r4c4")
          )
            throw new Error("Explicit candidate selection required");
          if (name === "manifest.json" && !url.search) {
            const descriptor =
              selection !== "baseline"
                ? await readCandidateDescriptor(aiRoot, selection)
                : null;
            const entries = await Promise.all(
              Object.keys(artifacts).map(async (name) => {
                if (
                  name === "controller.json" &&
                  descriptor !== null &&
                  descriptor.controller === null
                )
                  return [name, null];
                const artifact = await readPrototypeArtifact(
                  aiRoot,
                  name,
                  selection,
                );
                const pinned = RUNTIME_HASHES[name];
                if (
                  pinned &&
                  artifact.sha256 !== pinned &&
                  (name !== "controller.json" || selection === "baseline")
                )
                  throw new Error("Registered runtime configuration changed");
                return [
                  name,
                  {
                    url: `${PROTOTYPE_PREFIX}${selection}/${name}?sha256=${artifact.sha256}`,
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
                    schema: "open_shogi_core_prototype_assets/v2",
                    selection,
                    runId: descriptor?.runId ?? "frozen-w256-hard2",
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
          const artifact = await readPrototypeArtifact(aiRoot, name, selection);
          const pinned = RUNTIME_HASHES[name];
          if (
            pinned &&
            artifact.sha256 !== pinned &&
            (name !== "controller.json" || selection === "baseline")
          )
            throw new Error("Registered runtime configuration changed");
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
