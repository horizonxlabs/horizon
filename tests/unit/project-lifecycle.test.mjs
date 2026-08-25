import assert from "node:assert/strict";
import test from "node:test";

const {
  createMemoryProjectLifecycleStore,
  createProjectLifecycleCoordinator,
  ProjectDeletionInProgressError
} =
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
  const promise = new Promise((done) => {
    resolve = done;
  });
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
    async listProjects() {
      return [project];
    },
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
      persistence: {
        async listProjects() {
          return [];
        }
      },
      async cleanup() {
        throw new Error("must not clean");
      }
    }),
    /cannot delete project/
  );

  let wrote = false;
  await lifecycle.runChildMutation("project-1", async () => {
    wrote = true;
  });
  assert.equal(wrote, true);
});

test("file initialization is rejected after deletion starts", async () => {
  const lifecycle = createProjectLifecycleCoordinator();
  const releaseDeletion = deferred();
  const deletion = lifecycle.runDeletion("project-1", () => releaseDeletion.promise);

  await assert.rejects(
    initializePersistentProjectFile({
      lifecycle,
      repository: {
        async create() {
          throw new Error("must not create");
        }
      },
      issuer: {
        async issue() {
          throw new Error("must not issue");
        }
      },
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
    docker: {},
    git: {},
    migrations: {},
    deployments: {},
    health: {},
    async resolveEnv() {
      return {};
    },
    async getDevContainerId() {
      throw new Error("must not provision");
    }
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

test("a durable tombstone survives a coordinator restart and permits deletion retry", async () => {
  const store = createMemoryProjectLifecycleStore();
  const firstCoordinator = createProjectLifecycleCoordinator({ store });
  await assert.rejects(
    firstCoordinator.runDeletion("project-1", async () => {
      throw new Error("cleanup crashed");
    }),
    /cleanup crashed/
  );

  const restartedCoordinator = createProjectLifecycleCoordinator({ store });
  await assert.rejects(
    restartedCoordinator.runChildMutation("project-1", async () => undefined),
    ProjectDeletionInProgressError
  );
  assert.equal(
    await restartedCoordinator.runDeletion("project-1", async () => "retried"),
    "retried"
  );
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

  const deletion = deleter.runDeletion("project-1", async () => {
    events.push("cleanup");
  });
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
  const concurrentDeletion = second.runDeletion("project-1", async () => {
    cleanupCount += 1;
    return { id: "project-1", deleted: true };
  });
  releaseCleanup.resolve();

  assert.deepEqual(await firstDeletion, { id: "project-1", deleted: true });
  assert.deepEqual(await concurrentDeletion, { id: "project-1", deleted: true });
  assert.equal(cleanupCount, 1);
});

test("an expired deletion lease is recovered after a coordinator crash", async () => {
  const store = createMemoryProjectLifecycleStore();
  let currentTime = new Date("2026-08-25T00:00:00.000Z");
  const crashedOperation = deferred();
  const crashedOperationStarted = deferred();
  const crashed = createProjectLifecycleCoordinator({
    store,
    now: () => currentTime,
    deletionLeaseMs: 1_000
  });
  const abandonedDeletion = crashed.runDeletion("project-1", () => {
    crashedOperationStarted.resolve();
    return crashedOperation.promise;
  });
  await crashedOperationStarted.promise;

  currentTime = new Date("2026-08-25T00:00:02.000Z");
  const recovered = createProjectLifecycleCoordinator({
    store,
    now: () => currentTime,
    deletionLeaseMs: 1_000
  });
  assert.equal(await recovered.runDeletion("project-1", async () => "recovered"), "recovered");

  crashedOperation.resolve("stale");
  assert.equal(await abandonedDeletion, "stale");
  await assert.rejects(
    recovered.runChildMutation("project-1", async () => undefined),
    ProjectDeletionInProgressError
  );
});

test("a presigned upload remains a durable child lease until URL expiry across retry", async () => {
  const store = createMemoryProjectLifecycleStore();
  let currentTime = new Date("2026-08-25T00:00:00.000Z");
  const uploadExpiresAt = new Date("2026-08-25T00:15:00.000Z");
  const lifecycleOptions = {
    store,
    now: () => currentTime,
    pollIntervalMs: 10_000,
    sleep: async (milliseconds) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    }
  };
  const uploader = createProjectLifecycleCoordinator(lifecycleOptions);
  const repository = {
    async create(input) {
      const now = new Date("2026-08-25T00:00:00.000Z");
      return {
        ...input,
        uploadStatus: "pending",
        scanStatus: "pending",
        indexStatus: "pending",
        extractionStatus: "pending",
        excerpts: [],
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      };
    }
  };
  await initializePersistentProjectFile({
    lifecycle: uploader,
    repository,
    issuer: {
      async issue() {
        return { url: "https://uploads.example.test/signed", expiresAt: uploadExpiresAt };
      }
    },
    actorId: "creator-1",
    projectId: "project-1",
    fileName: "requirements.md",
    mimeType: "text/markdown",
    sizeBytes: 42,
    sha256: "a".repeat(64)
  });

  const cleanupTimes = [];
  const deleter = createProjectLifecycleCoordinator(lifecycleOptions);
  await assert.rejects(
    deleter.runDeletion("project-1", async () => {
      cleanupTimes.push(currentTime.toISOString());
      throw new Error("object store unavailable");
    }),
    /object store unavailable/
  );
  const retry = createProjectLifecycleCoordinator(lifecycleOptions);
  await retry.runDeletion("project-1", async () => {
    cleanupTimes.push(currentTime.toISOString());
  });

  assert.deepEqual(cleanupTimes, [uploadExpiresAt.toISOString(), uploadExpiresAt.toISOString()]);
});

test("upload URL issuance can promote its existing lease after deletion is requested", async () => {
  const store = createMemoryProjectLifecycleStore();
  const uploader = createProjectLifecycleCoordinator({ store });
  const deleter = createProjectLifecycleCoordinator({ store, pollIntervalMs: 1 });
  const issuerStarted = deferred();
  const releaseIssuer = deferred();
  const uploadExpiresAt = new Date(Date.now() + 30);
  const initialization = initializePersistentProjectFile({
    lifecycle: uploader,
    repository: {
      async create(input) {
        const now = new Date();
        return {
          ...input,
          uploadStatus: "pending",
          scanStatus: "pending",
          indexStatus: "pending",
          extractionStatus: "pending",
          excerpts: [],
          archivedAt: null,
          createdAt: now,
          updatedAt: now
        };
      }
    },
    issuer: {
      async issue() {
        issuerStarted.resolve();
        await releaseIssuer.promise;
        return { url: "https://uploads.example.test/race", expiresAt: uploadExpiresAt };
      }
    },
    actorId: "creator-1",
    projectId: "project-1",
    fileName: "requirements.md",
    mimeType: "text/markdown",
    sizeBytes: 42,
    sha256: "a".repeat(64)
  });
  await issuerStarted.promise;
  const deletion = deleter.runDeletion("project-1", async () => undefined);
  releaseIssuer.resolve();

  await initialization;
  await deletion;
});
