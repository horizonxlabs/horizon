import assert from "node:assert/strict";
import test from "node:test";

const {
  createMemoryProjectLifecycleStore,
  createProjectLifecycleCoordinator,
  ProjectDeletionInProgressError
} = await import("../../apps/platform-api/src/project-lifecycle.ts");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a durable tombstone survives a coordinator restart and permits deletion retry", async () => {
  const store = createMemoryProjectLifecycleStore();
  const first = createProjectLifecycleCoordinator({ store });
  await assert.rejects(
    first.runDeletion("project-1", async () => { throw new Error("cleanup crashed"); }),
    /cleanup crashed/
  );
  const restarted = createProjectLifecycleCoordinator({ store });
  await assert.rejects(
    restarted.runChildMutation("project-1", async () => undefined),
    ProjectDeletionInProgressError
  );
  assert.equal(await restarted.runDeletion("project-1", async () => "retried"), "retried");
});

test("deletion waits for child mutations held by another coordinator", async () => {
  const store = createMemoryProjectLifecycleStore();
  const writer = createProjectLifecycleCoordinator({ store });
  const deleter = createProjectLifecycleCoordinator({ store });
  const writeStarted = deferred();
  const releaseWrite = deferred();
  const events = [];
  const write = writer.runChildMutation("project-1", async () => {
    events.push("write-started");
    writeStarted.resolve();
    await releaseWrite.promise;
    events.push("write-finished");
  });
  await writeStarted.promise;
  const deletion = deleter.runDeletion("project-1", async () => { events.push("cleanup"); });
  await Promise.resolve();
  assert.deepEqual(events, ["write-started"]);
  releaseWrite.resolve();
  await Promise.all([write, deletion]);
  assert.deepEqual(events, ["write-started", "write-finished", "cleanup"]);
});

test("concurrent deletion requests on separate coordinators share the durable outcome", async () => {
  const store = createMemoryProjectLifecycleStore();
  const first = createProjectLifecycleCoordinator({ store });
  const second = createProjectLifecycleCoordinator({ store });
  const cleanupStarted = deferred();
  const releaseCleanup = deferred();
  let cleanupCount = 0;
  const firstDeletion = first.runDeletion("project-1", async () => {
    cleanupCount += 1;
    cleanupStarted.resolve();
    await releaseCleanup.promise;
    return { id: "project-1", deleted: true };
  });
  await cleanupStarted.promise;
  const concurrent = second.runDeletion("project-1", async () => {
    cleanupCount += 1;
    return { id: "project-1", deleted: true };
  });
  releaseCleanup.resolve();
  assert.deepEqual(await firstDeletion, { id: "project-1", deleted: true });
  assert.deepEqual(await concurrent, { id: "project-1", deleted: true });
  assert.equal(cleanupCount, 1);
});

test("an expired deletion lease is recovered after a coordinator crash", async () => {
  let currentTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => currentTime });
  const operation = deferred();
  const started = deferred();
  const crashed = createProjectLifecycleCoordinator({ store, deletionLeaseMs: 1_000 });
  const abandoned = crashed.runDeletion("project-1", () => {
    started.resolve();
    return operation.promise;
  });
  await started.promise;
  currentTime = new Date("2026-08-25T00:00:02.000Z");
  const recovered = createProjectLifecycleCoordinator({ store, deletionLeaseMs: 1_000 });
  assert.equal(await recovered.runDeletion("project-1", async () => "recovered"), "recovered");
  operation.resolve("stale");
  await assert.rejects(abandoned, ProjectDeletionInProgressError);
});

test("a stale deletion owner cannot clean or complete after a newer epoch takes over", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const paused = deferred();
  const resume = deferred();
  const events = [];
  const first = createProjectLifecycleCoordinator({ store, deletionLeaseMs: 100 });
  const stale = first.runDeletion("project-1", async (fence) => {
    paused.resolve();
    await resume.promise;
    await fence.assertCurrent();
    events.push("stale-cleanup");
  });
  await paused.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  const recovered = createProjectLifecycleCoordinator({ store, deletionLeaseMs: 100 });
  await recovered.runDeletion("project-1", async (fence) => {
    await fence.assertCurrent();
    events.push("recovered-cleanup");
  });
  resume.resolve();
  await assert.rejects(stale, ProjectDeletionInProgressError);
  assert.deepEqual(events, ["recovered-cleanup"]);
});

test("a draining store failure abandons ownership and stops the deletion heartbeat", async () => {
  const delegate = createMemoryProjectLifecycleStore();
  let renewals = 0;
  let abandons = 0;
  const store = {
    ...delegate,
    async renewDeletionLease(...args) {
      renewals += 1;
      return delegate.renewDeletionLease(...args);
    },
    async getMutationDrainDelay() { throw new Error("lease store unavailable"); },
    async abandonDeletion(...args) {
      abandons += 1;
      return delegate.abandonDeletion(...args);
    }
  };
  const lifecycle = createProjectLifecycleCoordinator({
    store,
    deletionLeaseMs: 15,
    pollIntervalMs: 1
  });
  await assert.rejects(
    lifecycle.runDeletion("project-1", async () => undefined),
    /lease store unavailable/
  );
  const renewalsAtFailure = renewals;
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(abandons, 1);
  assert.equal(renewals, renewalsAtFailure);
});

test("database lease time ignores opposite API host clock skew", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const writer = createProjectLifecycleCoordinator({
    store,
    now: () => new Date("2000-01-01T00:00:00.000Z")
  });
  const deleter = createProjectLifecycleCoordinator({
    store,
    now: () => new Date("2099-01-01T00:00:00.000Z"),
    sleep: async () => undefined
  });
  const started = deferred();
  const release = deferred();
  const events = [];
  const write = writer.runChildMutation("project-1", async () => {
    events.push("write");
    started.resolve();
    await release.promise;
  });
  await started.promise;
  const deletion = deleter.runDeletion("project-1", async () => events.push("cleanup"));
  await Promise.resolve();
  assert.deepEqual(events, ["write"]);
  release.resolve();
  await write;
  databaseTime = new Date("2026-08-25T00:00:00.001Z");
  await deletion;
  assert.deepEqual(events, ["write", "cleanup"]);
});

test("an expired child-write epoch cannot commit after deletion takes over", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const child = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const paused = deferred();
  const resume = deferred();
  let committed = false;
  const staleWrite = child.runChildMutation("project-1", async (fence) => {
    paused.resolve();
    await resume.promise;
    await fence.assertCurrent();
    committed = true;
  });
  await paused.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion(
    "project-1",
    async (fence) => fence.assertCurrent()
  );
  resume.resolve();
  await assert.rejects(staleWrite, ProjectDeletionInProgressError);
  assert.equal(committed, false);
});
