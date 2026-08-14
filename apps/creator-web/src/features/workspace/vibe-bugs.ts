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

// Fix requests keep old code untouched: surgical edits on the involved lines only —
// never a whole-file rewrite, never changes to unrelated files.
const FIX_SCOPE = "แก้เฉพาะจุดที่เกี่ยวข้องแบบ edit ทีละจุด ไม่กระทบส่วนอื่น ห้ามเขียนทับทั้งไฟล์ และห้ามแตะไฟล์อื่นที่ไม่เกี่ยวข้อง";

export function buildFixMessage(bug: BugReport): string {
  const location = bug.file ? ` (ไฟล์ ${bug.file})` : "";
  return `แก้ bug นี้โดย${FIX_SCOPE}: ${bug.message}${location}`;
}

// "Fix ทั้งหมด": one composer message covering every open bug, so multi-bug turns cost
// one round-trip instead of N — still user-sent, still ordinary chat history.
export function buildFixAllMessage(bugs: BugReport[]): string {
  const lines = bugs.map(
    (bug, index) => `${index + 1}. ${bug.message}${bug.file ? ` (ไฟล์ ${bug.file})` : ""}`
  );
  return [`แก้ bug ทั้งหมด ${bugs.length} รายการต่อไปนี้ โดย${FIX_SCOPE}:`, ...lines].join("\n");
}
