import assert from "node:assert/strict";
import test from "node:test";

const { GovernedAiExecutor, MemoryAiExecutionStore } = await import(
  "../../apps/platform-api/src/ai-governance/execution-service.ts"
);

function evidence(overrides) {
  return {
    id: `aiexec_${overrides.requestId}`,
    requestId: overrides.requestId,
    actorId: "usr_creator",
    projectId: "proj_1",
    scenario: "workspace",
    providerId: "aip_primary",
    model: "gpt-test",
    status: "succeeded",
    tokensUsed: 42,
    latencyMs: 8,
    costUsd: 0.001,
    fallbackUsed: false,
    quotaScope: "creator:usr_creator",
    quotaTokensReserved: 100,
    occurredAt: overrides.occurredAt
  };
}

test("MemoryAiExecutionStore.listRecent returns saved evidence sorted desc, limited", async () => {
  const store = new MemoryAiExecutionStore();
  await store.save({ status: "succeeded", text: "a", evidence: evidence({ requestId: "req_1", occurredAt: "2026-07-13T00:00:00.000Z" }) });
  await store.save({ status: "succeeded", text: "b", evidence: evidence({ requestId: "req_2", occurredAt: "2026-07-15T00:00:00.000Z" }) });
  await store.save({ status: "succeeded", text: "c", evidence: evidence({ requestId: "req_3", occurredAt: "2026-07-14T00:00:00.000Z" }) });

  const all = await store.listRecent(50);
  assert.deepEqual(all.map((row) => row.requestId), ["req_2", "req_3", "req_1"]);

  const limited = await store.listRecent(2);
  assert.deepEqual(limited.map((row) => row.requestId), ["req_2", "req_3"]);
});

test("GovernedAiExecutor.listRecentEvidence delegates to the store", async () => {
  let receivedLimit;
  const executor = new GovernedAiExecutor({
    store: {
      findByRequestId: async () => undefined,
      save: async (result) => result,
      listRecent: async (limit) => {
        receivedLimit = limit;
        return [evidence({ requestId: "req_9", occurredAt: "2026-07-15T00:00:00.000Z" })];
      }
    },
    resolvePlan: async () => { throw new Error("not used"); },
    evaluateGuardrail: async () => ({ decision: "allow" }),
    reserveQuota: async () => ({ allowed: true, remainingToday: 900 }),
    invoke: async () => { throw new Error("not used"); }
  });

  const result = await executor.listRecentEvidence(50);

  assert.equal(receivedLimit, 50);
  assert.equal(result.length, 1);
  assert.equal(result[0].requestId, "req_9");
});
