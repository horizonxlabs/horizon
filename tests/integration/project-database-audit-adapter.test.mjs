import assert from "node:assert/strict";
import test from "node:test";

const { createProjectDbAuditAdapter } = await import(
  "../../apps/platform-api/src/project-database-audit.ts"
);
const { registerProjectDbRoutes } = await import(
  "../../apps/platform-api/src/project-database.ts"
);
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);
const {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/core-repositories.ts");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function databaseMutationHandler(services, onSuccess) {
  let mutate;
  registerProjectDbRoutes({
    get() {},
    post(path, handler) { if (path.includes("mutate")) mutate = handler; },
    async resolveAccessibleProjectIds() { return ["p1"]; },
    async getDatabaseUrl() { return "postgresql://user:pass@localhost/db?schema=app_p1"; },
    createTransaction() {
      return async (operation) => operation(async (sql) => {
        if (sql.includes("information_schema.columns")) {
          return { rows: [{
            table_name: "items", column_name: "id", data_type: "text",
            is_nullable: "NO", ordinal_position: 1, is_primary_key: true
          }], rowCount: 1 };
        }
        if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
        return { rows: [{ id: "one" }], rowCount: 1 };
      });
    },
    async runChildMutation(_projectId, operation) {
      return operation({ async assertCurrent() {} });
    },
    audit: createProjectDbAuditAdapter(services),
    ok(_response, body) { onSuccess(body); },
    fail(_response, _status, _code, message) { assert.fail(message); }
  });
  return mutate;
}

function persistenceServices() {
  return {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(new MemoryCorePersistenceClient())
  };
}

test("database mutation success waits for durable audit persistence", async () => {
  const services = persistenceServices();
  const auditReleased = deferred();
  const originalRecordAudit = services.corePersistence.recordAudit.bind(services.corePersistence);
  services.corePersistence.recordAudit = async (event) => {
    await auditReleased.promise;
    return originalRecordAudit(event);
  };
  let responseBody;
  const mutate = databaseMutationHandler(services, (body) => { responseBody = body; });

  const response = mutate({
    params: { projectId: "p1", table: "items" },
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { op: "insert", values: { id: "one" } }
  }, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responseBody, undefined, "HTTP success must remain pending until audit persistence settles");

  auditReleased.resolve();
  await response;
  assert.deepEqual(responseBody, { row: { id: "one" } });
});

test("database mutation reports audit persistence failure and keeps the committed success response", async () => {
  const services = persistenceServices();
  services.corePersistence.recordAudit = async () => { throw new Error("audit database unavailable"); };
  let responseBody;
  const mutate = databaseMutationHandler(services, (body) => { responseBody = body; });

  await mutate({
    params: { projectId: "p1", table: "items" },
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { op: "insert", values: { id: "one" } }
  }, {});

  assert.deepEqual(responseBody, { row: { id: "one" } });
  const failure = services.audit.list().find((event) => event.action === "audit.persistence_failed");
  assert.equal(failure?.severity, "high");
  assert.equal(failure?.resourceId, "p1");
  assert.equal(failure?.metadata.attemptedAction, "database.row.insert");
  assert.equal(failure?.metadata.message, "audit database unavailable");
});

test("database mutation reports post-commit auth resolution failure and keeps the committed success response", async () => {
  const services = persistenceServices();
  let responseBody;
  const mutate = databaseMutationHandler(services, (body) => { responseBody = body; });

  await mutate({
    params: { projectId: "p1", table: "items" },
    headers: {},
    body: { op: "insert", values: { id: "one" } }
  }, {});

  assert.deepEqual(responseBody, { row: { id: "one" } });
  const failure = services.audit.list().find((event) => event.action === "audit.persistence_failed");
  assert.equal(failure?.severity, "high");
  assert.equal(failure?.actorId, "system");
  assert.equal(failure?.resourceId, "p1");
  assert.equal(failure?.metadata.attemptedAction, "database.row.insert");
  assert.match(failure?.metadata.message, /Authorization|authentication/i);
});
