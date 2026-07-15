import type { MigrationRecord } from "@evcp/types";

export type MigrationRecordInput = {
  projectId: string;
  name: string;
  sql: string;
  commitSha: string;
};

export interface MigrationStore {
  recordMigration(input: MigrationRecordInput): Promise<MigrationRecord>;
  recordMigrations(inputs: MigrationRecordInput[]): Promise<MigrationRecord[]>;
  listMigrations(projectId: string): Promise<MigrationRecord[]>;
}

export function createMemoryMigrationStore(): MigrationStore {
  const byProject = new Map<string, MigrationRecord[]>();
  let counter = 0;
  const recordMigrations = async (inputs: MigrationRecordInput[]) => {
    const records = inputs.map((input, index): MigrationRecord => ({
      id: `mig-${counter + index + 1}`,
      projectId: input.projectId,
      name: input.name,
      sql: input.sql,
      commitSha: input.commitSha,
      appliedAt: new Date().toISOString()
    }));
    const nextByProject = new Map(
      [...byProject].map(([projectId, records]) => [projectId, [...records]])
    );
    for (const record of records) {
      const list = nextByProject.get(record.projectId) ?? [];
      list.push(record);
      nextByProject.set(record.projectId, list);
    }
    for (const [projectId, records] of nextByProject) byProject.set(projectId, records);
    counter += records.length;
    return records;
  };
  return {
    async recordMigration(input) {
      return (await recordMigrations([input]))[0];
    },
    recordMigrations,
    async listMigrations(projectId) {
      return [...(byProject.get(projectId) ?? [])];
    }
  };
}
