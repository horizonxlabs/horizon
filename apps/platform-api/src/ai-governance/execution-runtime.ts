import { GovernedAiExecutor, MemoryAiExecutionStore, type AiExecutionStore, type ResolvedAiExecutionPlan, type ResolvedAiProvider } from "./execution-service";
import type { AiGovernancePersistenceClient } from "../persistence/ai-governance-repositories";
import type { AiScenario, PlatformUser } from "../platform-services";

export function createPersistedGovernedAiExecutor(
  client: AiGovernancePersistenceClient,
  options: { executionStore?: AiExecutionStore; fetcher?: typeof fetch } = {}
): GovernedAiExecutor {
  return new GovernedAiExecutor({
    store: options.executionStore ?? new MemoryAiExecutionStore(),
    resolvePlan: async (actor, scenario) => resolvePlan(client, actor, scenario),
    evaluateGuardrail: async ({ scenario, prompt }) => evaluateGuardrail(client, scenario, prompt),
    reserveQuota: async ({ requestedTokens }) => reserveCreatorQuota(client, requestedTokens),
    invoke: async ({ provider, prompt }) => invokeOpenAiCompatible(provider, prompt, options.fetcher ?? globalThis.fetch)
  });
}

async function resolvePlan(client: AiGovernancePersistenceClient, actor: PlatformUser, scenario: AiScenario): Promise<ResolvedAiExecutionPlan> {
  if (actor.role !== "admin" && actor.role !== "creator") throw new Error("AI execution requires an Admin or Creator role");
  const route = (await client.aiScenarioRoute.findMany()).find((candidate) => candidate.scenario === scenario);
  if (!route) throw new Error(`No persisted AI route configured for ${scenario}`);
  const provider = await resolveProvider(client, route.primaryProviderId, route.primaryModel);
  const fallback = route.fallbackProviderId ? await resolveProvider(client, route.fallbackProviderId, route.fallbackModel ?? route.primaryModel) : undefined;
  return { provider, ...(fallback ? { fallback } : {}) };
}

async function resolveProvider(client: AiGovernancePersistenceClient, providerId: string, model: string): Promise<ResolvedAiProvider> {
  const provider = await client.aiProvider.findUnique({ where: { id: providerId } });
  if (!provider || provider.status !== "active") throw new Error(`AI provider ${providerId} is not active`);
  if (provider.adapter !== "openai") throw new Error(`AI provider adapter ${provider.adapter} is not supported by the live executor`);
  if (!provider.models.includes(model)) throw new Error(`AI provider ${providerId} does not support model ${model}`);
  const key = (await client.aiApiKey.findMany()).find((candidate) => candidate.providerId === providerId && candidate.status === "active");
  if (!key) throw new Error(`No active key configured for AI provider ${providerId}`);
  if (key.encryptionProvider !== "local-envelope" || !key.secretCiphertext.startsWith("local-envelope:")) throw new Error(`AI provider ${providerId} key cannot be resolved by the configured secret store`);
  return { id: provider.id, model, secret: Buffer.from(key.secretCiphertext.slice("local-envelope:".length), "base64").toString("utf8"), adapter: provider.adapter, baseUrl: provider.baseUrl };
}

async function evaluateGuardrail(client: AiGovernancePersistenceClient, scenario: AiScenario, prompt: string): Promise<{ decision: "allow" | "warn" | "block"; reason?: string }> {
  const rule = (await client.guardrailRule.findMany()).find((candidate) => {
    if (candidate.status !== "active") return false;
    if (candidate.type === "regex") { try { return new RegExp(candidate.pattern, "i").test(prompt); } catch { return false; } }
    return prompt.toLowerCase().includes(candidate.pattern.toLowerCase());
  });
  return rule ? { decision: rule.action, reason: `guardrail:${rule.id}:${scenario}` } : { decision: "allow" };
}

async function reserveCreatorQuota(client: AiGovernancePersistenceClient, requestedTokens: number): Promise<{ allowed: boolean; remainingToday: number }> {
  const quota = (await client.aiQuota.findMany()).find((candidate) => candidate.scope === "creator");
  if (!quota) return { allowed: true, remainingToday: Number.MAX_SAFE_INTEGER };
  const remainingToday = Math.max(quota.dailyLimit - quota.usedToday, 0);
  if (quota.hardStop && requestedTokens > remainingToday) return { allowed: false, remainingToday };
  await client.aiQuota.upsert({ where: { scope: quota.scope }, update: { usedToday: quota.usedToday + requestedTokens }, create: quota });
  return { allowed: true, remainingToday: remainingToday - requestedTokens };
}

async function invokeOpenAiCompatible(provider: ResolvedAiProvider, prompt: string, fetcher: typeof fetch) {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  const response = await fetcher(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${provider.secret}`, "content-type": "application/json" },
    body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: prompt }], temperature: 0.2 })
  });
  const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { total_tokens?: unknown } };
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const text = String(body.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("AI provider returned an empty completion");
  const tokensUsed = Number(body.usage?.total_tokens ?? Math.max(1, Math.ceil((prompt.length + text.length) / 4)));
  return { text, tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 1, latencyMs: 1, providerId: provider.id, model: provider.model };
}
