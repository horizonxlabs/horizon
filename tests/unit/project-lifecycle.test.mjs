import assert from "node:assert/strict";
import test from "node:test";

const { createProjectLifecycleCoordinator, ProjectDeletionInProgressError } =
  await import("../../apps/platform-api/src/project-lifecycle.ts");
const { deletePersistedProject } = await import("../../apps/platform-api/src/project-deletion.ts");
const { initializePersistentProjectFile } =
  await import("../../apps/platform-api/src/persistence/persistent-project-files-route.ts");
const { createPublishService } =
  await import("../../apps/platform-api/src/publish/publish-service.ts");

const actor = { id: "creator-1", role: "creator" };
const project = { id: "project-1" };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("deletion drains an interleaved child write and rejects every later write", async () => {
  const lifecycle = createProjectLifecycleCoordinator();
  const writeStarted = deferred();
  const releaseWrite = deferred();
  const events = [];
  const write = lifecycle.runChildMutation("project-1", async () => {
    events.push("write-started");
    writeStarted.resolve();
    await releaseWrite.promise;
    events.push("write-finished");
  });
  await writeStarted.promise;
  const deletion = lifecycle.runDeletion("project-1", async () => {
    events.push("cleanup");
    return { deleted: true };
  });
  await assert.rejects(
    lifecycle.runChildMutation("project-1", async () => events.push("late-write")),
    ProjectDeletionInProgressError
  );
  assert.deepEqual(events, ["write-started"]);
  releaseWrite.resolve();
  await Promise.all([write, deletion]);
  assert.deepEqual(events, ["write-started", "write-finished", "cleanup"]);
});

test("concurrent deletion shares one cleanup and a failed deletion remains retryable", async () => {
  const lifecycle = createProjectLifecycleCoordinator();
  let attempts = 0;
  const persistence = {
    async listProjects() { return [project]; },
    async deleteProject() {},
    async recordAudit() {}
  };
  const input = {
    actor,
    encodedProjectId: "project-1",
    persistence,
    lifecycle,
    cleanup: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("cleanup unavailable");
    }
  };
  const first = deletePersistedProject(input);
  const concurrent = deletePersistedProject(input);
  await assert.rejects(first, /cleanup unavailable/);
  await assert.rejects(concurrent, /cleanup unavailable/);
  assert.equal(attempts, 1);
  assert.deepEqual(await deletePersistedProject(input), { id: "project-1", deleted: true });
  assert.equal(attempts, 2);
});

test("an unauthorized deletion attempt cannot tombstone the project", async () => {
  const lifecycle = createProjectLifecycleCoordinator();
  await assert.rejects(
    deletePersistedProject({
      actor,
      encodedProjectId: "project-1",
      lifecycle,
      persistence: { async listProjects() { return []; } },
      async cleanup() { throw new Error("must not clean"); }
    }),
    /cannot delete project/
  );
  let wrote = false;
  await lifecycle.runChildMutation("project-1", async () => { wrote = true; });
  assert.equal(wrote, true);
});

test("file initialization is rejected after deletion starts", async () => {
  const lifecycle = createProjectLifecycleCoordinator();
  const releaseDeletion = deferred();
  const deletion = lifecycle.runDeletion("project-1", () => releaseDeletion.promise);
  await assert.rejects(
    initializePersistentProjectFile({
      lifecycle,
      repository: { async create() { throw new Error("must not create"); } },
      issuer: { async issue() { throw new Error("must not issue"); } },
      actorId: "creator-1",
      projectId: "project-1",
      fileName: "requirements.md",
      mimeType: "text/markdown",
      sizeBytes: 42,
      sha256: "a".repeat(64)
    }),
    ProjectDeletionInProgressError
  );
  releaseDeletion.resolve();
  await deletion;
});

test("deployment creation is rejected after deletion starts", async () => {
  const lifecycle = createProjectLifecycleCoordinator();
  const releaseDeletion = deferred();
  const deletion = lifecycle.runDeletion("project-1", () => releaseDeletion.promise);
  const service = createPublishService({
    lifecycle,
    docker: {}, git: {}, migrations: {}, deployments: {}, health: {},
    async resolveEnv() { return {}; },
    async getDevContainerId() { throw new Error("must not provision"); }
  });
  await assert.rejects(
    service.publish({
      projectId: "project-1",
      slug: "project-1",
      environment: "production",
      publishedByUserId: "creator-1"
    }),
    ProjectDeletionInProgressError
  );
  releaseDeletion.resolve();
  await deletion;
});
