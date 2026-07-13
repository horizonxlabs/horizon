import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync("apps/platform-api/prisma/migrations/20260713000003_ai_execution_evidence/migration.sql", "utf8");

test("Phase 6 schema persists sanitized idempotent AI execution evidence", () => {
  assert.match(schema, /model AiExecutionEvidence/);
  assert.match(schema, /requestId\s+String\s+@unique/);
  assert.match(schema, /failureReason\s+String\?/);
  assert.doesNotMatch(schema.match(/model AiExecutionEvidence[\s\S]*?(?=\nmodel |$)/)?.[0] ?? "", /prompt|response|secret/i);
  assert.match(migration, /CREATE TABLE "ai_execution_evidence"/);
  assert.match(migration, /CREATE UNIQUE INDEX "ai_execution_evidence_request_id_key"/);
});

