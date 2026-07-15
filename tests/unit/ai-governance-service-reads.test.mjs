import test from "node:test";
import assert from "node:assert/strict";

test("AiGovernanceService exposes stored routes and quotas", async () => {
  const { AiGovernanceService } = await import("../../apps/platform-api/src/platform-services.ts");
  const audit = { record() {} };
  const auth = { requireRole() {}, resolveCurrentUser: () => admin };
  const admin = { id: "admin-1", platformRoles: ["admin"], email: "a@b.c", name: "A", groups: [] };
  const svc = new AiGovernanceService(auth, audit);

  svc.createProvider(admin, { name: "OpenAI", adapter: "openai", baseUrl: "https://x/v1", models: ["gpt-4.1"] });
  const providerId = svc.listProviders()[0].id;
  svc.configureRoute(admin, { scenario: "frontend_coding", primaryProviderId: providerId, primaryModel: "gpt-4.1" });
  svc.configureQuota(admin, { scope: "organization", dailyLimit: 100, monthlyLimit: 1000, warningThreshold: 80, hardStop: true, usedToday: 0 });

  assert.equal(svc.listRoutes().length, 1);
  assert.equal(svc.listRoutes()[0].scenario, "frontend_coding");
  assert.equal(svc.listQuotas().length, 1);
  assert.equal(svc.listQuotas()[0].scope, "organization");
});
