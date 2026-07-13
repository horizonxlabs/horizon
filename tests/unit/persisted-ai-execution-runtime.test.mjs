import assert from "node:assert/strict";
import test from "node:test";

const { createPersistedGovernedAiExecutor } = await import(
  "../../apps/platform-api/src/ai-governance/execution-runtime.ts"
);
const { MemoryAiGovernancePersistenceClient } = await import(
  "../../apps/platform-api/src/persistence/ai-governance-repositories.ts"
);
const { MemoryAiExecutionStore } = await import(
  "../../apps/platform-api/src/ai-governance/execution-service.ts"
);

const now = new Date("2026-07-13T00:00:00.000Z");
const actor = { id: "u1", email: "creator@example.test", name: "Creator", role: "creator" };

test("persisted executor resolves the configured route, key, guardrail and quota before one live provider call", async () => {
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "local-envelope:c2VjcmV0", keyVersion: 1, encryptionProvider: "local-envelope", status: "active", createdAt: now }],
    routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }],
    quotas: [{ id: "aiq_creator", scope: "creator", dailyLimit: 1000, monthlyLimit: 10000, warningThreshold: 800, hardStop: true, usedToday: 0, createdAt: now }]
  });
  const requests = [];
  const executor = createPersistedGovernedAiExecutor(client, {
    executionStore: new MemoryAiExecutionStore(),
    fetcher: async (url, init) => {
      requests.push({ url, authorization: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Generated safely" } }], usage: { total_tokens: 37 } }), { status: 200 });
    }
  });
  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId: "req_live_1", requestedTokens: 100 });
  assert.equal(result.status, "succeeded");
  assert.equal(result.evidence.providerId, "aip_primary");
  assert.equal(result.evidence.tokensUsed, 37);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, "Bearer secret");
  assert.equal((await client.aiQuota.findMany())[0].usedToday, 37);
});

test("persisted executor retries one transient provider failure before recording success", async () => {
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "local-envelope:c2VjcmV0", keyVersion: 1, encryptionProvider: "local-envelope", status: "active", createdAt: now }],
    routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }]
  });
  let attempts = 0;
  const executor = createPersistedGovernedAiExecutor(client, {
    fetcher: async () => {
      attempts += 1;
      if (attempts === 1) return new Response("upstream unavailable", { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Recovered" } }], usage: { total_tokens: 9 } }), { status: 200 });
    }
  });
  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId: "req_retry_1" });
  assert.equal(result.status, "succeeded");
  assert.equal(attempts, 2);
});

test("persisted executor does not retry a non-retryable provider response", async () => {
  const client = new MemoryAiGovernancePersistenceClient({ providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }], apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "local-envelope:c2VjcmV0", keyVersion: 1, encryptionProvider: "local-envelope", status: "active", createdAt: now }], routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }] });
  let attempts = 0;
  const executor = createPersistedGovernedAiExecutor(client, { fetcher: async () => { attempts += 1; return new Response("bad request", { status: 400 }); } });
  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId: "req_bad_1" });
  assert.equal(result.status, "failed");
  assert.equal(attempts, 1);
});

test("persisted executor opens a provider circuit after repeated failed executions", async () => {
  const client = new MemoryAiGovernancePersistenceClient({ providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }], apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "local-envelope:c2VjcmV0", keyVersion: 1, encryptionProvider: "local-envelope", status: "active", createdAt: now }], routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }] });
  let attempts = 0;
  const executor = createPersistedGovernedAiExecutor(client, { fetcher: async () => { attempts += 1; return new Response("bad request", { status: 400 }); } });
  for (const requestId of ["req-circuit-1", "req-circuit-2", "req-circuit-3", "req-circuit-4"]) await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId });
  assert.equal(attempts, 3);
});
