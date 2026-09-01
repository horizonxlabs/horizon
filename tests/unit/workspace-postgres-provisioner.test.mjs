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
  for (const bad of ["ab", "UPPER", "has_underscore", "a".repeat(61), "semi;colon", "sp ace", ""]) {
    assert.throws(
      () => assertValidProjectSlug(bad),
      /slug/i,
      `expected rejection for ${JSON.stringify(bad)}`
    );
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

test("pg-client provisioner removes a partially-created role/schema when any step fails", async () => {
  const executed = [];
  let provisioningStatements = 0;
  const provisioner = createPgClientPostgresProvisioner(async (sql) => {
    executed.push(sql);
    if (sql.startsWith("CREATE")) {
      provisioningStatements += 1;
      if (provisioningStatements === 2) throw new Error("schema create failed");
    }
  });

  await assert.rejects(() => provisioner.provisionSchema("leave-tracker"), /schema create failed/);

  assert.ok(executed.some((sql) => /DROP SCHEMA IF EXISTS/.test(sql)));
  assert.ok(executed.some((sql) => /DROP ROLE IF EXISTS/.test(sql)));
});

test("schema deletion takes the same transaction advisory lock as migrations", async () => {
  const executed = [];
  const provisioner = createPgClientPostgresProvisioner(async (sql) => executed.push(sql));
  await provisioner.releaseSchema("leave-tracker");

  assert.equal(executed.length, 1);
  assert.match(executed[0], /^BEGIN;/);
  assert.match(executed[0], /pg_advisory_xact_lock\(hashtextextended\('evcp-schema:app_leave_tracker', 0\)\)/);
  assert.match(executed[0], /DROP SCHEMA IF EXISTS "app_leave_tracker" CASCADE/);
  assert.match(executed[0], /COMMIT;$/);
});
