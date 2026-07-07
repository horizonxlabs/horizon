import test from "node:test";
import assert from "node:assert/strict";
import { createMinioObjectStorageProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

const LIVE = process.env.EVCP_MINIO_LIVE === "1";

test("provisions and releases a real bucket against the running MinIO", { skip: !LIVE }, async () => {
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: process.env.EVCP_S3_HOST ?? "minio",
    port: Number(process.env.EVCP_S3_PORT ?? 9000),
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USER,
    secretKey: process.env.MINIO_ROOT_PASSWORD
  });
  const slug = "livebucket" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));

  const result = await provisioner.provisionBucket(slug);
  assert.equal(result.bucket, `proj-${slug}`);

  // idempotent second call must not throw
  await provisioner.provisionBucket(slug);

  await provisioner.releaseBucket(slug);
  // releasing a non-existent bucket must be a no-op, not throw
  await provisioner.releaseBucket(slug);
});
