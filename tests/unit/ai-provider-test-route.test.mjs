import assert from "node:assert/strict";
import test from "node:test";

const { handleAiProviderTestCall, handleLegacyAiProviderTestCall } = await import(
  "../../apps/platform-api/src/ai-governance/provider-test-route.ts"
);

test("legacy provider-test route stays synchronous for the legacy API dispatcher", () => {
  const result = handleLegacyAiProviderTestCall({
    request: { method: "POST", path: "/ai/provider-test-call", body: { scenario: "prd_generation" } },
    resolveUser: () => ({ id: "u1", email: "admin@example.test", name: "Admin", role: "admin" }),
    legacyTest: () => ({ providerId: "p1", providerName: "Primary", adapter: "openai", model: "gpt-test", status: "succeeded", fallbackUsed: false, tokensUsed: 1, latencyMs: 1, usageLogId: "usage-1", outputExcerpt: "ok" })
  });
  assert.equal(typeof result?.then, "undefined");
  assert.equal(result?.status, 201);
  assert.equal(result?.body.data.usageLogId, "usage-1");
});

test("persisted provider-test route uses governed execution evidence instead of legacy AI service", async () => {
  let legacyCalls = 0;
  const result = await handleAiProviderTestCall({
    request: { method: "POST", path: "/ai/provider-test-call", headers: {}, body: { scenario: "frontend_coding", prompt: "Health check", requestedTokens: 37 } },
    resolveUser: async () => ({ id: "u1", email: "admin@example.test", name: "Admin", role: "admin" }),
    executor: { execute: async () => ({ status: "succeeded", text: "safe output", evidence: { id: "e1", requestId: "r1", actorId: "u1", projectId: "", scenario: "frontend_coding", providerId: "aip_primary", model: "gpt-test", status: "succeeded", tokensUsed: 37, latencyMs: 4, fallbackUsed: false, occurredAt: "2026-07-13T00:00:00.000Z" } }) },
    providerNameFor: async () => "Primary provider",
    legacyTest: () => { legacyCalls += 1; throw new Error("legacy must not run"); }
  });
  assert.equal(legacyCalls, 0);
  assert.equal(result?.status, 201);
  assert.equal(result?.body.data.providerName, "Primary provider");
  assert.equal(result?.body.data.usageLogId, "e1");
  assert.equal(result?.body.data.outputExcerpt, "safe output");
});
