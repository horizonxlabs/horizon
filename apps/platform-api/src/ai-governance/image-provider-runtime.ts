import type { ResolvedAiProvider } from "./execution-service";
import { openAiCompatibleBaseUrl } from "./agent-provider-runtime-utils";

// Image generation runtime — the third invocation kind next to completions and agent
// rounds. Shares the per-provider circuit-breaker map so a dead provider trips one
// breaker for every invocation kind (3 consecutive failures → 30s open).

export type ImageGenerationRequest = { prompt: string; aspectRatio?: string };

export type ImageGenerationResult = {
  base64: string;
  mimeType: string;
  tokensUsed: number;
  latencyMs: number;
  costUsd: number;
  providerId: string;
  model: string;
};

export async function invokeImageWithCircuitBreaker(
  provider: ResolvedAiProvider,
  request: ImageGenerationRequest,
  fetcher: typeof fetch,
  timeoutMs: number,
  circuit: Map<string, { failures: number; blockedUntil?: number }>
): Promise<ImageGenerationResult> {
  const state = circuit.get(provider.id);
  if (state?.blockedUntil && state.blockedUntil > Date.now())
    throw new Error(`AI provider ${provider.id} circuit is open`);
  try {
    const result =
      provider.adapter === "google"
        ? await invokeGoogleImage(provider, request, fetcher, timeoutMs)
        : provider.adapter === "openai"
          ? await invokeOpenAiImage(provider, request, fetcher, timeoutMs)
          : (() => {
              throw new Error(
                `AI provider adapter ${provider.adapter} is not supported for image generation`
              );
            })();
    circuit.delete(provider.id);
    return result;
  } catch (error) {
    const failures = (state?.failures ?? 0) + 1;
    circuit.set(provider.id, {
      failures,
      ...(failures >= 3 ? { blockedUntil: Date.now() + 30_000 } : {})
    });
    throw error;
  }
}

async function invokeGoogleImage(
  provider: ResolvedAiProvider,
  request: ImageGenerationRequest,
  fetcher: typeof fetch,
  timeoutMs: number
): Promise<ImageGenerationResult> {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  const startedAt = performance.now();
  const base = provider.baseUrl.replace(/\/+$/, "");
  const response = await fetcher(`${base}/models/${provider.model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": provider.secret, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: request.prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        ...(request.aspectRatio ? { imageConfig: { aspectRatio: request.aspectRatio } } : {})
      }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`AI image provider returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
    usageMetadata?: { totalTokenCount?: number };
  };
  const inline = payload.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data
  )?.inlineData;
  if (!inline?.data) throw new Error("AI image provider response contained no image data");
  const tokens = payload.usageMetadata?.totalTokenCount;
  return {
    base64: inline.data,
    mimeType: inline.mimeType ?? "image/png",
    tokensUsed: Number.isFinite(tokens) ? Number(tokens) : 0,
    latencyMs: Math.round(performance.now() - startedAt),
    costUsd: 0,
    providerId: provider.id,
    model: provider.model
  };
}

async function invokeOpenAiImage(
  provider: ResolvedAiProvider,
  request: ImageGenerationRequest,
  fetcher: typeof fetch,
  timeoutMs: number
): Promise<ImageGenerationResult> {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  const startedAt = performance.now();
  const response = await fetcher(`${openAiCompatibleBaseUrl(provider)}/images/generations`, {
    method: "POST",
    headers: { authorization: `Bearer ${provider.secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      prompt: request.prompt,
      response_format: "b64_json"
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`AI image provider returned HTTP ${response.status}`);
  const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) throw new Error("AI image provider response contained no image data");
  return {
    base64,
    mimeType: "image/png",
    tokensUsed: 0,
    latencyMs: Math.round(performance.now() - startedAt),
    costUsd: 0,
    providerId: provider.id,
    model: provider.model
  };
}
