import test from "node:test";
import assert from "node:assert/strict";
import { createPgClientPostgresProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";

test("createPgClientPostgresProvisioner runs each provision statement through the injected runSql", async () => {
  const executed = [];
  const runSql = async (sql) => { executed.push(sql); };
  const provisioner = createPgClientPostgresProvisioner(runSql);

  const result = await provisioner.provisionSchema("demo");

  // schema + role names follow the isolation convention
  assert.match(result.schemaName, /demo/);
  assert.match(result.roleName, /demo/);
  assert.ok(result.password && result.password.length > 0);
  // at least one CREATE SCHEMA and one CREATE ROLE were issued
  assert.ok(executed.some((s) => /create schema/i.test(s)), "expected a CREATE SCHEMA statement");
  assert.ok(executed.some((s) => /create role|create user/i.test(s)), "expected a role/user statement");
});
