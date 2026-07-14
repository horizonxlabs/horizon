import { createPersistedGovernedAiExecutor } from "../../apps/platform-api/src/ai-governance/execution-runtime";
import { createAiGovernanceRepositoryBackedService, type AiGovernancePersistenceClient } from "../../apps/platform-api/src/persistence/ai-governance-repositories";
import type { PlatformUser } from "../../apps/platform-api/src/platform-services";

export async function createPersistedGovernedAiFixture(client: AiGovernancePersistenceClient, admin: PlatformUser) {
  const service = createAiGovernanceRepositoryBackedService(client);
  const provider = await service.createProvider(admin, { name: "Test governed provider", adapter: "openai", baseUrl: "https://governed.test/v1", models: ["gpt-test"] });
  await service.createApiKey(admin, { providerId: provider.id, name: "Test key", secret: "test-secret", usageMode: "production", quotaTokens: 100000, fallbackPriority: 1 });
  await Promise.all(["frontend_coding", "prd_generation"].map((scenario) =>
    service.configureRoute(admin, { scenario, primaryProviderId: provider.id, primaryModel: "gpt-test" })
  ));
  await service.configureQuota(admin, { scope: "creator", dailyLimit: 1000, monthlyLimit: 30000, warningThreshold: 900, hardStop: true, usedToday: 0 });
  return {
    service,
    executor: createPersistedGovernedAiExecutor(client, {
      fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: "test workspace completion" } }], usage: { total_tokens: 120 } }), { status: 200, headers: { "content-type": "application/json" } })
    })
  };
}
