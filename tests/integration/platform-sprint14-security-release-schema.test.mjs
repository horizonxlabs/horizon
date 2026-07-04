import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migrationPath = "apps/platform-api/prisma/migrations/20260703000013_sprint14_security_release_readiness/migration.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 14 Prisma schema defines security release readiness models", () => {
  for (const model of [
    "SecurityReadinessReport",
    "SecurityReadinessCheck",
    "UploadScanEvent",
    "ReleaseChecklistReport",
    "SensitiveRedactionEvidence"
  ]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  for (const relation of [
    /securityReadinessReports\s+SecurityReadinessReport\[\]/,
    /securityReadinessChecks\s+SecurityReadinessCheck\[\]/,
    /uploadScanEvents\s+UploadScanEvent\[\]/,
    /releaseChecklistReports\s+ReleaseChecklistReport\[\]/,
    /sensitiveRedactionEvidence\s+SensitiveRedactionEvidence\[\]/
  ]) {
    assert.match(schema, relation);
  }
});

test("Sprint 14 migration creates security readiness tables without plaintext secret columns", () => {
  for (const table of [
    "security_readiness_reports",
    "security_readiness_checks",
    "upload_scan_events",
    "release_checklist_reports",
    "sensitive_redaction_evidence"
  ]) {
    assert.match(migration, new RegExp(table));
  }

  for (const column of [
    "tls_enforced",
    "session_policy",
    "secret_redaction_passed",
    "mime_type",
    "scan_status",
    "quarantine_reason",
    "exposure",
    "release_blocked",
    "redaction_rules_applied"
  ]) {
    assert.match(migration, new RegExp(column));
  }

  assert.doesNotMatch(migration, /secret_plaintext|raw_payload|unredacted_prompt|unredacted_ticket|private_key/i);
});

test("Sprint 14 seed includes representative security release readiness evidence", () => {
  for (const token of [
    "securityReadinessReport",
    "securityReadinessCheck",
    "uploadScanEvent",
    "releaseChecklistReport",
    "sensitiveRedactionEvidence",
    "sec_readiness_release_001",
    "sec_check_tls_001",
    "upload_scan_quarantine_001",
    "release_check_public_block_001",
    "redaction_evidence_restricted_001"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
