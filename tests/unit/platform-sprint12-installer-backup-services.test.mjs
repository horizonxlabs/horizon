import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint12Fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  return { services, admin, creator };
}

test("Sprint 12 installer preflight creates pass and block install reports", () => {
  const { services, admin, creator } = createSprint12Fixture();

  const passed = services.operations.runPreflight(admin, {
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
  });

  assert.equal(passed.status, "passed");
  assert.equal(passed.installBlocked, false);
  assert.equal(passed.checks.every((check) => check.status === "pass"), true);
  assert.ok(passed.reportPath.endsWith("install-report.json"));
  assert.deepEqual(passed.composeServices.map((service) => service.name), [
    "platform-api",
    "admin-web",
    "creator-web",
    "app-store-pwa",
    "postgres",
    "keycloak",
    "minio",
    "redis",
    "caddy"
  ]);

  const failed = services.operations.runPreflight(admin, {
    cpuCores: 2,
    memoryGb: 4,
    diskFreeGb: 20,
    os: "ubuntu-22.04",
    dockerVersion: "",
    composeVersion: "",
    portsAvailable: [5432],
    dnsReady: false,
    tlsReady: false,
    networkReady: false
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.installBlocked, true);
  assert.ok(failed.checks.some((check) => check.status === "fail" && check.name === "Docker"));
  assert.ok(failed.actionableFailures.length >= 4);

  assert.throws(
    () => services.operations.runPreflight(creator, { cpuCores: 8, memoryGb: 32, diskFreeGb: 500 }),
    /Role creator cannot access this resource/
  );
});

test("Sprint 12 setup wizard saves deployment config without exposing secrets", () => {
  const { services, admin } = createSprint12Fixture();

  const setup = services.operations.saveSetupConfig(admin, {
    domain: "platform.company.test",
    databaseUrl: "postgresql://evcp:secret@postgres:5432/evcp",
    storage: {
      provider: "minio",
      endpoint: "http://minio:9000",
      bucket: "evcp-backups",
      accessKeyId: "minio-admin",
      secretAccessKey: "super-secret"
    },
    auth: { mode: "keycloak", issuerUrl: "http://keycloak:8080/realms/evcp" },
    ai: { providerId: "aip_openai", model: "gpt-4.1" },
    guardrail: { defaultPolicy: "enterprise-default", blockHighRisk: true },
    backup: { schedule: "0 2 * * *", retentionDays: 30, encryptionMode: "kms", encryptionKeyRef: "kms://evcp/backup" },
    firstAdmin: { email: "admin@company.com", displayName: "Platform Admin" }
  });

  assert.equal(setup.status, "completed");
  assert.equal(setup.domain, "platform.company.test");
  assert.equal(setup.storage.provider, "minio");
  assert.equal(setup.storage.secretAccessKey, undefined);
  assert.match(setup.databaseUrlMasked, /^postgresql:\/\/evcp:\*\*\*@postgres/);
  assert.ok(setup.auditEventId);
});

test("Sprint 12 backup policy run and PITR metadata are encrypted and storage-provider neutral", () => {
  const { services, admin } = createSprint12Fixture();

  const policy = services.operations.configureBackupPolicy(admin, {
    name: "Nightly PostgreSQL Backup",
    schedule: "0 2 * * *",
    retentionDays: 30,
    storage: { provider: "s3", bucket: "evcp-prod-backups", region: "ap-southeast-1" },
    encryptionMode: "kms",
    encryptionKeyRef: "aws-kms://backup-key",
    enabled: true
  });
  assert.equal(policy.status, "active");
  assert.equal(policy.storage.provider, "s3");

  const run = services.operations.runBackup(admin, {
    policyId: policy.id,
    trigger: "manual",
    databaseName: "evcp"
  });

  assert.equal(run.status, "succeeded");
  assert.equal(run.encrypted, true);
  assert.match(run.artifactUri, /^s3:\/\/evcp-prod-backups\//);
  assert.match(run.checksum, /^sha256:/);
  assert.equal(run.databaseName, "evcp");

  const pitr = services.operations.configurePitr(admin, {
    databaseName: "evcp",
    walRetentionHours: 72,
    baseBackupRunId: run.id,
    targetTimestamp: "2026-07-03T12:00:00.000Z",
    rpoMinutes: 60,
    rtoMinutes: 120
  });

  assert.equal(pitr.status, "ready");
  assert.equal(pitr.baseBackupRunId, run.id);
  assert.equal(pitr.walRetentionHours, 72);
});

test("Sprint 12 restore drill creates pass and fail validation reports with critical audit", () => {
  const { services, admin } = createSprint12Fixture();
  const policy = services.operations.configureBackupPolicy(admin, {
    name: "Nightly MinIO Backup",
    schedule: "0 2 * * *",
    retentionDays: 14,
    storage: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-backups" },
    encryptionMode: "passphrase",
    encryptionKeyRef: "secret://backup-passphrase",
    enabled: true
  });
  const run = services.operations.runBackup(admin, { policyId: policy.id, trigger: "scheduled", databaseName: "evcp" });
  const pitr = services.operations.configurePitr(admin, {
    databaseName: "evcp",
    walRetentionHours: 48,
    baseBackupRunId: run.id,
    targetTimestamp: "2026-07-03T10:00:00.000Z",
    rpoMinutes: 60,
    rtoMinutes: 120
  });

  const passed = services.operations.runRestoreDrill(admin, {
    backupRunId: run.id,
    pitrConfigId: pitr.id,
    targetTimestamp: "2026-07-03T10:00:00.000Z",
    validationChecks: ["checksum", "schema", "seed-records", "audit-events"]
  });

  assert.equal(passed.status, "passed");
  assert.equal(passed.recoveryVerified, true);
  assert.deepEqual(passed.failedChecks, []);

  const failed = services.operations.runRestoreDrill(admin, {
    backupRunId: run.id,
    pitrConfigId: pitr.id,
    targetTimestamp: "2026-07-03T10:00:00.000Z",
    validationChecks: ["checksum", "schema"],
    forceFailureChecks: ["schema"]
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.recoveryVerified, false);
  assert.deepEqual(failed.failedChecks, ["schema"]);
  assert.ok(services.audit.list().some((event) => event.action === "restore.drill.failed" && event.severity === "critical"));
});
