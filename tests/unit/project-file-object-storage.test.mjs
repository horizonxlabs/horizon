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
});
