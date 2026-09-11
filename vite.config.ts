import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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
  return {
    plugins: [
      react(),
      runtimeModule(
        model?.manifest ?? null,
        model?.config.controllerEnabled ?? false,
      ),
      ...(model ? [emitRelease(model)] : isPreview ? [] : [corePrototypeDev()]),
    ],
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
