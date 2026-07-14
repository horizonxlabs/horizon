import { readFileSync } from "node:fs";
import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

// This legacy bootstrap fixture intentionally exercises mock identities; production defaults deny them.
process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

test("frontend bootstrap API routes return current user projects and store apps", () => {
  const services = createPlatformApiServices();
  const admin = executePlatformApiRequest(services, {
    method: "GET",
    path: "/auth/me",
    headers: adminHeaders
  });
  const projects = executePlatformApiRequest(services, {
    method: "GET",
    path: "/projects",
    headers: creatorHeaders
  });
  const store = executePlatformApiRequest(services, {
    method: "GET",
    path: "/store/apps",
    headers: endUserHeaders
  });

  assert.equal(admin.status, 200);
  assert.equal(admin.body.data.user.email, "admin@company.com");
  assert.equal(projects.status, 200);
  assert.ok(projects.body.data.some((project) => project.name === "Leave Management"));
  assert.equal(store.status, 200);
  assert.ok(Array.isArray(store.body.data.myApps));
  assert.equal(store.body.data.profile.email, "user@company.com");
});

test("frontend source exposes API bootstrap state without direct mock-data imports", () => {
  const adminSource = readAllSourceFiles("apps/admin-web/src");
  const creatorSource = readAllSourceFiles("apps/creator-web/src");
  const storeSource = readAllSourceFiles("apps/app-store-pwa/src");

  assert.match(adminSource, /createAdminPlatformClient/);
  assert.match(adminSource, /getSetupStatus/);
  assert.match(adminSource, /Logout/);
  assert.doesNotMatch(adminSource, /Refresh Session/);
  assert.match(creatorSource, /source: "Platform API"/);
  assert.match(storeSource, /loadStoreBootstrap/);
  assert.doesNotMatch(`${adminSource}\n${creatorSource}\n${storeSource}`, /@evcp\/mock-data/);
});

test("frontend session bridge can issue a bearer token accepted by bootstrap auth", () => {
  const services = createPlatformApiServices();
  const login = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/simulate-login",
    headers: adminHeaders,
    body: {
      providerId: "authprov_keycloak_default_001",
      subject: "keycloak-creator-ui-bridge",
      email: "creator@company.com",
      name: "Creator User",
      groups: ["evcp-creators"],
      appRoles: { "leave-management": ["HR Admin"] }
    }
  });

  assert.equal(login.status, 201);
  assert.equal(login.body.data.token.startsWith("evcp_session."), true);

  const me = executePlatformApiRequest(services, {
    method: "GET",
    path: "/auth/me",
    headers: { authorization: `Bearer ${login.body.data.token}` }
  });

  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, "creator@company.com");
  assert.equal(me.body.data.auth.mode, "platform_session");
  assert.equal(me.body.data.auth.legacyMockFallback, false);
});

test("operational bootstrap guidance records the server-brokered Keycloak handoff", () => {
  const operationsGuide = readFileSync(
    "docs/operations/real-mvp-frontend-api-bootstrap.md",
    "utf8"
  );

  assert.match(operationsGuide, /Keycloak/);
  assert.match(operationsGuide, /server-brokered|authorization code|OIDC/i);
  assert.match(operationsGuide, /evcp_session|Platform session/i);
});
