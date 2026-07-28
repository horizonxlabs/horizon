import test from "node:test";
import assert from "node:assert/strict";

const { vibeChatBody } = await import("../../apps/creator-web/src/features/workspace/api.ts");

test("vibeChatBody includes approvedPlan when given", () => {
  const body = vibeChatBody("do it", [], "build", "Step 1: add a Header.");
  assert.deepEqual(body, { prompt: "do it", attachmentIds: [], agentMode: "build", approvedPlan: "Step 1: add a Header." });
});

test("vibeChatBody omits approvedPlan when not given", () => {
  const body = vibeChatBody("do it", ["a1"], "plan");
  assert.equal("approvedPlan" in body, false);
  assert.deepEqual(body, { prompt: "do it", attachmentIds: ["a1"], agentMode: "plan" });
});
