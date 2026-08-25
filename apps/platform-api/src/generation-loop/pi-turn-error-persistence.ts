import type { WorkspaceAgentMode, WorkspaceChatAction, WorkspaceChatMessage } from "@evcp/types";

import type { ChatHistoryStore } from "./chat-history-store";
import { createAssistantChatMessage } from "./generation-message-factory";
import { safeToolError } from "./pi-tool-policy";

export async function persistPiTurnErrorAssistant(input: {
  chatHistory: ChatHistoryStore;
  projectId: string;
  mode: WorkspaceAgentMode;
  assistantText: string;
  errorMessage: string;
  inputAborted: boolean;
  preservedCommitSha?: string;
  assistantMessage?: WorkspaceChatMessage;
  artifactActionIds: string[];
  actions: WorkspaceChatAction[];
  tokenUsage: { promptTokens: number; completionTokens: number };
  assertCurrent?: () => Promise<void>;
}): Promise<string> {
  const persistedContent =
    input.inputAborted && !input.preservedCommitSha
      ? input.assistantText
      : `${input.assistantText}\n\n⚠️ ${input.errorMessage}`;
  const assistant =
    input.assistantMessage ??
    createAssistantChatMessage({
      projectId: input.projectId,
      content: persistedContent,
      agentMode: input.mode,
      artifactActionIds: input.artifactActionIds,
      actions: input.actions,
      tokenUsage: input.tokenUsage
    });
  assistant.content = persistedContent;
  if (input.preservedCommitSha) assistant.commitSha = input.preservedCommitSha;

  let persistError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await input.assertCurrent?.();
      await input.chatHistory.appendMessage(assistant);
      return input.errorMessage;
    } catch (error) {
      persistError = error;
    }
  }
  return `${input.errorMessage}; assistant persistence failed: ${safeToolError(persistError)}`;
}
