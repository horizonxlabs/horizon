import type { ActionResult, RunnableAction } from "./action-runner";

const PREVIEW_MAX = 4000;

// Tool/build output carries ANSI escape sequences (colors, cursor moves) and \r line
// rewrites; rendered raw in chat they read as "[33m [39m" garbage. Strip everywhere output
// becomes user- or model-facing text.
const ANSI_PATTERN = new RegExp(String.raw`\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B`, "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(/\r\n?/g, "\n");
}

export function clipActionText(text: string): string {
  const clean = stripAnsi(text);
  return clean.length > PREVIEW_MAX ? `${clean.slice(0, PREVIEW_MAX)}\n… (truncated)` : clean;
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

// Builds the executable action from a streamed open action (extracted from generation-service).
export function toRunnableAction(open: {
  id: string;
  type: string;
  filePath?: string;
  content: string;
}): RunnableAction {
  if (open.type === "file") {
    return { id: open.id, type: "file", filePath: open.filePath ?? "", content: open.content };
  }
  if (open.type === "edit") {
    const editParsed = parseEditBody(open.content);
    return {
      id: open.id,
      type: "edit",
      filePath: open.filePath ?? "",
      find: editParsed?.find ?? "",
      replace: editParsed?.replace ?? ""
    };
  }
  if (open.type === "shell") return { id: open.id, type: "shell", command: open.content };
  return { id: open.id, type: "migration", name: open.filePath ?? open.id, sql: open.content };
}
