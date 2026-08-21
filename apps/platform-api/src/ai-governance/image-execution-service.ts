import type { PlatformUser } from "../platform-services";
import type {
  AiExecutionEvidence,
  GovernedAiExecutionResult,
  GovernedAiExecutionStatus,
  GovernedAiExecutorDependencies,
  ResolvedAiProvider
} from "./execution-service";

// Governed image generation — same pipeline as text execution (idempotency → route →
// guardrail on the prompt → quota → invoke with fallback → reconcile → evidence), but:
// the scenario is fixed to "image_generation", quota is denominated in a per-image token
// equivalent (images must never be free against quotas), and the image bytes are RETURNED
// to the caller but never persisted into the execution store — evidence keeps only a
// short "image:<mime>:<bytes>b" marker.

export type GovernedAiImageInput = {
  projectId: string;
  prompt: string;
  requestId: string;
  aspectRatio?: string;
};

export type GovernedAiImageResult = GovernedAiExecutionResult & {
  base64?: string;
  mimeType?: string;
};

const IMAGE_SCENARIO = "image_generation" as const;

type InvokedImage = {
  base64: string;
  mimeType: string;
  tokensUsed: number;
  latencyMs: number;
  costUsd: number;
  providerId: string;
  model: string;
};

export function imageTokenEquivalent(): number {
  const raw = Number(process.env.EVCP_AI_IMAGE_TOKEN_EQUIVALENT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10_000;
}

type PersistFn = (
  provider: ResolvedAiProvider,
  result: Omit<GovernedAiExecutionResult, "evidence"> & {
    status: GovernedAiExecutionStatus;
    tokensUsed: number;
    latencyMs: number;
    costUsd: number;
    fallbackUsed: boolean;
    quotaScope?: string;
    quotaTokensReserved?: number;
    failureReason?: string;
  }
) => Promise<GovernedAiExecutionResult>;

function imageMarker(mimeType: string, base64: string): string {
  return `image:${mimeType}:${Buffer.from(base64, "base64").byteLength}b`;
}

function failureMessage(error: unknown, ...secrets: Array<string | undefined>): string {
  const message = error instanceof Error ? error.message : String(error);
  return secrets
    .filter((secret): secret is string => Boolean(secret))
    .reduce((sanitized, secret) => sanitized.split(secret).join("[redacted-secret]"), message)
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}

export async function executeGovernedImageGeneration(
  dependencies: GovernedAiExecutorDependencies,
  persist: PersistFn,
  actor: PlatformUser,
  input: GovernedAiImageInput
): Promise<GovernedAiImageResult> {
  const prior = await dependencies.store.findByRequestId(input.requestId);
  if (prior) return prior;
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required");
  if (!dependencies.invokeImage)
    throw new Error("Image generation is not configured for this deployment");
  const plan = await dependencies.resolvePlan(actor, IMAGE_SCENARIO);
  const guardrail = await dependencies.evaluateGuardrail({
    actor,
    scenario: IMAGE_SCENARIO,
    prompt
  });
  if (guardrail.decision === "block") {
    return persist(plan.provider, {
      status: "blocked",
      tokensUsed: 0,
      latencyMs: 0,
      costUsd: 0,
      fallbackUsed: false,
      failureReason: guardrail.reason ?? "guardrail_blocked"
    });
  }
  const requestedTokens = imageTokenEquivalent();
  const quota = await dependencies.reserveQuota({
    actor,
    projectId: input.projectId,
    requestId: input.requestId,
    requestedTokens
  });
  if (!quota.allowed) {
    return persist(plan.provider, {
      status: "blocked",
      tokensUsed: 0,
      latencyMs: 0,
      costUsd: 0,
      fallbackUsed: false,
      quotaScope: quota.quotaScope,
      quotaTokensReserved: 0,
      failureReason: "quota_exceeded"
    });
  }
  const settle = async (actualTokens: number) =>
    dependencies.reconcileQuota?.({
      actor,
      projectId: input.projectId,
      requestId: input.requestId,
      requestedTokens,
      actualTokens
    });
  const succeed = async (
    provider: ResolvedAiProvider,
    image: InvokedImage,
    status: GovernedAiExecutionStatus,
    failureReason?: string
  ): Promise<GovernedAiImageResult> => {
    const tokensUsed = Math.max(image.tokensUsed, requestedTokens);
    await settle(tokensUsed);
    const persisted = await persist(provider, {
      status,
      text: imageMarker(image.mimeType, image.base64),
      tokensUsed,
      latencyMs: image.latencyMs,
      costUsd: image.costUsd,
      fallbackUsed: status === "fallback",
      quotaScope: quota.quotaScope,
      quotaTokensReserved: requestedTokens,
      ...(failureReason ? { failureReason } : {})
    });
    return { ...persisted, base64: image.base64, mimeType: image.mimeType };
  };
  const request = { prompt, ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}) };
  try {
    const image = await dependencies.invokeImage({ provider: plan.provider, request });
    return await succeed(plan.provider, image, "succeeded");
  } catch (error) {
    if (!plan.fallback) {
      await settle(0);
      return persist(plan.provider, {
        status: "failed",
        tokensUsed: 0,
        latencyMs: 0,
        costUsd: 0,
        fallbackUsed: false,
        quotaScope: quota.quotaScope,
        quotaTokensReserved: requestedTokens,
        failureReason: failureMessage(error, plan.provider.secret)
      });
    }
    try {
      const image = await dependencies.invokeImage({ provider: plan.fallback, request });
      return await succeed(
        plan.fallback,
        image,
        "fallback",
        failureMessage(error, plan.provider.secret)
      );
    } catch (fallbackError) {
      await settle(0);
      return persist(plan.fallback, {
        status: "failed",
        tokensUsed: 0,
        latencyMs: 0,
        costUsd: 0,
        fallbackUsed: true,
        quotaScope: quota.quotaScope,
        quotaTokensReserved: requestedTokens,
        failureReason: failureMessage(fallbackError, plan.fallback.secret)
      });
    }
  }
}

export type { AiExecutionEvidence };
