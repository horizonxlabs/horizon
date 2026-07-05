import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

test("frontend bootstrap API routes return current user projects and store apps", () => {
  const services = createPlatformApiServices();
  const admin = executePlatformApiRequest(services, { method: "GET", path: "/auth/me", headers: adminHeaders });
  const projects = executePlatformApiRequest(services, { method: "GET", path: "/projects", headers: creatorHeaders });
  const store = executePlatformApiRequest(services, { method: "GET", path: "/store/apps", headers: endUserHeaders });

  assert.equal(admin.status, 200);
  assert.equal(admin.body.data.user.email, "admin@company.com");
  assert.equal(projects.status, 200);
  assert.ok(projects.body.data.some((project) => project.name === "Leave Management"));
  assert.equal(store.status, 200);
  assert.ok(Array.isArray(store.body.data.myApps));
  assert.equal(store.body.data.profile.email, "user@company.com");
});

test("frontend source exposes API bootstrap state without direct mock-data imports", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  const creatorSource = readFileSync("apps/creator-web/src/main.tsx", "utf8");
  const storeSource = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");

  assert.match(adminSource, /Session: \{bootstrap\.source\}/);
  assert.match(creatorSource, /Bootstrap: \{bootstrap\.source\}/);
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
