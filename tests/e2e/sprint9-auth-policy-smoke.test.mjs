import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

test("Sprint 9 API configures OIDC SAML Keycloak and direct IdP constraints", () => {
  const services = createPlatformApiServices();

  const keycloak = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/auth/keycloak-defaults",
    headers: adminHeaders
  });
  assert.equal(keycloak.status, 200);
  assert.equal(keycloak.body.data.strategy, "keycloak_broker_default");

  const oidc = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/providers/oidc",
    headers: adminHeaders,
    body: {
      name: "Azure AD Production",
      issuerUrl: "https://login.microsoftonline.com/company/v2.0",
      clientId: "evcp-platform",
      clientSecret: "super-secret-oidc",
      scopes: ["openid", "profile", "email"],
      groupRoleMapping: { "hr-creators": ["creator"] }
    }
  });
  assert.equal(oidc.status, 201);
  assert.equal(oidc.body.data.type, "oidc");
  assert.equal("clientSecret" in oidc.body.data, false);

  const saml = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/providers/saml",
    headers: adminHeaders,
    body: {
      name: "Okta Workforce",
      entityId: "http://www.okta.com/company",
      ssoUrl: "https://company.okta.com/app/sso/saml",
      certificate: "-----BEGIN CERTIFICATE-----demo-cert-----END CERTIFICATE-----",
      groupRoleMapping: { "IT Admins": ["admin"] }
    }
  });
  assert.equal(saml.status, 201);
  assert.ok(saml.body.data.certificateFingerprint.startsWith("fp_"));

  const direct = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/auth/direct-idp-constraints",
    headers: adminHeaders
  });
  assert.equal(direct.status, 200);
  assert.ok(direct.body.data.requiresSecurityReview);

  const creatorDenied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/providers/oidc",
    headers: creatorHeaders,
    body: {
      name: "Creator IdP",
      issuerUrl: "https://issuer.example",
      clientId: "bad",
      clientSecret: "bad",
      scopes: ["openid"],
      groupRoleMapping: {}
    }
  });
  assert.equal(creatorDenied.status, 403);
});

test("Sprint 9 API simulates Platform Auth login and generated app session validation", () => {
  const services = createPlatformApiServices();
  const provider = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/providers/oidc",
    headers: adminHeaders,
    body: {
      name: "Azure AD Production",
      issuerUrl: "https://login.microsoftonline.com/company/v2.0",
      clientId: "evcp-platform",
      clientSecret: "super-secret-oidc",
      scopes: ["openid", "profile", "email"],
      groupRoleMapping: { "hr-creators": ["creator"] }
    }
  });

  const login = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/simulate-login",
    headers: adminHeaders,
    body: {
      providerId: provider.body.data.id,
      subject: "oidc-user-001",
      email: "pilot.creator@company.com",
      name: "Pilot Creator",
      groups: ["hr-creators"],
      appRoles: { "leave-management": ["Employee"] }
    }
  });
  assert.equal(login.status, 201);
  assert.deepEqual(login.body.data.claims.platformRoles, ["creator"]);

  const valid = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/generated-app/validate-session",
    headers: adminHeaders,
    body: {
      token: login.body.data.token,
      appSlug: "leave-management",
      requiredRole: "Employee"
    }
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.allowed, true);

  const invalid = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/generated-app/validate-session",
    headers: adminHeaders,
    body: {
      token: "invalid-token",
      appSlug: "leave-management",
      requiredRole: "Employee"
    }
  });
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.data.allowed, false);
});

test("Sprint 9 API enforces break-glass reason and policy template evaluation", () => {
  const services = createPlatformApiServices();

  const missingReason = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/break-glass",
    headers: adminHeaders,
    body: {
      reason: "",
      ticketRef: "INC-1001"
    }
  });
  assert.equal(missingReason.status, 422);

  const breakGlass = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/break-glass",
    headers: adminHeaders,
    body: {
      reason: "Primary IdP outage during pilot",
      ticketRef: "INC-1001"
    }
  });
  assert.equal(breakGlass.status, 201);
  assert.equal(breakGlass.body.data.ttlMinutes, 15);

  const templates = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/policy-templates",
    headers: adminHeaders
  });
  assert.equal(templates.status, 200);
  assert.deepEqual(
    templates.body.data.map((template) => template.classification),
    ["public", "internal", "confidential", "restricted"]
  );

  const restricted = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/policy-templates/evaluate",
    headers: adminHeaders,
    body: {
      classification: "restricted",
      action: "publish_app"
    }
  });
  assert.equal(restricted.status, 200);
  assert.ok(restricted.body.data.requiredReviewers.includes("Security Admin"));
  assert.ok(restricted.body.data.requiredChecks.includes("break_glass_disabled"));
});

test("Sprint 9 Admin UI exposes auth SSO and policy hardening surfaces", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "Auth / SSO Production Readiness",
    "SSO Providers",
    "Role / Group Mapping",
    "Break-glass Admin",
    "Policy Templates",
    "Auth Session Evidence",
    "Keycloak Default",
    "Direct IdP Constraints"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }
});

