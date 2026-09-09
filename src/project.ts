import projectConfiguration from "../project.config.json";

export const projectStatus = {
  release: "candidate",
} as const;

export const repositoryUrl = projectConfiguration.repositoryUrl;

export const workspaceStatuses = [
  { workspace: "adapter", status: "ready" },
  { workspace: "play", status: "ready" },
  { workspace: "delivery", status: "ready" },
] as const;

export type WorkspaceRoute =
  | "workspace"
  | "match"
  | "browser-play"
  | "core-prototype"
  | "evaluation-lab";

export function routeForHash(
  hash: string,
  development = false,
): WorkspaceRoute {
  if (development && hash === "#/core-prototype") return "core-prototype";
  if (hash === "#/match") return "match";
  if (hash === "#/browser-play") return "browser-play";
  if (hash === "#/evaluation-lab") return "evaluation-lab";
  return "workspace";
}
