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
  parts: unknown;
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
    findUnique(args: { where: { id: string } }): Promise<ChatMessageRecord | null>;
    updateMany(args: {
      where: Pick<ChatMessageRecord, "id" | "projectId" | "role">;
      data: Pick<
        ChatMessageRecord,
        | "agentMode"
        | "content"
        | "artifactActionIds"
        | "actions"
        | "parts"
        | "commitSha"
        | "tokenUsage"
      >;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: { projectId: string };
      orderBy: { createdAt: "asc" | "desc" };
      take?: number;
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
    parts: (record.parts ?? undefined) as WorkspaceChatMessage["parts"],
    commitSha: record.commitSha,
    tokenUsage: record.tokenUsage as WorkspaceChatMessage["tokenUsage"],
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt
  };
}

export class ChatHistoryRepositoryBackedStore implements ChatHistoryStore {
  constructor(private readonly client: ChatHistoryPersistenceClient) {}

  async appendMessage(message: WorkspaceChatMessage): Promise<void> {
    const create = {
      id: message.id,
      projectId: message.projectId,
      role: message.role,
      agentMode: message.agentMode ?? null,
      content: message.content,
      artifactActionIds: message.artifactActionIds,
      actions: message.actions ?? null,
      parts: message.parts ?? null,
      commitSha: message.commitSha,
      tokenUsage: message.tokenUsage,
      createdAt: new Date(message.createdAt)
    };
    const existing = await this.client.chatMessage.findUnique({ where: { id: message.id } });
    if (existing) {
      assertMessageIdentity(existing, message);
      await this.updateExistingMessage(message, create);
      return;
    }

    try {
      await this.client.chatMessage.create({ data: create });
    } catch (createError) {
      // A concurrent insert or a lost create acknowledgement may leave the intended row present.
      const recovered = await this.client.chatMessage.findUnique({ where: { id: message.id } });
      if (!recovered) throw createError;
      assertMessageIdentity(recovered, message);
      await this.updateExistingMessage(message, create);
    }
  }

  private async updateExistingMessage(
    message: WorkspaceChatMessage,
    record: ChatMessageRecord
  ): Promise<void> {
    const result = await this.client.chatMessage.updateMany({
      where: { id: message.id, projectId: message.projectId, role: message.role },
      data: {
        agentMode: record.agentMode,
        content: record.content,
        artifactActionIds: record.artifactActionIds,
        actions: record.actions,
        parts: record.parts,
        commitSha: record.commitSha,
        tokenUsage: record.tokenUsage
      }
    });
    if (result.count !== 1) throw new Error("chat message identity conflict during update");
  }

  async listMessages(projectId: string): Promise<WorkspaceChatMessage[]> {
    const records = await this.client.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" }
    });
    return records.map(toWorkspaceChatMessage);
  }

  async listRecentMessages(projectId: string, limit: number): Promise<WorkspaceChatMessage[]> {
    if (limit <= 0) return [];
    const records = await this.client.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return records.reverse().map(toWorkspaceChatMessage);
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

function assertMessageIdentity(
  existing: Pick<ChatMessageRecord, "projectId" | "role">,
  candidate: Pick<WorkspaceChatMessage, "projectId" | "role">
): void {
  if (existing.projectId !== candidate.projectId || existing.role !== candidate.role) {
    throw new Error("chat message identity conflict");
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
