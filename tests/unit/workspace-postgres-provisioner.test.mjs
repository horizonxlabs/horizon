// tests/unit/workspace-postgres-provisioner.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const {
  assertValidProjectSlug,
  buildProvisionSchemaSql,
  buildReleaseSchemaSql,
  schemaNameFor,
  roleNameFor,
  createPgClientPostgresProvisioner
} = await import("../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts");

test("accepts valid slugs and rejects invalid ones", () => {
  assertValidProjectSlug("leave-tracker-01");
  for (const bad of ["ab", "UPPER", "has_underscore", "a".repeat(41), "semi;colon", "sp ace", ""]) {
    assert.throws(() => assertValidProjectSlug(bad), /slug/i, `expected rejection for ${JSON.stringify(bad)}`);
  }
});

test("builds schema/role names deterministically", () => {
  assert.equal(schemaNameFor("leave-tracker"), "app_leave_tracker");
  assert.equal(roleNameFor("leave-tracker"), "app_leave_tracker_role");
});

test("provision SQL creates isolated role and schema, revoking public access", () => {
  const sql = buildProvisionSchemaSql("leave-tracker", "s3cret").join("\n");
  assert.match(sql, /CREATE ROLE "app_leave_tracker_role" LOGIN PASSWORD 's3cret'/);
  assert.match(sql, /CREATE SCHEMA "app_leave_tracker" AUTHORIZATION "app_leave_tracker_role"/);
  assert.match(sql, /REVOKE ALL ON SCHEMA public FROM "app_leave_tracker_role"/);
  assert.match(sql, /ALTER ROLE "app_leave_tracker_role" SET search_path = "app_leave_tracker"/);
});

test("release SQL drops schema and role", () => {
  const sql = buildReleaseSchemaSql("leave-tracker").join("\n");
  assert.match(sql, /DROP SCHEMA IF EXISTS "app_leave_tracker" CASCADE/);
  assert.match(sql, /DROP ROLE IF EXISTS "app_leave_tracker_role"/);
});

test("pg-client provisioner runs all statements and returns credentials", async () => {
  const executed = [];
  const provisioner = createPgClientPostgresProvisioner(async (sql) => {
    executed.push(sql);
  });
  const result = await provisioner.provisionSchema("leave-tracker");
  assert.equal(result.schemaName, "app_leave_tracker");
  assert.equal(result.roleName, "app_leave_tracker_role");
  assert.equal(typeof result.password, "string");
  assert.ok(result.password.length >= 32);
  assert.ok(executed.length >= 4);
});
