import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

test("Sprint 14 API exposes security readiness and denies non-admin access", () => {
  const services = createPlatformApiServices();

  const denied = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/security/readiness",
    headers: creatorHeaders
  });
  assert.equal(denied.status, 403);

  const readiness = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/security/readiness",
    headers: adminHeaders
  });
  assert.equal(readiness.status, 200);
  assert.equal(readiness.body.data.tlsPolicy.productionHttpsRequired, true);
  assert.equal(readiness.body.data.secretRedaction.passed, true);
  assert.ok(readiness.body.data.rtmRegression.p0RequirementsTotal > 0);
});

test("Sprint 14 API validates uploads release checklist and sensitive redaction", () => {
  const services = createPlatformApiServices();

  const upload = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/security/uploads/validate",
    headers: adminHeaders,
    body: {
      fileName: "unsafe.exe",
      mimeType: "application/x-msdownload",
      sizeBytes: 200000,
      scanStatus: "clean",
      source: "ticket"
    }
  });
  assert.equal(upload.status, 201);
  assert.equal(upload.body.data.decision, "blocked");

  const release = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/security/release-checklist",
    headers: adminHeaders,
    body: {
      projectId: "prj_leave_management",
      exposure: "public",
      authReady: true,
      permissionsReady: true,
      domainApproved: true,
      tlsReady: false,
      dataClassification: "Confidential",
      auditReady: true
    }
  });
  assert.equal(release.status, 201);
  assert.equal(release.body.data.allowed, false);

  const redaction = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/security/redaction/preview",
    headers: adminHeaders,
    body: {
      classification: "Restricted",
      prompt: "Use sk-live-secret for payroll export",
      ticketDescription: "password hunter2 and card 4111 1111 1111 1111",
      requestPayload: { apiKey: "sk-live-secret", normalField: "leave request" }
    }
  });
  assert.equal(redaction.status, 200);
  assert.equal(JSON.stringify(redaction.body).includes("sk-live-secret"), false);
  assert.equal(JSON.stringify(redaction.body).includes("hunter2"), false);
});

test("Sprint 14 Admin UI exposes Security Release Readiness dashboard", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "Security Release Readiness",
    "TLS Enforcement",
    "Session Policy",
    "Secret Redaction",
    "Upload Validation",
    "Public / External Checklist",
    "Sensitive Log Redaction",
    "RTM Regression",
    "security-release-shell",
    "security-release-mobile-list"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }
});
