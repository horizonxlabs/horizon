import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequestAsync } = await import("../../apps/platform-api/src/app-factory.ts");

const CREATOR = { "x-mock-user-email": "creator@company.com" };

test("creator provisions a container and reads status with names-only secrets", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser(CREATOR);
  const projectId = services.projects.listProjects(creator)[0].id; // prj_leave_management

  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${projectId}/workspace/container`,
    headers: CREATOR,
    body: { slug: "leave-tracker" }
  });
  assert.equal(created.status, 201);

  const status = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: `/projects/${projectId}/workspace/container`,
    headers: CREATOR
  });
  assert.equal(status.status, 200);
  const body = JSON.stringify(status.body);
  assert.ok(body.includes("DATABASE_URL"), "secret names present");
  assert.ok(!body.includes("postgresql://"), "no secret values leak");
});

test("stop then wake transitions the container", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser(CREATOR);
  const projectId = services.projects.listProjects(creator)[0].id;
  await executePlatformApiRequestAsync(services, { method: "POST", path: `/projects/${projectId}/workspace/container`, headers: CREATOR, body: { slug: "leave-tracker" } });
  const stopped = await executePlatformApiRequestAsync(services, { method: "POST", path: `/projects/${projectId}/workspace/container/stop`, headers: CREATOR });
  assert.equal(stopped.status, 200);
  const woken = await executePlatformApiRequestAsync(services, { method: "POST", path: `/projects/${projectId}/workspace/container/wake`, headers: CREATOR });
  assert.equal(woken.status, 200);
});

test("missing auth returns 401, not a crash", async () => {
  const services = createPlatformApiServices();
  const res = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects/prj_leave_management/workspace/container",
    headers: {},
    body: { slug: "leave-tracker" }
  });
  assert.equal(res.status, 401);
});

test("non-member is forbidden", async () => {
  const services = createPlatformApiServices();
  const res = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/prj_not_owned_by_creator/workspace/container`,
    headers: CREATOR,
    body: { slug: "x-y-z" }
  });
  assert.equal(res.status, 403);
});
