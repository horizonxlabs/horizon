import type { MigrationRecord } from "@evcp/types";

export interface MigrationStore {
  recordMigration(input: { projectId: string; name: string; sql: string; commitSha: string }): Promise<MigrationRecord>;
  listMigrations(projectId: string): Promise<MigrationRecord[]>;
}

export function createMemoryMigrationStore(): MigrationStore {
  const byProject = new Map<string, MigrationRecord[]>();
  let counter = 0;
  return {
    async recordMigration(input) {
      counter += 1;
      const record: MigrationRecord = {
        id: `mig-${counter}`,
        projectId: input.projectId,
        name: input.name,
        sql: input.sql,
        commitSha: input.commitSha,
        appliedAt: new Date().toISOString()
      };
      const list = byProject.get(input.projectId) ?? [];
      list.push(record);
      byProject.set(input.projectId, list);
      return record;
    },
    async listMigrations(projectId) {
      return [...(byProject.get(projectId) ?? [])];
    }
  };
}
