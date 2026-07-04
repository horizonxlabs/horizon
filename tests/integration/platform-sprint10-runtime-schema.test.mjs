import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync("apps/platform-api/prisma/migrations/20260703000009_sprint10_generated_runtime_hardening/migration.sql", "utf8");
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 10 Prisma schema defines generated runtime hardening models", () => {
  for (const model of [
    "GeneratedAppRuntime",
    "GeneratedAppSchemaGrant",
    "GeneratedAppHealthCheck",
    "GeneratedAppRuntimeLog",
    "GeneratedAppRuntimeMetric",
    "GeneratedAppOpenApiContract",
    "GeneratedAppMigrationReport"
  ]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  assert.match(schema, /generatedAppRuntime\s+GeneratedAppRuntime/);
  assert.match(schema, /schemaGrants\s+GeneratedAppSchemaGrant/);
  assert.match(schema, /healthChecks\s+GeneratedAppHealthCheck/);
  assert.match(schema, /runtimeLogs\s+GeneratedAppRuntimeLog/);
  assert.match(schema, /runtimeMetrics\s+GeneratedAppRuntimeMetric/);
  assert.match(schema, /openApiContract\s+GeneratedAppOpenApiContract/);
  assert.match(schema, /migrationReports\s+GeneratedAppMigrationReport/);
});

test("Sprint 10 migration creates generated app runtime hardening tables", () => {
  for (const table of [
    "generated_app_runtimes",
    "generated_app_schema_grants",
    "generated_app_health_checks",
    "generated_app_runtime_logs",
    "generated_app_runtime_metrics",
    "generated_app_openapi_contracts",
    "generated_app_migration_reports"
  ]) {
    assert.match(migration, new RegExp(table));
  }

  for (const column of [
    "container_name",
    "image_tag",
    "health_endpoint",
    "ready_endpoint",
    "metrics_endpoint",
    "schema_name",
    "db_user",
    "allowed_schemas",
    "denied_schemas",
    "openapi_path",
    "dry_run_status",
    "destructive_changes",
    "required_approvals"
  ]) {
    assert.match(migration, new RegExp(column));
  }
});

test("Sprint 10 seed includes runtime contract schema isolation health OpenAPI and migration records", () => {
  for (const token of [
    "generatedAppRuntime",
    "generatedAppSchemaGrant",
    "generatedAppHealthCheck",
    "generatedAppRuntimeLog",
    "generatedAppRuntimeMetric",
    "generatedAppOpenApiContract",
    "generatedAppMigrationReport",
    "garun_leave_management_001",
    "gaschema_leave_management_001",
    "gahealth_leave_management_001",
    "galog_leave_management_001",
    "gametric_leave_management_001",
    "gaopenapi_leave_management_001",
    "gamigration_leave_management_001"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
