import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

function installLicense(services) {
  return executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/license/install",
    headers: adminHeaders,
    body: {
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
        signature: "sig_valid_enterprise_2026"
      }
    }
  });
}

test("Sprint 13 API exposes observability dashboard and upgrade rollback evidence", () => {
  const services = createPlatformApiServices();
  installLicense(services);

  const denied = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/production/observability",
    headers: creatorHeaders
  });
  assert.equal(denied.status, 403);

  const dashboard = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/production/observability",
    headers: adminHeaders
  });
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.body.data.serviceHealth.some((service) => service.name === "PostgreSQL"));
  assert.ok(dashboard.body.data.queueHealth.some((queue) => queue.name === "ai-tasks"));

  const upgrade = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/production/upgrade-checks",
    headers: adminHeaders,
    body: {
      targetVersion: "1.1.0",
      diskFreeGb: 20,
      lastBackupStatus: "failed",
      serviceHealth: "degraded",
      licenseStatus: "expired"
    }
  });
  assert.equal(upgrade.status, 201);
  assert.equal(upgrade.body.data.upgradeBlocked, true);

  const rollback = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/production/rollback",
    headers: adminHeaders,
    body: {
      fromVersion: "1.1.1",
      toVersion: "1.1.0",
      reason: "Upgrade health check failed",
      rollbackWindowEndsAt: "2026-10-05T12:00:00.000Z"
    }
  });
  assert.equal(rollback.status, 201);
  assert.equal(rollback.body.data.status, "succeeded");
});

test("Sprint 13 API validates license offline cache and enforces restricted actions", () => {
  const services = createPlatformApiServices();
  const installed = installLicense(services);
  assert.equal(installed.status, 201);
  assert.equal(installed.body.data.status, "active");
  assert.equal(installed.body.data.licenseKey, undefined);
  assert.equal(installed.body.data.licenseKeyFingerprint.startsWith("sha256:"), true);

  const offline = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/license/validate",
    headers: adminHeaders,
    body: { onlineAvailable: false, checkedAt: "2026-10-05T00:00:00.000Z" }
  });
  assert.equal(offline.status, 200);
  assert.equal(offline.body.data.source, "offline_cache");

  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/license/install",
    headers: creatorHeaders,
    body: {}
  });
  assert.equal(denied.status, 403);

  const enforcement = executePlatformApiRequest(services, {
    method: "POST",
    path: "/license/enforce",
    headers: creatorHeaders,
    body: {
      action: "publish",
      currentSeats: 200,
      currentApps: 30,
      monthlyAiTokensUsed: 1_500_000,
      checkedAt: "2027-02-01T00:00:00.000Z"
    }
  });
  assert.equal(enforcement.status, 200);
  assert.equal(enforcement.body.data.allowed, false);
  assert.equal(enforcement.body.data.preserveExistingData, true);

  const existingApp = executePlatformApiRequest(services, {
    method: "POST",
    path: "/license/enforce",
    headers: endUserHeaders,
    body: {
      action: "run_existing_app",
      currentSeats: 200,
      currentApps: 30,
      monthlyAiTokensUsed: 1_500_000,
      checkedAt: "2027-02-01T00:00:00.000Z"
    }
  });
  assert.equal(existingApp.status, 200);
  assert.equal(existingApp.body.data.allowed, true);
});

test("Sprint 13 Admin UI exposes Observability and License dashboard", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "Observability and License",
    "Service Health",
    "Generated App Health",
    "Queue Backpressure",
    "Telemetry Export",
    "Upgrade Compatibility",
    "Rollback Report",
    "License Validation",
    "License Enforcement",
    "observability-license-shell",
    "license-enforcement-mobile-list"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }
});
