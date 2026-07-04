import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migrationPath = "apps/platform-api/prisma/migrations/20260703000012_sprint13_observability_license/migration.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 13 Prisma schema defines observability upgrade rollback and license models", () => {
  for (const model of [
    "ServiceHealthSnapshot",
    "TelemetryExportConfig",
    "UpgradeCompatibilityReport",
    "RollbackReport",
    "LicenseRecord",
    "LicenseValidationLog",
    "LicenseEnforcementEvent"
  ]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  for (const relation of [
    /serviceHealthSnapshots\s+ServiceHealthSnapshot\[\]/,
    /telemetryExportConfigs\s+TelemetryExportConfig\[\]/,
    /upgradeCompatibilityReports\s+UpgradeCompatibilityReport\[\]/,
    /rollbackReports\s+RollbackReport\[\]/,
    /licenseRecords\s+LicenseRecord\[\]/,
    /licenseValidationLogs\s+LicenseValidationLog\[\]/,
    /licenseEnforcementEvents\s+LicenseEnforcementEvent\[\]/
  ]) {
    assert.match(schema, relation);
  }
});

test("Sprint 13 migration creates observability and license tables without plaintext secret columns", () => {
  for (const table of [
    "service_health_snapshots",
    "telemetry_export_configs",
    "upgrade_compatibility_reports",
    "rollback_reports",
    "license_records",
    "license_validation_logs",
    "license_enforcement_events"
  ]) {
    assert.match(migration, new RegExp(table));
  }

  for (const column of [
    "service_name",
    "service_type",
    "queue_depth",
    "audit_retention_days",
    "endpoint",
    "target_version",
    "upgrade_blocked",
    "rollback_window_ends_at",
    "signed_payload_fingerprint",
    "offline_valid_until",
    "restricted_actions",
    "preserve_existing_data"
  ]) {
    assert.match(migration, new RegExp(column));
  }

  assert.doesNotMatch(migration, /license_secret_plaintext|private_key|raw_signature_secret/i);
});

test("Sprint 13 seed includes representative observability license upgrade and rollback evidence", () => {
  for (const token of [
    "serviceHealthSnapshot",
    "telemetryExportConfig",
    "upgradeCompatibilityReport",
    "rollbackReport",
    "licenseRecord",
    "licenseValidationLog",
    "licenseEnforcementEvent",
    "svc_health_platform_api",
    "telemetry_otlp_default",
    "upgrade_check_001",
    "rollback_report_001",
    "license_enterprise_2026",
    "license_validation_offline_001",
    "license_enforcement_publish_block_001"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
