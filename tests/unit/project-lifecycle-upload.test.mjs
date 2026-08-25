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

test("file init compensates a row created after deletion completed during repository.create", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const createStarted = deferred();
  const resumeCreate = deferred();
  const rows = new Map();
  const revoked = [];
  const repository = {
    async create(input) {
      createStarted.resolve();
      await resumeCreate.promise;
      const row = { ...input, archivedAt: null, createdAt: new Date(), updatedAt: new Date() };
      rows.set(input.id, row);
      return row;
    },
    async deleteUpload(id) { rows.delete(id); }
  };
  const initialization = initializePersistentProjectFile({
    lifecycle: createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 }),
    repository,
    issuer: {
      leaseDurationMs: 100,
      async issue() { throw new Error("URL issuance must not follow a lost create fence"); },
      async remove(bucket, key) { revoked.push([bucket, [key]]); },
      async revokeBucket(bucket, keys) { revoked.push([bucket, keys]); }
    },
    actorId: "creator-1", projectId: "project-1", fileName: "late.md",
    mimeType: "text/markdown", sizeBytes: 42, sha256: "a".repeat(64)
  });
  await createStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("project-1", async () => undefined);
  resumeCreate.resolve();

  await assert.rejects(initialization, /being deleted/);
  assert.equal(rows.size, 0);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0][0], projectFileBucketName("project-1"));
  assert.equal(revoked[0][1].length, 1);
});

test("file init revokes a URL issued after its lease expired and deletion completed", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const issueStarted = deferred();
  const resumeIssue = deferred();
  const rows = new Map();
  const revoked = [];
  const repository = {
    async create(input) {
      const row = { ...input, archivedAt: null, createdAt: new Date(), updatedAt: new Date() };
      rows.set(input.id, row);
      return row;
    },
    async deleteUpload(id) { rows.delete(id); }
  };
  const initialization = initializePersistentProjectFile({
    lifecycle: createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 }),
    repository,
    issuer: {
      leaseDurationMs: 100,
      async issue() {
        issueStarted.resolve();
        await resumeIssue.promise;
        return { url: "https://uploads.example.test/late", expiresAt: new Date() };
      },
      async remove() {},
      async revokeBucket(bucket, keys) { revoked.push([bucket, keys]); }
    },
    actorId: "creator-1", projectId: "project-1", fileName: "late.md",
    mimeType: "text/markdown", sizeBytes: 42, sha256: "a".repeat(64)
  });
  await issueStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("project-1", async () => rows.clear());
  resumeIssue.resolve();

  await assert.rejects(initialization, /being deleted/);
  assert.equal(rows.size, 0);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0][0], projectFileBucketName("project-1"));
});

test("file init revokes a bucket created by an issuer that throws after deletion", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const bucketCreated = deferred();
  const resumeIssue = deferred();
  const rows = new Map();
  const revoked = [];
  const repository = {
    async create(input) {
      const row = { ...input, archivedAt: null, createdAt: new Date(), updatedAt: new Date() };
      rows.set(input.id, row);
      return row;
    },
    async deleteUpload(id) { rows.delete(id); }
  };
  const initialization = initializePersistentProjectFile({
    lifecycle: createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 }),
    repository,
    issuer: {
      leaseDurationMs: 100,
      async issue() {
        bucketCreated.resolve();
        await resumeIssue.promise;
        throw new Error("presign failed after creating bucket");
      },
      async remove() { assert.fail("a lost fence must revoke the project bucket"); },
      async revokeBucket(bucket, keys) { revoked.push([bucket, keys]); }
    },
    actorId: "creator-1", projectId: "project-1", fileName: "late.md",
    mimeType: "text/markdown", sizeBytes: 42, sha256: "a".repeat(64)
  });
  await bucketCreated.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("project-1", async () => rows.clear());
  resumeIssue.resolve();

  await assert.rejects(initialization, /presign failed/);
  assert.equal(rows.size, 0);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0][0], projectFileBucketName("project-1"));
});

test("persisted file cleanup stops between object stages after deletion-fence takeover", async () => {
  const firstRemoved = deferred();
  const resumeFirst = deferred();
  const removed = [];
  let metadataDeleted = false;
  let current = true;
  const cleanup = deletePersistedProjectFiles(
    "project-1",
    {
      async listAll() {
        return [
          { bucket: "legacy-a", objectKey: "one" },
          { bucket: "legacy-b", objectKey: "two" }
        ];
      },
      async deleteProject() { metadataDeleted = true; }
    },
    {
      async remove(bucket, key) {
        removed.push([bucket, key]);
        if (key === "one") {
          firstRemoved.resolve();
          await resumeFirst.promise;
        }
      }
    },
    { epoch: 1, async assertCurrent() { if (!current) throw new Error("deletion ownership lost"); } }
  );
  await firstRemoved.promise;
  current = false;
  resumeFirst.resolve();

  await assert.rejects(cleanup, /ownership lost/);
  assert.deepEqual(removed, [["legacy-a", "one"]]);
  assert.equal(metadataDeleted, false);
});
