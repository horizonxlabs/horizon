import assert from "node:assert/strict";
import test from "node:test";

const { WorkspaceMigrationRepositoryBackedStore } = await import("../../apps/platform-api/src/persistence/workspace-migration-repository.ts");

test("workspace migration repository persists records by project and updates a repeated migration name", async () => {
  const records = new Map();
  const store = new WorkspaceMigrationRepositoryBackedStore({ workspaceMigrationRecord: {
    upsert: async ({ where, update, create }) => {
      const key = `${where.projectId_name.projectId}/${where.projectId_name.name}`;
      const current = records.get(key);
      const next = current ? { ...current, ...update } : create;
      records.set(key, next);
      return next;
    },
    findMany: async ({ where }) => [...records.values()].filter((record) => record.projectId === where.projectId).sort((left, right) => new Date(left.appliedAt) - new Date(right.appliedAt))
  } });

  await store.recordMigration({ projectId: "prj_1", name: "001_init", sql: "create table one", commitSha: "one" });
  await store.recordMigration({ projectId: "prj_1", name: "001_init", sql: "create table one revised", commitSha: "two" });
  await store.recordMigration({ projectId: "prj_2", name: "001_init", sql: "other", commitSha: "three" });

  const projectOne = await store.listMigrations("prj_1");
  assert.equal(projectOne.length, 1);
  assert.equal(projectOne[0].sql, "create table one revised");
  assert.equal(projectOne[0].commitSha, "two");
  assert.equal((await store.listMigrations("prj_2")).length, 1);
});
