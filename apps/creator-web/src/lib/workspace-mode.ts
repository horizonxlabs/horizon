import type { WorkspaceAgentMode } from "@evcp/api-client";

type WorkspaceModeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const DEFAULT_WORKSPACE_MODE: WorkspaceAgentMode = "build";

const STORAGE_PREFIX = "evcp.creator.workspaceMode.";

export function normalizeWorkspaceMode(value: unknown): WorkspaceAgentMode {
  return value === "plan" ? "plan" : DEFAULT_WORKSPACE_MODE;
}

export function workspaceModeStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function readWorkspaceMode(
  storage: WorkspaceModeStorage | undefined,
  projectId: string
): WorkspaceAgentMode {
  if (!storage) return DEFAULT_WORKSPACE_MODE;
  return normalizeWorkspaceMode(storage.getItem(workspaceModeStorageKey(projectId)));
}

export function persistWorkspaceMode(
  storage: WorkspaceModeStorage | undefined,
  projectId: string,
  mode: WorkspaceAgentMode
): void {
  if (!storage) return;
  storage.setItem(workspaceModeStorageKey(projectId), normalizeWorkspaceMode(mode));
}
