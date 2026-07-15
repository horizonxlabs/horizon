import test from "node:test";
import assert from "node:assert/strict";
import { createDockerMinioIdentityAdmin, createMinioObjectStorageProvisioner, MinioClient } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_MINIO_LIVE === "1";

test("provisions and releases a real bucket against the running MinIO", { skip: !LIVE }, async () => {
    const provisioner = createMinioObjectStorageProvisioner({
      endPoint: process.env.EVCP_S3_HOST ?? "minio",
      port: Number(process.env.EVCP_S3_PORT ?? 9000),
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER,
      secretKey: process.env.MINIO_ROOT_PASSWORD,
      identityAdmin: createDockerMinioIdentityAdmin(createDockerSocketEngine(), {
        containerName: process.env.EVCP_MINIO_CONTAINER_NAME ?? "evcp-minio",
        adminAccessKey: process.env.MINIO_ROOT_USER,
        adminSecretKey: process.env.MINIO_ROOT_PASSWORD
      })
    });
    const slug = "livebucket" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
    const otherSlug = `${slug}other`;

    const result = await provisioner.provisionBucket(slug);
    const other = await provisioner.provisionBucket(otherSlug);
    assert.equal(result.bucket, `proj-${slug}`);

    // idempotent second call must not throw
    const repeated = await provisioner.provisionBucket(slug);
    assert.equal(repeated.accessKey, result.accessKey);
    assert.equal(repeated.secretKey, result.secretKey);

    const scoped = new MinioClient({
      endPoint: process.env.EVCP_S3_HOST ?? "localhost",
      port: Number(process.env.EVCP_S3_PORT ?? 9000),
      useSSL: false,
      accessKey: result.accessKey,
      secretKey: result.secretKey
    });
    await scoped.putObject(result.bucket, "own.txt", Buffer.from("own"));
    await assert.rejects(
      () => scoped.putObject(other.bucket, "cross-project.txt", Buffer.from("denied")),
      /AccessDenied|not authorized|denied/i
    );
    await scoped.removeObject(result.bucket, "own.txt");

    await provisioner.releaseBucket(slug);
    await provisioner.releaseBucket(otherSlug);
    // releasing a non-existent bucket must be a no-op, not throw
    await provisioner.releaseBucket(slug);
});
