import type { AgentRoundEvent, AgentRoundMessage, AgentRoundTool } from "./agent-execution-types";
import type { ResolvedAiProvider } from "./execution-service";

export type StructuredRoundRuntimeInput = {
  provider: ResolvedAiProvider;
  systemPrompt?: string;
  messages: AgentRoundMessage[];
  tools: AgentRoundTool[];
  signal?: AbortSignal;
  onEvent?: (event: AgentRoundEvent) => void;
  fetcher: typeof fetch;
  timeoutMs: number;
};

export function withRequestTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function consumeSse(
  response: Response,
  onData: (data: string) => void
): Promise<void> {
  if (!response.body) throw new Error("AI provider returned no stream body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data && data !== "[DONE]") onData(data);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
}

export function parseProviderJson(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Provider stream frame must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw nonRetryableProviderError(
      `invalid provider stream JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function openAiCompatibleBaseUrl(provider: ResolvedAiProvider): string {
  const baseUrl = provider.baseUrl?.trim().replace(/\/+$/, "") ?? "";
  if (provider.adapter === "lm_studio" && !/\/v1$/i.test(baseUrl)) return `${baseUrl}/v1`;
  if (provider.adapter === "google" && !/\/openai$/i.test(baseUrl)) return `${baseUrl}/openai`;
  return baseUrl;
}

export function providerErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : undefined;
}

export function nonRetryableProviderError(message: string): Error & { retryable: boolean } {
  const error = new Error(`AI provider error: ${message}`) as Error & { retryable: boolean };
  error.retryable = false;
  return error;
}
