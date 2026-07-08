import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryAiGovernancePersistenceClient,
  createAiGovernanceRepositoryBackedService
} from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

const adminActor = {
  id: "usr_admin",
  email: "admin@company.com",
  name: "Admin User",
  role: "admin",
  status: "active",
  permissions: ["platform:admin", "ai:manage", "guardrail:manage"]
};

test("AI governance persistence service creates and lists masked governance records", async () => {
  const service = createAiGovernanceRepositoryBackedService(
    new MemoryAiGovernancePersistenceClient()
  );

  const provider = await service.createProvider(adminActor, {
    name: "OpenAI Persisted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  const key = await service.createApiKey(adminActor, {
    providerId: provider.id,
    name: "Persisted Key",
    secret: "provider-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  const route = await service.configureRoute(adminActor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });
  const quota = await service.configureQuota(adminActor, {
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 30000,
    warningThreshold: 900,
    hardStop: true,
    usedToday: 0
  });
  const rule = await service.createGuardrailRule(adminActor, {
    name: "Block payroll export",
    type: "keyword",
    pattern: "payroll export",
    severity: "high",
    action: "block",
    scope: "organization"
  });
  const guardrail = await service.testPrompt(adminActor, {
    prompt: "Generate payroll export report",
    scenario: "prd_generation"
  });

  assert.equal(provider.name, "OpenAI Persisted");
  assert.equal(key.providerId, provider.id);
  assert.match(key.fingerprint, /^sha256:/);
  assert.match(key.maskedValue, /^\*\*\*/);
  assert.equal(JSON.stringify(key).includes("provider-secret-that-must-not-leak"), false);
  assert.equal(route.primary.providerId, provider.id);
  assert.equal(quota.scope, "creator");
  assert.equal(rule.status, "active");
  assert.equal(guardrail.decision, "block");
  assert.equal((await service.listProviders(adminActor)).length, 1);
  assert.equal((await service.listApiKeys(adminActor)).length, 1);
  assert.equal((await service.listGuardrailEvents(adminActor)).length, 1);
});

test("runtime persistence wiring exposes AI governance service and routes", () => {
  assert.match(appFactory, /aiGovernancePersistence\?: AiGovernanceRepositoryBackedService/);
  assert.match(
    appFactory,
    /createAiGovernanceRepositoryBackedService\(\s*new MemoryAiGovernancePersistenceClient\(\)\s*\)/
  );
  assert.match(appFactory, /createPrismaAiGovernancePersistence\(\s*env\.DATABASE_URL\s*\)/);
  assert.match(appFactory, /isPersistenceAiGovernanceRoute/);
  assert.match(persistenceDoc, /AI Governance Route-Level Coverage/);
});
