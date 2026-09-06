import {
  GovernedAiExecutor,
  MemoryAiExecutionStore,
  type AiExecutionStore,
  type ResolvedAiExecutionPlan,
  type ResolvedAiProvider
} from "./execution-service";
import type { AiGovernancePersistenceClient } from "../persistence/ai-governance-repositories";
import type { AiScenario, PlatformUser } from "../platform-services";
import { MemoryAiSecretStore, type AiSecretStore } from "./secret-store";
import { invokeAgentRoundWithCircuitBreaker } from "./agent-provider-runtime";
import { invokeWithCircuitBreaker } from "./completion-provider-runtime";
import { invokeImageWithCircuitBreaker } from "./image-provider-runtime";

export function createPersistedGovernedAiExecutor(
  client: AiGovernancePersistenceClient,
  options: {
    executionStore?: AiExecutionStore;
    fetcher?: typeof fetch;
    timeoutMs?: number;
    secretStore?: AiSecretStore;
  } = {}
): GovernedAiExecutor {
  const circuit = new Map<string, { failures: number; blockedUntil?: number }>();
  return new GovernedAiExecutor({
    store: options.executionStore ?? new MemoryAiExecutionStore(),
    resolvePlan: async (actor, scenario) =>
      resolvePlan(client, actor, scenario, options.secretStore ?? new MemoryAiSecretStore()),
    evaluateGuardrail: async ({ scenario, prompt }) => evaluateGuardrail(client, scenario, prompt),
    reserveQuota: async ({ actor, projectId, requestedTokens }) =>
      reserveScopedQuota(client, actor, projectId, requestedTokens),
    reconcileQuota: async ({ actor, projectId, requestedTokens, actualTokens }) =>
      reconcileScopedQuota(client, actor, projectId, requestedTokens, actualTokens),
    // 30s default suits hosted providers; slow local models (a 26B model generating a whole app)
    // exceed it, aborting the run and tripping the breaker. Configurable via EVCP_AI_COMPLETION_TIMEOUT_MS.
    invoke: async ({ provider, prompt, onToken, onReasoning }) =>
      invokeWithCircuitBreaker(
        provider,
        prompt,
        options.fetcher ?? globalThis.fetch,
        options.timeoutMs ?? (Number(process.env.EVCP_AI_COMPLETION_TIMEOUT_MS) || 30_000),
        circuit,
        onToken,
        onReasoning
      ),
    invokeAgentRound: async (input) =>
      invokeAgentRoundWithCircuitBreaker({
        ...input,
        fetcher: options.fetcher ?? globalThis.fetch,
        timeoutMs:
          options.timeoutMs ?? (Number(process.env.EVCP_AI_COMPLETION_TIMEOUT_MS) || 30_000),
        circuit
      }),
    // Image generation is slower than chat completions — its own timeout knob (60s default).
    invokeImage: async ({ provider, request }) =>
      invokeImageWithCircuitBreaker(
        provider,
        request,
        options.fetcher ?? globalThis.fetch,
        Number(process.env.EVCP_AI_IMAGE_TIMEOUT_MS) || 60_000,
        circuit
      )
  });
}

async function resolvePlan(
  client: AiGovernancePersistenceClient,
  actor: PlatformUser,
  scenario: AiScenario,
  secretStore: AiSecretStore
): Promise<ResolvedAiExecutionPlan> {
  if (actor.role !== "admin" && actor.role !== "creator")
    throw new Error("AI execution requires an Admin or Creator role");
  const route = (await client.aiScenarioRoute.findMany()).find(
    (candidate) => candidate.scenario === scenario
  );
  if (!route) throw new Error(`No persisted AI route configured for ${scenario}`);
  const provider = await resolveProvider(
    client,
    route.primaryProviderId,
    route.primaryModel,
    secretStore,
    scenario
  );
  const fallback = route.fallbackProviderId
    ? await resolveProvider(
        client,
        route.fallbackProviderId,
        route.fallbackModel ?? route.primaryModel,
        secretStore,
        scenario
      )
    : undefined;
  return { provider, ...(fallback ? { fallback } : {}) };
}

// Adapter support is per-modality. Google text requests use Gemini's OpenAI-compatible
// endpoint, while image requests continue to use the native generateContent endpoint.
const TEXT_ADAPTERS = ["openai", "openrouter", "lm_studio", "anthropic", "google"];
const IMAGE_ADAPTERS = ["google", "openai"];

async function resolveProvider(
  client: AiGovernancePersistenceClient,
  providerId: string,
  model: string,
  secretStore: AiSecretStore,
  scenario: AiScenario
): Promise<ResolvedAiProvider> {
  const provider = await client.aiProvider.findUnique({ where: { id: providerId } });
  if (!provider || provider.status !== "active")
    throw new Error(`AI provider ${providerId} is not active`);
  const allowedAdapters = scenario === "image_generation" ? IMAGE_ADAPTERS : TEXT_ADAPTERS;
  if (!allowedAdapters.includes(provider.adapter))
    throw new Error(
      `AI provider adapter ${provider.adapter} is not supported by the live executor for ${scenario}`
    );
  if (!provider.models.includes(model))
    throw new Error(`AI provider ${providerId} does not support model ${model}`);
  const key = (await client.aiApiKey.findMany()).find(
    (candidate) => candidate.providerId === providerId && candidate.status === "active"
  );
  if (!key) throw new Error(`No active key configured for AI provider ${providerId}`);
  if (key.encryptionProvider !== secretStore.provider)
    throw new Error(
      `AI provider ${providerId} key cannot be resolved by the configured secret store`
    );
  return {
    id: provider.id,
    model,
    secret: await secretStore.read(key.secretCiphertext),
    adapter: provider.adapter,
    baseUrl: provider.baseUrl
  };
}

async function evaluateGuardrail(
  client: AiGovernancePersistenceClient,
  scenario: AiScenario,
  prompt: string
): Promise<{ decision: "allow" | "warn" | "block"; reason?: string }> {
  const rule = (await client.guardrailRule.findMany()).find((candidate) => {
    if (candidate.status !== "active") return false;
    if (candidate.type === "regex") {
      try {
        return new RegExp(candidate.pattern, "i").test(prompt);
      } catch {
        return false;
      }
    }
    return prompt.toLowerCase().includes(candidate.pattern.toLowerCase());
  });
  return rule
    ? { decision: rule.action, reason: `guardrail:${rule.id}:${scenario}` }
    : { decision: "allow" };
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

async function reserveScopedQuota(
  client: AiGovernancePersistenceClient,
  actor: PlatformUser,
  projectId: string,
  requestedTokens: number
): Promise<{ allowed: boolean; remainingToday: number; quotaScope: string }> {
  const policies = await client.aiQuota.findMany();
  const targets = quotaTargets(actor, projectId).filter((target) =>
    policies.some((policy) => policy.scope === target.scope)
  );
  const usage = await Promise.all(
    targets.map(async (target) => ({
      target,
      policy: policies.find((candidate) => candidate.scope === target.scope)!,
      usage: await client.aiQuotaUsage.findUnique({ where: { scope_scopeId: target } })
    }))
  );
  const denied = usage.find(
    ({ policy, usage: row }) =>
      policy.hardStop && requestedTokens > Math.max(policy.dailyLimit - (row?.usedToday ?? 0), 0)
  );
  const quotaScope =
    targets.map((target) => `${target.scope}:${target.scopeId}`).join(",") || "unlimited";
  if (denied)
    return {
      allowed: false,
      remainingToday: Math.max(denied.policy.dailyLimit - (denied.usage?.usedToday ?? 0), 0),
      quotaScope
    };
  await Promise.all(
    usage.map(({ target, usage: row }) =>
      client.aiQuotaUsage.upsert({
        where: { scope_scopeId: target },
        update: { usedToday: (row?.usedToday ?? 0) + requestedTokens },
        create: {
          id: `aiqu_${target.scope}_${target.scopeId}`,
          scope: target.scope,
          scopeId: target.scopeId,
          usedToday: requestedTokens
        }
      })
    )
  );
  const remainingToday = usage.length
    ? Math.min(
        ...usage.map(({ policy, usage: row }) =>
          Math.max(policy.dailyLimit - (row?.usedToday ?? 0) - requestedTokens, 0)
        )
      )
    : Number.MAX_SAFE_INTEGER;
  return { allowed: true, remainingToday, quotaScope };
}

async function reconcileScopedQuota(
  client: AiGovernancePersistenceClient,
  actor: PlatformUser,
  projectId: string,
  requestedTokens: number,
  actualTokens: number
): Promise<void> {
  const policies = await client.aiQuota.findMany();
  await Promise.all(
    quotaTargets(actor, projectId)
      .filter((target) => policies.some((policy) => policy.scope === target.scope))
      .map(async (target) => {
        const row = await client.aiQuotaUsage.findUnique({ where: { scope_scopeId: target } });
        if (!row) return;
        await client.aiQuotaUsage.upsert({
          where: { scope_scopeId: target },
          update: { usedToday: Math.max(0, row.usedToday - requestedTokens + actualTokens) },
          create: row
        });
      })
  );
}
