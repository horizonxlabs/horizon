import type { WorkspaceChatMessage, WorkspaceChatSummary } from "@evcp/types";

export interface ChatHistoryStore {
  appendMessage(message: WorkspaceChatMessage): void;
  listMessages(projectId: string): WorkspaceChatMessage[];
  putSummary(summary: WorkspaceChatSummary): void;
  getSummary(projectId: string): WorkspaceChatSummary | null;
}

export function createMemoryChatHistoryStore(): ChatHistoryStore {
  const messagesByProject = new Map<string, WorkspaceChatMessage[]>();
  const summaryByProject = new Map<string, WorkspaceChatSummary>();

  return {
    appendMessage(message) {
      const list = messagesByProject.get(message.projectId) ?? [];
      list.push(message);
      messagesByProject.set(message.projectId, list);
    },
    listMessages(projectId) {
      return [...(messagesByProject.get(projectId) ?? [])];
    },
    putSummary(summary) {
      summaryByProject.set(summary.projectId, summary);
    },
    getSummary(projectId) {
      return summaryByProject.get(projectId) ?? null;
    }
  };
}
