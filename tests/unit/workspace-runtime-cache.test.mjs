import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceRuntimeCache } from "../../apps/platform-api/src/workspace-orchestrator/runtime-cache.ts";

const running = {
  id: "ws-prj-cache",
  projectId: "prj_cache",
  slug: "current",
  resourceKey: "warm-current",
  state: "running",
  containerId: "container-current",
  cpuCores: 1,
  memoryMb: 2048,
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  lastActivityAt: "2026-09-05T00:00:00.000Z"
};

test("a recovery publication preserves another project's independent cache writes", () => {
  const cache = createWorkspaceRuntimeCache();
  const recovery = cache.capture("prj_cache");
  cache.set({ ...running, projectId: "prj_other", slug: "other" });
  assert.equal(recovery.publish(running), true);
  assert.equal(cache.records.get("prj_cache").slug, "current");
  assert.equal(cache.records.get("prj_other").slug, "other");
  recovery.release();
});

test("a cache write invalidates all older publications for that project", () => {
  const cache = createWorkspaceRuntimeCache();
  cache.set(running);
  const recovery = cache.capture("prj_cache");
  cache.set({ ...running, slug: "renamed", state: "idle" });
  assert.equal(recovery.publish(running), false);
  assert.equal(cache.records.get("prj_cache").slug, "renamed");
  assert.equal(cache.records.get("prj_cache").state, "idle");
  recovery.release();
});

for (const initiallyPresent of [false, true]) {
  test(`deleting an ${initiallyPresent ? "existing" : "absent"} runtime prevents stale recovery resurrection`, () => {
    const cache = createWorkspaceRuntimeCache();
    if (initiallyPresent) cache.set(running);
    const recovery = cache.capture("prj_cache");
    cache.delete("prj_cache");
    assert.equal(recovery.publish(running), false);
    assert.equal(cache.records.has("prj_cache"), false);
    recovery.release();
  });
}

test("overlapping recovery captures retain deletion history until every older attempt ends", () => {
  const cache = createWorkspaceRuntimeCache();
  const first = cache.capture("prj_cache");
  const second = cache.capture("prj_cache");
  cache.set(running);
  cache.delete("prj_cache");
  first.release();
  first.release();
  assert.equal(second.publish(running), false);
  assert.equal(cache.records.has("prj_cache"), false);
  second.release();

  const successor = cache.capture("prj_cache");
  assert.equal(successor.publish({ ...running, slug: "successor" }), true);
  assert.equal(first.publish(running), false);
  assert.equal(second.publish(running), false);
  assert.equal(cache.records.get("prj_cache").slug, "successor");
  successor.release();
});

test("successful recovery publication invalidates competing snapshots and cannot be repeated", () => {
  const cache = createWorkspaceRuntimeCache();
  const first = cache.capture("prj_cache");
  const second = cache.capture("prj_cache");
  assert.equal(first.publish(running), true);
  assert.equal(second.publish({ ...running, slug: "stale" }), false);
  assert.equal(first.publish({ ...running, slug: "repeated" }), false);
  assert.equal(cache.records.get("prj_cache").slug, "current");
  first.release();
  second.release();
});

test("a released or differently scoped recovery cannot publish", () => {
  const cache = createWorkspaceRuntimeCache();
  const recovery = cache.capture("prj_cache");
  assert.equal(recovery.publish({ ...running, projectId: "prj_other" }), false);
  recovery.release();
  assert.equal(recovery.publish(running), false);
  assert.equal(cache.records.size, 0);
});
