import { randomUUID } from "node:crypto";

import type { WorkspaceAgentMode, WorkspaceChatAction, WorkspaceChatMessage } from "@evcp/types";

function nextMessageId(): string {
  return `msg-${randomUUID()}`;
}

export function createUserChatMessage(
  projectId: string,
  prompt: string,
  agentMode: WorkspaceAgentMode
): WorkspaceChatMessage {
  return {
    id: nextMessageId(),
    projectId,
    role: "user",
    content: prompt,
    agentMode,
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: new Date().toISOString()
  };
}

export function createAssistantChatMessage(input: {
  projectId: string;
  content: string;
  agentMode: WorkspaceAgentMode;
  artifactActionIds: string[];
  actions: WorkspaceChatAction[];
  tokenUsage?: { promptTokens: number; completionTokens: number };
}): WorkspaceChatMessage {
  return {
    id: nextMessageId(),
    projectId: input.projectId,
    role: "assistant",
    content: input.content,
    agentMode: input.agentMode,
    artifactActionIds: input.artifactActionIds,
    actions: input.actions,
    commitSha: null,
    tokenUsage: input.tokenUsage ?? null,
    createdAt: new Date().toISOString()
  };
}
