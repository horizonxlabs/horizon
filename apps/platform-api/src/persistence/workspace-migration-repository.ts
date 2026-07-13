import { randomUUID } from "node:crypto";

import type { MigrationRecord } from "@evcp/types";
import type { MigrationStore } from "../generation-loop/migration-store";

type WorkspaceMigrationRecord = {
  id: string;
  projectId: string;
  name: string;
  sql: string;
  commitSha: string;
  appliedAt: Date | string;
};

export interface WorkspaceMigrationPersistenceClient {
  workspaceMigrationRecord: {
    upsert(args: {
      where: { projectId_name: { projectId: string; name: string } };
      update: { sql: string; commitSha: string; appliedAt: Date };
      create: WorkspaceMigrationRecord;
    }): Promise<WorkspaceMigrationRecord>;
    findMany(args: { where: { projectId: string }; orderBy: { appliedAt: "asc" } }): Promise<WorkspaceMigrationRecord[]>;
  };
}

export class WorkspaceMigrationRepositoryBackedStore implements MigrationStore {
  constructor(private readonly client: WorkspaceMigrationPersistenceClient) {}

  async recordMigration(input: { projectId: string; name: string; sql: string; commitSha: string }): Promise<MigrationRecord> {
    const appliedAt = new Date();
    return toMigrationRecord(await this.client.workspaceMigrationRecord.upsert({
      where: { projectId_name: { projectId: input.projectId, name: input.name } },
      update: { sql: input.sql, commitSha: input.commitSha, appliedAt },
      create: { id: `wmig_${randomUUID().replaceAll("-", "")}`, ...input, appliedAt }
    }));
  }

  async listMigrations(projectId: string): Promise<MigrationRecord[]> {
    return (await this.client.workspaceMigrationRecord.findMany({ where: { projectId }, orderBy: { appliedAt: "asc" } })).map(toMigrationRecord);
  }
}

export async function createPrismaWorkspaceMigrationStore(databaseUrl = process.env.DATABASE_URL): Promise<MigrationStore> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as WorkspaceMigrationPersistenceClient;
  return new WorkspaceMigrationRepositoryBackedStore(client);
}

function toMigrationRecord(record: WorkspaceMigrationRecord): MigrationRecord {
  return { ...record, appliedAt: record.appliedAt instanceof Date ? record.appliedAt.toISOString() : record.appliedAt };
}
