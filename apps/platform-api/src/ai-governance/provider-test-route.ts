import { success } from "@evcp/api-client";
import { ValidationError } from "../platform-services";
import type { AiProviderTestCallResult, AiScenario, PlatformUser } from "../platform-services";
import type { GovernedAiExecutor } from "./execution-service";

type Request = { method: string; path: string; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown> };
type Response = { status: number; body: ReturnType<typeof success<AiProviderTestCallResult>> };
type ProviderTestRequest = { scenario: AiScenario; prompt?: string; requestedTokens?: number; dryRun?: boolean };
type LegacyProviderTestInput = {
  request: Request;
  resolveUser: () => PlatformUser;
  legacyTest: (actor: PlatformUser, request: ProviderTestRequest) => AiProviderTestCallResult;
};

function parseProviderTestRequest(request: Request): ProviderTestRequest {
  return {
    scenario: String(request.body?.scenario ?? "prd_generation") as AiScenario,
    prompt: request.body?.prompt ? String(request.body.prompt) : undefined,
    requestedTokens: request.body?.requestedTokens === undefined ? undefined : Number(request.body.requestedTokens),
    dryRun: request.body?.dryRun === undefined ? undefined : Boolean(request.body.dryRun)
  };
}

export function handleLegacyAiProviderTestCall(input: LegacyProviderTestInput): Response | undefined {
  if (input.request.method !== "POST" || input.request.path !== "/ai/provider-test-call") return undefined;
  return { status: 201, body: success(input.legacyTest(input.resolveUser(), parseProviderTestRequest(input.request))) };
}

export async function handleAiProviderTestCall(input: {
  request: Request;
  resolveUser: () => Promise<PlatformUser>;
  executor?: Pick<GovernedAiExecutor, "execute">;
  providerNameFor?: (providerId: string) => Promise<string | undefined>;
  providerAdapterFor?: (providerId: string) => Promise<AiProviderTestCallResult["adapter"] | undefined>;
  legacyTest: (actor: PlatformUser, request: ProviderTestRequest) => AiProviderTestCallResult;
}): Promise<Response | undefined> {
  if (input.request.method !== "POST" || input.request.path !== "/ai/provider-test-call") return undefined;
  const actor = await input.resolveUser();
  const request = parseProviderTestRequest(input.request);
  if (!input.executor) {
    return { status: 201, body: success(input.legacyTest(actor, request)) };
  }
  if (actor.role !== "admin") throw new Error(`Role ${actor.role} cannot test AI providers`);
  const execution = await input.executor.execute(actor, {
    scenario: request.scenario, projectId: "", prompt: request.prompt?.trim() || `Validate ${request.scenario} provider route before Creator use`,
    requestId: `admin_provider_test_${crypto.randomUUID()}`, ...(request.requestedTokens ? { requestedTokens: request.requestedTokens } : {})
  });
  if (execution.status === "failed" || execution.status === "blocked") {
    // A failed/blocked governed test is an expected outcome (provider unreachable, bad key,
    // guardrail block) — surface it as a validation error (422) carrying the reason so the
    // console shows a meaningful message, instead of an opaque 500 INTERNAL_ERROR.
    throw new ValidationError(
      `Provider test ${execution.status}: ${execution.evidence.failureReason ?? execution.status}`
    );
  }
  const providerName = await input.providerNameFor?.(execution.evidence.providerId) ?? execution.evidence.providerId;
  const adapter = await input.providerAdapterFor?.(execution.evidence.providerId) ?? "openai";
  return {
    status: 201,
    body: success({
      providerId: execution.evidence.providerId, providerName, adapter, model: execution.evidence.model,
      status: execution.status === "fallback" ? "fallback" : "succeeded", fallbackUsed: execution.evidence.fallbackUsed,
      tokensUsed: execution.evidence.tokensUsed, latencyMs: execution.evidence.latencyMs, usageLogId: execution.evidence.id,
      outputExcerpt: execution.text?.slice(0, 280) ?? "Execution did not produce provider output."
    })
  };
}
