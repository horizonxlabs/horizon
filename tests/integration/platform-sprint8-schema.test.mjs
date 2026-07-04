import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync("apps/platform-api/prisma/migrations/20260703000007_sprint8_mvp_hardening/migration.sql", "utf8");
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 8 Prisma schema defines PRD change domain and traceability models", () => {
  for (const model of ["PrdChangeRequest", "PrdChangeDecision", "DomainSetting", "DomainRequest", "DeploymentTraceRecord"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  assert.match(schema, /prdChangeRequests\s+PrdChangeRequest/);
  assert.match(schema, /domainRequests\s+DomainRequest/);
  assert.match(schema, /deploymentTraceRecords\s+DeploymentTraceRecord/);
  assert.match(schema, /approvedPrdVersionId\s+String\?/);
});

test("Sprint 8 migration creates PRD change domain and traceability tables", () => {
  for (const table of [
    "prd_change_requests",
    "prd_change_decisions",
    "domain_settings",
    "domain_requests",
    "deployment_trace_records"
  ]) {
    assert.match(migration, new RegExp(table));
  }

  assert.match(migration, /source_ticket_id/);
  assert.match(migration, /approved_prd_version_id/);
  assert.match(migration, /public_domain/);
  assert.match(migration, /audit_event_ids/);
});

test("Sprint 8 seed includes PRD change domain traceability and demo checklist data", () => {
  for (const token of [
    "prdChangeRequest",
    "prdChangeDecision",
    "domainSetting",
    "domainRequest",
    "deploymentTraceRecord",
    "prdchg_leave_management_001",
    "domainreq_leave_management_public_001",
    "trace_leave_management_mvp_001",
    "MVP Demo Checklist"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
