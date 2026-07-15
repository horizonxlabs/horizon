import test from "node:test";
import assert from "node:assert/strict";
import { createDockerMinioIdentityAdmin, createMinioObjectStorageProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

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

function fakeIdentityAdmin() {
  return {
    calls: [],
    async provision(input) {
      this.calls.push(["provision", input]);
    },
    async release(input) {
      this.calls.push(["release", input]);
    }
  };
}

test("provisionBucket creates the per-project bucket when absent and returns creds", async () => {
  const client = fakeMinio();
  const identities = fakeIdentityAdmin();
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client,
    identityAdmin: identities
  });

  const result = await provisioner.provisionBucket("myapp");
  assert.equal(result.bucket, "proj-myapp");
  assert.notEqual(result.accessKey, "root");
  assert.notEqual(result.secretKey, "rootsecret");
  assert.match(result.accessKey, /^evcp-/);
  assert.ok(result.secretKey.length >= 32);
  assert.ok(client.buckets.has("proj-myapp"));
  assert.deepEqual(client.calls, [
    ["exists", "proj-myapp"],
    ["make", "proj-myapp"]
  ]);
  assert.equal(identities.calls[0][0], "provision");
  assert.equal(identities.calls[0][1].bucket, "proj-myapp");
  assert.equal(identities.calls[0][1].accessKey, result.accessKey);
});

test("provisionBucket is idempotent when the bucket already exists", async () => {
  const client = fakeMinio();
  client.buckets.add("proj-myapp");
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client,
    identityAdmin: fakeIdentityAdmin()
  });
  await provisioner.provisionBucket("myapp");
  assert.ok(!client.calls.some((c) => c[0] === "make"), "must not re-create an existing bucket");
});

test("releaseBucket removes the bucket", async () => {
  const client = fakeMinio();
  const identities = fakeIdentityAdmin();
  client.buckets.add("proj-myapp");
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client,
    identityAdmin: identities
  });
  await provisioner.releaseBucket("myapp");
  assert.ok(!client.buckets.has("proj-myapp"));
  assert.deepEqual(
    identities.calls.map(([action]) => action),
    ["release"]
  );
});

test("provisionBucket fails closed when scoped identity provisioning is not configured", async () => {
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => fakeMinio()
  });
  await assert.rejects(() => provisioner.provisionBucket("myapp"), /identity admin.*required/i);
});

test("Docker identity admin attaches a policy scoped to only the project bucket", async () => {
  const scripts = [];
  const admin = createDockerMinioIdentityAdmin({
    async inspectContainer(name) {
      assert.equal(name, "evcp-minio");
      return { containerId: "minio-1", running: true, image: "minio", labels: {}, env: [] };
    },
    async execInContainer(containerId, cmd) {
      assert.equal(containerId, "minio-1");
      scripts.push(cmd.at(-1));
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  });

  await admin.provision({
    bucket: "proj-app-a",
    accessKey: "evcp-abc123",
    secretKey: "secret123",
    policyName: "evcp-abc123"
  });

  const encoded = scripts[0].match(/printf %s ([A-Za-z0-9+/=]+) \| base64/)[1];
  const policy = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const resources = policy.Statement.flatMap((statement) => statement.Resource);
  assert.deepEqual(resources, ["arn:aws:s3:::proj-app-a", "arn:aws:s3:::proj-app-a/*"]);
  assert.equal(
    resources.some((resource) => resource.includes("proj-app-b")),
    false
  );
});
