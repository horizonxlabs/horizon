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

export function buildFixMessage(bug: BugReport): string {
  const location = bug.file ? ` (ไฟล์ ${bug.file})` : "";
  return `แก้ bug นี้โดยแก้เฉพาะจุดที่เกี่ยวข้อง ไม่กระทบส่วนอื่น: ${bug.message}${location}`;
}
