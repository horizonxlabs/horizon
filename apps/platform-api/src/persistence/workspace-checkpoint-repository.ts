import { randomUUID } from "node:crypto";

import type { CodeCheckpoint } from "@evcp/types";
import type { CheckpointStore } from "../generation-loop/checkpoint-store";

type WorkspaceCodeCheckpointRecord = {
  id: string;
  projectId: string;
  tag: string;
  commitSha: string;
  label: string;
  createdAt: Date | string;
};

export interface WorkspaceCheckpointPersistenceClient {
  workspaceCodeCheckpoint: {
    upsert(args: {
      where: { projectId_commitSha: { projectId: string; commitSha: string } };
      update: { label: string };
      create: WorkspaceCodeCheckpointRecord;
    }): Promise<WorkspaceCodeCheckpointRecord>;
    findMany(args: {
      where: { projectId: string };
      orderBy: { createdAt: "asc" };
    }): Promise<WorkspaceCodeCheckpointRecord[]>;
  };
}

export class PrismaWorkspaceCheckpointStore implements CheckpointStore {
  constructor(private readonly client: WorkspaceCheckpointPersistenceClient) {}

  async createCheckpoint(input: {
    projectId: string;
    tag: string;
    commitSha: string;
    label: string;
  }): Promise<CodeCheckpoint> {
    const createdAt = new Date();
    return mapCheckpoint(await this.client.workspaceCodeCheckpoint.upsert({
      where: { projectId_commitSha: { projectId: input.projectId, commitSha: input.commitSha } },
      update: { label: input.label },
      create: { id: `wcp_${randomUUID().replaceAll("-", "")}`, ...input, createdAt }
    }));
  }

  async listCheckpoints(projectId: string): Promise<CodeCheckpoint[]> {
    return (await this.client.workspaceCodeCheckpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" }
    })).map(mapCheckpoint);
  }
}

export async function createPrismaWorkspaceCheckpointStore(
  databaseUrl = process.env.DATABASE_URL
): Promise<CheckpointStore> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as WorkspaceCheckpointPersistenceClient;
  return new PrismaWorkspaceCheckpointStore(client);
}

function mapCheckpoint(record: WorkspaceCodeCheckpointRecord): CodeCheckpoint {
  return {
    ...record,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt
  };
}
