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

  assert.equal(currentUser.email, "creator@company.com");
  assert.equal(currentUser.role, "creator");
  assert.throws(
    () => services.auth.resolveCurrentUser({ "x-mock-user-email": "missing@company.com" }),
    /Unknown mock user/
  );
  assert.throws(() => services.auth.resolveCurrentUser({}), /Missing x-mock-user-email/);
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
    name: "Leave Management",
    slug: "leave-management"
  });

  const events = services.audit.list();

  assert.equal(project.slug, "leave-management");
  assert.ok(events.some((event) => event.action === "auth.me"));
  assert.ok(events.some((event) => event.action === "project.created" && event.resourceId === project.id));
});
