import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  return { services, admin, creator };
}

test("Sprint 14 security readiness evaluates TLS session secret upload release and redaction gates", () => {
  const { services, admin } = fixture();

  const report = services.securityRelease.getReadinessOverview(admin);

  assert.equal(report.status, "blocked");
  assert.ok(report.tlsPolicy.productionHttpsRequired);
  assert.equal(report.tlsPolicy.allowLocalSetupHttp, true);
  assert.equal(report.sessionPolicy.idleTimeoutMinutes, 30);
  assert.equal(report.sessionPolicy.absoluteTimeoutMinutes, 480);
  assert.equal(report.sessionPolicy.rememberMeAllowed, false);
  assert.ok(report.secretRedaction.surfaces.every((surface) => surface.secretExposed === false));
  assert.ok(report.uploadPolicy.allowedMimeTypes.includes("application/pdf"));
  assert.ok(report.releaseChecklist.requiredChecks.includes("tls"));
  assert.ok(report.rtmRegression.p0RequirementsTotal >= report.rtmRegression.p0RequirementsPassed);
  assert.ok(report.auditEventId.startsWith("aud_"));
});

test("Sprint 14 upload validation blocks unsupported oversize and unsafe scan states", () => {
  const { services, admin } = fixture();

  const safe = services.securityRelease.validateUpload(admin, {
    fileName: "policy.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2_000_000,
    scanStatus: "clean",
    source: "knowledge"
  });
  assert.equal(safe.decision, "allowed");

  const unsupported = services.securityRelease.validateUpload(admin, {
    fileName: "payload.exe",
    mimeType: "application/x-msdownload",
    sizeBytes: 500_000,
    scanStatus: "clean",
    source: "ticket"
  });
  assert.equal(unsupported.decision, "blocked");
  assert.ok(unsupported.reasons.some((reason) => reason.includes("mime")));

  const oversize = services.securityRelease.validateUpload(admin, {
    fileName: "huge.pdf",
    mimeType: "application/pdf",
    sizeBytes: 50_000_000,
    scanStatus: "clean",
    source: "knowledge"
  });
  assert.equal(oversize.decision, "blocked");
  assert.ok(oversize.reasons.some((reason) => reason.includes("size")));

  const pending = services.securityRelease.validateUpload(admin, {
    fileName: "pending.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 1_000_000,
    scanStatus: "pending",
    source: "ticket"
  });
  assert.equal(pending.decision, "quarantined");
});

test("Sprint 14 public external publish checklist blocks until security gates pass", () => {
  const { services, admin, creator } = fixture();

  assert.throws(
    () => services.securityRelease.getReadinessOverview(creator),
    /Role creator cannot access this resource/
  );

  const blocked = services.securityRelease.evaluatePublicRelease(admin, {
    projectId: "prj_leave_management",
    exposure: "public",
    authReady: true,
    permissionsReady: true,
    domainApproved: true,
    tlsReady: false,
    dataClassification: "Confidential",
    auditReady: true
  });

  assert.equal(blocked.allowed, false);
  assert.ok(blocked.blockingReasons.some((reason) => reason.includes("TLS")));

  const allowed = services.securityRelease.evaluatePublicRelease(admin, {
    projectId: "prj_leave_management",
    exposure: "external",
    authReady: true,
    permissionsReady: true,
    domainApproved: true,
    tlsReady: true,
    dataClassification: "Internal",
    auditReady: true
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiredChecks.every((check) => check.status === "pass"), true);
});

test("Sprint 14 sensitive log redaction removes secrets prompts tickets and request payload values", () => {
  const { services, admin } = fixture();

  const evidence = services.securityRelease.redactSensitivePayload(admin, {
    classification: "Restricted",
    prompt: "Summarize payroll export for employee 123-45-6789 using sk-live-secret",
    ticketDescription: "Bug contains password hunter2 and card 4111 1111 1111 1111",
    requestPayload: {
      apiKey: "sk-live-secret",
      clientSecret: "oidc-secret",
      normalField: "leave request"
    }
  });

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("sk-live-secret"), false);
  assert.equal(serialized.includes("hunter2"), false);
  assert.equal(serialized.includes("4111 1111 1111 1111"), false);
  assert.equal(serialized.includes("123-45-6789"), false);
  assert.equal(evidence.redactedPayload.requestPayload.normalField, "leave request");
  assert.ok(evidence.redactionRulesApplied.includes("secret_key"));
  assert.ok(evidence.auditEventId.startsWith("aud_"));
});
