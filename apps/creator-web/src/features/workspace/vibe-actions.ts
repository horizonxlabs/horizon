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
