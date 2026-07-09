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

test("getCurrent is environment-aware: staging and production resolve to their own tier", () => {
  const store = createMemoryDeploymentStore();
  const staging = store.create(baseInput({ environment: "staging", commitSha: "s1", imageTag: "evcp-staging-app:s1" }));
  store.updateHealth(staging.id, "healthy");
  const prod = store.create(baseInput({ environment: "production", commitSha: "p1", imageTag: "evcp-production-app:p1" }));
  store.updateHealth(prod.id, "healthy");

  // defaults to production; explicit environment resolves the matching tier
  assert.equal(store.getCurrent("app").id, prod.id);
  assert.equal(store.getCurrent("app", "production").id, prod.id);
  assert.equal(store.getCurrent("app", "staging").id, staging.id);
});

test("getCurrent(slug, env) does not leak the other tier when only one is healthy", () => {
  const store = createMemoryDeploymentStore();
  const staging = store.create(baseInput({ environment: "staging", commitSha: "s1" }));
  store.updateHealth(staging.id, "healthy");
  // no production deployment yet
  assert.equal(store.getCurrent("app", "production"), null);
  assert.equal(store.getCurrent("app", "staging").id, staging.id);
});
