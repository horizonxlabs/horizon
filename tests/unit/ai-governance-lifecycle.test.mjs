import assert from "node:assert/strict";
import test from "node:test";

const { MemoryAiGovernancePersistenceClient, AiGovernanceRepositoryBackedService } = await import(
  "../../apps/platform-api/src/persistence/ai-governance-repositories.ts"
);

const now = new Date("2026-07-16T00:00:00.000Z");
const admin = { id: "u_admin", email: "admin@example.test", name: "Admin", role: "admin" };
const creator = { id: "u_creator", email: "creator@example.test", name: "Creator", role: "creator" };

function seedClient() {
  return new MemoryAiGovernancePersistenceClient({
    providers: [
      { id: "aip_primary", name: "Primary", adapter: "openai", baseUrl: "https://gateway.example.test/v1", models: ["gpt-test"], status: "active", createdAt: now }
    ],
    apiKeys: [
      { id: "aik_one", providerId: "aip_primary", name: "Key One", usageMode: "shared_key", quotaTokens: 1000, fallbackPriority: 1, fingerprint: "sha256:one", maskedValue: "***one", secretCiphertext: "cipher-one", keyVersion: 1, encryptionProvider: "local-envelope", status: "active", createdAt: now },
      { id: "aik_two", providerId: "aip_primary", name: "Key Two", usageMode: "shared_key", quotaTokens: 1000, fallbackPriority: 2, fingerprint: "sha256:two", maskedValue: "***two", secretCiphertext: "cipher-two", keyVersion: 1, encryptionProvider: "local-envelope", status: "active", createdAt: now }
    ],
    routes: [
      { id: "air_frontend", scenario: "frontend_coding", primaryProviderId: "aip_primary", primaryModel: "gpt-test", createdAt: now }
    ]
  });
}

test("setProviderStatus flips a provider to disabled", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  const updated = await service.setProviderStatus(admin, "aip_primary", "disabled");
  assert.equal(updated.status, "disabled");
  const [reloaded] = await service.listProviders(admin);
  assert.equal(reloaded.status, "disabled");
});

test("setProviderStatus rejects a non-admin actor", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await assert.rejects(() => service.setProviderStatus(creator, "aip_primary", "disabled"));
});

test("updateProvider changes name/baseUrl/models and preserves status", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await service.setProviderStatus(admin, "aip_primary", "disabled");
  const updated = await service.updateProvider(admin, "aip_primary", {
    name: "Primary Renamed",
    baseUrl: "https://gateway.example.test/v2",
    models: ["gpt-test-2", "gpt-test-3"]
  });
  assert.equal(updated.name, "Primary Renamed");
  assert.equal(updated.baseUrl, "https://gateway.example.test/v2");
  assert.deepEqual(updated.models, ["gpt-test-2", "gpt-test-3"]);
  assert.equal(updated.status, "disabled");

  const [reloaded] = await service.listProviders(admin);
  assert.equal(reloaded.name, "Primary Renamed");
  assert.equal(reloaded.baseUrl, "https://gateway.example.test/v2");
  assert.deepEqual(reloaded.models, ["gpt-test-2", "gpt-test-3"]);
  assert.equal(reloaded.status, "disabled");
});

test("updateProvider rejects a non-admin actor", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await assert.rejects(() =>
    service.updateProvider(creator, "aip_primary", { name: "X", baseUrl: "https://x.example.test", models: ["m"] })
  );
});

test("updateProvider rejects an unknown providerId", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await assert.rejects(() =>
    service.updateProvider(admin, "aip_missing", { name: "X", baseUrl: "https://x.example.test", models: ["m"] })
  );
});

test("setApiKeyStatus flips a key to disabled", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  const updated = await service.setApiKeyStatus(admin, "aik_one", "disabled");
  assert.equal(updated.status, "disabled");
  const keys = await service.listApiKeys(admin);
  const key = keys.find((k) => k.id === "aik_one");
  assert.equal(key.status, "disabled");
});

test("setApiKeyStatus rejects a non-admin actor", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await assert.rejects(() => service.setApiKeyStatus(creator, "aik_one", "disabled"));
});

test("deleteApiKey removes a single key", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await service.deleteApiKey(admin, "aik_one");
  const keys = await service.listApiKeys(admin);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].id, "aik_two");
});

test("deleteApiKey rejects a non-admin actor", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await assert.rejects(() => service.deleteApiKey(creator, "aik_one"));
});

test("deleteProvider cascades: removes provider, its keys, and referencing routes", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await service.deleteProvider(admin, "aip_primary");

  const providers = await service.listProviders(admin);
  assert.equal(providers.length, 0);

  const keys = await service.listApiKeys(admin);
  assert.equal(keys.length, 0);

  const routes = await service.listRoutes(admin);
  assert.equal(routes.length, 0);
});

test("deleteProvider rejects a non-admin actor", async () => {
  const client = seedClient();
  const service = new AiGovernanceRepositoryBackedService(client);
  await assert.rejects(() => service.deleteProvider(creator, "aip_primary"));
});
