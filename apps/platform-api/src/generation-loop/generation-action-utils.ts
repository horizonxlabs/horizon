import type { ActionResult, RunnableAction } from "./action-runner";

const PREVIEW_MAX = 4000;

export function clipActionText(text: string): string {
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}\n… (truncated)` : text;
}

export function buildActionPreview(
  action: Exclude<RunnableAction, { type: "migration" }>,
  result: ActionResult
): { find?: string; replace?: string; body?: string; error?: string } {
  if (!result.ok) return { error: result.error };
  if (action.type === "edit") {
    return { find: clipActionText(action.find), replace: clipActionText(action.replace) };
  }
  if (action.type === "file") return { body: clipActionText(action.content) };
  return { body: clipActionText(`$ ${action.command}\n${result.stdout}`.trim()) };
}

export function describeRunnable(action: RunnableAction): string {
  if (action.type === "shell") return action.command;
  if (action.type === "file" || action.type === "edit") return action.filePath;
  return action.name;
}

export function parseEditBody(body: string): { find: string; replace: string } {
  const match = body.match(
    /<{3,}\s*SEARCH\s*\n([\s\S]*?)\n={3,}[^\n]*\n?([\s\S]*?)\n?>{3,}\s*REPLACE/
  );
  return match ? { find: match[1], replace: match[2] } : { find: "", replace: "" };
}
