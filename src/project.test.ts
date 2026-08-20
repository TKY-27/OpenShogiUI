/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectStatus, routeForHash, workspaceStatuses } from "./project";

describe("project foundation metadata", () => {
  it("identifies the clean-history release status", () => {
    expect(projectStatus).toEqual({ release: "candidate" });
  });

  it("reports each workspace exactly once", () => {
    const names = workspaceStatuses.map(({ workspace }) => workspace);

    expect(new Set(names).size).toBe(names.length);
    expect(workspaceStatuses.every(({ status }) => status === "ready")).toBe(
      true,
    );
  });

  it("keeps Workspace as the safe default for unknown hash routes", () => {
    expect(routeForHash("#/match")).toBe("match");
    expect(routeForHash("#/evaluation-lab")).toBe("evaluation-lab");
    expect(routeForHash("#/browser-play")).toBe("browser-play");
    expect(routeForHash("#/workspace")).toBe("workspace");
    expect(routeForHash("#/unknown")).toBe("workspace");
  });

  it("keeps the static publication boundary same-origin and Wasm-capable", () => {
    const headers = readFileSync(
      new URL("../public/_headers", import.meta.url),
      "utf8",
    );

    expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(headers).toContain("worker-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).not.toContain("'unsafe-eval'");
    expect(headers).toContain("/assets/*");
    expect(headers).toContain("max-age=31536000, immutable");
  });
});
