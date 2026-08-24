// Bug Report box (user-in-command): the platform's detectors report here; the USER decides
// when to fix. "Fix bug" pre-fills the chat composer so the fix request goes through the
// normal turn and lives in chat history like any other instruction.

export type BugReport = {
  signature: string;
  source: string;
  file?: string;
  message: string;
  platformBug?: boolean;
};

export function mergeBugReports(current: BugReport[], incoming: BugReport[]): BugReport[] {
  const merged = new Map(current.map((bug) => [bug.signature, bug]));
  for (const bug of incoming) merged.set(bug.signature, bug);
  return [...merged.values()];
}

export function createBugFixPrompt(bug: BugReport): string {
  const context = [`source: ${bug.source}`, bug.file ? `file: ${bug.file}` : ""]
    .filter(Boolean)
    .join("; ");
  return `Fix this bug by changing only the relevant code and avoiding unrelated changes: ${bug.message} (${context})`;
}

export const buildFixMessage = createBugFixPrompt;
