import assert from "node:assert/strict";
import test from "node:test";

const { registerProjectDbRoutes } = await import("../../apps/platform-api/src/project-database.ts");

test("database mutations map project deletion conflicts to 409", async () => {
  let mutate;
  let failure;
  const error = new Error("Project 'p1' is being deleted");
  error.name = "ProjectDeletionInProgressError";

  registerProjectDbRoutes({
    get() {},
    post(path, handler) {
      if (path.includes("mutate")) mutate = handler;
    },
    ok() {
      assert.fail("mutation must not succeed");
    },
    fail(_response, status, code, message) {
      failure = { status, code, message };
    },
    async resolveAccessibleProjectIds() {
      return ["p1"];
    },
    async getDatabaseUrl() {
      return "postgresql://user:pass@localhost/db?schema=p1";
    },
    async runChildMutation() {
      throw error;
    },
    audit() {}
  });

  await mutate(
    { params: { projectId: "p1", table: "items" }, headers: {}, body: { op: "insert" } },
    {}
  );
  assert.deepEqual(failure, {
    status: 409,
    code: "PROJECT_DELETION_IN_PROGRESS",
    message: "Project 'p1' is being deleted"
  });
});

test("database mutation checks its child-write fence immediately before SQL", async () => {
  let mutate;
  let failure;
  let audited = false;
  registerProjectDbRoutes({
    get() {},
    post(path, handler) { if (path.includes("mutate")) mutate = handler; },
    ok() { assert.fail("stale mutation must not succeed"); },
    fail(_response, status, code) { failure = { status, code }; },
    async resolveAccessibleProjectIds() { return ["p1"]; },
    async getDatabaseUrl() { return "postgresql://user:pass@localhost/db?schema=p1"; },
    async runChildMutation(_projectId, operation) {
      return operation({
        async assertCurrent() {
          const error = new Error("stale child-write epoch");
          error.name = "ProjectDeletionInProgressError";
          throw error;
        }
      });
    },
    audit() { audited = true; }
  });

  await mutate(
    { params: { projectId: "p1", table: "items" }, headers: {}, body: { op: "insert" } },
    {}
  );
  assert.deepEqual(failure, { status: 409, code: "PROJECT_DELETION_IN_PROGRESS" });
  assert.equal(audited, false);
});
