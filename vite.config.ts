import { siteMetadata } from "./site-metadata";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";
import { corePrototypeDev } from "./core-prototype-dev";
import { emitRelease, releaseBuild, runtimeModule } from "./model-build";

export default defineConfig(async ({ command, isPreview }) => {
  if (
    command === "build" &&
    process.env.NODE_ENV &&
    process.env.NODE_ENV !== "production"
  )
    throw new Error("Production build requires NODE_ENV=production");
  const model = command === "build" ? await releaseBuild() : null;
  // The opt-in game-collection profile is chosen at build time. Local and
  // plain production builds stay disabled; build:cloudflare sets
  // OSUI_COLLECTION_PROFILE=on and the allowlist supplies the exact identity.
  const collectionPolicy =
    command === "build" && process.env.OSUI_COLLECTION_PROFILE === "on" && model
      ? {
          enabled: true,
          models: model.models
            .filter(
              ({ manifest }) =>
                manifest.selection === "r4c4" &&
                /^r4-c4[-a-zA-Z0-9._]{0,90}$/.test(manifest.runId),
            )
            .map(({ config, manifest }) => ({
              modelId: manifest.runId,
              modelSha256: config.artifacts["leaf.osaval03"].sha256,
              jsSha256: config.artifacts["engine.js"].sha256,
              wasmSha256: config.artifacts["engine.wasm"].sha256,
            })),
        }
      : { enabled: false, models: [] };
  if (collectionPolicy.enabled && !collectionPolicy.models.length)
    throw new Error("Collection profile requested but no eligible model");
  return {
    test: { maxWorkers: 1, fileParallelism: false },
    plugins: [
      react(),
      siteMetadata(),
      {
        name: "local-collection-disabled",
        configureServer(server: ViteDevServer) {
          server.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith("/api/")) return next();
            response.statusCode = 503;
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end('{"status":"disabled"}');
          });
        },
      },
      runtimeModule(
        model?.manifest ?? null,
        model?.config.controllerEnabled ?? false,
        model?.models ?? [],
        collectionPolicy,
      ),
      ...(model ? [emitRelease(model)] : isPreview ? [] : [corePrototypeDev()]),
    ],
    server: {
      fs: {
        deny: [
          "**/.git",
          "**/.git/**",
          "**/.qa-*",
          "**/.playwright-mcp/**",
          "**/.env*",
          "**/.dev.vars*",
          "**/local/**",
          "**/.wrangler/**",
          "**/worker/**",
          "**/*.{sqlite,sqlite3,db,pem,key}",
        ],
      },
      headers: {
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
    build: {
      emptyOutDir: true,
      copyPublicDir: false,
      sourcemap: false,
      manifest: true,
    },
    worker: {
      format: "es" as const,
      plugins: () => [
        runtimeModule(
          model?.manifest ?? null,
          model?.config.controllerEnabled ?? false,
          model?.models ?? [],
          collectionPolicy,
        ),
      ],
    },
    preview: {
      host: "127.0.0.1",
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  };
});
