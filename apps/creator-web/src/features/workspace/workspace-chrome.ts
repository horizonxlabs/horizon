// Workspace header chrome: view tabs extracted from WorkspacePage to keep it under the file-size
// ratchet.

export const WORKSPACE_TABS = ["preview", "prd", "code", "database", "history"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  preview: "Preview",
  prd: "Docs",
  code: "Code",
  database: "Database",
  history: "History"
};
