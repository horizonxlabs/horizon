import test from "node:test";
import assert from "node:assert/strict";

const { buildVersionHistory } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-history.ts"
);
const { WORKSPACE_TABS, TAB_LABELS } = await import(
  "../../apps/creator-web/src/features/workspace/workspace-chrome.ts"
);

const messages = [
  { id: "u1", role: "user", text: "สร้างระบบคลังสินค้า", actions: [] },
  { id: "a1", role: "assistant", text: "done", actions: [], commitSha: "aaa111bbb222" },
  { id: "u2", role: "user", text: "[AUTO-DEBUG] The platform detected...", actions: [] },
  { id: "a2", role: "assistant", text: "fixed", actions: [], commitSha: "ccc333ddd444" },
  { id: "u3", role: "user", text: "เพิ่มหน้ารายงาน", actions: [] },
  { id: "a3", role: "assistant", text: "no commit here", actions: [] },
  { id: "u4", role: "user", text: "ทำ dark mode", actions: [] },
  { id: "a4", role: "assistant", text: "done", actions: [], commitSha: "eee555fff666" }
];

test("version history pairs each commit with the prompt that created it, newest first", () => {
  const versions = buildVersionHistory(messages);
  assert.equal(versions.length, 3);
  assert.deepEqual(
    versions.map((version) => version.commitSha),
    ["eee555fff666", "ccc333ddd444", "aaa111bbb222"]
  );
  assert.equal(versions[0].prompt, "ทำ dark mode");
  assert.equal(versions[0].isCurrent, true);
  assert.equal(versions[0].version, 3);
  assert.equal(versions[2].prompt, "สร้างระบบคลังสินค้า");
  assert.equal(versions[2].version, 1);
  assert.equal(versions[1].isCurrent, false);
});

test("auto-debug versions are labeled as automatic repairs, not raw prompts", () => {
  const versions = buildVersionHistory(messages);
  const repair = versions.find((version) => version.commitSha === "ccc333ddd444");
  assert.equal(repair.isAutoDebug, true);
  assert.doesNotMatch(repair.prompt, /\[AUTO-DEBUG\]/);
});

test("history joins the workspace tabs", () => {
  assert.ok(WORKSPACE_TABS.includes("history"));
  assert.equal(TAB_LABELS.history, "History");
});
