import assert from "node:assert/strict";
import test from "node:test";

const { WorkspaceRuntimeRepositoryBackedStore } = await import("../../apps/platform-api/src/persistence/workspace-runtime-repository.ts");

test("workspace runtime repository upserts, hydrates, and removes lifecycle records without secrets", async () => {
  const records = new Map();
  const store = new WorkspaceRuntimeRepositoryBackedStore({ workspaceRuntimeRecord: {
    findMany: async () => [...records.values()],
    upsert: async ({ where, update, create }) => {
      const next = records.has(where.projectId) ? { ...records.get(where.projectId), ...update } : create;
      records.set(where.projectId, next);
      return next;
    },
    deleteMany: async ({ where }) => {
      const count = records.delete(where.projectId) ? 1 : 0;
      return { count };
    }
  } });
  const record = { id: "ws_1", projectId: "prj_1", slug: "leave", state: "running", containerId: "ctr_1", cpuCores: 1, memoryMb: 1024, lastActivityAt: "2026-07-13T00:00:00.000Z", lastError: undefined, createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z" };
  await store.save({ record, llmGatewayKeyId: "key_1" });
  const [hydrated] = await store.list();
  assert.equal(hydrated.record.containerId, "ctr_1");
  assert.equal(hydrated.llmGatewayKeyId, "key_1");
  assert.equal("DATABASE_URL" in hydrated.record, false);
  await store.remove("prj_1");
  await store.remove("prj_1");
  assert.deepEqual(await store.list(), []);
});

test("workspace runtime removal propagates a Prisma transport failure", async () => {
  const databaseError = new Error("database connection lost");
  const store = new WorkspaceRuntimeRepositoryBackedStore({
    workspaceRuntimeRecord: {
      async findMany() { return []; },
      async upsert() { throw new Error("not used"); },
      async deleteMany() { throw databaseError; }
    }
  });

  await assert.rejects(store.remove("prj_1"), (error) => error === databaseError);
});
