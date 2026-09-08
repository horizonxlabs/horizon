import assert from "node:assert/strict";
import test from "node:test";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createLiteLlmGatewayAdmin } from "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createMinioObjectStorageProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

const absentKey = {
  error: {
    message: "{'error': 'No keys found'}",
    type: "internal_server_error",
    param: "None",
    code: "404"
  }
};

test("LiteLLM key-ID adapter itself normalizes exact absence", async () => {
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm",
    masterKey: "test-only",
    fetchImpl: async () => Response.json(absentKey, { status: 404 })
  });
  await assert.doesNotReject(() => gateway.revokeVirtualKey("old-key"));
});

for (const payload of [{ detail: "Not Found" }, absentKey]) {
  test(`key-ID cleanup ${payload === absentKey ? "accepts exact absence" : "retains ownership on unrelated 404"}`, async () => {
    const fixture = createWarmPoolFixture({ targetSize: 1 });
    await fixture.pool.ensureCapacity();
    const slot = await fixture.pool.claim("prj_cleanup");
    await fixture.store.preparations.create({
      resourceKey: slot.resourceKey,
      slotId: slot.slotId,
      operationOwner: "old-owner"
    });
    fixture.deps.llmGateway = createLiteLlmGatewayAdmin({
      baseUrl: "http://litellm",
      masterKey: "test-only",
      fetchImpl: async () => Response.json(payload, { status: 404 })
    });
    await fixture.pool.failClaim(slot.slotId, new Error("handoff failed"), async () => {});
    const rows = await fixture.store.list();
    assert.equal(rows.length, payload === absentKey ? 0 : 1);
    if (rows.length) {
      assert.equal(rows[0].state, "failed");
      assert.equal(rows[0].llmGatewayKeyId, slot.llmGatewayKeyId);
      assert.equal((await fixture.store.preparations.list()).length, 1);
    }
  });
}

for (const resource of ["schema", "bucket", "volume", "container"]) {
  test(`generic ${resource} cleanup does not classify unstructured not-found errors`, async () => {
    const fixture = createWarmPoolFixture({ targetSize: 1 });
    await fixture.pool.ensureCapacity();
    const slot = await fixture.pool.claim("prj_cleanup");
    await fixture.store.preparations.create({
      resourceKey: slot.resourceKey,
      slotId: slot.slotId,
      operationOwner: "old-owner"
    });
    const fail = async () => {
      throw new Error("upstream route not found (404)");
    };
    if (resource === "schema") fixture.deps.postgres.releaseSchema = fail;
    if (resource === "bucket") fixture.deps.objectStorage.releaseBucket = fail;
    if (resource === "volume") fixture.docker.removeVolume = fail;
    if (resource === "container") fixture.docker.removeContainer = fail;
    await fixture.pool.failClaim(slot.slotId, new Error("handoff failed"), async () => {});
    assert.equal((await fixture.store.list())[0]?.state, "failed");
    assert.equal((await fixture.store.preparations.list()).length, 1);
  });
}

for (const [operation, id, message] of [
  ["removeContainer", "old-container", "No such container: old-container"],
  ["removeVolume", "old-volume", "get old-volume: no such volume"]
]) {
  test(`Docker ${operation} accepts only exact named absence`, async () => {
    for (const [payload, succeeds] of [
      [{ message }, true],
      [{ message: "404 page not found" }, false],
      [{ message: message.replace(id, "other") }, false]
    ]) {
      const docker = createDockerSocketEngine({
        request: async () => ({ status: 404, json: async () => payload })
      });
      if (succeeds) await assert.doesNotReject(() => docker[operation](id));
      else await assert.rejects(() => docker[operation](id));
    }
  });
}

test("Docker volume cleanup accepts the Engine not-found contract used in production", async () => {
  const docker = createDockerSocketEngine({
    request: async () => ({
      status: 404,
      json: async () => ({ message: "volume old-volume not found" })
    })
  });

  await assert.doesNotReject(() => docker.removeVolume("old-volume"));
});

test("memory Docker repeated container removal succeeds", async () => {
  await assert.doesNotReject(() => createMemoryDockerEngine().removeContainer("already-absent"));
});

test("MinIO bucket removal normalizes exact NoSuchBucket race and propagates unrelated 404", async () => {
  for (const [code, succeeds] of [
    ["NoSuchBucket", true],
    ["NotFound", false],
    ["AccessDenied", false]
  ]) {
    const storage = createMinioObjectStorageProvisioner({
      endPoint: "minio",
      port: 9000,
      useSSL: false,
      accessKey: "test",
      secretKey: "test",
      identityAdmin: { release: async () => {} },
      clientFactory: () => ({
        bucketExists: async () => true,
        removeBucket: async () => {
          throw Object.assign(new Error("not found (404)"), { code });
        }
      })
    });
    if (succeeds) await assert.doesNotReject(() => storage.releaseBucket("warm-old"));
    else await assert.rejects(() => storage.releaseBucket("warm-old"));
  }
});
