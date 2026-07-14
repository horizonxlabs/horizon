import { GovernedAiExecutor, MemoryAiExecutionStore, type AiExecutionStore, type ResolvedAiExecutionPlan, type ResolvedAiProvider } from "./execution-service";
import type { AiGovernancePersistenceClient } from "../persistence/ai-governance-repositories";
import type { AiScenario, PlatformUser } from "../platform-services";
import { MemoryAiSecretStore, type AiSecretStore } from "./secret-store";

export function createPersistedGovernedAiExecutor(
  client: AiGovernancePersistenceClient,
  options: { executionStore?: AiExecutionStore; fetcher?: typeof fetch; timeoutMs?: number; secretStore?: AiSecretStore } = {}
): GovernedAiExecutor {
  const circuit = new Map<string, { failures: number; blockedUntil?: number }>();
  return new GovernedAiExecutor({
    store: options.executionStore ?? new MemoryAiExecutionStore(),
    resolvePlan: async (actor, scenario) => resolvePlan(client, actor, scenario, options.secretStore ?? new MemoryAiSecretStore()),
    evaluateGuardrail: async ({ scenario, prompt }) => evaluateGuardrail(client, scenario, prompt),
    reserveQuota: async ({ actor, projectId, requestedTokens }) => reserveScopedQuota(client, actor, projectId, requestedTokens),
    reconcileQuota: async ({ actor, projectId, requestedTokens, actualTokens }) => reconcileScopedQuota(client, actor, projectId, requestedTokens, actualTokens),
    invoke: async ({ provider, prompt }) => invokeWithCircuitBreaker(provider, prompt, options.fetcher ?? globalThis.fetch, options.timeoutMs ?? 30_000, circuit)
  });
}

async function invokeWithCircuitBreaker(provider: ResolvedAiProvider, prompt: string, fetcher: typeof fetch, timeoutMs: number, circuit: Map<string, { failures: number; blockedUntil?: number }>) {
  const state = circuit.get(provider.id);
  if (state?.blockedUntil && state.blockedUntil > Date.now()) throw new Error(`AI provider ${provider.id} circuit is open`);
  try {
    const result = provider.adapter === "anthropic"
      ? await invokeAnthropic(provider, prompt, fetcher, timeoutMs)
      : await invokeOpenAiCompatible(provider, prompt, fetcher, timeoutMs);
    circuit.delete(provider.id);
    return result;
  } catch (error) {
    const failures = (state?.failures ?? 0) + 1;
    circuit.set(provider.id, { failures, ...(failures >= 3 ? { blockedUntil: Date.now() + 30_000 } : {}) });
    throw error;
  }
}

async function resolvePlan(client: AiGovernancePersistenceClient, actor: PlatformUser, scenario: AiScenario, secretStore: AiSecretStore): Promise<ResolvedAiExecutionPlan> {
  if (actor.role !== "admin" && actor.role !== "creator") throw new Error("AI execution requires an Admin or Creator role");
  const route = (await client.aiScenarioRoute.findMany()).find((candidate) => candidate.scenario === scenario);
  if (!route) throw new Error(`No persisted AI route configured for ${scenario}`);
  const provider = await resolveProvider(client, route.primaryProviderId, route.primaryModel, secretStore);
  const fallback = route.fallbackProviderId ? await resolveProvider(client, route.fallbackProviderId, route.fallbackModel ?? route.primaryModel, secretStore) : undefined;
  return { provider, ...(fallback ? { fallback } : {}) };
}

async function resolveProvider(client: AiGovernancePersistenceClient, providerId: string, model: string, secretStore: AiSecretStore): Promise<ResolvedAiProvider> {
  const provider = await client.aiProvider.findUnique({ where: { id: providerId } });
  if (!provider || provider.status !== "active") throw new Error(`AI provider ${providerId} is not active`);
  if (provider.adapter !== "openai" && provider.adapter !== "anthropic") throw new Error(`AI provider adapter ${provider.adapter} is not supported by the live executor`);
  if (!provider.models.includes(model)) throw new Error(`AI provider ${providerId} does not support model ${model}`);
  const key = (await client.aiApiKey.findMany()).find((candidate) => candidate.providerId === providerId && candidate.status === "active");
  if (!key) throw new Error(`No active key configured for AI provider ${providerId}`);
  if (key.encryptionProvider !== secretStore.provider) throw new Error(`AI provider ${providerId} key cannot be resolved by the configured secret store`);
  return { id: provider.id, model, secret: await secretStore.read(key.secretCiphertext), adapter: provider.adapter, baseUrl: provider.baseUrl };
}

async function evaluateGuardrail(client: AiGovernancePersistenceClient, scenario: AiScenario, prompt: string): Promise<{ decision: "allow" | "warn" | "block"; reason?: string }> {
  const rule = (await client.guardrailRule.findMany()).find((candidate) => {
    if (candidate.status !== "active") return false;
    if (candidate.type === "regex") { try { return new RegExp(candidate.pattern, "i").test(prompt); } catch { return false; } }
    return prompt.toLowerCase().includes(candidate.pattern.toLowerCase());
  });
  return rule ? { decision: rule.action, reason: `guardrail:${rule.id}:${scenario}` } : { decision: "allow" };
}

type QuotaTarget = { scope: "organization" | "creator" | "project" | "app"; scopeId: string };

function quotaTargets(actor: PlatformUser, projectId: string): QuotaTarget[] {
  // A Creator project is the pre-publish app boundary. Once published, the same project ID
  // remains the stable target for the app policy, avoiding a quota reset during publish.
  return [
    { scope: "organization", scopeId: "platform" },
    { scope: "creator", scopeId: actor.id },
    { scope: "project", scopeId: projectId },
    { scope: "app", scopeId: projectId }
  ];
}

async function reserveScopedQuota(client: AiGovernancePersistenceClient, actor: PlatformUser, projectId: string, requestedTokens: number): Promise<{ allowed: boolean; remainingToday: number; quotaScope: string }> {
  const policies = await client.aiQuota.findMany();
  const targets = quotaTargets(actor, projectId).filter((target) => policies.some((policy) => policy.scope === target.scope));
  const usage = await Promise.all(targets.map(async (target) => ({ target, policy: policies.find((candidate) => candidate.scope === target.scope)!, usage: await client.aiQuotaUsage.findUnique({ where: { scope_scopeId: target } }) })));
  const denied = usage.find(({ policy, usage: row }) => policy.hardStop && requestedTokens > Math.max(policy.dailyLimit - (row?.usedToday ?? 0), 0));
  const quotaScope = targets.map((target) => `${target.scope}:${target.scopeId}`).join(",") || "unlimited";
  if (denied) return { allowed: false, remainingToday: Math.max(denied.policy.dailyLimit - (denied.usage?.usedToday ?? 0), 0), quotaScope };
  await Promise.all(usage.map(({ target, usage: row }) => client.aiQuotaUsage.upsert({
    where: { scope_scopeId: target }, update: { usedToday: (row?.usedToday ?? 0) + requestedTokens },
    create: { id: `aiqu_${target.scope}_${target.scopeId}`, scope: target.scope, scopeId: target.scopeId, usedToday: requestedTokens }
  })));
  const remainingToday = usage.length ? Math.min(...usage.map(({ policy, usage: row }) => Math.max(policy.dailyLimit - (row?.usedToday ?? 0) - requestedTokens, 0))) : Number.MAX_SAFE_INTEGER;
  return { allowed: true, remainingToday, quotaScope };
}

async function reconcileScopedQuota(client: AiGovernancePersistenceClient, actor: PlatformUser, projectId: string, requestedTokens: number, actualTokens: number): Promise<void> {
  const policies = await client.aiQuota.findMany();
  await Promise.all(quotaTargets(actor, projectId).filter((target) => policies.some((policy) => policy.scope === target.scope)).map(async (target) => {
    const row = await client.aiQuotaUsage.findUnique({ where: { scope_scopeId: target } });
    if (!row) return;
    await client.aiQuotaUsage.upsert({ where: { scope_scopeId: target }, update: { usedToday: Math.max(0, row.usedToday - requestedTokens + actualTokens) }, create: row });
  }));
}

async function invokeOpenAiCompatible(provider: ResolvedAiProvider, prompt: string, fetcher: typeof fetch, timeoutMs: number) {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  const startedAt = performance.now();
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
      const body = await response.json() as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { total_tokens?: unknown };
        response_cost?: unknown;
        _hidden_params?: { response_cost?: unknown };
      };
      const text = String(body.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("AI provider returned an empty completion");
      const tokensUsed = Number(body.usage?.total_tokens ?? Math.max(1, Math.ceil((prompt.length + text.length) / 4)));
      const rawCost = body.response_cost ?? body._hidden_params?.response_cost;
      const costUsd = Number(rawCost);
      return {
        text,
        tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 1,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        costUsd: Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : 0,
        providerId: provider.id,
        model: provider.model
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0 && (isRetryable(error) || !(error instanceof Error))) continue;
      throw error;
    }
  }
  throw lastError;
}

async function invokeAnthropic(provider: ResolvedAiProvider, prompt: string, fetcher: typeof fetch, timeoutMs: number) {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  const startedAt = performance.now();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(`${provider.baseUrl.replace(/\/$/, "")}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": provider.secret,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) continue;
        const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & { retryable?: boolean };
        error.retryable = response.status >= 500 || response.status === 429;
        throw error;
      }
      const body = await response.json() as {
        content?: Array<{ type?: unknown; text?: unknown }>;
        usage?: { input_tokens?: unknown; output_tokens?: unknown };
      };
      const text = (body.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => String(block.text))
        .join("\n")
        .trim();
      if (!text) throw new Error("AI provider returned an empty completion");
      const inputTokens = Number(body.usage?.input_tokens ?? 0);
      const outputTokens = Number(body.usage?.output_tokens ?? 0);
      const tokensUsed = inputTokens + outputTokens;
      return {
        text,
        tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : Math.max(1, Math.ceil((prompt.length + text.length) / 4)),
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        costUsd: 0,
        providerId: provider.id,
        model: provider.model
      };
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
