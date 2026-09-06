import type { AiScenario } from "../platform-services";
import type { AiExecutionEvidence, GovernedAiExecutionStatus } from "./execution-service";

export type AgentTextBlock = { type: "text"; text: string };
export type AgentThinkingBlock = { type: "thinking"; thinking: string };
export type AgentToolCallBlock = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
};

export type AgentRoundMessage =
  | { role: "user"; content: string | AgentTextBlock[]; timestamp: number }
  | {
      role: "assistant";
      content: Array<AgentTextBlock | AgentThinkingBlock | AgentToolCallBlock>;
      timestamp: number;
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: AgentTextBlock[];
      isError: boolean;
      timestamp: number;
    };

export type AgentRoundTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentRoundEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "toolcall_start"; contentIndex: number }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: AgentToolCallBlock };

export type AgentRoundUsage = {
  input: number;
  output: number;
  totalTokens: number;
  costUsd: number;
};

export type GovernedAiAgentRoundInput = {
  scenario: AiScenario;
  projectId: string;
  requestId: string;
  systemPrompt?: string;
  messages: AgentRoundMessage[];
  tools: AgentRoundTool[];
  requestedTokens?: number;
  signal?: AbortSignal;
};

export type GovernedAiAgentRoundResult = {
  status: GovernedAiExecutionStatus;
  message?: Extract<AgentRoundMessage, { role: "assistant" }>;
  usage?: AgentRoundUsage;
  evidence: AiExecutionEvidence;
};

export type AgentRoundInvocationResult = {
  message: Extract<AgentRoundMessage, { role: "assistant" }>;
  usage: AgentRoundUsage;
  latencyMs: number;
  providerId: string;
  model: string;
};
