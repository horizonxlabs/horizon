import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000002_sprint3_prd_generation/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 3 Prisma schema defines PRD document version and section models", () => {
  for (const model of ["PrdDocument", "PrdVersion", "PrdSection"]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }

  assert.match(schema, /baselineVersionId/);
  assert.match(schema, /isBaseline/);
});

test("Sprint 3 migration creates PRD document version and section tables", () => {
  for (const table of ["prd_documents", "prd_versions", "prd_sections"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }

  assert.match(migration, /baseline_version_id/);
  assert.match(migration, /is_baseline/);
});

test("Sprint 3 seed includes Leave Management PRD draft and baseline demo data", () => {
  assert.match(seed, /prdDocument/);
  assert.match(seed, /prdVersion/);
  assert.match(seed, /prdSection/);
  assert.match(seed, /Baseline v1\.0/);
});
