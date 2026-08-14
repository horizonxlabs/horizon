import test from "node:test";
import assert from "node:assert/strict";

const { createCreatorNavigation } = await import("../../apps/creator-web/src/app/routes.ts");
const { WORKSPACE_TABS, TAB_LABELS } = await import(
  "../../apps/creator-web/src/features/workspace/workspace-chrome.ts"
);
const { actionLineCount, turnLineTotal } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-actions.ts"
);

test("PRD leaves the sidebar — it lives in the workspace tabs now", () => {
  const nav = createCreatorNavigation({ id: "prj_x", name: "X", appType: "Workflow App" });
  assert.ok(!nav.some((item) => /prd/i.test(item.label)), "no PRD item in the sidebar");
  assert.ok(WORKSPACE_TABS.includes("prd"), "workspace tabs include prd");
  assert.equal(TAB_LABELS.prd, "PRD");
});

test("line counters track streamed work per action and per turn", () => {
  const fileAction = { id: "a", type: "file", label: "app/page.tsx", status: "running", body: "a\nb\nc" };
  const editAction = {
    id: "b",
    type: "edit",
    label: "app/page.tsx",
    status: "done",
    find: "old",
    replace: "x\ny"
  };
  const bare = { id: "c", type: "shell", label: "npm i", status: "running" };
  assert.equal(actionLineCount(fileAction), 3);
  assert.equal(actionLineCount(editAction), 2);
  assert.equal(actionLineCount(bare), 0);
  assert.equal(turnLineTotal([fileAction, editAction, bare]), 5);
  assert.equal(turnLineTotal([]), 0);
});
