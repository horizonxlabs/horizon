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
  openAiCompatibleBaseUrl,
  parseProviderJson,
  providerErrorMessage,
  type StructuredRoundRuntimeInput,
  withRequestTimeout
} from "./agent-provider-runtime-utils";

function openAiMessages(
  systemPrompt: string | undefined,
  messages: AgentRoundMessage[]
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  if (systemPrompt) result.push({ role: "system", content: systemPrompt });
  for (const message of messages) {
    if (message.role === "user") {
      result.push({
        role: "user",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map((block) => block.text).join("")
      });
      continue;
    }
    if (message.role === "toolResult") {
      result.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.toolName,
        content: message.content.map((block) => block.text).join("")
      });
      continue;
    }
    const text = message.content
      .filter((block): block is AgentTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const reasoning = message.content
      .filter((block): block is AgentThinkingBlock => block.type === "thinking")
      .map((block) => block.thinking)
      .join("");
    const toolCalls = message.content
      .filter((block): block is AgentToolCallBlock => block.type === "toolCall")
      .map((block) => ({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.arguments) }
      }));
    result.push({
      role: "assistant",
      content: text || null,
      ...(reasoning ? { reasoning_content: reasoning } : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    });
  }
  return result;
}

export async function streamOpenAiAgentRound(
  input: StructuredRoundRuntimeInput
): Promise<AgentRoundInvocationResult> {
  if (!input.provider.baseUrl) {
    throw new Error(`AI provider ${input.provider.id} has no base URL`);
  }
  const startedAt = performance.now();
  const response = await input.fetcher(
    `${openAiCompatibleBaseUrl(input.provider)}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.provider.secret}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.provider.model,
        messages: openAiMessages(input.systemPrompt, input.messages),
        tools: input.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        })),
        ...(input.tools.length ? { tool_choice: "auto" } : {}),
        temperature: 0.2,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: withRequestTimeout(input.signal, input.timeoutMs)
    }
  );
  if (!response.ok) {
    const error = new Error(`AI provider returned HTTP ${response.status}`) as Error & {
      retryable?: boolean;
    };
    error.retryable = response.status >= 500 || response.status === 429;
    throw error;
  }

  let text = "";
  let thinking = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;
  const toolCalls = new Map<
    number,
    { id: string; name: string; argumentsJson: string; contentIndex: number; started: boolean }
  >();

  await consumeSse(response, (data) => {
    const frame = parseProviderJson(data) as {
      choices?: Array<{
        delta?: {
          content?: unknown;
          reasoning_content?: unknown;
          tool_calls?: Array<{
            index?: unknown;
            id?: unknown;
            function?: { name?: unknown; arguments?: unknown };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
      };
      response_cost?: unknown;
      _hidden_params?: { response_cost?: unknown };
      error?: unknown;
    };
    const providerError = providerErrorMessage(frame.error);
    if (providerError) throw nonRetryableProviderError(providerError);
    const delta = frame.choices?.[0]?.delta;
    if (typeof delta?.content === "string" && delta.content) {
      text += delta.content;
      input.onEvent?.({ type: "text_delta", delta: delta.content });
    }
    if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
      thinking += delta.reasoning_content;
      input.onEvent?.({ type: "thinking_delta", delta: delta.reasoning_content });
    }
    for (const incoming of delta?.tool_calls ?? []) {
      const index = Number(incoming.index ?? 0);
      if (!Number.isInteger(index) || index < 0) {
        throw nonRetryableProviderError("invalid tool call index");
      }
      let current = toolCalls.get(index);
      if (!current) {
        current = {
          id: typeof incoming.id === "string" ? incoming.id : `tool_${index}`,
          name: typeof incoming.function?.name === "string" ? incoming.function.name : "",
          argumentsJson: "",
          contentIndex: (text ? 1 : 0) + (thinking ? 1 : 0) + index,
          started: false
        };
        toolCalls.set(index, current);
      }
      if (typeof incoming.id === "string" && incoming.id) current.id = incoming.id;
      if (typeof incoming.function?.name === "string" && incoming.function.name) {
        current.name = incoming.function.name;
      }
      if (!current.started) {
        current.started = true;
        input.onEvent?.({ type: "toolcall_start", contentIndex: current.contentIndex });
      }
      if (typeof incoming.function?.arguments === "string" && incoming.function.arguments) {
        current.argumentsJson += incoming.function.arguments;
        input.onEvent?.({
          type: "toolcall_delta",
          contentIndex: current.contentIndex,
          delta: incoming.function.arguments
        });
      }
    }
    const prompt = Number(frame.usage?.prompt_tokens);
    const completion = Number(frame.usage?.completion_tokens);
    const total = Number(frame.usage?.total_tokens);
    if (Number.isFinite(prompt) && prompt >= 0) inputTokens = prompt;
    if (Number.isFinite(completion) && completion >= 0) outputTokens = completion;
    if (Number.isFinite(total) && total > 0) totalTokens = total;
    const rawCost = frame.response_cost ?? frame._hidden_params?.response_cost;
    const parsedCost = Number(rawCost);
    if (Number.isFinite(parsedCost) && parsedCost >= 0) costUsd = parsedCost;
  });

  const content: Array<AgentTextBlock | AgentThinkingBlock | AgentToolCallBlock> = [];
  if (text) content.push({ type: "text", text });
  if (thinking) content.push({ type: "thinking", thinking });
  for (const [, call] of [...toolCalls.entries()].sort(([left], [right]) => left - right)) {
    if (!call.name) throw nonRetryableProviderError("tool call is missing a name");
    let argumentsValue: unknown;
    try {
      argumentsValue = JSON.parse(call.argumentsJson || "{}");
    } catch {
      throw nonRetryableProviderError(`tool call ${call.name} has invalid JSON arguments`);
    }
    if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
      throw nonRetryableProviderError(`tool call ${call.name} arguments must be an object`);
    }
    const toolCall: AgentToolCallBlock = {
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: argumentsValue as Record<string, unknown>
    };
    content.push(toolCall);
    input.onEvent?.({ type: "toolcall_end", contentIndex: call.contentIndex, toolCall });
  }
  if (!content.length) throw new Error("AI provider returned an empty agent round");
  if (totalTokens <= 0) {
    totalTokens = inputTokens + outputTokens;
  }
  if (totalTokens <= 0) {
    totalTokens = Math.max(
      1,
      Math.ceil((JSON.stringify(input.messages).length + text.length + thinking.length) / 4)
    );
  }
  return {
    message: { role: "assistant", content, timestamp: Date.now() },
    usage: { input: inputTokens, output: outputTokens, totalTokens, costUsd },
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    providerId: input.provider.id,
    model: input.provider.model
  };
}
