import test from "node:test";
import assert from "node:assert/strict";

const { MemoryAiSecretStore, VaultKvV2AiSecretStore } = await import("../../apps/platform-api/src/ai-governance/secret-store.ts");
const { AiGovernanceRepositoryBackedService, MemoryAiGovernancePersistenceClient } = await import("../../apps/platform-api/src/persistence/ai-governance-repositories.ts");

test("secret store writes a reference and never returns the secret reference as plaintext", async () => {
  const store = new MemoryAiSecretStore();
  const reference = await store.write("aik_test", "sk-provider-secret");
  assert.match(reference, /^memory:\/\/ai-provider-keys\/aik_test$/);
  assert.equal(await store.read(reference), "sk-provider-secret");
});

test("Vault KV v2 store uses server-side API and a mounted token file", async () => {
  const requests = [];
  const store = new VaultKvV2AiSecretStore({
    address: "https://vault.internal", mount: "platform", tokenFile: "/run/secrets/vault-token",
    readFile: async () => "vault-token", fetcher: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ data: { data: { value: "sk-provider-secret" } } }), { status: 200 });
    }
  });
  const reference = await store.write("aik_test", "sk-provider-secret");
  assert.equal(reference, "vault://platform/data/ai-provider-keys/aik_test");
  assert.equal(await store.read(reference), "sk-provider-secret");
  assert.match(String(requests[0].url), /\/v1\/platform\/data\/ai-provider-keys\/aik_test$/);
  assert.equal(requests[0].init.headers["X-Vault-Token"], "vault-token");
});

test("Admin provider key persistence stores only a secret-store reference", async () => {
  const store = new MemoryAiSecretStore();
  const client = new MemoryAiGovernancePersistenceClient();
  const service = new AiGovernanceRepositoryBackedService(client, store);
  const admin = { id: "usr_admin", email: "admin@example.test", name: "Admin", role: "admin", status: "active", permissions: [] };
  const provider = await service.createProvider(admin, { name: "Provider", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"] });
  await service.createApiKey(admin, { providerId: provider.id, name: "production", secret: "sk-never-persist-this", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0 });
  const stored = (await client.aiApiKey.findMany())[0];
  assert.equal(stored.encryptionProvider, "memory-test-only");
  assert.match(stored.secretCiphertext, /^memory:\/\/ai-provider-keys\//);
  assert.doesNotMatch(JSON.stringify(stored), /sk-never-persist-this/);
});
