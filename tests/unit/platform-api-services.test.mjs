import test from "node:test";
import assert from "node:assert/strict";

const servicesModule = await import("../../apps/platform-api/src/platform-services.ts");

test("platform API seeds admin creator and end user with permissions", () => {
  const services = servicesModule.createPlatformApiServices();

  const admin = services.identity.getUserByEmail("admin@company.com");
  const creator = services.identity.getUserByEmail("creator@company.com");
  const endUser = services.identity.getUserByEmail("user@company.com");

  assert.equal(admin.role, "admin");
  assert.equal(creator.role, "creator");
  assert.equal(endUser.role, "end_user");
  assert.ok(admin.permissions.includes("platform:admin"));
  assert.ok(creator.permissions.includes("project:create"));
  assert.ok(endUser.permissions.includes("store:view"));
});

test("platform API resolves mock auth headers and rejects unknown users", () => {
  const services = servicesModule.createPlatformApiServices();

  const currentUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const resolution = services.auth.resolve({ "x-mock-user-email": "creator@company.com" });

  assert.equal(currentUser.email, "creator@company.com");
  assert.equal(currentUser.role, "creator");
  assert.equal(resolution.mode, "mock_header");
  assert.throws(
    () => services.auth.resolveCurrentUser({ "x-mock-user-email": "missing@company.com" }),
    /Unknown mock user/
  );
  assert.throws(() => services.auth.resolveCurrentUser({}), /Missing Authorization Bearer token/);
});

test("platform API issues and verifies signed platform session bearer tokens", () => {
  const services = servicesModule.createPlatformApiServices();
  const creator = services.identity.getUserByEmail("creator@company.com");
  const issued = services.auth.issuePlatformSession(creator, { sessionId: "psess_unit_001" });

  const resolved = services.auth.resolve({ Authorization: `Bearer ${issued.token}` });

  assert.equal(issued.token.startsWith("evcp_session."), true);
  assert.equal(resolved.mode, "platform_session");
  assert.equal(resolved.user.email, "creator@company.com");
  assert.equal(resolved.sessionId, "psess_unit_001");
  assert.equal(resolved.expiresAt, issued.expiresAt);
});

test("platform API denies tampered and expired platform session bearer tokens", () => {
  const services = servicesModule.createPlatformApiServices();
  const creator = services.identity.getUserByEmail("creator@company.com");
  const issued = services.auth.issuePlatformSession(creator, { sessionId: "psess_unit_002" });
  const tampered = `${issued.token.slice(0, -1)}x`;
  const expired = services.auth.issuePlatformSession(creator, {
    sessionId: "psess_unit_003",
    issuedAt: new Date(Date.now() - 120_000),
    ttlSeconds: 1
  });

  assert.throws(() => services.auth.resolve({ authorization: `Bearer ${tampered}` }), /signature/);
  assert.throws(() => services.auth.resolve({ authorization: `Bearer ${expired.token}` }), /Expired platform session token/);
});

test("platform API records audit events for auth and project actions", () => {
  const services = servicesModule.createPlatformApiServices();
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });

  services.audit.record({
    actorId: actor.id,
    action: "auth.me",
    resourceType: "platform_user",
    resourceId: actor.id
  });
  const project = services.projects.createProject({
    actor,
    name: "Leave Management"
  });

  const events = services.audit.list();

  assert.match(project.id, /^prj_[0-9a-f]{32}$/);
  assert.ok(events.some((event) => event.action === "auth.me"));
  assert.ok(events.some((event) => event.action === "project.created" && event.resourceId === project.id));
});
