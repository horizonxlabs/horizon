import type { PlatformUser } from "../platform-services";
import type {
  AgentRoundEvent,
  GovernedAiAgentRoundInput,
  GovernedAiAgentRoundResult
} from "./agent-execution-types";
import type {
  GovernedAiExecutionResult,
  GovernedAiExecutorDependencies,
  ResolvedAiProvider
} from "./execution-service";

type PersistAgentRound = (
  provider: ResolvedAiProvider,
  result: Omit<GovernedAiExecutionResult, "evidence"> & {
    tokensUsed: number;
    latencyMs: number;
    costUsd: number;
    fallbackUsed: boolean;
    quotaScope?: string;
    quotaTokensReserved?: number;
    failureReason?: string;
  }
) => Promise<GovernedAiExecutionResult>;

export async function executeGovernedAgentRound(
  dependencies: GovernedAiExecutorDependencies,
  persist: PersistAgentRound,
  actor: PlatformUser,
  input: GovernedAiAgentRoundInput,
  onEvent?: (event: AgentRoundEvent) => void
): Promise<GovernedAiAgentRoundResult> {
  const prior = await dependencies.store.findByRequestId(input.requestId);
  if (prior) return agentRoundResult(prior);

  const guardrailPrompt = renderGuardrailInput(input);
  if (!guardrailPrompt.trim()) throw new Error("AI agent round input is required");
  const plan = await dependencies.resolvePlan(actor, input.scenario);

  if (input.signal?.aborted) {
    return agentRoundResult(await persist(plan.provider, failedRound("aborted", false)));
  }

  const guardrail = await dependencies.evaluateGuardrail({
    actor,
    scenario: input.scenario,
    prompt: guardrailPrompt
  });
  if (guardrail.decision === "block") {
    return agentRoundResult(
      await persist(plan.provider, {
        ...failedRound(guardrail.reason ?? "guardrail_blocked", false),
        status: "blocked"
      })
    );
  }

  const requestedTokens = input.requestedTokens ?? estimateTokens(guardrailPrompt);
  const quota = await dependencies.reserveQuota({
    actor,
    projectId: input.projectId,
    requestId: input.requestId,
    requestedTokens
  });
  if (!quota.allowed) {
    return agentRoundResult(
      await persist(plan.provider, {
        ...failedRound("quota_exceeded", false),
        status: "blocked",
        quotaScope: quota.quotaScope,
        quotaTokensReserved: 0
      })
    );
  }

  const invoke = dependencies.invokeAgentRound;
  if (!invoke) throw new Error("Structured AI agent invocation is not configured");

  let primaryStreamStarted = false;
  try {
    const completed = await invoke({
      provider: plan.provider,
      systemPrompt: input.systemPrompt,
      messages: input.messages,
      tools: input.tools,
      signal: input.signal,
      onEvent: (event) => {
        primaryStreamStarted = true;
        onEvent?.(event);
      }
    });
    await reconcile(dependencies, actor, input, requestedTokens, completed.usage.totalTokens);
    return agentRoundResult(
      await persist(plan.provider, {
        status: "succeeded",
        agentMessage: completed.message,
        agentUsage: completed.usage,
        tokensUsed: completed.usage.totalTokens,
        latencyMs: completed.latencyMs,
        costUsd: completed.usage.costUsd,
        fallbackUsed: false,
        quotaScope: quota.quotaScope,
        quotaTokensReserved: requestedTokens
      })
    );
  } catch (primaryError) {
    const aborted = input.signal?.aborted === true;
    if (!plan.fallback || primaryStreamStarted || aborted) {
      await reconcile(dependencies, actor, input, requestedTokens, 0);
      return agentRoundResult(
        await persist(plan.provider, {
          ...failedRound(
            aborted
              ? "aborted"
              : sanitizeFailure(primaryError, plan.provider.secret, plan.fallback?.secret),
            false
          ),
          quotaScope: quota.quotaScope,
          quotaTokensReserved: requestedTokens
        })
      );
    }

    try {
      const completed = await invoke({
        provider: plan.fallback,
        systemPrompt: input.systemPrompt,
        messages: input.messages,
        tools: input.tools,
        signal: input.signal,
        onEvent
      });
      await reconcile(dependencies, actor, input, requestedTokens, completed.usage.totalTokens);
      return agentRoundResult(
        await persist(plan.fallback, {
          status: "fallback",
          agentMessage: completed.message,
          agentUsage: completed.usage,
          tokensUsed: completed.usage.totalTokens,
          latencyMs: completed.latencyMs,
          costUsd: completed.usage.costUsd,
          fallbackUsed: true,
          quotaScope: quota.quotaScope,
          quotaTokensReserved: requestedTokens,
          failureReason: sanitizeFailure(primaryError, plan.provider.secret, plan.fallback.secret)
        })
      );
    } catch (fallbackError) {
      await reconcile(dependencies, actor, input, requestedTokens, 0);
      return agentRoundResult(
        await persist(plan.fallback, {
          ...failedRound(
            input.signal?.aborted
              ? "aborted"
              : sanitizeFailure(fallbackError, plan.provider.secret, plan.fallback.secret),
            true
          ),
          quotaScope: quota.quotaScope,
          quotaTokensReserved: requestedTokens
        })
      );
    }
  }
}

function failedRound(failureReason: string, fallbackUsed: boolean) {
  return {
    status: "failed" as const,
    tokensUsed: 0,
    latencyMs: 0,
    costUsd: 0,
    fallbackUsed,
    failureReason
  };
}

async function reconcile(
  dependencies: GovernedAiExecutorDependencies,
  actor: PlatformUser,
  input: GovernedAiAgentRoundInput,
  requestedTokens: number,
  actualTokens: number
): Promise<void> {
  await dependencies.reconcileQuota?.({
    actor,
    projectId: input.projectId,
    requestId: input.requestId,
    requestedTokens,
    actualTokens
  });
}

function renderGuardrailInput(input: GovernedAiAgentRoundInput): string {
  const parts = input.messages.flatMap((message) => {
    if (message.role === "assistant") return [];
    if (message.role === "user") {
      return typeof message.content === "string"
        ? [message.content]
        : message.content.map((block) => block.text);
    }
    return message.content.map((block) => block.text);
  });
  return [input.systemPrompt ?? "", ...parts].filter(Boolean).join("\n");
}

function estimateTokens(prompt: string): number {
  return Math.max(1, Math.ceil(prompt.length / 4));
}

function sanitizeFailure(error: unknown, ...secrets: Array<string | undefined>): string {
  const message = error instanceof Error ? error.message : String(error);
  return secrets
    .filter((secret): secret is string => Boolean(secret))
    .reduce((sanitized, secret) => sanitized.split(secret).join("[redacted-secret]"), message)
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}

function agentRoundResult(result: GovernedAiExecutionResult): GovernedAiAgentRoundResult {
  return {
    status: result.status,
    ...(result.agentMessage ? { message: result.agentMessage } : {}),
    ...(result.agentUsage ? { usage: result.agentUsage } : {}),
    evidence: result.evidence
  };
}
