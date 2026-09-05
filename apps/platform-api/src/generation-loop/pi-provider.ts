import { randomUUID } from "node:crypto";

import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type Provider,
  type SimpleStreamOptions,
  type Usage
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import type {
  AgentRoundEvent,
  AgentRoundMessage,
  GovernedAiAgentRoundResult
} from "../ai-governance/agent-execution-types";
import type { GovernedAiExecutor } from "../ai-governance/execution-service";
import type { AiScenario, PlatformUser } from "../platform-services";

const PROVIDER_ID = "horizon-governed";
const MODEL_ID = "horizon-governed";

export type CreateHorizonPiRuntimeInput = {
  executor: Pick<GovernedAiExecutor, "executeAgentRound">;
  actor: PlatformUser;
  projectId: string;
  scenario: AiScenario;
  turnId: string;
  maxModelRounds: number;
  modelRoundTimeoutMs?: number;
};

export async function createHorizonPiRuntime(
  input: CreateHorizonPiRuntimeInput
): Promise<{ modelRuntime: ModelRuntime; model: Model<string> }> {
  if (!Number.isInteger(input.maxModelRounds) || input.maxModelRounds < 1) {
    throw new Error("Pi maxModelRounds must be a positive integer");
  }
  if (
    input.modelRoundTimeoutMs !== undefined &&
    (!Number.isInteger(input.modelRoundTimeoutMs) || input.modelRoundTimeoutMs < 1)
  ) {
    throw new Error("Pi modelRoundTimeoutMs must be a positive integer");
  }

  const model = createGovernedModel();
  let roundNumber = 0;
  let fallbackWarningEmitted = false;
  const claimFallbackWarning = () => {
    if (fallbackWarningEmitted) return false;
    fallbackWarningEmitted = true;
    return true;
  };
  const streamRound = (
    selectedModel: Model<string>,
    context: Context,
    options?: SimpleStreamOptions
  ) => {
    const stream = createAssistantMessageEventStream();
    const currentRound = ++roundNumber;
    void produceRound(
      stream,
      selectedModel,
      context,
      options,
      input,
      currentRound,
      claimFallbackWarning
    );
    return stream;
  };
  const provider: Provider<string> = {
    id: PROVIDER_ID,
    name: "Horizon Governed AI",
    auth: {
      apiKey: {
        name: "Horizon internal governance",
        resolve: async () => ({ auth: { apiKey: "horizon-governed-internal" }, source: "Horizon" })
      }
    },
    getModels: () => [model],
    stream: streamRound,
    streamSimple: streamRound
  };
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false
  });
  modelRuntime.registerNativeProvider(provider);
  return { modelRuntime, model };
}

async function produceRound(
  stream: AssistantMessageEventStream,
  model: Model<string>,
  context: Context,
  options: SimpleStreamOptions | undefined,
  input: CreateHorizonPiRuntimeInput,
  roundNumber: number,
  claimFallbackWarning: () => boolean
): Promise<void> {
  const partial = emptyAssistantMessage(model);
  stream.push({ type: "start", partial });
  if (roundNumber > input.maxModelRounds) {
    pushError(stream, partial, "error", `Pi model round limit (${input.maxModelRounds}) exceeded`);
    return;
  }

  try {
    const state = createEventState(stream, partial);
    const roundTimeoutSignal = input.modelRoundTimeoutMs
      ? AbortSignal.timeout(input.modelRoundTimeoutMs)
      : undefined;
    const signal = roundTimeoutSignal
      ? options?.signal
        ? AbortSignal.any([options.signal, roundTimeoutSignal])
        : roundTimeoutSignal
      : options?.signal;
    const result = await input.executor.executeAgentRound(
      input.actor,
      {
        scenario: input.scenario,
        projectId: input.projectId,
        requestId: `pi_${input.turnId}_${roundNumber}_${randomUUID()}`,
        systemPrompt: context.systemPrompt,
        messages: toAgentMessages(context),
        tools: (context.tools ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as unknown as Record<string, unknown>
        })),
        signal
      },
      state.onEvent
    );
    if ((result.status !== "succeeded" && result.status !== "fallback") || !result.message) {
      const roundTimedOut = roundTimeoutSignal?.aborted === true && options?.signal?.aborted !== true;
      const aborted =
        !roundTimedOut &&
        (options?.signal?.aborted === true || result.evidence.failureReason === "aborted");
      pushError(
        stream,
        partial,
        aborted ? "aborted" : "error",
        roundTimedOut
          ? `Pi model round timed out after ${input.modelRoundTimeoutMs}ms`
          : (result.evidence.failureReason ?? `Governed AI round ${result.status}`)
      );
      return;
    }
    if (result.status === "fallback" && claimFallbackWarning()) {
      state.warnFallback(result.evidence.failureReason);
    }
    state.finish(result);
  } catch (error) {
    const roundTimedOut =
      input.modelRoundTimeoutMs !== undefined &&
      options?.signal?.aborted !== true &&
      safeErrorMessage(error).toLowerCase().includes("timeout");
    const aborted = !roundTimedOut && options?.signal?.aborted === true;
    pushError(
      stream,
      partial,
      aborted ? "aborted" : "error",
      roundTimedOut
        ? `Pi model round timed out after ${input.modelRoundTimeoutMs}ms`
        : aborted
          ? "Pi model round aborted"
          : safeErrorMessage(error)
    );
  }
}

function createEventState(stream: AssistantMessageEventStream, partial: AssistantMessage) {
  let textIndex: number | undefined;
  let thinkingIndex: number | undefined;
  const toolIndexes = new Map<number, number>();
  const onEvent = (event: AgentRoundEvent) => {
    if (event.type === "text_delta") {
      if (textIndex === undefined) {
        textIndex = partial.content.length;
        partial.content.push({ type: "text", text: "" });
        stream.push({ type: "text_start", contentIndex: textIndex, partial });
      }
      const block = partial.content[textIndex];
      if (block?.type === "text") block.text += event.delta;
      stream.push({ type: "text_delta", contentIndex: textIndex, delta: event.delta, partial });
      return;
    }
    if (event.type === "thinking_delta") {
      if (thinkingIndex === undefined) {
        thinkingIndex = partial.content.length;
        partial.content.push({ type: "thinking", thinking: "" });
        stream.push({ type: "thinking_start", contentIndex: thinkingIndex, partial });
      }
      const block = partial.content[thinkingIndex];
      if (block?.type === "thinking") block.thinking += event.delta;
      stream.push({
        type: "thinking_delta",
        contentIndex: thinkingIndex,
        delta: event.delta,
        partial
      });
      return;
    }
    if (event.type === "toolcall_start") {
      const index = partial.content.length;
      toolIndexes.set(event.contentIndex, index);
      partial.content.push({ type: "toolCall", id: "pending", name: "pending", arguments: {} });
      stream.push({ type: "toolcall_start", contentIndex: index, partial });
      return;
    }
    if (event.type === "toolcall_delta") {
      const index = toolIndexes.get(event.contentIndex);
      if (index !== undefined) {
        stream.push({ type: "toolcall_delta", contentIndex: index, delta: event.delta, partial });
      }
      return;
    }
    const index = toolIndexes.get(event.contentIndex) ?? partial.content.length;
    const toolCall = { ...event.toolCall };
    partial.content[index] = toolCall;
    stream.push({ type: "toolcall_end", contentIndex: index, toolCall, partial });
  };

  return {
    onEvent,
    warnFallback(reason: string | undefined) {
      const warning = `Using fallback AI provider: ${reason ?? "primary provider unavailable"}`;
      if (thinkingIndex === undefined) {
        thinkingIndex = partial.content.length;
        partial.content.push({ type: "thinking", thinking: "" });
        stream.push({ type: "thinking_start", contentIndex: thinkingIndex, partial });
      }
      const block = partial.content[thinkingIndex];
      if (block?.type === "thinking") {
        const delta = block.thinking ? `\n${warning}` : warning;
        block.thinking += delta;
        stream.push({ type: "thinking_delta", contentIndex: thinkingIndex, delta, partial });
      }
    },
    finish(result: GovernedAiAgentRoundResult) {
      for (const block of result.message!.content) {
        if (block.type === "text" && textIndex === undefined && block.text) {
          textIndex = partial.content.length;
          partial.content.push({ type: "text", text: block.text });
          stream.push({ type: "text_start", contentIndex: textIndex, partial });
          stream.push({ type: "text_delta", contentIndex: textIndex, delta: block.text, partial });
        }
        if (block.type === "thinking" && thinkingIndex === undefined && block.thinking) {
          thinkingIndex = partial.content.length;
          partial.content.push({ type: "thinking", thinking: block.thinking });
          stream.push({ type: "thinking_start", contentIndex: thinkingIndex, partial });
          stream.push({
            type: "thinking_delta",
            contentIndex: thinkingIndex,
            delta: block.thinking,
            partial
          });
        }
      }
      if (textIndex !== undefined) {
        const block = partial.content[textIndex];
        stream.push({
          type: "text_end",
          contentIndex: textIndex,
          content: block?.type === "text" ? block.text : "",
          partial
        });
      }
      if (thinkingIndex !== undefined) {
        const block = partial.content[thinkingIndex];
        stream.push({
          type: "thinking_end",
          contentIndex: thinkingIndex,
          content: block?.type === "thinking" ? block.thinking : "",
          partial
        });
      }
      partial.content = result.message!.content.map((block) => ({ ...block }));
      partial.usage = toPiUsage(result);
      partial.stopReason = partial.content.some((block) => block.type === "toolCall")
        ? "toolUse"
        : "stop";
      stream.push({ type: "done", reason: partial.stopReason, message: partial });
    }
  };
}

function toAgentMessages(context: Context): AgentRoundMessage[] {
  return context.messages.map((message) => {
    if (message.role === "user") {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.map((block) => {
              if (block.type !== "text") throw new Error("Pi image messages are not supported");
              return { type: "text" as const, text: block.text };
            });
      return { role: "user", content, timestamp: message.timestamp };
    }
    if (message.role === "toolResult") {
      return {
        role: "toolResult",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        content: message.content.map((block) => {
          if (block.type !== "text") throw new Error("Pi image tool results are not supported");
          return { type: "text", text: block.text };
        }),
        isError: message.isError,
        timestamp: message.timestamp
      };
    }
    return {
      role: "assistant",
      content: message.content.map((block) => {
        if (block.type === "text") return { type: "text", text: block.text };
        if (block.type === "thinking") return { type: "thinking", thinking: block.thinking };
        return { ...block };
      }),
      timestamp: message.timestamp
    };
  });
}

function createGovernedModel(): Model<string> {
  return {
    id: MODEL_ID,
    name: "Horizon Governed AI",
    api: PROVIDER_ID,
    provider: PROVIDER_ID,
    baseUrl: "horizon://governed",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 32_000
  };
}

function emptyAssistantMessage(model: Model<string>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: "pending",
    timestamp: Date.now()
  };
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  };
}

function toPiUsage(result: GovernedAiAgentRoundResult): Usage {
  const usage = result.usage!;
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: usage.totalTokens,
    cost: { input: 0, output: usage.costUsd, cacheRead: 0, cacheWrite: 0, total: usage.costUsd }
  };
}

function pushError(
  stream: AssistantMessageEventStream,
  partial: AssistantMessage,
  reason: "aborted" | "error",
  message: string
): void {
  partial.stopReason = reason;
  partial.errorMessage = message;
  stream.push({ type: "error", reason, error: partial });
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}
