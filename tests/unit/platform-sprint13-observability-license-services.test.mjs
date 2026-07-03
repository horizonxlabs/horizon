import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint13Fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const endUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "user@company.com" });
  return { services, admin, creator, endUser };
}

function installValidLicense(services, admin, overrides = {}) {
  return services.production.installLicense(admin, {
    licenseKey: "EVCP-ENTERPRISE-2026",
    signedPayload: {
      issuer: "0xlabs",
      subject: "company-private-server",
      edition: "enterprise",
      seats: 100,
      appLimit: 25,
      aiUsageMonthlyTokens: 1_000_000,
      expiresAt: "2026-12-31T23:59:59.000Z",
      warningDays: 30,
      graceDays: 14,
      offlineValidUntil: "2027-01-14T23:59:59.000Z",
      signature: "sig_valid_enterprise_2026",
      ...overrides
    }
  });
}

test("Sprint 13 production observability reports core service app queue retention and telemetry state", () => {
  const { services, admin, creator } = createSprint13Fixture();

  const dashboard = services.production.getObservabilityDashboard(admin);

  assert.equal(dashboard.serviceHealth.length >= 8, true);
  assert.ok(dashboard.serviceHealth.some((service) => service.name === "PostgreSQL" && service.status === "healthy"));
  assert.ok(dashboard.generatedAppHealth.some((app) => app.slug === "leave-management" && app.status === "healthy"));
  assert.ok(dashboard.queueHealth.some((queue) => queue.name === "ai-tasks" && queue.depth >= 0));
  assert.equal(dashboard.retention.auditDays, 365);
  assert.equal(dashboard.telemetryExport.status, "configured");
  assert.match(dashboard.telemetryExport.endpoint, /^otlp:\/\//);
  assert.ok(dashboard.auditEventId);

  assert.throws(
    () => services.production.getObservabilityDashboard(creator),
    /Role creator cannot access this resource/
  );
});

test("Sprint 13 upgrade checks block unsafe state and rollback is audited", () => {
  const { services, admin } = createSprint13Fixture();
  installValidLicense(services, admin);

  const passed = services.production.runUpgradeCheck(admin, {
    targetVersion: "1.1.0",
    diskFreeGb: 250,
    lastBackupStatus: "succeeded",
    serviceHealth: "healthy",
    licenseStatus: "active"
  });

  assert.equal(passed.status, "passed");
  assert.equal(passed.upgradeBlocked, false);
  assert.equal(passed.checks.every((check) => check.status === "pass"), true);

  const blocked = services.production.runUpgradeCheck(admin, {
    targetVersion: "1.1.1",
    diskFreeGb: 20,
    lastBackupStatus: "failed",
    serviceHealth: "degraded",
    licenseStatus: "expired"
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.upgradeBlocked, true);
  assert.ok(blocked.blockingReasons.some((reason) => reason.includes("Backup")));

  const rollback = services.production.runRollback(admin, {
    fromVersion: "1.1.1",
    toVersion: "1.1.0",
    reason: "Upgrade health check failed",
    rollbackWindowEndsAt: "2026-10-05T12:00:00.000Z"
  });

  assert.equal(rollback.status, "succeeded");
  assert.equal(rollback.auditEventId.startsWith("aud_"), true);
  assert.ok(services.audit.list().some((event) => event.action === "upgrade.rollback.succeeded"));
});

test("Sprint 13 license validation supports signed payload offline cache and tamper detection", () => {
  const { services, admin } = createSprint13Fixture();

  const license = installValidLicense(services, admin);
  assert.equal(license.status, "active");
  assert.equal(license.edition, "enterprise");
  assert.equal(license.seats.entitled, 100);
  assert.equal(license.appLimit.entitled, 25);
  assert.equal(license.offlineCache.status, "valid");
  assert.equal(license.signedPayloadFingerprint.startsWith("sha256:"), true);
  assert.equal(license.licenseKey, undefined);
  assert.equal(license.licenseKeyFingerprint.startsWith("sha256:"), true);

  const offline = services.production.validateLicense(admin, {
    onlineAvailable: false,
    checkedAt: "2026-10-05T00:00:00.000Z"
  });
  assert.equal(offline.source, "offline_cache");
  assert.equal(offline.status, "active");

  const tampered = services.production.installLicense(admin, {
    licenseKey: "EVCP-TAMPERED",
    signedPayload: {
      issuer: "0xlabs",
      subject: "company-private-server",
      edition: "enterprise",
      seats: 100,
      appLimit: 25,
      aiUsageMonthlyTokens: 1_000_000,
      expiresAt: "2026-12-31T23:59:59.000Z",
      warningDays: 30,
      graceDays: 14,
      offlineValidUntil: "2027-01-14T23:59:59.000Z",
      signature: "tampered"
    }
  });

  assert.equal(tampered.status, "tampered");
  assert.equal(tampered.enforcement.restrictedActions.includes("publish"), true);
  assert.ok(services.audit.list().some((event) => event.action === "license.tamper.detected" && event.severity === "critical"));
});

test("Sprint 13 license enforcement blocks privileged actions without deleting existing data", () => {
  const { services, admin, creator, endUser } = createSprint13Fixture();
  installValidLicense(services, admin, {
    seats: 1,
    appLimit: 1,
    aiUsageMonthlyTokens: 100,
    expiresAt: "2026-07-01T00:00:00.000Z",
    offlineValidUntil: "2026-07-15T00:00:00.000Z"
  });

  const publishDecision = services.production.evaluateLicenseAction(creator, {
    action: "publish",
    currentSeats: 1,
    currentApps: 1,
    monthlyAiTokensUsed: 101,
    checkedAt: "2026-08-01T00:00:00.000Z"
  });

  assert.equal(publishDecision.allowed, false);
  assert.equal(publishDecision.preserveExistingData, true);
  assert.ok(publishDecision.reasons.some((reason) => reason.includes("expired")));

  const runExistingApp = services.production.evaluateLicenseAction(endUser, {
    action: "run_existing_app",
    currentSeats: 1,
    currentApps: 1,
    monthlyAiTokensUsed: 101,
    checkedAt: "2026-08-01T00:00:00.000Z"
  });

  assert.equal(runExistingApp.allowed, true);
  assert.equal(runExistingApp.preserveExistingData, true);
});
