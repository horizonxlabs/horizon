import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migrationPath = "apps/platform-api/prisma/migrations/20260703000011_sprint12_installer_backup_restore/migration.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 12 Prisma schema defines installer and setup models", () => {
  for (const model of ["InstallerReport", "SetupConfiguration"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  for (const relation of [/installerReports\s+InstallerReport\[\]/, /setupConfigurations\s+SetupConfiguration\[\]/]) {
    assert.match(schema, relation);
  }
});

test("Sprint 12 Prisma schema defines backup PITR and restore drill models", () => {
  for (const model of ["BackupPolicy", "BackupRun", "PitrConfiguration", "RestoreDrillReport"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  for (const relation of [
    /backupPolicies\s+BackupPolicy\[\]/,
    /backupRuns\s+BackupRun\[\]/,
    /pitrConfigurations\s+PitrConfiguration\[\]/,
    /restoreDrillReports\s+RestoreDrillReport\[\]/
  ]) {
    assert.match(schema, relation);
  }
});

test("Sprint 12 migration creates installer backup and restore tables", () => {
  for (const table of [
    "installer_reports",
    "setup_configurations",
    "backup_policies",
    "backup_runs",
    "pitr_configurations",
    "restore_drill_reports"
  ]) {
    assert.match(migration, new RegExp(table));
  }

  for (const column of [
    "install_blocked",
    "report_path",
    "checks",
    "compose_services",
    "database_url_masked",
    "storage_config",
    "encryption_key_ref",
    "retention_days",
    "artifact_uri",
    "wal_retention_hours",
    "target_timestamp",
    "recovery_verified",
    "failed_checks"
  ]) {
    assert.match(migration, new RegExp(column));
  }
});

test("Sprint 12 seed includes representative installer backup and restore records", () => {
  for (const token of [
    "installerReport",
    "setupConfiguration",
    "backupPolicy",
    "backupRun",
    "pitrConfiguration",
    "restoreDrillReport",
    "instrep_private_server_ready",
    "setup_private_server_001",
    "bckpol_nightly_postgres",
    "bckrun_nightly_postgres_001",
    "pitr_evcp_ready_001",
    "restore_drill_001"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
