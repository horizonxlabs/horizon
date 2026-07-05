import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint9Fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const endUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "user@company.com" });

  return { services, admin, creator, endUser };
}

test("Admin configures OIDC provider without exposing client secret", () => {
  const { services, admin, creator } = createSprint9Fixture();

  const provider = services.authSso.createOidcProvider(admin, {
    name: "Azure AD Production",
    issuerUrl: "https://login.microsoftonline.com/company/v2.0",
    clientId: "evcp-platform",
    clientSecret: "super-secret-oidc",
    scopes: ["openid", "profile", "email"],
    groupRoleMapping: {
      "evcp-admins": ["admin"],
      "evcp-creators": ["creator"]
    }
  });

  assert.equal(provider.type, "oidc");
  assert.equal(provider.status, "ready");
  assert.equal(provider.clientSecretMasked, "************oidc");
  assert.ok(provider.clientSecretFingerprint.startsWith("fp_"));
  assert.equal("clientSecret" in provider, false);
  assert.ok(services.audit.list().some((event) => event.action === "auth.oidc_provider.created" && event.resourceId === provider.id));

  assert.throws(
    () =>
      services.authSso.createOidcProvider(creator, {
        name: "Creator-owned IdP",
        issuerUrl: "https://issuer.example",
        clientId: "bad",
        clientSecret: "bad-secret",
        scopes: ["openid"],
        groupRoleMapping: {}
      }),
    /cannot access/
  );
});

test("Admin configures SAML provider with certificate fingerprint and mapping rules", () => {
  const { services, admin } = createSprint9Fixture();

  const provider = services.authSso.createSamlProvider(admin, {
    name: "Okta Workforce",
    entityId: "http://www.okta.com/company",
    ssoUrl: "https://company.okta.com/app/sso/saml",
    certificate: "-----BEGIN CERTIFICATE-----demo-cert-----END CERTIFICATE-----",
    groupRoleMapping: {
      "IT Admins": ["admin"],
      "HR Creators": ["creator"]
    }
  });

  assert.equal(provider.type, "saml");
  assert.equal(provider.status, "ready");
  assert.ok(provider.certificateFingerprint.startsWith("fp_"));
  assert.equal("certificate" in provider, false);
  assert.ok(provider.groupRoleMapping["IT Admins"].includes("admin"));
  assert.ok(services.audit.list().some((event) => event.action === "auth.saml_provider.created" && event.resourceId === provider.id));
});

test("Keycloak defaults and direct IdP constraints are explicit production auth strategy inputs", () => {
  const { services, admin } = createSprint9Fixture();

  const defaults = services.authSso.getKeycloakDefaults(admin);
  const constraints = services.authSso.getDirectIdpConstraints(admin);
  const keycloakSession = services.authSso.simulateLogin(admin, {
    providerId: "authprov_keycloak_default_001",
    subject: "keycloak-admin-001",
    email: "keycloak.admin@company.com",
    name: "Keycloak Admin",
    groups: ["evcp-admins"],
    appRoles: { "leave-management": ["HR Admin"] }
  });

  assert.equal(defaults.strategy, "keycloak_broker_default");
  assert.equal(defaults.realm, "evcp");
  assert.ok(defaults.clients.some((client) => client.clientId === "evcp-platform-api"));
  assert.ok(defaults.clients.some((client) => client.clientId === "evcp-generated-app"));
  assert.equal(keycloakSession.providerType, "keycloak");
  assert.deepEqual(keycloakSession.claims.platformRoles, ["admin"]);
  assert.ok(constraints.allowed);
  assert.ok(constraints.requiresSecurityReview);
  assert.match(constraints.boundary, /Platform Auth/);
});

test("Simulated OIDC and SAML login normalize claims into Platform Auth sessions", () => {
  const { services, admin } = createSprint9Fixture();
  const oidc = services.authSso.createOidcProvider(admin, {
    name: "Azure AD Production",
    issuerUrl: "https://login.microsoftonline.com/company/v2.0",
    clientId: "evcp-platform",
    clientSecret: "super-secret-oidc",
    scopes: ["openid", "profile", "email"],
    groupRoleMapping: { "evcp-admins": ["admin"], "hr-creators": ["creator"] }
  });
  const saml = services.authSso.createSamlProvider(admin, {
    name: "Okta Workforce",
    entityId: "http://www.okta.com/company",
    ssoUrl: "https://company.okta.com/app/sso/saml",
    certificate: "-----BEGIN CERTIFICATE-----demo-cert-----END CERTIFICATE-----",
    groupRoleMapping: { "IT Admins": ["admin"] }
  });

  const oidcSession = services.authSso.simulateLogin(admin, {
    providerId: oidc.id,
    subject: "oidc-user-001",
    email: "pilot.creator@company.com",
    name: "Pilot Creator",
    groups: ["hr-creators"],
    appRoles: { "leave-management": ["Employee", "Manager"] }
  });
  const samlSession = services.authSso.simulateLogin(admin, {
    providerId: saml.id,
    subject: "saml-admin-001",
    email: "saml.admin@company.com",
    name: "SAML Admin",
    groups: ["IT Admins"],
    appRoles: { "leave-management": ["HR Admin"] }
  });

  assert.equal(oidcSession.providerType, "oidc");
  assert.deepEqual(oidcSession.claims.platformRoles, ["creator"]);
  assert.deepEqual(oidcSession.claims.appRoles["leave-management"], ["Employee", "Manager"]);
  assert.ok(oidcSession.token.startsWith("evcp_session."));
  assert.equal(services.auth.resolve({ authorization: `Bearer ${oidcSession.token}` }).sessionId, oidcSession.id);
  assert.equal(samlSession.providerType, "saml");
  assert.deepEqual(samlSession.claims.platformRoles, ["admin"]);
  assert.ok(samlSession.token.startsWith("evcp_session."));
  assert.ok(services.audit.list().some((event) => event.action === "auth.sso_login.succeeded" && event.resourceId === oidcSession.id));
});

test("Generated app auth contract validates platform sessions and denies invalid tokens", () => {
  const { services, admin } = createSprint9Fixture();
  const provider = services.authSso.createOidcProvider(admin, {
    name: "Azure AD Production",
    issuerUrl: "https://login.microsoftonline.com/company/v2.0",
    clientId: "evcp-platform",
    clientSecret: "super-secret-oidc",
    scopes: ["openid", "profile", "email"],
    groupRoleMapping: { "hr-creators": ["creator"] }
  });
  const session = services.authSso.simulateLogin(admin, {
    providerId: provider.id,
    subject: "oidc-user-001",
    email: "pilot.creator@company.com",
    name: "Pilot Creator",
    groups: ["hr-creators"],
    appRoles: { "leave-management": ["Employee"] }
  });

  const valid = services.authSso.validateGeneratedAppSession(session.token, {
    appSlug: "leave-management",
    requiredRole: "Employee"
  });
  const denied = services.authSso.validateGeneratedAppSession("invalid-token", {
    appSlug: "leave-management",
    requiredRole: "Employee"
  });

  assert.equal(valid.allowed, true);
  assert.equal(valid.claims.email, "pilot.creator@company.com");
  assert.deepEqual(valid.claims.appRoles["leave-management"], ["Employee"]);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "invalid_session");
});

test("Break-glass admin requires reason and emits critical audit with limited session", () => {
  const { services, admin } = createSprint9Fixture();

  assert.throws(
    () =>
      services.breakGlass.login(admin, {
        reason: "",
        ticketRef: "INC-1001"
      }),
    /reason is required/
  );

  const session = services.breakGlass.login(admin, {
    reason: "Primary IdP outage during pilot",
    ticketRef: "INC-1001"
  });

  assert.equal(session.userId, admin.id);
  assert.equal(session.ttlMinutes, 15);
  assert.ok(session.token.startsWith("breakglass_"));
  assert.ok(
    services.audit
      .list()
      .some((event) => event.action === "auth.break_glass_used" && event.resourceId === session.id && event.severity === "critical")
  );
});

test("Policy templates evaluate public internal confidential and restricted classifications", () => {
  const { services, admin } = createSprint9Fixture();

  const templates = services.policyTemplates.listTemplates(admin);
  const publicPolicy = services.policyTemplates.evaluate(admin, { classification: "public", action: "publish_app" });
  const internalPolicy = services.policyTemplates.evaluate(admin, { classification: "internal", action: "publish_app" });
  const confidentialPolicy = services.policyTemplates.evaluate(admin, { classification: "confidential", action: "publish_app" });
  const restrictedPolicy = services.policyTemplates.evaluate(admin, { classification: "restricted", action: "publish_app" });

  assert.deepEqual(
    templates.map((template) => template.classification),
    ["public", "internal", "confidential", "restricted"]
  );
  assert.equal(publicPolicy.requiredReviewers.length, 0);
  assert.ok(internalPolicy.requiredChecks.includes("auth_session_required"));
  assert.ok(confidentialPolicy.requiredReviewers.includes("Security Admin"));
  assert.ok(restrictedPolicy.requiredReviewers.includes("Security Admin"));
  assert.ok(restrictedPolicy.requiredReviewers.includes("Platform Admin"));
  assert.ok(restrictedPolicy.requiredChecks.includes("break_glass_disabled"));
});
