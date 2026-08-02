import test from "node:test";
import assert from "node:assert/strict";
import { createSystemUpdateService } from "../../apps/platform-api/src/system/system-update-service.ts";

function fakeEngine() {
  const updates = [];
  return {
    updates,
    async listStackServices() {
      return [
        { id: "1", name: "evcp_platform-api", image: "repo/evcp-platform-api:v1" },
        { id: "2", name: "evcp_admin-web", image: "repo/evcp-admin-web:v1" },
        { id: "3", name: "evcp_postgres", image: "postgres:16-alpine" }
      ];
    },
    async updateServiceImage(name, image) { updates.push({ name, image }); }
  };
}

test("getSystemVersion returns EVCP_VERSION + only the app services", async () => {
  const svc = createSystemUpdateService({ engine: fakeEngine(), env: { EVCP_VERSION: "v1", EVCP_IMAGE_REPOSITORY: "repo" } });
  const v = await svc.getSystemVersion();
  assert.equal(v.currentVersion, "v1");
  assert.deepEqual(v.appServices.map((s) => s.name).sort(), ["evcp_admin-web", "evcp_platform-api"]);
  assert.equal(v.appServices.find((s) => s.name === "evcp_admin-web").tag, "v1");
});

test("updateToVersion rejects a bad tag", async () => {
  const svc = createSystemUpdateService({ engine: fakeEngine(), env: { EVCP_IMAGE_REPOSITORY: "repo" } });
  await assert.rejects(() => svc.updateToVersion("bad tag!"), /invalid/i);
});

test("updateToVersion bumps every app service and does platform-api LAST", async () => {
  const engine = fakeEngine();
  const svc = createSystemUpdateService({ engine, env: { EVCP_IMAGE_REPOSITORY: "repo" } });
  const r = await svc.updateToVersion("v2");
  assert.deepEqual(r, { accepted: true, targetVersion: "v2" });
  // platform-api is fire-and-forget; give the microtask a tick
  await new Promise((res) => setTimeout(res, 10));
  const names = engine.updates.map((u) => u.name);
  assert.ok(!names.slice(0, -1).includes("evcp_platform-api"), "platform-api must not be updated before the others");
  assert.equal(names[names.length - 1], "evcp_platform-api");
  assert.ok(engine.updates.every((u) => u.image.endsWith(":v2")));
  assert.ok(engine.updates.some((u) => u.image === "repo/evcp-workspace-next:v2"));
});
