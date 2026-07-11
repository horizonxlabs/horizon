import type { WorkspaceChatMessage, WorkspaceChatSummary } from "@evcp/types";
import type { ChatHistoryStore } from "../generation-loop/chat-history-store";

type ChatMessageRecord = {
  id: string;
  projectId: string;
  role: string;
  agentMode: string | null;
  content: string;
  artifactActionIds: string[];
  actions: unknown;
  commitSha: string | null;
  tokenUsage: unknown;
  createdAt: Date | string;
};

type ChatSummaryRecord = {
  projectId: string;
  summary: string;
  updatedAt: Date | string;
};

export interface ChatHistoryPersistenceClient {
  chatMessage: {
    create(args: { data: ChatMessageRecord }): Promise<ChatMessageRecord>;
    findMany(args: {
      where: { projectId: string };
      orderBy: { createdAt: "asc" };
    }): Promise<ChatMessageRecord[]>;
  };
  chatSummary: {
    upsert(args: {
      where: { projectId: string };
      update: { summary: string; updatedAt: Date };
      create: ChatSummaryRecord;
    }): Promise<ChatSummaryRecord>;
    findUnique(args: { where: { projectId: string } }): Promise<ChatSummaryRecord | null>;
  };
}

function toWorkspaceChatMessage(record: ChatMessageRecord): WorkspaceChatMessage {
  return {
    id: record.id,
    projectId: record.projectId,
    role: record.role as WorkspaceChatMessage["role"],
    agentMode: (record.agentMode ?? undefined) as WorkspaceChatMessage["agentMode"],
    content: record.content,
    artifactActionIds: record.artifactActionIds,
    actions: record.actions as WorkspaceChatMessage["actions"],
    commitSha: record.commitSha,
    tokenUsage: record.tokenUsage as WorkspaceChatMessage["tokenUsage"],
    createdAt:
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt
  };
}

export class ChatHistoryRepositoryBackedStore implements ChatHistoryStore {
  constructor(private readonly client: ChatHistoryPersistenceClient) {}

  async appendMessage(message: WorkspaceChatMessage): Promise<void> {
    await this.client.chatMessage.create({
      data: {
        id: message.id,
        projectId: message.projectId,
        role: message.role,
        agentMode: message.agentMode ?? null,
        content: message.content,
        artifactActionIds: message.artifactActionIds,
        actions: message.actions ?? null,
        commitSha: message.commitSha,
        tokenUsage: message.tokenUsage,
        createdAt: new Date(message.createdAt)
      }
    });
  }

  async listMessages(projectId: string): Promise<WorkspaceChatMessage[]> {
    const records = await this.client.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" }
    });
    return records.map(toWorkspaceChatMessage);
  }

  async putSummary(summary: WorkspaceChatSummary): Promise<void> {
    const updatedAt = new Date(summary.updatedAt);
    await this.client.chatSummary.upsert({
      where: { projectId: summary.projectId },
      update: { summary: summary.summary, updatedAt },
      create: { projectId: summary.projectId, summary: summary.summary, updatedAt }
    });
  }

  async getSummary(projectId: string): Promise<WorkspaceChatSummary | null> {
    const record = await this.client.chatSummary.findUnique({ where: { projectId } });
    if (!record) return null;
    return {
      projectId: record.projectId,
      summary: record.summary,
      updatedAt:
        record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt
    };
  }
}

export async function createPrismaChatHistoryStore(
  databaseUrl = process.env.DATABASE_URL
): Promise<ChatHistoryStore> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as ChatHistoryPersistenceClient;
  return new ChatHistoryRepositoryBackedStore(client);
}
