import { randomUUID } from "node:crypto";

import type { MigrationRecord } from "@evcp/types";
import type { MigrationRecordInput, MigrationStore } from "../generation-loop/migration-store";

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
    findMany(args: {
      where: { projectId: string };
      orderBy: { appliedAt: "asc" };
    }): Promise<WorkspaceMigrationRecord[]>;
  };
  $transaction<T>(
    operation: (
      client: Pick<WorkspaceMigrationPersistenceClient, "workspaceMigrationRecord">
    ) => Promise<T>
  ): Promise<T>;
}

async function upsertMigration(
  model: WorkspaceMigrationPersistenceClient["workspaceMigrationRecord"],
  input: MigrationRecordInput
): Promise<MigrationRecord> {
  const appliedAt = new Date();
  return toMigrationRecord(
    await model.upsert({
      where: { projectId_name: { projectId: input.projectId, name: input.name } },
      update: { sql: input.sql, commitSha: input.commitSha, appliedAt },
      create: { id: `wmig_${randomUUID().replaceAll("-", "")}`, ...input, appliedAt }
    })
  );
}

export class WorkspaceMigrationRepositoryBackedStore implements MigrationStore {
  constructor(private readonly client: WorkspaceMigrationPersistenceClient) {}

  async recordMigration(input: MigrationRecordInput): Promise<MigrationRecord> {
    return upsertMigration(this.client.workspaceMigrationRecord, input);
  }

  async recordMigrations(inputs: MigrationRecordInput[]): Promise<MigrationRecord[]> {
    if (inputs.length === 0) return [];
    if (typeof this.client.$transaction !== "function") {
      throw new Error("atomic migration evidence transaction is unavailable");
    }
    return this.client.$transaction(async (transaction) => {
      const records: MigrationRecord[] = [];
      for (const input of inputs) {
        records.push(await upsertMigration(transaction.workspaceMigrationRecord, input));
      }
      return records;
    });
  }

  async listMigrations(projectId: string): Promise<MigrationRecord[]> {
    return (
      await this.client.workspaceMigrationRecord.findMany({
        where: { projectId },
        orderBy: { appliedAt: "asc" }
      })
    ).map(toMigrationRecord);
  }
}

export async function createPrismaWorkspaceMigrationStore(
  databaseUrl = process.env.DATABASE_URL
): Promise<MigrationStore> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as WorkspaceMigrationPersistenceClient;
  return new WorkspaceMigrationRepositoryBackedStore(client);
}

function toMigrationRecord(record: WorkspaceMigrationRecord): MigrationRecord {
  return {
    ...record,
    appliedAt: record.appliedAt instanceof Date ? record.appliedAt.toISOString() : record.appliedAt
  };
}
