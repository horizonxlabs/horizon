import { createHash } from "node:crypto";
import { ValidationError } from "../platform-services";
import type {
  AiCompletionAdapter,
  AiGatewayFetchResponse,
  AiGatewayRuntimeOptions,
  AiProvider,
  AiProviderAdapter,
  AiScenario,
  StoredAiApiKey
} from "../platform-services";

export function fingerprintSecret(secret: string): string {
  return `fp_${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

export function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `sk-...${tail}`;
}

export function encryptSecretEnvelope(secret: string): string {
  return `local-envelope:${Buffer.from(secret, "utf8").toString("base64")}`;
}

export function decryptSecretEnvelope(ciphertext: string): string {
  if (!ciphertext.startsWith("local-envelope:"))
    throw new ValidationError("Unsupported AI key envelope");
  return Buffer.from(ciphertext.replace("local-envelope:", ""), "base64").toString("utf8");
}

export function estimateAiTokens(prompt: string, responseText = ""): number {
  return Math.max(1, Math.ceil((prompt.length + responseText.length) / 4));
}

export function sanitizeProviderError(message: string, secret?: string): string {
  let sanitized = message;
  if (secret) sanitized = sanitized.split(secret).join("[redacted-secret]");
  return sanitized.replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}

export function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function aiGatewayAttemptLimit(runtime: AiGatewayRuntimeOptions): number {
  return Math.max(1, Math.floor(runtime.maxRetries ?? 0) + 1);
}

export function isRetryableProviderStatus(status: number, runtime: AiGatewayRuntimeOptions): boolean {
  const configured = runtime.retryableStatusCodes;
  if (configured?.length) return configured.includes(status);
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export class OpenAiCompatibleCompletionAdapter implements AiCompletionAdapter {
  readonly kind: AiProviderAdapter = "openai";

  constructor(private readonly runtime: AiGatewayRuntimeOptions = {}) {}

  complete(input: {
    provider: AiProvider;
    key: StoredAiApiKey;
    model: string;
    prompt: string;
    scenario: AiScenario;
    dryRun: boolean;
    timeoutMs: number;
  }): { text: string; tokensUsed: number; latencyMs: number } {
    const started = this.runtime.now?.() ?? Date.now();
    if (input.provider.baseUrl.startsWith("mock://fail")) {
      throw new ValidationError(`AI provider ${input.provider.id} dry-run failed`);
    }
    const secret = decryptSecretEnvelope(input.key.secretCiphertext);
    if (!input.dryRun) {
      const fetcher = this.runtime.fetcher;
      if (!fetcher) {
        throw new ValidationError(
          "Live external AI fetcher is not configured for the provider adapter runtime"
        );
      }
      const maxAttempts = aiGatewayAttemptLimit(this.runtime);
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: AiGatewayFetchResponse;
        try {
          response = fetcher({
            url: `${input.provider.baseUrl.replace(/\/$/, "")}/chat/completions`,
            method: "POST",
            timeoutMs: input.timeoutMs,
            headers: {
              authorization: `Bearer ${secret}`,
              "content-type": "application/json"
            },
            body: {
              model: input.model,
              messages: [{ role: "user", content: input.prompt }],
              temperature: 0.2,
              metadata: { scenario: input.scenario }
            }
          });
        } catch (error) {
          const sanitized = sanitizeProviderError(providerErrorMessage(error), secret);
          if (attempt < maxAttempts) continue;
          throw new ValidationError(
            `OpenAI-compatible provider transport failed (attempts=${maxAttempts}): ${sanitized}`
          );
        }

        if (response.status < 200 || response.status >= 300) {
          const shouldRetry = isRetryableProviderStatus(response.status, this.runtime);
          if (shouldRetry && attempt < maxAttempts) continue;
          const errorBody = response.body as
            | { error?: { message?: unknown; type?: unknown } }
            | undefined;
          const providerMessage = sanitizeProviderError(
            String(errorBody?.error?.message ?? `HTTP ${response.status}`),
            secret
          );
          const providerType = errorBody?.error?.type ? ` ${String(errorBody.error.type)}` : "";
          throw new ValidationError(
            `OpenAI-compatible provider error (${response.status}${providerType}, attempts=${attempt}): ${providerMessage}`
          );
        }
        const body = response.body as {
          choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
          usage?: { total_tokens?: unknown; completion_tokens?: unknown; prompt_tokens?: unknown };
        };
        const liveText = String(
          body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? ""
        ).trim();
        if (!liveText)
          throw new ValidationError("OpenAI-compatible provider returned an empty completion");
        const totalTokens = Number(
          body?.usage?.total_tokens ?? body?.usage?.completion_tokens ?? 0
        );
        return {
          text: liveText,
          tokensUsed:
            Number.isFinite(totalTokens) && totalTokens > 0
              ? totalTokens
              : estimateAiTokens(input.prompt, liveText),
          latencyMs: Math.max((this.runtime.now?.() ?? Date.now()) - started, 1)
        };
      }
      throw new ValidationError(`OpenAI-compatible provider exhausted attempts=${maxAttempts}`);
    }
    const text = [
      `AI Gateway dry-run response for ${input.scenario}.`,
      `Provider ${input.provider.name} (${input.provider.adapter}) accepted model ${input.model}.`,
      `Prompt fingerprint ${fingerprintSecret(input.prompt)} using key ${fingerprintSecret(secret)}.`
    ].join(" ");
    return {
      text,
      tokensUsed: estimateAiTokens(input.prompt, text),
      latencyMs: Math.max((this.runtime.now?.() ?? Date.now()) - started, 1)
    };
  }
}
