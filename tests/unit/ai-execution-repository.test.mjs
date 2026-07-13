import assert from "node:assert/strict";
import test from "node:test";

const { PrismaAiExecutionStore } = await import(
  "../../apps/platform-api/src/persistence/ai-execution-repository.ts"
);

test("Prisma execution store returns existing evidence without persisted completion text", async () => {
  const rows = new Map();
  const store = new PrismaAiExecutionStore({
    aiExecutionEvidence: {
      findUnique: async ({ where }) => rows.get(where.requestId) ?? null,
      create: async ({ data }) => { rows.set(data.requestId, data); return data; }
    }
  });
  const saved = await store.save({
    status: "succeeded", text: "server-only completion",
    evidence: { id: "aiexec_req_1", requestId: "req_1", actorId: "u1", projectId: "p1", scenario: "workspace", providerId: "provider", model: "model", status: "succeeded", tokensUsed: 42, latencyMs: 9, fallbackUsed: false, occurredAt: "2026-07-13T00:00:00.000Z" }
  });
  assert.equal(saved.text, "server-only completion");
  const restored = await store.findByRequestId("req_1");
  assert.equal(restored?.status, "succeeded");
  assert.equal(restored?.text, undefined);
  assert.equal(restored?.evidence.tokensUsed, 42);
});

