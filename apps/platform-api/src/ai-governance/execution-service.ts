import type { AiScenario, PlatformUser } from "../platform-services";

export type GovernedAiExecutionStatus = "succeeded" | "blocked" | "failed" | "fallback";

export type ResolvedAiProvider = {
  id: string;
  model: string;
  secret: string;
  adapter: string;
  baseUrl?: string;
};

export type ResolvedAiExecutionPlan = {
  provider: ResolvedAiProvider;
  fallback?: ResolvedAiProvider;
};

export type AiExecutionEvidence = {
  id: string;
  requestId: string;
  actorId: string;
  projectId: string;
  scenario: AiScenario;
  providerId: string;
  model: string;
  status: GovernedAiExecutionStatus;
  tokensUsed: number;
  latencyMs: number;
  costUsd: number;
  fallbackUsed: boolean;
  quotaScope: string;
  quotaTokensReserved: number;
  failureReason?: string;
  occurredAt: string;
};

export type GovernedAiExecutionResult = {
  status: GovernedAiExecutionStatus;
  text?: string;
  evidence: AiExecutionEvidence;
};

export type GovernedAiExecutionInput = {
  scenario: AiScenario;
  projectId: string;
  prompt: string;
  requestId: string;
  requestedTokens?: number;
};

export interface AiExecutionStore {
  findByRequestId(requestId: string): Promise<GovernedAiExecutionResult | undefined>;
  save(result: GovernedAiExecutionResult): Promise<GovernedAiExecutionResult>;
  listRecent(limit: number): Promise<AiExecutionEvidence[]>;
}

export class MemoryAiExecutionStore implements AiExecutionStore {
  private readonly rows = new Map<string, GovernedAiExecutionResult>();

  async findByRequestId(requestId: string): Promise<GovernedAiExecutionResult | undefined> {
    return this.rows.get(requestId);
  }

  async save(result: GovernedAiExecutionResult): Promise<GovernedAiExecutionResult> {
    const existing = this.rows.get(result.evidence.requestId);
    if (existing) return existing;
    this.rows.set(result.evidence.requestId, result);
    return result;
  }

  async listRecent(limit: number): Promise<AiExecutionEvidence[]> {
    return [...this.rows.values()]
      .map((result) => result.evidence)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }
}

export type GovernedAiExecutorDependencies = {
  store: AiExecutionStore;
  resolvePlan: (actor: PlatformUser, scenario: AiScenario) => Promise<ResolvedAiExecutionPlan>;
  evaluateGuardrail: (input: { actor: PlatformUser; scenario: AiScenario; prompt: string }) => Promise<{ decision: "allow" | "warn" | "block"; reason?: string }>;
  reserveQuota: (input: { actor: PlatformUser; projectId: string; requestId: string; requestedTokens: number }) => Promise<{ allowed: boolean; remainingToday: number; quotaScope: string }>;
  reconcileQuota?: (input: { actor: PlatformUser; projectId: string; requestId: string; requestedTokens: number; actualTokens: number }) => Promise<void>;
  invoke: (input: { provider: ResolvedAiProvider; prompt: string; scenario: AiScenario; onToken?: (delta: string) => void; onReasoning?: (delta: string) => void }) => Promise<{ text: string; tokensUsed: number; latencyMs: number; costUsd?: number; providerId: string; model: string }>;
  now?: () => Date;
};

export class GovernedAiExecutor {
  constructor(private readonly dependencies: GovernedAiExecutorDependencies) {}

  async listRecentEvidence(limit = 50): Promise<AiExecutionEvidence[]> {
    return this.dependencies.store.listRecent(limit);
  }

  async execute(actor: PlatformUser, input: GovernedAiExecutionInput, onToken?: (delta: string) => void, onReasoning?: (delta: string) => void): Promise<GovernedAiExecutionResult> {
    const prior = await this.dependencies.store.findByRequestId(input.requestId);
    if (prior) return prior;
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("AI prompt is required");
    const plan = await this.dependencies.resolvePlan(actor, input.scenario);
    const guardrail = await this.dependencies.evaluateGuardrail({ actor, scenario: input.scenario, prompt });
    if (guardrail.decision === "block") {
      return this.persist(input, actor, plan.provider, {
        status: "blocked", tokensUsed: 0, latencyMs: 0, costUsd: 0, fallbackUsed: false, failureReason: guardrail.reason ?? "guardrail_blocked"
      });
    }
    const requestedTokens = input.requestedTokens ?? estimateTokens(prompt);
    const quota = await this.dependencies.reserveQuota({
      actor, projectId: input.projectId, requestId: input.requestId, requestedTokens
    });
    if (!quota.allowed) {
      return this.persist(input, actor, plan.provider, {
        status: "blocked", tokensUsed: 0, latencyMs: 0, costUsd: 0, fallbackUsed: false, quotaScope: quota.quotaScope, quotaTokensReserved: 0, failureReason: "quota_exceeded"
      });
    }
    try {
      const completed = await this.dependencies.invoke({ provider: plan.provider, prompt, scenario: input.scenario, onToken, onReasoning });
      await this.dependencies.reconcileQuota?.({ actor, projectId: input.projectId, requestId: input.requestId, requestedTokens, actualTokens: completed.tokensUsed });
      return this.persist(input, actor, plan.provider, {
        status: "succeeded", text: completed.text, tokensUsed: completed.tokensUsed, latencyMs: completed.latencyMs, costUsd: completed.costUsd ?? 0, fallbackUsed: false, quotaScope: quota.quotaScope, quotaTokensReserved: requestedTokens
      });
    } catch (error) {
      if (!plan.fallback) {
        await this.dependencies.reconcileQuota?.({ actor, projectId: input.projectId, requestId: input.requestId, requestedTokens, actualTokens: 0 });
        return this.persist(input, actor, plan.provider, {
          status: "failed", tokensUsed: 0, latencyMs: 0, costUsd: 0, fallbackUsed: false, quotaScope: quota.quotaScope, quotaTokensReserved: requestedTokens, failureReason: sanitizeFailure(error, plan.provider.secret)
        });
      }
      try {
        const completed = await this.dependencies.invoke({ provider: plan.fallback, prompt, scenario: input.scenario });
        await this.dependencies.reconcileQuota?.({ actor, projectId: input.projectId, requestId: input.requestId, requestedTokens, actualTokens: completed.tokensUsed });
        return this.persist(input, actor, plan.fallback, {
          status: "fallback", text: completed.text, tokensUsed: completed.tokensUsed, latencyMs: completed.latencyMs, costUsd: completed.costUsd ?? 0, fallbackUsed: true, quotaScope: quota.quotaScope, quotaTokensReserved: requestedTokens, failureReason: sanitizeFailure(error, plan.provider.secret)
        });
      } catch (fallbackError) {
        await this.dependencies.reconcileQuota?.({ actor, projectId: input.projectId, requestId: input.requestId, requestedTokens, actualTokens: 0 });
        return this.persist(input, actor, plan.fallback, {
          status: "failed", tokensUsed: 0, latencyMs: 0, costUsd: 0, fallbackUsed: true, quotaScope: quota.quotaScope, quotaTokensReserved: requestedTokens, failureReason: sanitizeFailure(fallbackError, plan.fallback.secret)
        });
      }
    }
  }

  private async persist(
    input: GovernedAiExecutionInput, actor: PlatformUser, provider: ResolvedAiProvider,
    result: Omit<GovernedAiExecutionResult, "evidence"> & { status: GovernedAiExecutionStatus; tokensUsed: number; latencyMs: number; costUsd: number; fallbackUsed: boolean; quotaScope?: string; quotaTokensReserved?: number; failureReason?: string }
  ): Promise<GovernedAiExecutionResult> {
    const occurredAt = (this.dependencies.now?.() ?? new Date()).toISOString();
    return this.dependencies.store.save({
      ...result,
      evidence: {
        id: `aiexec_${input.requestId}`, requestId: input.requestId, actorId: actor.id, projectId: input.projectId, scenario: input.scenario,
        providerId: provider.id, model: provider.model, status: result.status, tokensUsed: result.tokensUsed, latencyMs: result.latencyMs, costUsd: result.costUsd,
        fallbackUsed: result.fallbackUsed, quotaScope: result.quotaScope ?? "not_reserved", quotaTokensReserved: result.quotaTokensReserved ?? 0,
        ...(result.failureReason ? { failureReason: result.failureReason } : {}), occurredAt
      }
    });
  }
}

function estimateTokens(prompt: string): number {
  return Math.max(1, Math.ceil(prompt.length / 4));
}

function sanitizeFailure(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(secret).join("[redacted-secret]").replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}
