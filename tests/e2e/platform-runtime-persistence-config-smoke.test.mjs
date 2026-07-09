import assert from "node:assert/strict";
import { test } from "node:test";

const { createRuntimePlatformApiServices, executePlatformApiRequestAsync } = await import(
  "../../apps/platform-api/src/app-factory.ts"
);

test("runtime memory persistence mode serves core API flow through startup services", async () => {
  const services = await createRuntimePlatformApiServices({ EVCP_CORE_PERSISTENCE: "memory" });

  const me = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/auth/me",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { name: "Runtime Startup Project" }
  });
  const listed = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  const audit = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { projectId: created.body.data.id }
  });

  assert.equal(me.body.data.user.email, "creator@company.com");
  assert.match(created.body.data.id, /^prj_[0-9a-f]{32}$/);
  assert.deepEqual(
    listed.body.data.map((project) => project.name),
    ["Runtime Startup Project"]
  );
  assert.equal(audit.body.data.length, 1);
  assert.equal(audit.body.data[0].action, "project.created");
});
