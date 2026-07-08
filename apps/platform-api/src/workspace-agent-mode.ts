import type { WorkspaceAgentMode } from "@evcp/types";

export function resolveWorkspaceAgentMode(input: unknown): WorkspaceAgentMode {
  if (!input || typeof input !== "object") return "build";
  const body = input as { agentMode?: unknown; workspaceMode?: unknown };
  return body.agentMode === "plan" || body.workspaceMode === "plan" ? "plan" : "build";
}
