import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync("apps/platform-api/prisma/migrations/20260713000003_ai_execution_evidence/migration.sql", "utf8");
const quotaUsageMigration = readFileSync("apps/platform-api/prisma/migrations/20260714000000_ai_quota_usage_ledger/migration.sql", "utf8");
const costEvidenceMigration = readFileSync("apps/platform-api/prisma/migrations/20260714010000_ai_execution_cost_evidence/migration.sql", "utf8");

test("Phase 6 schema persists sanitized idempotent AI execution evidence", () => {
  assert.match(schema, /model AiExecutionEvidence/);
  assert.match(schema, /requestId\s+String\s+@unique/);
  assert.match(schema, /failureReason\s+String\?/);
  assert.match(schema, /costUsd\s+Decimal/);
  assert.doesNotMatch(schema.match(/model AiExecutionEvidence[\s\S]*?(?=\nmodel |$)/)?.[0] ?? "", /prompt|response|secret/i);
  assert.match(migration, /CREATE TABLE "ai_execution_evidence"/);
  assert.match(migration, /CREATE UNIQUE INDEX "ai_execution_evidence_request_id_key"/);
  assert.match(costEvidenceMigration, /ADD COLUMN "cost_usd" DECIMAL\(18, 8\)/);
});

test("Phase 6 schema keeps quota policy separate from per-scope consumption", () => {
  assert.match(schema, /model AiQuotaUsage/);
  assert.match(schema.match(/model AiQuotaUsage[\s\S]*?(?=\nmodel |$)/)?.[0] ?? "", /@@unique\(\[scope, scopeId\]\)/);
  assert.match(quotaUsageMigration, /CREATE TABLE "ai_quota_usage"/);
  assert.match(quotaUsageMigration, /CREATE UNIQUE INDEX "ai_quota_usage_scope_scope_id_key"/);
});
