import assert from "node:assert/strict";
import test from "node:test";

const { GovernedAiExecutor, MemoryAiExecutionStore } = await import(
  "../../apps/platform-api/src/ai-governance/execution-service.ts"
);

const actor = { id: "usr_creator", email: "creator@example.test", name: "Creator", role: "creator" };
const plan = {
  provider: { id: "aip_primary", model: "gpt-test", secret: "secret", adapter: "openai" },
  fallback: { id: "aip_fallback", model: "gpt-fallback", secret: "fallback-secret", adapter: "openai" }
};

test("governed execution persists one sanitized evidence record for an idempotency key", async () => {
  let calls = 0;
  const executor = new GovernedAiExecutor({
    store: new MemoryAiExecutionStore(),
    resolvePlan: async () => plan,
    evaluateGuardrail: async () => ({ decision: "allow" }),
    reserveQuota: async () => ({ allowed: true, remainingToday: 900 }),
    invoke: async ({ provider }) => { calls += 1; return { text: "response", tokensUsed: 42, latencyMs: 8, providerId: provider.id, model: provider.model }; }
  });
  const first = await executor.execute(actor, { scenario: "workspace", projectId: "proj_1", prompt: "Build a leave view", requestId: "req_1" });
  const second = await executor.execute(actor, { scenario: "workspace", projectId: "proj_1", prompt: "Build a leave view", requestId: "req_1" });
  assert.equal(calls, 1);
  assert.equal(first.status, "succeeded");
  assert.deepEqual(second, first);
  assert.equal(first.evidence.tokensUsed, 42);
  assert.equal("prompt" in first.evidence, false);
  assert.equal("secret" in first.evidence, false);
});

test("guardrail block persists evidence without provider invocation", async () => {
  let calls = 0;
  const executor = new GovernedAiExecutor({
    store: new MemoryAiExecutionStore(),
    resolvePlan: async () => plan,
    evaluateGuardrail: async () => ({ decision: "block", reason: "policy" }),
    reserveQuota: async () => ({ allowed: true, remainingToday: 900 }),
    invoke: async () => { calls += 1; throw new Error("must not call"); }
  });
  const result = await executor.execute(actor, { scenario: "workspace", projectId: "proj_1", prompt: "blocked", requestId: "req_blocked" });
  assert.equal(calls, 0);
  assert.equal(result.status, "blocked");
  assert.equal(result.evidence.failureReason, "policy");
});

