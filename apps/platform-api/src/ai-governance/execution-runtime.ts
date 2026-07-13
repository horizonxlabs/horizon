import { GovernedAiExecutor, MemoryAiExecutionStore, type AiExecutionStore, type ResolvedAiExecutionPlan, type ResolvedAiProvider } from "./execution-service";
import type { AiGovernancePersistenceClient } from "../persistence/ai-governance-repositories";
import type { AiScenario, PlatformUser } from "../platform-services";

export function createPersistedGovernedAiExecutor(
  client: AiGovernancePersistenceClient,
  options: { executionStore?: AiExecutionStore; fetcher?: typeof fetch; timeoutMs?: number } = {}
): GovernedAiExecutor {
  const circuit = new Map<string, { failures: number; blockedUntil?: number }>();
  return new GovernedAiExecutor({
    store: options.executionStore ?? new MemoryAiExecutionStore(),
    resolvePlan: async (actor, scenario) => resolvePlan(client, actor, scenario),
    evaluateGuardrail: async ({ scenario, prompt }) => evaluateGuardrail(client, scenario, prompt),
    reserveQuota: async ({ requestedTokens }) => reserveCreatorQuota(client, requestedTokens),
    reconcileQuota: async ({ requestedTokens, actualTokens }) => reconcileCreatorQuota(client, requestedTokens, actualTokens),
    invoke: async ({ provider, prompt }) => invokeWithCircuitBreaker(provider, prompt, options.fetcher ?? globalThis.fetch, options.timeoutMs ?? 30_000, circuit)
  });
}

async function invokeWithCircuitBreaker(provider: ResolvedAiProvider, prompt: string, fetcher: typeof fetch, timeoutMs: number, circuit: Map<string, { failures: number; blockedUntil?: number }>) {
  const state = circuit.get(provider.id);
  if (state?.blockedUntil && state.blockedUntil > Date.now()) throw new Error(`AI provider ${provider.id} circuit is open`);
  try {
    const result = await invokeOpenAiCompatible(provider, prompt, fetcher, timeoutMs);
    circuit.delete(provider.id);
    return result;
  } catch (error) {
    const failures = (state?.failures ?? 0) + 1;
    circuit.set(provider.id, { failures, ...(failures >= 3 ? { blockedUntil: Date.now() + 30_000 } : {}) });
    throw error;
  }
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

async function reconcileCreatorQuota(client: AiGovernancePersistenceClient, requestedTokens: number, actualTokens: number): Promise<void> {
  const quota = (await client.aiQuota.findMany()).find((candidate) => candidate.scope === "creator");
  if (!quota) return;
  await client.aiQuota.upsert({ where: { scope: quota.scope }, update: { usedToday: Math.max(0, quota.usedToday - requestedTokens + actualTokens) }, create: quota });
}

async function invokeOpenAiCompatible(provider: ResolvedAiProvider, prompt: string, fetcher: typeof fetch, timeoutMs: number) {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", headers: { authorization: `Bearer ${provider.secret}`, "content-type": "application/json" },
        body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) continue;
        const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & { retryable?: boolean };
        error.retryable = response.status >= 500;
        throw error;
      }
      const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { total_tokens?: unknown } };
      const text = String(body.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("AI provider returned an empty completion");
      const tokensUsed = Number(body.usage?.total_tokens ?? Math.max(1, Math.ceil((prompt.length + text.length) / 4)));
      return { text, tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 1, latencyMs: 1, providerId: provider.id, model: provider.model };
    } catch (error) {
      lastError = error;
      if (attempt === 0 && (isRetryable(error) || !(error instanceof Error))) continue;
      throw error;
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const tagged = error as Error & { retryable?: boolean };
  if (tagged.retryable !== undefined) return tagged.retryable;
  return !/^AI provider returned HTTP 4\d\d$/.test(error.message);
}
