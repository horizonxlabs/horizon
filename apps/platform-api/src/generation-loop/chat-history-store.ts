import type { WorkspaceChatMessage, WorkspaceChatSummary } from "@evcp/types";

export interface ChatHistoryStore {
  appendMessage(message: WorkspaceChatMessage): Promise<void>;
  listMessages(projectId: string): Promise<WorkspaceChatMessage[]>;
  listRecentMessages(projectId: string, limit: number): Promise<WorkspaceChatMessage[]>;
  putSummary(summary: WorkspaceChatSummary): Promise<void>;
  getSummary(projectId: string): Promise<WorkspaceChatSummary | null>;
}

export function createMemoryChatHistoryStore(): ChatHistoryStore {
  const messagesByProject = new Map<string, WorkspaceChatMessage[]>();
  const identityByMessageId = new Map<string, Pick<WorkspaceChatMessage, "projectId" | "role">>();
  const summaryByProject = new Map<string, WorkspaceChatSummary>();

  return {
    async appendMessage(message) {
      const identity = identityByMessageId.get(message.id);
      if (
        identity &&
        (identity.projectId !== message.projectId || identity.role !== message.role)
      ) {
        throw new Error("chat message identity conflict");
      }
      const list = messagesByProject.get(message.projectId) ?? [];
      const existingIndex = list.findIndex((candidate) => candidate.id === message.id);
      if (existingIndex >= 0) list[existingIndex] = message;
      else list.push(message);
      messagesByProject.set(message.projectId, list);
      identityByMessageId.set(message.id, {
        projectId: message.projectId,
        role: message.role
      });
    },
    async listMessages(projectId) {
      return [...(messagesByProject.get(projectId) ?? [])];
    },
    async listRecentMessages(projectId, limit) {
      return [...(messagesByProject.get(projectId) ?? [])].slice(-Math.max(0, limit));
    },
    async putSummary(summary) {
      summaryByProject.set(summary.projectId, summary);
    },
    async getSummary(projectId) {
      return summaryByProject.get(projectId) ?? null;
    }
  };
}
