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

const actor = {
  id: "usr_creator",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};
const now = new Date("2026-08-07T00:00:00.000Z");

async function createLmStudioExecutor(baseUrl, fetcher) {
  const secretStore = new MemoryAiSecretStore();
  await secretStore.write("aik_lmstudio", "lm-studio");
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [{
      id: "aip_lmstudio",
      name: "Local Model",
      adapter: "lm_studio",
      baseUrl,
      models: ["local-model"],
      status: "active",
      createdAt: now
    }],
    apiKeys: [{
      id: "aik_lmstudio",
      providerId: "aip_lmstudio",
      name: "local",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 0,
      fingerprint: "sha256:test",
      maskedValue: "***test",
      secretCiphertext: "memory://ai-provider-keys/aik_lmstudio",
      keyVersion: 1,
      encryptionProvider: "memory-test-only",
      status: "active",
      createdAt: now
    }],
    routes: [{
      id: "air_prd",
      scenario: "prd_generation",
      primaryProviderId: "aip_lmstudio",
      primaryModel: "local-model",
      createdAt: now
    }]
  });
  return createPersistedGovernedAiExecutor(client, {
    fetcher,
    secretStore,
    executionStore: new MemoryAiExecutionStore()
  });
}

test("LM Studio root URL is normalized to its OpenAI-compatible /v1 endpoint", async () => {
  let observedUrl;
  const executor = await createLmStudioExecutor("https://local-model.example.test", async (url) => {
    observedUrl = String(url);
    return new Response(JSON.stringify({
      choices: [{ message: { content: "PRD ready" } }],
      usage: { total_tokens: 12 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const result = await executor.execute(actor, {
    scenario: "prd_generation",
    projectId: "prj_todo",
    prompt: "Generate a Todo PRD",
    requestId: "req_lmstudio_normalized"
  });

  assert.equal(result.status, "succeeded");
  assert.equal(observedUrl, "https://local-model.example.test/v1/chat/completions");
});

test("HTTP 200 provider error payload reports the provider message instead of empty completion", async () => {
  const executor = await createLmStudioExecutor(
    "https://local-model.example.test/v1",
    async () => new Response(JSON.stringify({
      error: "Unexpected endpoint or method. (POST /chat/completions)"
    }), { status: 200, headers: { "content-type": "application/json" } })
  );

  const result = await executor.execute(actor, {
    scenario: "prd_generation",
    projectId: "prj_todo",
    prompt: "Generate a Todo PRD",
    requestId: "req_lmstudio_error_payload"
  });

  assert.equal(result.status, "failed");
  assert.match(result.evidence.failureReason ?? "", /Unexpected endpoint or method/);
  assert.doesNotMatch(result.evidence.failureReason ?? "", /empty completion/i);
});

test("streamed provider error event preserves the provider message", async () => {
  const stream = [
    'data: {"error":{"message":"Model is not loaded"}}',
    "",
    "data: [DONE]",
    ""
  ].join("\n");
  const executor = await createLmStudioExecutor(
    "https://local-model.example.test/v1",
    async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    })
  );

  const result = await executor.execute(actor, {
    scenario: "prd_generation",
    projectId: "prj_todo",
    prompt: "Generate a Todo PRD",
    requestId: "req_lmstudio_stream_error"
  }, () => {});

  assert.equal(result.status, "failed");
  assert.match(result.evidence.failureReason ?? "", /Model is not loaded/);
  assert.doesNotMatch(result.evidence.failureReason ?? "", /empty completion/i);
});
