import assert from "node:assert/strict";
import test from "node:test";
import { ProjectRepository } from "../../apps/platform-api/src/persistence/project-repository.ts";

for (const stolen of ["epoch", "workspace", "none"]) {
  test(`project cascade checks ${stolen} ownership inside its transaction after caller prechecks`, async () => {
    const project = {
      id: "prj_delete",
      ownerUserId: "owner",
      name: "Delete",
      status: "draft",
      createdAt: new Date(),
      intendedUsers: []
    };
    let deleted = false;
    let inTransaction = false;
    let reads = 0;
    const projectModel = {
      findMany: async () => [project],
      delete: async () => {
        deleted = true;
        return project;
      }
    };
    const client = {
      project: projectModel,
      async $transaction(operation) {
        inTransaction = true;
        try {
          return await operation({
            project: projectModel,
            async $queryRawUnsafe(sql) {
              assert.equal(inTransaction, true);
              assert.match(sql, /FOR UPDATE/);
              reads++;
              if (sql.includes("project_lifecycle_states"))
                return stolen === "epoch" ? [] : [{ valid: true }];
              if (sql.includes("workspace_provisioning_leases"))
                return stolen === "workspace" ? [] : [{ valid: true }];
              throw new Error("unexpected ownership query");
            }
          });
        } finally {
          inTransaction = false;
        }
      }
    };
    const remove = () =>
      new ProjectRepository(client).deleteForActor({ id: "owner", role: "creator" }, project.id, {
        epoch: 1,
        ownerId: "deletion-owner",
        workspaceToken: "workspace-owner",
        assertCurrent: async () => {}
      });
    if (stolen === "none") {
      await remove();
      assert.equal(deleted, true);
      assert.equal(reads, 2);
    } else {
      await assert.rejects(remove, { code: "PROJECT_DELETION_IN_PROGRESS" });
      assert.equal(deleted, false);
    }
  });
}
