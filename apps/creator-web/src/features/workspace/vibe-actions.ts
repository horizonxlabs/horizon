// single AI action shown in vibe chat: live "running" while AI streams/executes it,
// then "done"/"failed", expandable diff (edit), written body (file), command/SQL, or error.
export type VibeAction = {
  id: string;
  type: string;
  label: string;
  status: "running" | "done" | "failed";
  find?: string;
  replace?: string;
  body?: string;
  error?: string;
};

// Live progress: lines of code this action has produced so far (streamed body for
// file/shell/migration actions, the REPLACE side for edits). Powers the running counters.
export function actionLineCount(action: VibeAction): number {
  const content = action.type === "edit" ? action.replace : action.body;
  if (!content) return 0;
  return content.split("\n").filter((line) => line.length > 0).length;
}

export function turnLineTotal(actions: VibeAction[]): number {
  return actions.reduce((total, action) => total + actionLineCount(action), 0);
}

export const VIBE_ACTION_VERBS: Record<string, [string, string]> = {
  file: ["Creating", "Created"],
  edit: ["Editing", "Edited"],
  shell: ["Running", "Ran"],
  migration: ["Migrating", "Migrated"]
};

export function vibeActionVerb(type: string, status: string): string {
  if (status === "failed") return "Failed";
  const [active, done] = VIBE_ACTION_VERBS[type] ?? ["Working", "Done"];
  return status === "running" ? active : done;
}

export function vibeActionIcon(type: string): string {
  return type === "file"
    ? "📄"
    : type === "edit"
      ? "✏️"
      : type === "shell"
        ? "⚡"
        : type === "migration"
          ? "🗄️"
          : "•";
}
