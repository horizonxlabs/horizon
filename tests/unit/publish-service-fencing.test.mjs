import assert from "node:assert/strict";
import test from "node:test";

import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import {
  createMemoryProjectLifecycleStore,
  createProjectLifecycleCoordinator
} from "../../apps/platform-api/src/project-lifecycle.ts";
import { buildPublishServiceDeps } from "./publish-service-test-helpers.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a publish that loses its fence during Docker create removes the candidate and cannot start or persist", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const publisher = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const deleter = createProjectLifecycleCoordinator({ store, deletionLeaseMs: 100 });
  const deps = buildPublishServiceDeps();
  deps.lifecycle = publisher;
  const originalCreate = deps.docker.createContainer.bind(deps.docker);
  const createStarted = deferred();
  const resumeCreate = deferred();
  const started = [];
  const originalStart = deps.docker.startContainer.bind(deps.docker);
  deps.docker.createContainer = async (spec) => {
    const created = await originalCreate(spec);
    createStarted.resolve();
    await resumeCreate.promise;
    return created;
  };
  deps.docker.startContainer = async (id) => { started.push(id); return originalStart(id); };

  const publish = createPublishService(deps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await createStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await deleter.runDeletion("p1", async () => undefined);
  resumeCreate.resolve();

  await assert.rejects(publish, /being deleted/);
  assert.deepEqual(started, []);
  assert.deepEqual(deps.deployments.list("p1"), []);
  assert.equal(
    deps.docker.state.containers.some((item) => item.spec.name?.startsWith("evcp-production-app-")),
    false
  );
});

test("a publish that loses ownership during deployment flush compensates the persisted candidate", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const deps = buildPublishServiceDeps();
  deps.lifecycle = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const flushStarted = deferred();
  const resumeFlush = deferred();
  let flushes = 0;
  deps.deployments.flush = async () => {
    flushes += 1;
    if (flushes === 1) { flushStarted.resolve(); await resumeFlush.promise; }
  };

  const publish = createPublishService(deps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await flushStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("p1", async () => undefined);
  resumeFlush.resolve();

  await assert.rejects(publish, /being deleted/);
  assert.deepEqual(deps.deployments.list("p1"), []);
  assert.equal(flushes, 2, "the lost owner durably compensates its flushed candidate");
  assert.equal(
    deps.docker.state.containers.some((item) => item.spec.name?.startsWith("evcp-production-app-")),
    false
  );
});
