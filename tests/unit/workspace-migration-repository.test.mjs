import assert from "node:assert/strict";
import test from "node:test";

const { WorkspaceMigrationRepositoryBackedStore } =
  await import("../../apps/platform-api/src/persistence/workspace-migration-repository.ts");

test("workspace migration repository persists records by project and updates a repeated migration name", async () => {
  const records = new Map();
  const store = new WorkspaceMigrationRepositoryBackedStore({
    workspaceMigrationRecord: {
      upsert: async ({ where, update, create }) => {
        const key = `${where.projectId_name.projectId}/${where.projectId_name.name}`;
        const current = records.get(key);
        const next = current ? { ...current, ...update } : create;
        records.set(key, next);
        return next;
      },
      findMany: async ({ where }) =>
        [...records.values()]
          .filter((record) => record.projectId === where.projectId)
          .sort((left, right) => new Date(left.appliedAt) - new Date(right.appliedAt))
    }
  });

  await store.recordMigration({
    projectId: "prj_1",
    name: "001_init",
    sql: "create table one",
    commitSha: "one"
  });
  await store.recordMigration({
    projectId: "prj_1",
    name: "001_init",
    sql: "create table one revised",
    commitSha: "two"
  });
  await store.recordMigration({
    projectId: "prj_2",
    name: "001_init",
    sql: "other",
    commitSha: "three"
  });

  const projectOne = await store.listMigrations("prj_1");
  assert.equal(projectOne.length, 1);
  assert.equal(projectOne[0].sql, "create table one revised");
  assert.equal(projectOne[0].commitSha, "two");
  assert.equal((await store.listMigrations("prj_2")).length, 1);
});

test("workspace migration repository rolls back the whole evidence batch when the second write fails", async () => {
  const records = new Map();
  let transactionCalls = 0;
  const model = {
    upsert: async ({ where, create }) => {
      if (create.name === "second") throw new Error("second evidence record failed");
      const key = `${where.projectId_name.projectId}/${where.projectId_name.name}`;
      records.set(key, create);
      return create;
    },
    findMany: async ({ where }) =>
      [...records.values()].filter((record) => record.projectId === where.projectId)
  };
  const client = {
    workspaceMigrationRecord: model,
    async $transaction(operation) {
      transactionCalls += 1;
      const before = new Map(records);
      try {
        return await operation({ workspaceMigrationRecord: model });
      } catch (error) {
        records.clear();
        for (const [key, value] of before) records.set(key, value);
        throw error;
      }
    }
  };
  const store = new WorkspaceMigrationRepositoryBackedStore(client);

  await assert.rejects(
    () =>
      store.recordMigrations([
        { projectId: "p1", name: "first", sql: "CREATE TABLE first(id text)", commitSha: "sha" },
        { projectId: "p1", name: "second", sql: "CREATE TABLE second(id text)", commitSha: "sha" }
      ]),
    /second evidence record failed/
  );

  assert.equal(transactionCalls, 1);
  assert.deepEqual(await store.listMigrations("p1"), []);
});
