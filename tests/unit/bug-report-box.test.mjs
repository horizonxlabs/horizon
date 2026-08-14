import test from "node:test";
import assert from "node:assert/strict";

const { mergeBugReports, buildFixMessage, buildFixAllMessage } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-bugs.ts"
);

test("bug reports merge by signature — a repeat updates instead of duplicating", () => {
  const current = [{ signature: "s1", source: "runtime", message: "boom" }];
  const merged = mergeBugReports(current, [
    { signature: "s1", source: "runtime", message: "boom (updated)" },
    { signature: "s2", source: "relay", message: "crash", file: "app/page.tsx" }
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((bug) => bug.signature === "s1").message, "boom (updated)");
});

test("Fix bug pre-fills a scoped, history-friendly fix request", () => {
  const message = buildFixMessage({
    signature: "s2",
    source: "relay",
    message: "Cannot read properties of undefined",
    file: "app/page.tsx"
  });
  assert.match(message, /แก้ bug/);
  assert.match(message, /Cannot read properties of undefined/);
  assert.match(message, /app\/page\.tsx/);
  assert.match(message, /ไม่กระทบส่วนอื่น/);
  // Old code stays untouched: fixes must be surgical edits, never file rewrites.
  assert.match(message, /ห้ามเขียนทับทั้งไฟล์/);
  const noFile = buildFixMessage({ signature: "s3", source: "build", message: "TS1005" });
  assert.doesNotMatch(noFile, /ไฟล์ undefined/);
});

test("Fix all pre-fills ONE message that covers every open bug", () => {
  const message = buildFixAllMessage([
    { signature: "s1", source: "build", message: "TS1005: ';' expected", file: "app/page.tsx" },
    { signature: "s2", source: "runtime", message: "500 on /" }
  ]);
  assert.match(message, /2 รายการ/);
  assert.match(message, /1\. TS1005/);
  assert.match(message, /2\. 500 on \//);
  assert.match(message, /app\/page\.tsx/);
  assert.match(message, /ไม่กระทบส่วนอื่น/);
  assert.match(message, /ห้ามเขียนทับทั้งไฟล์/);
});
