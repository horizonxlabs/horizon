import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function runPassingPreflight(services) {
  return executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/installer/preflight",
    headers: adminHeaders,
    body: {
      cpuCores: 8,
      memoryGb: 32,
      diskFreeGb: 500,
      os: "ubuntu-22.04",
      dockerVersion: "26.1.0",
      composeVersion: "2.27.0",
      portsAvailable: [80, 443, 5432, 6379, 9000],
      dnsReady: true,
      tlsReady: true,
      networkReady: true
    }
  });
}

test("Sprint 12 API supports installer preflight and setup wizard", () => {
  const services = createPlatformApiServices();

  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/installer/preflight",
    headers: creatorHeaders,
    body: { cpuCores: 8, memoryGb: 32, diskFreeGb: 500 }
  });
  assert.equal(denied.status, 403);

  const preflight = runPassingPreflight(services);
  assert.equal(preflight.status, 201);
  assert.equal(preflight.body.data.status, "passed");
  assert.equal(preflight.body.data.installBlocked, false);

  const failed = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/installer/preflight",
    headers: adminHeaders,
    body: {
      cpuCores: 1,
      memoryGb: 2,
      diskFreeGb: 10,
      dockerVersion: "",
      composeVersion: "",
      portsAvailable: [],
      dnsReady: false,
      tlsReady: false,
      networkReady: false
    }
  });
  assert.equal(failed.status, 201);
  assert.equal(failed.body.data.installBlocked, true);

  const setup = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/installer/setup",
    headers: adminHeaders,
    body: {
      domain: "platform.company.test",
      databaseUrl: "postgresql://evcp:secret@postgres:5432/evcp",
      storage: {
        provider: "minio",
        endpoint: "http://minio:9000",
        bucket: "evcp-backups",
        secretAccessKey: "secret"
      },
      auth: { mode: "keycloak", issuerUrl: "http://keycloak:8080/realms/evcp" },
      ai: { providerId: "aip_openai", model: "gpt-4.1" },
      guardrail: { defaultPolicy: "enterprise-default", blockHighRisk: true },
      backup: {
        schedule: "0 2 * * *",
        retentionDays: 30,
        encryptionMode: "kms",
        encryptionKeyRef: "kms://evcp/backup"
      },
      firstAdmin: { email: "admin@company.com", displayName: "Platform Admin" }
    }
  });
  assert.equal(setup.status, 201);
  assert.equal(setup.body.data.status, "completed");
  assert.equal(setup.body.data.storage.secretAccessKey, undefined);
  assert.match(setup.body.data.databaseUrlMasked, /\*\*\*/);

  const reports = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/installer/reports",
    headers: adminHeaders
  });
  assert.equal(reports.status, 200);
  assert.equal(reports.body.data.length, 2);
  assert.equal(reports.body.data[0].status, "passed");
});

test("Sprint 12 API supports backup policy run PITR and restore drill", () => {
  const services = createPlatformApiServices();

  const policy = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/backup/policies",
    headers: adminHeaders,
    body: {
      name: "Nightly PostgreSQL Backup",
      schedule: "0 2 * * *",
      retentionDays: 30,
      storage: { provider: "s3", bucket: "evcp-prod-backups", region: "ap-southeast-1" },
      encryptionMode: "kms",
      encryptionKeyRef: "aws-kms://backup-key",
      enabled: true
    }
  });
  assert.equal(policy.status, 201);

  const run = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/backup/runs",
    headers: adminHeaders,
    body: { policyId: policy.body.data.id, trigger: "manual", databaseName: "evcp" }
  });
  assert.equal(run.status, 201);
  assert.equal(run.body.data.status, "succeeded");
  assert.equal(run.body.data.encrypted, true);

  const pitr = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/backup/pitr",
    headers: adminHeaders,
    body: {
      databaseName: "evcp",
      walRetentionHours: 72,
      baseBackupRunId: run.body.data.id,
      targetTimestamp: "2026-07-03T12:00:00.000Z",
      rpoMinutes: 60,
      rtoMinutes: 120
    }
  });
  assert.equal(pitr.status, 201);

  const drill = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/backup/restore-drills",
    headers: adminHeaders,
    body: {
      backupRunId: run.body.data.id,
      pitrConfigId: pitr.body.data.id,
      targetTimestamp: "2026-07-03T12:00:00.000Z",
      validationChecks: ["checksum", "schema", "seed-records"]
    }
  });
  assert.equal(drill.status, 201);
  assert.equal(drill.body.data.status, "passed");
  assert.equal(drill.body.data.recoveryVerified, true);

  const overview = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/backup/overview",
    headers: adminHeaders
  });
  assert.equal(overview.status, 200);
  assert.equal(overview.body.data.policies.length, 1);
  assert.equal(overview.body.data.runs.length, 1);
  assert.equal(overview.body.data.restoreDrills.length, 1);
});

test("Sprint 12 Admin backup routes reject creator access", () => {
  const services = createPlatformApiServices();

  const denied = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/backup/overview",
    headers: creatorHeaders
  });

  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");
});

test("Sprint 12 Admin UI exposes Installer Backup Restore dashboard", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "Installer, Backup and Restore",
    "Preflight Report",
    "Setup Wizard",
    "Backup Schedule",
    "Backup Runs",
    "PostgreSQL PITR",
    "Restore Drill",
    "Recovery Evidence",
    "operations-recovery-shell",
    "backup-restore-mobile-list"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }
});
