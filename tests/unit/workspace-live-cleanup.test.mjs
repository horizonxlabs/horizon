import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";

import { assertLiveContainerAbsent } from "../integration/workspace-live-assertions.mjs";
import { waitForWorkspaceLiveIdle } from "../integration/workspace-live-idle.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { cleanupWarmSlotResources } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-cleanup.ts";

test("live cleanup absence failures never format Docker environment credentials", async () => {
  const sentinel = "CLEANUP_SECRET_SENTINEL_DO_NOT_LOG";
  const docker = {
    async inspectContainer() {
      return {
        containerId: "test-container-id",
        running: true,
        labels: { "evcp.managed": "true" },
        env: { DATABASE_URL: sentinel, LLM_GATEWAY_KEY: sentinel, S3_SECRET_KEY: sentinel }
      };
    }
  };
  const failure = await assertLiveContainerAbsent(docker, "evcp-ws-live-example").then(
    () => null,
    (error) => error
  );

  assert.ok(failure, "an existing container must fail cleanup verification");
  assert.equal(inspect(failure).includes(sentinel), false, "assertion must not expose Docker env");
  assert.equal(failure.actual, false);
  assert.equal(failure.expected, true);
  assert.match(failure.message, /evcp-ws-live-example/);
});

test("live cleanup waits for a blocked refill scheduled inside corrupt-envelope recovery", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const [ready] = await fixture.store.list();
  await fixture.store.markReady(ready.id, {
    containerId: ready.containerId,
    llmGatewayKeyId: ready.llmGatewayKeyId,
    secretPayload: "corrupt-envelope"
  });
  const refillStarted = Promise.withResolvers();
  const releaseRefill = Promise.withResolvers();
  const provisionSchema = fixture.deps.postgres.provisionSchema;
  fixture.deps.postgres.provisionSchema = async (resourceKey) => {
    refillStarted.resolve();
    await releaseRefill.promise;
    return provisionSchema(resourceKey);
  };
  const observedRefills = new Set();
  const exposedPool = {
    ...fixture.pool,
    ensureCapacity() {
      const pending = fixture.pool.ensureCapacity();
      observedRefills.add(pending);
      return pending;
    }
  };
  assert.equal(await exposedPool.claim("prj_bad_envelope"), null);
  await refillStarted.promise;
  const inFlightRefill = fixture.pool.ensureCapacity();
  assert.equal(observedRefills.size, 0, "closure-internal refill bypasses the copied wrapper");
  let cleanupStarted = false;
  const cleanup = waitForWorkspaceLiveIdle(fixture.pool, new Set(), observedRefills).then(
    async () => {
      cleanupStarted = true;
      for (const slot of await fixture.store.list()) {
        await cleanupWarmSlotResources(fixture.deps, slot);
        await fixture.store.remove(slot.id);
      }
    }
  );
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cleanupStarted, false, "cleanup must wait for the internally scheduled refill");
    assert.equal((await fixture.store.list())[0].state, "preparing");
    releaseRefill.resolve();
    await cleanup;
    assert.deepEqual(await fixture.store.list(), []);
    assert.equal(fixture.docker.state.containers.length, 0);
    assert.equal(fixture.docker.state.volumes.length, 0);
  } finally {
    releaseRefill.resolve();
    await inFlightRefill;
    await cleanup;
  }
});

test("the pool idle boundary includes a scheduled refill before capacity work starts", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const [ready] = await fixture.store.list();
  await fixture.store.markReady(ready.id, {
    containerId: ready.containerId,
    llmGatewayKeyId: ready.llmGatewayKeyId,
    secretPayload: "corrupt-envelope"
  });
  const requested = Promise.withResolvers();
  const release = Promise.withResolvers();
  const ensureCapacity = fixture.pool.ensureCapacity;
  // A caller may decorate the public entry point; the scheduler must own this wait too.
  fixture.pool.ensureCapacity = async () => {
    requested.resolve();
    await release.promise;
    return ensureCapacity();
  };
  assert.equal(await fixture.pool.claim("prj_bad_scheduled_envelope"), null);
  await requested.promise;
  let idle = false;
  const draining = fixture.pool.waitForIdle().then(() => {
    idle = true;
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(idle, false, "scheduled work must be tracked before ensureCapacity begins");
    release.resolve();
    await draining;
    assert.equal((await fixture.pool.getStatus()).ready, 1);
  } finally {
    release.resolve();
    await draining;
  }
});
