import assert from "node:assert/strict";
import test from "node:test";

const { aiGovernanceUnavailableMessage, canMutateAiGovernance } = await import(
  "../../apps/admin-web/src/features/ai-governance/status.ts"
);

test("only ready governance state permits writes", () => {
  assert.equal(canMutateAiGovernance("loading"), false);
  assert.equal(canMutateAiGovernance("unavailable"), false);
  assert.equal(canMutateAiGovernance("ready"), true);
});

test("unavailable status never exposes a provider secret", () => {
  const message = aiGovernanceUnavailableMessage(new Error("failed sk-live-secret"));
  assert.equal(message, "AI governance data is unavailable. Refresh the page or sign in again.");
  assert.equal(message.includes("sk-live"), false);
});
