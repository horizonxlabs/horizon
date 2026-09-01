import test from "node:test";
import assert from "node:assert/strict";

const { createMinioProjectFileUploadUrlIssuer } = await import("../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts");

test("project file uploads use a short-lived browser-reachable MinIO presigned URL", async () => {
  const calls = [];
  const issuer = createMinioProjectFileUploadUrlIssuer({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "server-only", secretKey: "server-only",
    publicBaseUrl: "https://files.example.internal",
    clientFactory: () => ({
      async bucketExists() { return false; },
      async makeBucket(bucket) { calls.push({ makeBucket: bucket }); },
      async removeObject(bucket, objectKey) { calls.push({ removeObject: { bucket, objectKey } }); },
      async removeBucket(bucket) { calls.push({ removeBucket: bucket }); },
      async presignedPutObject() { throw new Error("internal endpoint must not sign browser URL"); }
    }),
    signingClientFactory: (options) => ({
      async presignedPutObject(bucket, objectKey, expiry) {
        calls.push({ signingOptions: options });
        calls.push({ bucket, objectKey, expiry });
        return `https://files.example.internal/${bucket}/${objectKey}?X-Amz-Signature=server-signed`;
      }
    })
  });
  const upload = await issuer.issue("project-file-uploads", "projects/prj_001/requirements.md");
  assert.equal(upload.url, "https://files.example.internal/project-file-uploads/projects/prj_001/requirements.md?X-Amz-Signature=server-signed");
  assert.deepEqual(calls[1].signingOptions, {
    endPoint: "files.example.internal", port: 443, useSSL: true,
    accessKey: "server-only", secretKey: "server-only"
  });
  assert.equal(calls[2].expiry, 900);
  assert.equal(calls[0].makeBucket, "project-file-uploads");
  assert.equal(upload.expiresAt.getTime() - Date.now() > 14 * 60_000, true);

  await issuer.remove("project-file-uploads", "projects/prj_001/requirements.md");
  assert.deepEqual(calls.at(-1), {
    removeObject: {
      bucket: "project-file-uploads",
      objectKey: "projects/prj_001/requirements.md"
    }
  });
});

test("a project upload bucket is revoked only after in-flight PUTs release it", async () => {
  let bucketRemovalAttempts = 0;
  const issuer = createMinioProjectFileUploadUrlIssuer({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "server", secretKey: "server",
    publicBaseUrl: "https://files.example.internal",
    clientFactory: () => ({
      async bucketExists() { return true; },
      async makeBucket() {},
      async removeObject() {},
      async removeBucket() {
        bucketRemovalAttempts += 1;
        if (bucketRemovalAttempts === 1) {
          const error = new Error("in-flight PUT");
          error.code = "BucketNotEmpty";
          throw error;
        }
      },
      async presignedPutObject() { return "unused"; }
    }),
    signingClientFactory: () => ({ async presignedPutObject() { return "unused"; } })
  });

  await issuer.revokeBucket("project-file-project-123", ["one.bin", "two.bin"]);
  assert.equal(bucketRemovalAttempts, 2);
});

test("project bucket revocation is idempotent after a prior cleanup removed the bucket", async () => {
  const issuer = createMinioProjectFileUploadUrlIssuer({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "server", secretKey: "server",
    publicBaseUrl: "https://files.example.internal",
    clientFactory: () => ({
      async bucketExists() { return false; },
      async makeBucket() {},
      async removeObject() { throw Object.assign(new Error("gone"), { code: "NoSuchBucket" }); },
      async removeBucket() { throw Object.assign(new Error("gone"), { code: "NoSuchBucket" }); },
      async presignedPutObject() { return "unused"; }
    }),
    signingClientFactory: () => ({ async presignedPutObject() { return "unused"; } })
  });

  await issuer.revokeBucket("project-file-project-123", ["one.bin"]);
});

test("project bucket revocation enumerates and removes unexpected objects before deleting the bucket", async () => {
  const removed = [];
  let bucketRemoved = false;
  const issuer = createMinioProjectFileUploadUrlIssuer({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "server", secretKey: "server",
    publicBaseUrl: "https://files.example.internal", revokeBaseDelayMs: 0,
    clientFactory: () => ({
      async bucketExists() { return true; }, async makeBucket() {},
      async *listObjectsV2() { yield { name: "known.bin" }; yield { name: "unexpected.bin" }; },
      async removeObject(_bucket, key) { removed.push(key); },
      async removeBucket() { bucketRemoved = true; },
      async presignedPutObject() { return "unused"; }
    }),
    signingClientFactory: () => ({ async presignedPutObject() { return "unused"; } })
  });
  await issuer.revokeBucket("project-file-project-123", ["known.bin"]);
  assert.deepEqual(removed.sort(), ["known.bin", "unexpected.bin"]);
  assert.equal(bucketRemoved, true);
});

test("project bucket revocation bounds retryable conflicts and surfaces unresolved cleanup", async () => {
  let attempts = 0;
  const issuer = createMinioProjectFileUploadUrlIssuer({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "server", secretKey: "server",
    publicBaseUrl: "https://files.example.internal", revokeMaxAttempts: 3, revokeBaseDelayMs: 0,
    clientFactory: () => ({
      async bucketExists() { return true; }, async makeBucket() {},
      async *listObjectsV2() {}, async removeObject() {},
      async removeBucket() {
        attempts += 1;
        throw Object.assign(new Error("still active"), { code: "BucketNotEmpty" });
      },
      async presignedPutObject() { return "unused"; }
    }),
    signingClientFactory: () => ({ async presignedPutObject() { return "unused"; } })
  });
  await assert.rejects(
    issuer.revokeBucket("project-file-project-123", ["known.bin"]),
    /remains non-empty after 3 attempts/
  );
  assert.equal(attempts, 3);
});
