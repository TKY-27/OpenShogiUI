import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { corePrototypeDev } from "./core-prototype-dev";

export default defineConfig({
  plugins: [react(), corePrototypeDev()],
});
