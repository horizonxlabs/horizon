import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

function baseInput(overrides = {}) {
  return {
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "sha1", imageTag: "evcp-prod-app:sha1", containerId: "c1",
    publishedByUserId: "u1", ...overrides
  };
}

test("create starts pending; updateHealth transitions it", () => {
  const store = createMemoryDeploymentStore();
  const dep = store.create(baseInput());
  assert.equal(dep.healthStatus, "pending");
  const updated = store.updateHealth(dep.id, "healthy");
  assert.equal(updated.healthStatus, "healthy");
  assert.equal(store.list("p1")[0].healthStatus, "healthy");
});

test("list returns newest first", () => {
  const store = createMemoryDeploymentStore();
  const d1 = store.create(baseInput({ commitSha: "sha1" }));
  const d2 = store.create(baseInput({ commitSha: "sha2" }));
  const list = store.list("p1");
  assert.deepEqual(list.map((d) => d.id), [d2.id, d1.id]);
});

test("getCurrent returns the latest HEALTHY deployment for a slug (ignores pending/failed)", () => {
  const store = createMemoryDeploymentStore();
  const d1 = store.create(baseInput({ commitSha: "sha1" }));
  store.updateHealth(d1.id, "healthy");
  const d2 = store.create(baseInput({ commitSha: "sha2" }));
  store.updateHealth(d2.id, "failed");
  const current = store.getCurrent("app");
  assert.equal(current.id, d1.id, "failed newer deployment must not become current");
});
