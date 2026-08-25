import assert from "node:assert/strict";
import test from "node:test";

const { registerProjectDbRoutes } = await import("../../apps/platform-api/src/project-database.ts");
const { createPgClientPostgresProvisioner } =
  await import("../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

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

test("schema deletion waits for a database mutation paused inside its locked SQL commit", async () => {
  let mutate;
  const mutationEntered = deferred();
  const allowCommit = deferred();
  const mutationCommitted = deferred();
  let cleanupFinished = false;
  let lockHeld = false;
  let transactions = 0;
  const statements = [];
  const query = async (sql) => {
    statements.push(sql);
    if (sql.includes("information_schema.columns")) {
      return { rows: [{
        table_name: "items", column_name: "id", data_type: "text", is_nullable: "NO",
        ordinal_position: 1, is_primary_key: true
      }], rowCount: 1 };
    }
    if (sql.trim().startsWith("SELECT pg_advisory_xact_lock")) {
      lockHeld = true;
      return { rows: [], rowCount: 1 };
    }
    assert.match(sql, /^\s*INSERT INTO /);
    mutationEntered.resolve();
    await allowCommit.promise;
    return { rows: [{ id: "one" }], rowCount: 1 };
  };
  const provisioner = createPgClientPostgresProvisioner(async (sql) => {
    assert.match(sql, /evcp-schema:app_prj/);
    if (lockHeld) await mutationCommitted.promise;
    cleanupFinished = true;
  });
  registerProjectDbRoutes({
    get() {},
    post(path, handler) { if (path.includes("mutate")) mutate = handler; },
    ok() {},
    fail(_response, _status, _code, message) { assert.fail(message); },
    async resolveAccessibleProjectIds() { return ["p1"]; },
    async getDatabaseUrl() { return "postgresql://user:pass@localhost/db?schema=app_prj"; },
    createQuery() { assert.fail("mutations must use one checked-out transaction connection"); },
    createTransaction() {
      return async (operation) => {
        transactions += 1;
        try { return await operation(query); }
        finally {
          lockHeld = false;
          mutationCommitted.resolve();
        }
      };
    },
    async runChildMutation(_projectId, operation) {
      return operation({ async assertCurrent() {} });
    },
    audit() {}
  });

  const mutation = mutate(
    { params: { projectId: "p1", table: "items" }, headers: {}, body: {
      op: "insert", values: { id: "one" }
    } },
    {}
  );
  await mutationEntered.promise;
  const deletion = provisioner.releaseSchema("prj");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleanupFinished, false, "DROP SCHEMA must wait for the in-flight SQL transaction");
  allowCommit.resolve();
  await Promise.all([mutation, deletion]);
  assert.equal(cleanupFinished, true);
  assert.equal(transactions, 1);
  assert.match(statements[0], /^SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(statements.at(-1), /WITH lifecycle_fence/);
});

test("database mutation rechecks its fence after DML and rolls back before commit", async () => {
  let mutate;
  let current = true;
  let committed = false;
  let rolledBack = false;
  let failure;
  const query = async (sql) => {
    if (sql.includes("information_schema.columns")) {
      return { rows: [{
        table_name: "items", column_name: "id", data_type: "text", is_nullable: "NO",
        ordinal_position: 1, is_primary_key: true
      }], rowCount: 1 };
    }
    if (sql.trim().startsWith("INSERT")) current = false;
    return { rows: [{ id: "one" }], rowCount: 1 };
  };
  registerProjectDbRoutes({
    get() {},
    post(path, handler) { if (path.includes("mutate")) mutate = handler; },
    ok() { assert.fail("lost fence must roll back instead of committing"); },
    fail(_response, status, code) { failure = { status, code }; },
    async resolveAccessibleProjectIds() { return ["p1"]; },
    async getDatabaseUrl() { return "postgresql://user:pass@localhost/db?schema=app_prj"; },
    createTransaction() {
      return async (operation) => {
        try {
          const result = await operation(query);
          committed = true;
          return result;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      };
    },
    async runChildMutation(_projectId, operation) {
      return operation({
        async assertCurrent() {
          if (!current) {
            const error = new Error("mutation lease lost during DML");
            error.name = "ProjectDeletionInProgressError";
            throw error;
          }
        }
      });
    },
    audit() {}
  });

  await mutate(
    { params: { projectId: "p1", table: "items" }, headers: {}, body: {
      op: "insert", values: { id: "one" }
    } },
    {}
  );
  assert.deepEqual(failure, { status: 409, code: "PROJECT_DELETION_IN_PROGRESS" });
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
});
