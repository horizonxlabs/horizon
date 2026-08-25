import assert from "node:assert/strict";
import test from "node:test";

const { createMemoryProjectLifecycleStore, createProjectLifecycleCoordinator } =
  await import("../../apps/platform-api/src/project-lifecycle.ts");
const { initializePersistentProjectFile, completePersistentProjectFile } =
  await import("../../apps/platform-api/src/persistence/persistent-project-files-route.ts");
const { deletePersistedProjectFiles } =
  await import("../../apps/platform-api/src/persistence/project-file-cleanup.ts");
const { projectFileBucketName } =
  await import("../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function repositoryAt(timestamp = "2026-08-25T00:00:00.000Z") {
  return {
    async create(input) {
      const now = new Date(timestamp);
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
}

test("uploads for the same project share one revocable project bucket", async () => {
  const buckets = [];
  const base = {
    repository: repositoryAt(),
    issuer: {
      async issue(bucket) {
        buckets.push(bucket);
        return { url: "https://uploads.example.test/signed", expiresAt: new Date(Date.now() + 1000) };
      }
    },
    actorId: "creator-1",
    projectId: "project-1",
    mimeType: "text/markdown",
    sizeBytes: 42,
    sha256: "a".repeat(64)
  };
  await initializePersistentProjectFile({ ...base, fileName: "one.md" });
  await initializePersistentProjectFile({ ...base, fileName: "two.md" });

  assert.equal(buckets.length, 2);
  assert.equal(buckets[0], buckets[1]);
  assert.match(buckets[0], /^project-file-[a-f0-9]{40}$/);
});

test("a presigned upload remains a durable child lease until URL expiry across retry", async () => {
  let currentTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => currentTime });
  const uploadExpiresAt = new Date("2026-08-25T00:15:00.000Z");
  const options = {
    store,
    pollIntervalMs: 10_000,
    sleep: async (milliseconds) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    }
  };
  await initializePersistentProjectFile({
    lifecycle: createProjectLifecycleCoordinator(options),
    repository: repositoryAt(),
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
  await assert.rejects(
    createProjectLifecycleCoordinator(options).runDeletion("project-1", async () => {
      cleanupTimes.push(currentTime.toISOString());
      throw new Error("object store unavailable");
    }),
    /object store unavailable/
  );
  await createProjectLifecycleCoordinator(options).runDeletion("project-1", async () => {
    cleanupTimes.push(currentTime.toISOString());
  });
  assert.deepEqual(cleanupTimes, [uploadExpiresAt.toISOString(), uploadExpiresAt.toISOString()]);
});

test("upload URL issuance promotes its existing lease before deletion is requested", async () => {
  const store = createMemoryProjectLifecycleStore();
  const uploader = createProjectLifecycleCoordinator({ store });
  const deleter = createProjectLifecycleCoordinator({ store, pollIntervalMs: 1 });
  const issuerStarted = deferred();
  const releaseIssuer = deferred();
  const uploadExpiresAt = new Date(Date.now() + 30);
  const initialization = initializePersistentProjectFile({
    lifecycle: uploader,
    repository: repositoryAt(new Date().toISOString()),
    issuer: {
      leaseDurationMs: 30,
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

test("a PUT held across deletion drains before project-bucket revoke and late completion is rejected", async () => {
  const store = createMemoryProjectLifecycleStore();
  const uploader = createProjectLifecycleCoordinator({ store });
  const deleter = createProjectLifecycleCoordinator({ store, pollIntervalMs: 1 });
  const putFinished = deferred();
  const revokeStarted = deferred();
  const objectKey = "projects/project-1/knowledge/source/version/file.bin";
  const row = {
    id: "upl_overlap", projectId: "project-1", bucket: projectFileBucketName("project-1"), objectKey,
    archivedAt: null, createdAt: new Date(), uploadStatus: "pending"
  };
  let metadataDeleted = false;
  let completionAttempted = false;
  const repository = {
    async listAll() { return [row]; },
    async deleteProject() { metadataDeleted = true; },
    async get() { return row; },
    async complete() {
      completionAttempted = true;
      throw new Error("late completion must not persist");
    }
  };
  const storage = {
    async remove() { throw new Error("project bucket revocation must own cleanup"); },
    async revokeBucket(bucket, keys) {
      assert.equal(bucket, row.bucket);
      assert.deepEqual(keys, [objectKey]);
      revokeStarted.resolve();
      await putFinished.promise;
    }
  };

  const deletion = deleter.runDeletion("project-1", () =>
    deletePersistedProjectFiles("project-1", repository, storage)
  );
  await revokeStarted.promise;
  assert.equal(metadataDeleted, false, "deletion drains the in-flight staging PUT");
  putFinished.resolve();
  await deletion;

  await assert.rejects(
    completePersistentProjectFile({
      lifecycle: uploader,
      projectId: "project-1",
      repository,
      uploadId: row.id
    }),
    /being deleted|has been deleted/
  );
  assert.equal(completionAttempted, false);
  assert.equal(metadataDeleted, true);
});
