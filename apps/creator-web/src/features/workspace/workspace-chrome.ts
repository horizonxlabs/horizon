import { ClipboardList, Hammer } from "lucide-react";
import type { WorkspaceAgentMode } from "@evcp/api-client";

// Workspace header chrome: the view tabs and the Plan/Build mode switch.
// Extracted from WorkspacePage to keep it under the file-size ratchet.

export const WORKSPACE_TABS = ["preview", "prd", "code", "database", "history"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  preview: "Preview",
  prd: "PRD",
  code: "Code",
  database: "Database",
  history: "History"
};

export const MODE_OPTIONS: Array<{
  value: WorkspaceAgentMode;
  label: string;
  description: string;
  Icon: typeof ClipboardList;
}> = [
  { value: "plan", label: "Plan", description: "Read-only analysis", Icon: ClipboardList },
  { value: "build", label: "Build", description: "Apply changes", Icon: Hammer }
];
