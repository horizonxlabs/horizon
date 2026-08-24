import assert from "node:assert/strict";
import test from "node:test";

const { deletePersistedProject, deleteProjectResources } =
  await import("../../apps/platform-api/src/project-deletion.ts");

const actor = { id: "creator-1", role: "creator" };
const project = { id: "project-1" };

test("project deletion keeps the row available for retry when cleanup fails", async () => {
  const events = [];
  const persistence = {
    async listProjects() {
      events.push("authorize");
      return [project];
    },
    async deleteProject() {
      events.push("delete-row");
    },
    async recordAudit(input) {
      events.push(`audit:${input.action}`);
    }
  };

  await assert.rejects(
    deletePersistedProject({
      actor,
      encodedProjectId: "project-1",
      persistence,
      cleanup: async () => {
        events.push("cleanup");
        throw new Error("schema cleanup failed");
      }
    }),
    /schema cleanup failed/
  );

  assert.deepEqual(events, ["authorize", "audit:project.deletion_requested", "cleanup"]);
});

test("project deletion succeeds after the row is gone even when success audit recording fails", async () => {
  const events = [];
  const persistence = {
    async listProjects() {
      return [project];
    },
    async deleteProject() {
      events.push("delete-row");
    },
    async recordAudit(input) {
      events.push(`audit:${input.action}`);
      if (input.action === "project.deleted") throw new Error("audit unavailable");
    }
  };

  const result = await deletePersistedProject({
    actor,
    encodedProjectId: "project-1",
    persistence,
    cleanup: async () => events.push("cleanup")
  });

  assert.deepEqual(result, { id: "project-1", deleted: true });
  assert.deepEqual(events, [
    "audit:project.deletion_requested",
    "cleanup",
    "delete-row",
    "audit:project.deleted"
  ]);
});

test("project resource cleanup attempts every independent cleanup and aggregates failures", async () => {
  const attempted = [];
  await assert.rejects(
    deleteProjectResources([
      async () => {
        attempted.push("deployments");
        throw new Error("deployment cleanup failed");
      },
      async () => {
        attempted.push("workspace");
      },
      async () => {
        attempted.push("uploads");
        throw new Error("upload cleanup failed");
      }
    ]),
    (error) => error instanceof AggregateError && error.errors.length === 2
  );
  assert.deepEqual(attempted, ["deployments", "workspace", "uploads"]);
});
