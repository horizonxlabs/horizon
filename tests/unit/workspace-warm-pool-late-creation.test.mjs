import assert from "node:assert/strict";
import test from "node:test";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test("a gateway key returned after lease takeover is revoked without touching the successor", async () => {
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    previewExitCode: 1,
    operationLeaseMs: 1_000
  });
  await fixture.pool.ensureCapacity();
  const [failed] = await fixture.store.list();
  fixture.setNow(new Date(failed.retryAfter));
  const dispatched = Promise.withResolvers();
  const release = Promise.withResolvers();
  let first = true;
  fixture.deps.llmGateway.createVirtualKey = async () => {
    if (first) {
      first = false;
      dispatched.resolve();
      await release.promise;
      return { keyId: "late-key-id", key: "late-test-secret" };
    }
    return { keyId: "successor-key-id", key: "successor-test-secret" };
  };
  const stale = fixture.pool.ensureCapacity();
  await dispatched.promise;
  try {
    fixture.setNow(new Date("2026-09-05T00:00:06.001Z"));
    fixture.previewExitCode = 0;
    const successor = fixture.createPool();
    await successor.reconcile();
    await successor.ensureCapacity();
    const [ready] = await fixture.store.list();
    release.resolve();
    await stale;
    await successor.reconcile();

    assert.ok(fixture.revokedKeys.includes("late-key-id"), "the late key must be compensated");
    assert.equal(fixture.revokedKeys.includes("successor-key-id"), false);
    assert.deepEqual(await fixture.store.list(), [ready]);
  } finally {
    release.resolve();
    await stale;
  }
});

for (const resource of ["schema", "bucket", "volume", "container"]) {
  test(`a late ${resource} create is compensated using only its retired generation`, async () => {
    const fixture = createWarmPoolFixture({
      targetSize: 1,
      previewExitCode: 1,
      operationLeaseMs: 1_000
    });
    await fixture.pool.ensureCapacity();
    const [failed] = await fixture.store.list();
    fixture.setNow(new Date(failed.retryAfter));
    const dispatched = Promise.withResolvers();
    const release = Promise.withResolvers();
    const [port, method] = {
      schema: [fixture.deps.postgres, "provisionSchema"],
      bucket: [fixture.deps.objectStorage, "provisionBucket"],
      volume: [fixture.docker, "ensureVolume"],
      container: [fixture.docker, "createContainer"]
    }[resource];
    const create = port[method].bind(port);
    let first = true;
    port[method] = async (...args) => {
      if (first) {
        first = false;
        dispatched.resolve();
        await release.promise;
      }
      return create(...args);
    };
    let keySequence = 0;
    fixture.deps.llmGateway.createVirtualKey = async () => ({
      keyId: `generation-key-${++keySequence}`,
      key: `generation-secret-${keySequence}`
    });
    const stale = fixture.pool.ensureCapacity();
    await dispatched.promise;
    const [retired] = await fixture.store.list();
    try {
      fixture.setNow(new Date("2026-09-05T00:00:06.001Z"));
      fixture.previewExitCode = 0;
      const successor = fixture.createPool();
      await successor.reconcile();
      await successor.ensureCapacity();
      const [ready] = await fixture.store.list();
      const schemaReleases = fixture.releasedSchemas.length;
      const bucketReleases = fixture.releasedBuckets.length;
      release.resolve();
      await stale;
      assert.deepEqual(await fixture.store.list(), [ready]);
      assert.equal(fixture.revokedKeys.includes(ready.llmGatewayKeyId), false);
      if (resource === "schema") {
        assert.ok(fixture.releasedSchemas.slice(schemaReleases).includes(retired.resourceKey));
      }
      if (resource === "bucket") {
        assert.ok(fixture.releasedBuckets.slice(bucketReleases).includes(retired.resourceKey));
      }
      const containers = await fixture.docker.listManagedContainers();
      assert.equal(
        containers.some((item) => item.name === `evcp-ws-${retired.resourceKey}`),
        false
      );
      if (resource === "volume") {
        const volumes = await fixture.docker.listManagedVolumes();
        assert.equal(
          volumes.some((item) => item.name === `evcp-ws-${retired.resourceKey}-data`),
          false
        );
      }
    } finally {
      release.resolve();
      await stale;
    }
  });
}

test("a restarted pool retires an ambiguous gateway create again after a late server commit", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, operationLeaseMs: 1_000 });
  const remoteKeys = new Map();
  let first = true;
  fixture.deps.llmGateway.createVirtualKey = async ({ slug }) => {
    remoteKeys.set(slug, `key-${slug}`);
    if (first) {
      first = false;
      throw new Error("gateway response was lost");
    }
    return { keyId: `key-${slug}`, key: `secret-${slug}` };
  };
  fixture.deps.llmGateway.revokeVirtualKeysForResource = async (resourceKey) => {
    remoteKeys.delete(resourceKey);
  };
  await fixture.pool.ensureCapacity();
  const [failed] = await fixture.store.list();
  fixture.setNow(new Date(failed.retryAfter));
  const restarted = fixture.createPool();
  await restarted.ensureCapacity();
  const [ready] = await fixture.store.list();
  await restarted.reconcile();
  assert.equal(remoteKeys.has(failed.resourceKey), false);
  assert.equal(remoteKeys.has(ready.resourceKey), true);
  // The original process never observed a response, so cleanup must remain durable.
  remoteKeys.set(failed.resourceKey, "late-commit-after-cleanup");
  await fixture.createPool().reconcile();
  assert.equal(remoteKeys.has(failed.resourceKey), false);
  assert.equal(remoteKeys.has(ready.resourceKey), true);
});

test("failed late compensation stays durable until a restarted sweeper can clean its exact alias", async () => {
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    previewExitCode: 1,
    operationLeaseMs: 1_000
  });
  await fixture.pool.ensureCapacity();
  const [failed] = await fixture.store.list();
  fixture.setNow(new Date(failed.retryAfter));
  const dispatched = Promise.withResolvers();
  const release = Promise.withResolvers();
  let first = true;
  let cleanupAvailable = false;
  const cleanedAliases = [];
  fixture.deps.llmGateway.createVirtualKey = async () => {
    if (first) {
      first = false;
      dispatched.resolve();
      await release.promise;
      return { keyId: "late-unavailable-key", key: "late-test-secret" };
    }
    return { keyId: "healthy-successor-key", key: "successor-test-secret" };
  };
  const revoke = fixture.deps.llmGateway.revokeVirtualKey.bind(fixture.deps.llmGateway);
  fixture.deps.llmGateway.revokeVirtualKey = async (keyId) => {
    if (keyId === "late-unavailable-key") throw new Error("key revocation unavailable");
    return revoke(keyId);
  };
  fixture.deps.llmGateway.revokeVirtualKeysForResource = async (resourceKey) => {
    if (!cleanupAvailable) throw new Error("alias revocation unavailable");
    cleanedAliases.push(resourceKey);
  };
  const stale = fixture.pool.ensureCapacity();
  await dispatched.promise;
  const [retired] = await fixture.store.list();
  try {
    fixture.setNow(new Date("2026-09-05T00:00:06.001Z"));
    fixture.previewExitCode = 0;
    await fixture.createPool().ensureCapacity();
    const [ready] = await fixture.store.list();
    release.resolve();
    await stale;
    assert.deepEqual(await fixture.store.preparations.list(), [
      {
        resourceKey: retired.resourceKey,
        slotId: retired.id,
        operationOwner: retired.operationOwner,
        settled: true
      }
    ]);
    cleanupAvailable = true;
    await fixture.createPool().reconcile();
    assert.deepEqual(cleanedAliases, [retired.resourceKey]);
    assert.deepEqual(await fixture.store.preparations.list(), []);
    assert.deepEqual(await fixture.store.list(), [ready]);
  } finally {
    release.resolve();
    await stale;
  }
});

test("warm resource dispatch waits for its durable preparation intent", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  const dispatched = Promise.withResolvers();
  const release = Promise.withResolvers();
  const create = fixture.store.preparations.create.bind(fixture.store.preparations);
  fixture.store.preparations.create = async (...args) => {
    dispatched.resolve();
    await release.promise;
    return create(...args);
  };
  const preparing = fixture.pool.ensureCapacity();
  await dispatched.promise;
  try {
    assert.equal(fixture.prepareAttempts, 0);
    assert.deepEqual(await fixture.docker.listManagedVolumes(), []);
    release.resolve();
    await preparing;
    assert.equal((await fixture.store.list())[0].state, "ready");
    assert.deepEqual(await fixture.store.preparations.list(), []);
  } finally {
    release.resolve();
    await preparing;
  }
});
