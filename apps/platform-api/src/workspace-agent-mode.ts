import type { WorkspaceAgentMode } from "@evcp/types";

export function resolveWorkspaceAgentMode(input: unknown): WorkspaceAgentMode {
  if (!input || typeof input !== "object") return "auto";
  const body = input as { agentMode?: unknown; workspaceMode?: unknown };
  if (body.agentMode !== undefined) {
    return body.agentMode === "plan" || body.agentMode === "build" ? body.agentMode : "auto";
  }
  return body.workspaceMode === "plan" || body.workspaceMode === "build"
    ? body.workspaceMode
    : "auto";
}
