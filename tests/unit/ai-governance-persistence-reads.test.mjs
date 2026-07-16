import test from "node:test";
import assert from "node:assert/strict";

test("repository service reads back routes and quotas", async () => {
  const mod = await import("../../apps/platform-api/src/persistence/ai-governance-repositories.ts");
  const service = mod.createAiGovernanceRepositoryBackedService();
  const admin = {
    id: "usr_admin",
    email: "admin@company.com",
    name: "Admin User",
    role: "admin",
    status: "active",
    permissions: ["platform:admin", "ai:manage", "guardrail:manage"]
  };
  await service.createProvider(admin, {
    name: "OpenAI",
    adapter: "openai",
    baseUrl: "https://x/v1",
    models: ["gpt-4.1"]
  });
  const providerId = (await service.listProviders(admin))[0].id;
  await service.configureRoute(admin, {
    scenario: "frontend_coding",
    primaryProviderId: providerId,
    primaryModel: "gpt-4.1"
  });
  await service.configureQuota(admin, {
    scope: "organization",
    dailyLimit: 100,
    monthlyLimit: 1000,
    warningThreshold: 80,
    hardStop: true,
    usedToday: 0
  });
  assert.equal((await service.listRoutes(admin))[0].scenario, "frontend_coding");
  assert.equal((await service.listQuotas(admin))[0].scope, "organization");
});
