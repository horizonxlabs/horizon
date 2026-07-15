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
const { MemoryAiSecretStore } = await import(
  "../../apps/platform-api/src/ai-governance/secret-store.ts"
);
const secretStore = new MemoryAiSecretStore();
await secretStore.write("aik_primary", "secret");
await secretStore.write("aik_anthropic", "anthropic-secret");
await secretStore.write("aik_openrouter", "or-secret");
await secretStore.write("aik_lmstudio", "lm-secret");

const now = new Date("2026-07-13T00:00:00.000Z");
const actor = { id: "u1", email: "creator@example.test", name: "Creator", role: "creator" };

test("persisted executor resolves the configured route, key, guardrail and quota before one live provider call", async () => {
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_primary", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
    routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }],
    quotas: [{ id: "aiq_creator", scope: "creator", dailyLimit: 1000, monthlyLimit: 10000, warningThreshold: 800, hardStop: true, usedToday: 0, createdAt: now }]
  });
  const requests = [];
  const executor = createPersistedGovernedAiExecutor(client, {
    executionStore: new MemoryAiExecutionStore(),
    fetcher: async (url, init) => {
      requests.push({ url, authorization: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Generated safely" } }], usage: { total_tokens: 37 }, response_cost: 0.00125 }), { status: 200 });
    }
  });
  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId: "req_live_1", requestedTokens: 100 });
  assert.equal(result.status, "succeeded");
  assert.equal(result.evidence.providerId, "aip_primary");
  assert.equal(result.evidence.tokensUsed, 37);
  assert.equal(result.evidence.costUsd, 0.00125);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, "Bearer secret");
  assert.equal((await client.aiQuotaUsage.findUnique({ where: { scope_scopeId: { scope: "creator", scopeId: actor.id } } }))?.usedToday, 37);
});

test("persisted executor calls Anthropic native messages API with Anthropic authentication", async () => {
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_anthropic", name: "Anthropic", adapter: "anthropic", baseUrl: "https://api.anthropic.com/v1", models: ["claude-sonnet-4-5"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_anthropic", providerId: "aip_anthropic", name: "production", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:def", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_anthropic", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
    routes: [{ id: "air_anthropic", scenario: "frontend_coding", primaryProviderId: "aip_anthropic", primaryModel: "claude-sonnet-4-5", createdAt: now }]
  });
  let observed;
  const executor = createPersistedGovernedAiExecutor(client, {
    fetcher: async (url, init) => {
      observed = { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Anthropic live output" }], usage: { input_tokens: 11, output_tokens: 7 } }), { status: 200 });
    }
  });

  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build safely", requestId: "req_anthropic_live" });

  assert.equal(result.status, "succeeded");
  assert.equal(result.text, "Anthropic live output");
  assert.equal(result.evidence.tokensUsed, 18);
  assert.equal(observed.url, "https://api.anthropic.com/v1/messages");
  assert.equal(observed.headers.get("x-api-key"), "anthropic-secret");
  assert.equal(observed.headers.get("anthropic-version"), "2023-06-01");
  assert.equal(observed.headers.get("authorization"), null);
  assert.equal(observed.body.model, "claude-sonnet-4-5");
  assert.equal(observed.body.messages[0].content, "Build safely");
});

test("persisted executor accounts organization, creator, project, and app quota usage independently", async () => {
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_primary", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
    routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }],
    quotas: ["organization", "creator", "project", "app"].map((scope) => ({ id: `aiq_${scope}`, scope, dailyLimit: 1000, monthlyLimit: 10000, warningThreshold: 800, hardStop: true, usedToday: 0, createdAt: now }))
  });
  const executor = createPersistedGovernedAiExecutor(client, {
    fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: "Generated safely" } }], usage: { total_tokens: 31 } }), { status: 200 })
  });
  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "project-a", prompt: "Build a leave view", requestId: "req_scoped_quota" });
  assert.equal(result.status, "succeeded");
  assert.equal(result.evidence.quotaScope, "organization:platform,creator:u1,project:project-a,app:project-a");
  for (const [scope, scopeId] of [["organization", "platform"], ["creator", "u1"], ["project", "project-a"], ["app", "project-a"]]) {
    assert.equal((await client.aiQuotaUsage.findUnique({ where: { scope_scopeId: { scope, scopeId } } }))?.usedToday, 31);
  }
});

test("every governed Phase 6 scenario resolves through the same persisted gateway", async () => {
  const scenarios = ["prd_generation", "requirement_analysis", "frontend_coding", "backend_coding", "review", "documentation"];
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_primary", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
    routes: scenarios.map((scenario) => ({ id: `air_${scenario}`, scenario, primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }))
  });
  const invoked = [];
  const executor = createPersistedGovernedAiExecutor(client, {
    fetcher: async (_url, init) => {
      invoked.push(JSON.parse(String(init.body)).messages[0].content);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Governed output" } }], usage: { total_tokens: 5 } }), { status: 200 });
    }
  });
  for (const scenario of scenarios) {
    const result = await executor.execute(actor, { scenario, projectId: "project-a", prompt: `execute ${scenario}`, requestId: `req_${scenario}` });
    assert.equal(result.status, "succeeded");
    assert.equal(result.evidence.scenario, scenario);
    assert.equal(result.evidence.providerId, "aip_primary");
  }
  assert.equal(invoked.length, scenarios.length);
});

test("persisted executor retries one transient provider failure before recording success", async () => {
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }],
    apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_primary", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
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
  const client = new MemoryAiGovernancePersistenceClient({ providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }], apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_primary", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }], routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }] });
  let attempts = 0;
  const executor = createPersistedGovernedAiExecutor(client, { fetcher: async () => { attempts += 1; return new Response("bad request", { status: 400 }); } });
  const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId: "req_bad_1" });
  assert.equal(result.status, "failed");
  assert.equal(attempts, 1);
});

test("persisted executor opens a provider circuit after repeated failed executions", async () => {
  const client = new MemoryAiGovernancePersistenceClient({ providers: [{ id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }], apiKeys: [{ id: "aik_primary", providerId: "aip_primary", name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: "memory://ai-provider-keys/aik_primary", keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }], routes: [{ id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }] });
  let attempts = 0;
  const executor = createPersistedGovernedAiExecutor(client, { fetcher: async () => { attempts += 1; return new Response("bad request", { status: 400 }); } });
  for (const requestId of ["req-circuit-1", "req-circuit-2", "req-circuit-3", "req-circuit-4"]) await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a leave view", requestId });
  assert.equal(attempts, 3);
});

for (const variant of [
  { adapter: "openrouter", keyId: "aik_openrouter", secret: "or-secret", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  { adapter: "lm_studio", keyId: "aik_lmstudio", secret: "lm-secret", baseUrl: "http://host.docker.internal:1234/v1", model: "local-model" }
]) {
  test(`persisted executor accepts ${variant.adapter} over the OpenAI-compatible transport`, async () => {
    const client = new MemoryAiGovernancePersistenceClient({
      providers: [{ id: `aip_${variant.adapter}`, name: variant.adapter, adapter: variant.adapter, baseUrl: variant.baseUrl, models: [variant.model], status: "active", createdAt: now }],
      apiKeys: [{ id: variant.keyId, providerId: `aip_${variant.adapter}`, name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: `memory://ai-provider-keys/${variant.keyId}`, keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
      routes: [{ id: `air_${variant.adapter}`, scenario: "frontend_coding", primaryProviderId: `aip_${variant.adapter}`, primaryModel: variant.model, createdAt: now }]
    });
    let observed;
    const executor = createPersistedGovernedAiExecutor(client, {
      fetcher: async (url, init) => {
        observed = { url, authorization: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { total_tokens: 12 } }), { status: 200 });
      }
    });
    const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a view", requestId: `req_${variant.adapter}` });
    assert.equal(result.status, "succeeded");
    assert.equal(observed.url, `${variant.baseUrl}/chat/completions`);
    assert.equal(observed.authorization, `Bearer ${variant.secret}`);
    assert.equal(observed.body.model, variant.model);
  });
}
