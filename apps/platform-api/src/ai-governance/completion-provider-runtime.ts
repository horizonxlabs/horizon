import type { ResolvedAiProvider } from "./execution-service";
import {
  nonRetryableProviderError,
  openAiCompatibleBaseUrl,
  providerErrorMessage
} from "./agent-provider-runtime-utils";

export async function invokeWithCircuitBreaker(
  provider: ResolvedAiProvider,
  prompt: string,
  fetcher: typeof fetch,
  timeoutMs: number,
  circuit: Map<string, { failures: number; blockedUntil?: number }>,
  onToken?: (delta: string) => void,
  onReasoning?: (delta: string) => void
) {
  const state = circuit.get(provider.id);
  if (state?.blockedUntil && state.blockedUntil > Date.now())
    throw new Error(`AI provider ${provider.id} circuit is open`);
  try {
    const result =
      provider.adapter === "anthropic"
        ? await invokeAnthropic(provider, prompt, fetcher, timeoutMs)
        : await invokeOpenAiCompatible(provider, prompt, fetcher, timeoutMs, onToken, onReasoning);
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

async function streamOpenAiCompatible(
  provider: ResolvedAiProvider,
  prompt: string,
  fetcher: typeof fetch,
  timeoutMs: number,
  onToken: (delta: string) => void,
  onReasoning?: (delta: string) => void
) {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  const startedAt = performance.now();
  const response = await fetcher(`${openAiCompatibleBaseUrl(provider)}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${provider.secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & {
      retryable?: boolean;
    };
    error.retryable = response.status >= 500;
    throw error;
  }
  if (!response.body) throw new Error("AI provider returned no stream body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usageTokens = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
          usage?: { total_tokens?: unknown };
          error?: unknown;
        };
        const providerError = providerErrorMessage(json.error);
        if (providerError) throw nonRetryableProviderError(providerError);
        const delta = json.choices?.[0]?.delta;
        const content = delta?.content;
        if (typeof content === "string" && content) {
          text += content;
          onToken(content);
        }
        // Reasoning models (e.g. gemma-*-a4b) stream chain-of-thought as `reasoning_content`.
        // Forward it on a SEPARATE channel — it is NOT part of `text` (the answer the action
        // parser consumes); callers surface it as a live "thinking" view, like opencode.
        const reasoning = delta?.reasoning_content;
        if (onReasoning && typeof reasoning === "string" && reasoning) onReasoning(reasoning);
        const total = Number(json.usage?.total_tokens);
        if (Number.isFinite(total) && total > 0) usageTokens = total;
      } catch (error) {
        if (
          error instanceof Error &&
          (error as Error & { retryable?: boolean }).retryable === false
        ) {
          throw error;
        }
        // skip keep-alive comments / non-JSON frames
      }
    }
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("AI provider returned an empty completion");
  const tokensUsed =
    usageTokens > 0 ? usageTokens : Math.max(1, Math.ceil((prompt.length + trimmed.length) / 4));
  return {
    text: trimmed,
    tokensUsed,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    costUsd: 0,
    providerId: provider.id,
    model: provider.model
  };
}

async function invokeOpenAiCompatible(
  provider: ResolvedAiProvider,
  prompt: string,
  fetcher: typeof fetch,
  timeoutMs: number,
  onToken?: (delta: string) => void,
  onReasoning?: (delta: string) => void
) {
  if (!provider.baseUrl) throw new Error(`AI provider ${provider.id} has no base URL`);
  if (onToken)
    return streamOpenAiCompatible(provider, prompt, fetcher, timeoutMs, onToken, onReasoning);
  const startedAt = performance.now();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(`${openAiCompatibleBaseUrl(provider)}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${provider.secret}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) continue;
        const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & {
          retryable?: boolean;
        };
        error.retryable = response.status >= 500;
        throw error;
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { total_tokens?: unknown };
        response_cost?: unknown;
        _hidden_params?: { response_cost?: unknown };
        error?: unknown;
      };
      const providerError = providerErrorMessage(body.error);
      if (providerError) throw nonRetryableProviderError(providerError);
      const text = String(body.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("AI provider returned an empty completion");
      const tokensUsed = Number(
        body.usage?.total_tokens ?? Math.max(1, Math.ceil((prompt.length + text.length) / 4))
      );
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

async function invokeAnthropic(
  provider: ResolvedAiProvider,
  prompt: string,
  fetcher: typeof fetch,
  timeoutMs: number
) {
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
        const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & {
          retryable?: boolean;
        };
        error.retryable = response.status >= 500 || response.status === 429;
        throw error;
      }
      const body = (await response.json()) as {
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
        tokensUsed:
          Number.isFinite(tokensUsed) && tokensUsed > 0
            ? tokensUsed
            : Math.max(1, Math.ceil((prompt.length + text.length) / 4)),
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
