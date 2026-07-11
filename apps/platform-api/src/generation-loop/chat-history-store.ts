import type { WorkspaceChatMessage, WorkspaceChatSummary } from "@evcp/types";

export interface ChatHistoryStore {
  appendMessage(message: WorkspaceChatMessage): Promise<void>;
  listMessages(projectId: string): Promise<WorkspaceChatMessage[]>;
  putSummary(summary: WorkspaceChatSummary): Promise<void>;
  getSummary(projectId: string): Promise<WorkspaceChatSummary | null>;
}

export function createMemoryChatHistoryStore(): ChatHistoryStore {
  const messagesByProject = new Map<string, WorkspaceChatMessage[]>();
  const summaryByProject = new Map<string, WorkspaceChatSummary>();

  return {
    async appendMessage(message) {
      const list = messagesByProject.get(message.projectId) ?? [];
      list.push(message);
      messagesByProject.set(message.projectId, list);
    },
    async listMessages(projectId) {
      return [...(messagesByProject.get(projectId) ?? [])];
    },
    async putSummary(summary) {
      summaryByProject.set(summary.projectId, summary);
    },
    async getSummary(projectId) {
      return summaryByProject.get(projectId) ?? null;
    }
  };
}
