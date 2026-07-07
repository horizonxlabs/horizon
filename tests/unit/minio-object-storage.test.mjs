import test from "node:test";
import assert from "node:assert/strict";
import { createMinioObjectStorageProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

function fakeMinio() {
  const buckets = new Set();
  return {
    calls: [],
    buckets,
    async bucketExists(name) { this.calls.push(["exists", name]); return buckets.has(name); },
    async makeBucket(name) { this.calls.push(["make", name]); buckets.add(name); },
    async removeBucket(name) { this.calls.push(["remove", name]); buckets.delete(name); }
  };
}

test("provisionBucket creates the per-project bucket when absent and returns creds", async () => {
  const client = fakeMinio();
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client
  });

  const result = await provisioner.provisionBucket("myapp");
  assert.equal(result.bucket, "proj-myapp");
  assert.equal(result.accessKey, "root");
  assert.equal(result.secretKey, "rootsecret");
  assert.ok(client.buckets.has("proj-myapp"));
  assert.deepEqual(client.calls, [["exists", "proj-myapp"], ["make", "proj-myapp"]]);
});

test("provisionBucket is idempotent when the bucket already exists", async () => {
  const client = fakeMinio();
  client.buckets.add("proj-myapp");
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client
  });
  await provisioner.provisionBucket("myapp");
  assert.ok(!client.calls.some((c) => c[0] === "make"), "must not re-create an existing bucket");
});

test("releaseBucket removes the bucket", async () => {
  const client = fakeMinio();
  client.buckets.add("proj-myapp");
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client
  });
  await provisioner.releaseBucket("myapp");
  assert.ok(!client.buckets.has("proj-myapp"));
});
