import type {
  AgentRoundInvocationResult,
  AgentRoundMessage,
  AgentTextBlock,
  AgentThinkingBlock,
  AgentToolCallBlock
} from "./agent-execution-types";
import {
  consumeSse,
  nonRetryableProviderError,
  parseProviderJson,
  providerErrorMessage,
  type StructuredRoundRuntimeInput,
  withRequestTimeout
} from "./agent-provider-runtime-utils";

function anthropicMessages(messages: AgentRoundMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map((block) => ({ type: "text", text: block.text }))
      };
    }
    if (message.role === "toolResult") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content.map((block) => block.text).join(""),
            is_error: message.isError
          }
        ]
      };
    }
    return {
      role: "assistant",
      content: message.content.map((block) => {
        if (block.type === "text") return { type: "text", text: block.text };
        if (block.type === "thinking") return { type: "thinking", thinking: block.thinking };
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.arguments
        };
      })
    };
  });
}

export async function streamAnthropicAgentRound(
  input: StructuredRoundRuntimeInput
): Promise<AgentRoundInvocationResult> {
  if (!input.provider.baseUrl) {
    throw new Error(`AI provider ${input.provider.id} has no base URL`);
  }
  const startedAt = performance.now();
  const response = await input.fetcher(`${input.provider.baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": input.provider.secret,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: input.provider.model,
      max_tokens: 8192,
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      messages: anthropicMessages(input.messages),
      tools: input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      })),
      stream: true
    }),
    signal: withRequestTimeout(input.signal, input.timeoutMs)
  });
  if (!response.ok) {
    const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & {
      retryable?: boolean;
    };
    error.retryable = response.status >= 500 || response.status === 429;
    throw error;
  }

  const blocks = new Map<
    number,
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
    | { type: "toolCall"; id: string; name: string; argumentsJson: string }
  >();
  let inputTokens = 0;
  let outputTokens = 0;
  await consumeSse(response, (data) => {
    const frame = parseProviderJson(data) as {
      type?: unknown;
      index?: unknown;
      content_block?: {
        type?: unknown;
        text?: unknown;
        thinking?: unknown;
        id?: unknown;
        name?: unknown;
        input?: unknown;
      };
      delta?: {
        type?: unknown;
        text?: unknown;
        thinking?: unknown;
        partial_json?: unknown;
      };
      message?: { usage?: { input_tokens?: unknown } };
      usage?: { output_tokens?: unknown };
      error?: unknown;
    };
    if (frame.type === "error") {
      throw nonRetryableProviderError(providerErrorMessage(frame.error) ?? "Anthropic error");
    }
    if (frame.type === "message_start") {
      const count = Number(frame.message?.usage?.input_tokens);
      if (Number.isFinite(count) && count >= 0) inputTokens = count;
      return;
    }
    if (frame.type === "message_delta") {
      const count = Number(frame.usage?.output_tokens);
      if (Number.isFinite(count) && count >= 0) outputTokens = count;
      return;
    }
    const index = Number(frame.index ?? 0);
    if (!Number.isInteger(index) || index < 0) {
      throw nonRetryableProviderError("invalid Anthropic content block index");
    }
    if (frame.type === "content_block_start") {
      const block = frame.content_block;
      if (block?.type === "text") {
        const initial = typeof block.text === "string" ? block.text : "";
        blocks.set(index, { type: "text", text: initial });
        if (initial) input.onEvent?.({ type: "text_delta", delta: initial });
      } else if (block?.type === "thinking") {
        const initial = typeof block.thinking === "string" ? block.thinking : "";
        blocks.set(index, { type: "thinking", thinking: initial });
        if (initial) input.onEvent?.({ type: "thinking_delta", delta: initial });
      } else if (block?.type === "tool_use") {
        const initialInput =
          block.input && typeof block.input === "object" && !Array.isArray(block.input)
            ? JSON.stringify(block.input)
            : "";
        blocks.set(index, {
          type: "toolCall",
          id: typeof block.id === "string" ? block.id : `tool_${index}`,
          name: typeof block.name === "string" ? block.name : "",
          argumentsJson: initialInput === "{}" ? "" : initialInput
        });
        input.onEvent?.({ type: "toolcall_start", contentIndex: index });
      }
      return;
    }
    if (frame.type === "content_block_delta") {
      const current = blocks.get(index);
      if (!current) throw nonRetryableProviderError("Anthropic delta has no content block");
      if (current.type === "text" && typeof frame.delta?.text === "string") {
        current.text += frame.delta.text;
        input.onEvent?.({ type: "text_delta", delta: frame.delta.text });
      } else if (current.type === "thinking" && typeof frame.delta?.thinking === "string") {
        current.thinking += frame.delta.thinking;
        input.onEvent?.({ type: "thinking_delta", delta: frame.delta.thinking });
      } else if (current.type === "toolCall" && typeof frame.delta?.partial_json === "string") {
        current.argumentsJson += frame.delta.partial_json;
        input.onEvent?.({
          type: "toolcall_delta",
          contentIndex: index,
          delta: frame.delta.partial_json
        });
      }
      return;
    }
    if (frame.type === "content_block_stop") {
      const current = blocks.get(index);
      if (current?.type !== "toolCall") return;
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(current.argumentsJson || "{}");
      } catch {
        throw nonRetryableProviderError(
          `tool call ${current.name || index} has invalid JSON arguments`
        );
      }
      if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
        throw nonRetryableProviderError("Anthropic tool arguments must be an object");
      }
      const toolCall: AgentToolCallBlock = {
        type: "toolCall",
        id: current.id,
        name: current.name,
        arguments: argumentsValue as Record<string, unknown>
      };
      input.onEvent?.({ type: "toolcall_end", contentIndex: index, toolCall });
    }
  });

  const content: Array<AgentTextBlock | AgentThinkingBlock | AgentToolCallBlock> = [];
  for (const [, block] of [...blocks.entries()].sort(([left], [right]) => left - right)) {
    if (block.type === "text") content.push(block);
    else if (block.type === "thinking") content.push(block);
    else {
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(block.argumentsJson || "{}");
      } catch {
        throw nonRetryableProviderError(`tool call ${block.name} has invalid JSON arguments`);
      }
      if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
        throw nonRetryableProviderError("Anthropic tool arguments must be an object");
      }
      content.push({
        type: "toolCall",
        id: block.id,
        name: block.name,
        arguments: argumentsValue as Record<string, unknown>
      });
    }
  }
  if (!content.length) throw new Error("AI provider returned an empty agent round");
  const totalTokens =
    inputTokens + outputTokens > 0
      ? inputTokens + outputTokens
      : Math.max(1, Math.ceil(JSON.stringify(input.messages).length / 4));
  return {
    message: { role: "assistant", content, timestamp: Date.now() },
    usage: { input: inputTokens, output: outputTokens, totalTokens, costUsd: 0 },
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    providerId: input.provider.id,
    model: input.provider.model
  };
}
