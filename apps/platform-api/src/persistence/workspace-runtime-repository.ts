import type { WorkspaceContainerRecord } from "@evcp/types";
import {
  WorkspaceProvisioningLeaseRepository,
  type WorkspaceProvisioningLeaseClient,
  type WorkspaceProvisioningLeaseStore
} from "./workspace-provisioning-lease-repository";

export type WorkspaceRuntimeSnapshot = {
  record: WorkspaceContainerRecord;
  llmGatewayKeyId?: string;
};

export interface WorkspaceRuntimeRecordStore {
  provisioningLeases?: WorkspaceProvisioningLeaseStore;
  list(): Promise<WorkspaceRuntimeSnapshot[]>;
  save(snapshot: WorkspaceRuntimeSnapshot): Promise<void>;
  remove(projectId: string): Promise<void>;
}

type RuntimeRecord = WorkspaceContainerRecord & { llmGatewayKeyId?: string | null };

export interface WorkspaceRuntimePersistenceClient {
  $executeRawUnsafe?: WorkspaceProvisioningLeaseClient["$executeRawUnsafe"];
  $transaction?: WorkspaceProvisioningLeaseClient["$transaction"];
  workspaceRuntimeRecord: {
    findMany(args: { orderBy: { updatedAt: "asc" } }): Promise<RuntimeRecord[]>;
    upsert(args: {
      where: { projectId: string };
      update: Omit<RuntimeRecord, "id" | "projectId" | "createdAt">;
      create: RuntimeRecord;
    }): Promise<RuntimeRecord>;
    deleteMany(args: { where: { projectId: string } }): Promise<{ count: number }>;
  };
}

export class WorkspaceRuntimeRepositoryBackedStore implements WorkspaceRuntimeRecordStore {
  readonly provisioningLeases?: WorkspaceProvisioningLeaseStore;

  constructor(private readonly client: WorkspaceRuntimePersistenceClient) {
    if (client.$executeRawUnsafe && client.$transaction) {
      this.provisioningLeases = new WorkspaceProvisioningLeaseRepository(
        client as WorkspaceProvisioningLeaseClient
      );
    }
  }

  async list(): Promise<WorkspaceRuntimeSnapshot[]> {
    return (
      await this.client.workspaceRuntimeRecord.findMany({ orderBy: { updatedAt: "asc" } })
    ).map((item) => ({
      record: toRecord(item),
      ...(item.llmGatewayKeyId ? { llmGatewayKeyId: item.llmGatewayKeyId } : {})
    }));
  }

  async save(snapshot: WorkspaceRuntimeSnapshot): Promise<void> {
    const data = { ...snapshot.record, llmGatewayKeyId: snapshot.llmGatewayKeyId ?? null };
    const { id: _id, projectId: _projectId, createdAt: _createdAt, ...update } = data;
    await this.client.workspaceRuntimeRecord.upsert({
      where: { projectId: snapshot.record.projectId },
      update,
      create: data
    });
  }

  async remove(projectId: string): Promise<void> {
    await this.client.workspaceRuntimeRecord.deleteMany({ where: { projectId } });
  }
}

export async function createPrismaWorkspaceRuntimeRecordStore(
  databaseUrl = process.env.DATABASE_URL
): Promise<WorkspaceRuntimeRecordStore> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as WorkspaceRuntimePersistenceClient;
  return new WorkspaceRuntimeRepositoryBackedStore(client);
}

function toRecord(record: RuntimeRecord): WorkspaceContainerRecord {
  const { llmGatewayKeyId: _llmGatewayKeyId, ...workspace } = record;
  return {
    ...workspace,
    state: workspace.state as WorkspaceContainerRecord["state"],
    lastActivityAt: toIso(workspace.lastActivityAt),
    createdAt: toIso(workspace.createdAt),
    updatedAt: toIso(workspace.updatedAt)
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
