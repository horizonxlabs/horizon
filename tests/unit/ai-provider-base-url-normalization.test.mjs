import assert from "node:assert/strict";
import test from "node:test";

const {
  AiGovernanceRepositoryBackedService,
  MemoryAiGovernancePersistenceClient
} = await import("../../apps/platform-api/src/persistence/ai-governance-repositories.ts");

const admin = {
  id: "usr_admin",
  email: "admin@example.test",
  name: "Admin",
  role: "admin"
};

test("LM Studio provider URLs are normalized when created and updated", async () => {
  const service = new AiGovernanceRepositoryBackedService(
    new MemoryAiGovernancePersistenceClient()
  );

  const created = await service.createProvider(admin, {
    name: "Local Model",
    adapter: "lm_studio",
    baseUrl: "https://local-model.example.test/",
    models: ["local-model"]
  });
  assert.equal(created.baseUrl, "https://local-model.example.test/v1");

  const updated = await service.updateProvider(admin, created.id, {
    name: created.name,
    baseUrl: "https://new-tunnel.example.test",
    models: created.models
  });
  assert.equal(updated.baseUrl, "https://new-tunnel.example.test/v1");
});
