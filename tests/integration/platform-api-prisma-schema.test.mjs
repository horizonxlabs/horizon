import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000000_sprint1_foundation/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("platform API Prisma schema targets PostgreSQL and defines Sprint 1 core models", () => {
  assert.match(schema, /provider\s*=\s*"postgresql"/);

  for (const model of [
    "PlatformUser",
    "PlatformGroup",
    "PlatformRole",
    "Project",
    "ProjectMember",
    "App",
    "AuditLog"
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }
});

test("platform API first migration creates identity project app and audit tables", () => {
  for (const table of [
    "platform_users",
    "platform_groups",
    "platform_roles",
    "platform_user_groups",
    "platform_user_roles",
    "projects",
    "project_members",
    "apps",
    "audit_logs"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }
});

test("platform API seed script creates repeatable demo users and Leave Management records", () => {
  statSync("apps/platform-api/prisma/seed.ts");
  assert.match(seed, /admin@company\.com/);
  assert.match(seed, /creator@company\.com/);
  assert.match(seed, /user@company\.com/);
  assert.match(seed, /leave-management/);
  assert.match(seed, /upsert/);
});
