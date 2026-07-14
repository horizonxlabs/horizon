import assert from "node:assert/strict";
import test from "node:test";

const { PrismaWorkspaceCheckpointStore } = await import(
  "../../apps/platform-api/src/persistence/workspace-checkpoint-repository.ts"
);

test("workspace code checkpoints persist and remain idempotent per project commit", async () => {
  const rows = [];
  const store = new PrismaWorkspaceCheckpointStore({
    workspaceCodeCheckpoint: {
      async upsert({ where, update, create }) {
        const existing = rows.find((row) =>
          row.projectId === where.projectId_commitSha.projectId &&
          row.commitSha === where.projectId_commitSha.commitSha
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        rows.push(create);
        return create;
      },
      async findMany({ where }) {
        return rows.filter((row) => row.projectId === where.projectId);
      }
    }
  });

  const first = await store.createCheckpoint({
    projectId: "prj_1",
    tag: "checkpoint/abc123",
    commitSha: "abc123",
    label: "First build"
  });
  const repeated = await store.createCheckpoint({
    projectId: "prj_1",
    tag: "checkpoint/abc123",
    commitSha: "abc123",
    label: "Updated label"
  });

  assert.equal(first.id, repeated.id);
  assert.equal((await store.listCheckpoints("prj_1")).length, 1);
  assert.equal((await store.listCheckpoints("prj_1"))[0].label, "Updated label");
});
