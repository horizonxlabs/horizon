import type { PlatformUser } from "../platform-services";
import type {
  AiExecutionEvidence,
  GovernedAiExecutionResult,
  GovernedAiExecutionStatus,
  GovernedAiExecutorDependencies,
  ResolvedAiProvider
} from "./execution-service";
import { sanitizeAiFailure } from "./execution-service";
import type { ImageGenerationResult } from "./image-provider-runtime";

// Governed image generation — same pipeline as text execution (idempotency → route →
// guardrail on the prompt → invoke with fallback → evidence), but:
// the scenario is fixed to "image_generation", image generation is intentionally excluded
// from token quota accounting, and the image bytes are RETURNED
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

type InvokedImage = ImageGenerationResult;

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

export async function executeGovernedImageGeneration(
  dependencies: GovernedAiExecutorDependencies,
  persist: PersistFn,
  actor: PlatformUser,
  input: GovernedAiImageInput
): Promise<GovernedAiImageResult> {
  const prior = await dependencies.store.findByRequestId(input.requestId);
  if (prior) {
    if (prior.status !== "succeeded" && prior.status !== "fallback") return prior;
    return {
      ...prior,
      status: "failed",
      evidence: {
        ...prior.evidence,
        status: "failed",
        failureReason:
          "idempotent image replay is unavailable because image bytes are not persisted"
      }
    };
  }
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
  const succeed = async (
    provider: ResolvedAiProvider,
    image: InvokedImage,
    status: GovernedAiExecutionStatus,
    failureReason?: string
  ): Promise<GovernedAiImageResult> => {
    const persisted = await persist(provider, {
      status,
      text: imageMarker(image.mimeType, image.base64),
      tokensUsed: image.tokensUsed,
      latencyMs: image.latencyMs,
      costUsd: image.costUsd,
      fallbackUsed: status === "fallback",
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
      return persist(plan.provider, {
        status: "failed",
        tokensUsed: 0,
        latencyMs: 0,
        costUsd: 0,
        fallbackUsed: false,
        failureReason: sanitizeAiFailure(error, plan.provider.secret)
      });
    }
    try {
      const image = await dependencies.invokeImage({ provider: plan.fallback, request });
      return await succeed(
        plan.fallback,
        image,
        "fallback",
        sanitizeAiFailure(error, plan.provider.secret)
      );
    } catch (fallbackError) {
      return persist(plan.fallback, {
        status: "failed",
        tokensUsed: 0,
        latencyMs: 0,
        costUsd: 0,
        fallbackUsed: true,
        failureReason: sanitizeAiFailure(fallbackError, plan.fallback.secret)
      });
    }
  }
}

export type { AiExecutionEvidence };
