import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000004_sprint5_database_restore/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 5 Prisma schema defines database metadata and frontend checkpoint models", () => {
  for (const model of [
    "AppDatabaseTable",
    "AppDatabaseColumn",
    "AppDatabaseRelationship",
    "AppDatabaseSampleRecord",
    "AppDatabaseMigration",
    "FrontendCheckpoint"
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }

  assert.match(schema, /activeFrontendCheckpointId/);
  assert.match(schema, /restoreSourceCheckpointId/);
});

test("Sprint 5 migration creates database metadata and frontend checkpoint tables", () => {
  for (const table of [
    "app_database_tables",
    "app_database_columns",
    "app_database_relationships",
    "app_database_sample_records",
    "app_database_migrations",
    "frontend_checkpoints"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }

  assert.match(migration, /active_frontend_checkpoint_id/);
  assert.match(migration, /restore_source_checkpoint_id/);
});

test("Sprint 5 seed includes database view and frontend restore demo data", () => {
  assert.match(seed, /appDatabaseTable/);
  assert.match(seed, /appDatabaseColumn/);
  assert.match(seed, /appDatabaseSampleRecord/);
  assert.match(seed, /appDatabaseMigration/);
  assert.match(seed, /frontendCheckpoint/);
  assert.match(seed, /leave_requests/);
  assert.match(seed, /fe-0001/);
});
