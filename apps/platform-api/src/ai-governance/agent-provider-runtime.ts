import type { AgentRoundInvocationResult } from "./agent-execution-types";
import type { StructuredRoundRuntimeInput } from "./agent-provider-runtime-utils";
import { streamAnthropicAgentRound } from "./anthropic-agent-runtime";
import { streamOpenAiAgentRound } from "./openai-agent-runtime";

export async function invokeAgentRoundWithCircuitBreaker(
  input: StructuredRoundRuntimeInput & {
    fetcher: typeof fetch;
    timeoutMs: number;
    circuit: Map<string, { failures: number; blockedUntil?: number }>;
  }
): Promise<AgentRoundInvocationResult> {
  const state = input.circuit.get(input.provider.id);
  if (state?.blockedUntil && state.blockedUntil > Date.now()) {
    throw new Error(`AI provider ${input.provider.id} circuit is open`);
  }
  try {
    const result =
      input.provider.adapter === "anthropic"
        ? await streamAnthropicAgentRound(input)
        : await streamOpenAiAgentRound(input);
    input.circuit.delete(input.provider.id);
    return result;
  } catch (error) {
    const failures = (state?.failures ?? 0) + 1;
    input.circuit.set(input.provider.id, {
      failures,
      ...(failures >= 3 ? { blockedUntil: Date.now() + 30_000 } : {})
    });
    throw error;
  }
}
