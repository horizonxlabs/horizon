import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000003_sprint4_workspace_preview/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 4 Prisma schema defines workspace task preview and usage models", () => {
  for (const model of ["WorkspaceTask", "WorkspaceTaskStep", "PreviewVersion", "AiUsageLog"]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }

  assert.match(schema, /guardrailDecision/);
  assert.match(schema, /tokensUsed/);
});

test("Sprint 4 migration creates workspace and usage tables", () => {
  for (const table of ["workspace_tasks", "workspace_task_steps", "preview_versions", "ai_usage_logs"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }

  assert.match(migration, /guardrail_decision/);
  assert.match(migration, /tokens_used/);
});

test("Sprint 4 seed includes workspace preview task and usage demo data", () => {
  assert.match(seed, /workspaceTask/);
  assert.match(seed, /previewVersion/);
  assert.match(seed, /aiUsageLog/);
  assert.match(seed, /Add WFH leave type/);
});
