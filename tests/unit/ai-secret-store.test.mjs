import test from "node:test";
import assert from "node:assert/strict";

const { MemoryAiSecretStore, VaultKvV2AiSecretStore } =
  await import("../../apps/platform-api/src/ai-governance/secret-store.ts");
const { AiGovernanceRepositoryBackedService, MemoryAiGovernancePersistenceClient } =
  await import("../../apps/platform-api/src/persistence/ai-governance-repositories.ts");

test("secret store writes a reference and never returns the secret reference as plaintext", async () => {
  const store = new MemoryAiSecretStore();
  const reference = await store.write("aik_test", "sk-provider-secret");
  assert.match(reference, /^memory:\/\/ai-provider-keys\/aik_test$/);
  assert.equal(await store.read(reference), "sk-provider-secret");
});

test("Vault KV v2 store uses server-side API and a mounted token file", async () => {
  const requests = [];
  const store = new VaultKvV2AiSecretStore({
    address: "https://vault.internal",
    mount: "platform",
    tokenFile: "/run/secrets/vault-token",
    readFile: async () => "vault-token",
    fetcher: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ data: { data: { value: "sk-provider-secret" } } }), {
        status: 200
      });
    }
  });
  const reference = await store.write("aik_test", "sk-provider-secret");
  assert.equal(reference, "vault://platform/data/ai-provider-keys/aik_test");
  assert.equal(await store.read(reference), "sk-provider-secret");
  assert.match(String(requests[0].url), /\/v1\/platform\/data\/ai-provider-keys\/aik_test$/);
  assert.equal(requests[0].init.headers["X-Vault-Token"], "vault-token");
});

test("Vault KV v2 store retries a temporary 503 without surfacing a stuck chat failure", async () => {
  let attempts = 0;
  const store = new VaultKvV2AiSecretStore({
    address: "https://vault.internal",
    mount: "platform",
    tokenFile: "/run/secrets/vault-token",
    retryDelayMs: 0,
    readFile: async () => "vault-token",
    fetcher: async () => {
      attempts += 1;
      if (attempts < 3) return new Response("temporarily unavailable", { status: 503 });
      return new Response(JSON.stringify({ data: { data: { value: "sk-recovered" } } }), {
        status: 200
      });
    }
  });

  assert.equal(await store.read("vault://platform/data/ai-provider-keys/aik_test"), "sk-recovered");
  assert.equal(attempts, 3);
});

test("Vault KV v2 store does not retry permanent authorization failures", async () => {
  let attempts = 0;
  const store = new VaultKvV2AiSecretStore({
    address: "https://vault.internal",
    mount: "platform",
    tokenFile: "/run/secrets/vault-token",
    retryDelayMs: 0,
    readFile: async () => "vault-token",
    fetcher: async () => {
      attempts += 1;
      return new Response("forbidden", { status: 403 });
    }
  });

  await assert.rejects(
    store.read("vault://platform/data/ai-provider-keys/aik_test"),
    /Vault secret operation failed \(403\)/
  );
  assert.equal(attempts, 1);
});

test("Admin provider key persistence stores only a secret-store reference", async () => {
  const store = new MemoryAiSecretStore();
  const client = new MemoryAiGovernancePersistenceClient();
  const service = new AiGovernanceRepositoryBackedService(client, store);
  const admin = {
    id: "usr_admin",
    email: "admin@example.test",
    name: "Admin",
    role: "admin",
    status: "active",
    permissions: []
  };
  const provider = await service.createProvider(admin, {
    name: "Provider",
    adapter: "openai",
    baseUrl: "https://gateway.example.test/v1",
    models: ["gpt-test"]
  });
  await service.createApiKey(admin, {
    providerId: provider.id,
    name: "production",
    secret: "sk-never-persist-this",
    usageMode: "production",
    quotaTokens: 1000,
    fallbackPriority: 0
  });
  const stored = (await client.aiApiKey.findMany())[0];
  assert.equal(stored.encryptionProvider, "memory-test-only");
  assert.match(stored.secretCiphertext, /^memory:\/\/ai-provider-keys\//);
  assert.doesNotMatch(JSON.stringify(stored), /sk-never-persist-this/);
});
