import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

test("platform API health and auth/me return shared success envelopes", async () => {
  const services = createPlatformApiServices();
  const health = executePlatformApiRequest(services, { method: "GET", path: "/health" });
  const healthJson = health.body;

  assert.equal(health.status, 200);
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.data.service, "platform-api");

  const me = executePlatformApiRequest(services, {
    method: "GET",
    path: "/auth/me",
    headers: { "x-mock-user-email": "admin@company.com" }
  });
  const meJson = me.body;

  assert.equal(me.status, 200);
  assert.equal(meJson.ok, true);
  assert.equal(meJson.data.user.email, "admin@company.com");
  assert.ok(meJson.data.permissions.includes("platform:admin"));
});

test("platform API rejects missing mock auth and audits project creation", async () => {
  const services = createPlatformApiServices();
  const denied = executePlatformApiRequest(services, { method: "GET", path: "/auth/me" });
  const deniedJson = denied.body;

  assert.equal(denied.status, 401);
  assert.equal(deniedJson.ok, false);
  assert.equal(deniedJson.error.code, "UNAUTHORIZED");

  const created = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { name: "Leave Management", slug: "leave-management-sprint-1" }
  });
  const createdJson = created.body;

  assert.equal(created.status, 201);
  assert.equal(createdJson.ok, true);
  assert.equal(createdJson.data.slug, "leave-management-sprint-1");

  const audit = executePlatformApiRequest(services, {
    method: "GET",
    path: "/audit-logs",
    headers: { "x-mock-user-email": "admin@company.com" }
  });
  const auditJson = audit.body;

  assert.equal(audit.status, 200);
  assert.ok(auditJson.data.some((event) => event.action === "project.created"));
});
