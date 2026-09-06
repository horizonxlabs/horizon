import test from "node:test";
import assert from "node:assert/strict";
import { startWarmPoolSweep } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import {
  workspaceVolumeName,
  workspaceWarmResourceLabels
} from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";

const start = new Date("2026-09-05T00:00:00.000Z");
const afterLeaseExpiry = new Date("2026-09-05T00:01:00.001Z");

async function addWarmResources(fixture, slotId, resourceKey) {
  await fixture.docker.ensureVolume(
    workspaceVolumeName(resourceKey),
    workspaceWarmResourceLabels(slotId)
  );
  const { containerId } = await fixture.docker.createContainer({
    name: `evcp-ws-${resourceKey}`,
    env: [],
    labels: workspaceWarmResourceLabels(slotId)
  });
  await fixture.docker.startContainer(containerId);
  return containerId;
}

test("zero-target sweep cleans a preparation deferred by a live startup lease", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const fixture = createWarmPoolFixture({ targetSize: 0 });
  const containerId = await addWarmResources(fixture, "preparing-slot", "preparing-resource");
  await fixture.store.createPreparing(
    { id: "preparing-slot", resourceKey: "preparing-resource" },
    {
      ownerId: "live-preparer",
      now: start.toISOString(),
      expiresAt: afterLeaseExpiry.toISOString()
    }
  );

  await fixture.pool.reconcile();
  assert.equal((await fixture.store.list())[0].state, "preparing");
  assert.equal(fixture.docker.state.containers[0].containerId, containerId);

  const sweep = startWarmPoolSweep(fixture.pool, { intervalMs: 10 });
  t.after(() => sweep.stop());
  fixture.setNow(afterLeaseExpiry);
  t.mock.timers.tick(10);
  await new Promise(setImmediate);

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["preparing-resource"]);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.docker.state.volumes.length, 0);
});

test("zero-target sweep retries expired claiming and cleaning slots", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 0, runtimeRecords: runtimeStore });

  const claimingContainerId = await addWarmResources(fixture, "claiming-slot", "claiming-resource");
  fixture.store.seedReady({
    id: "claiming-slot",
    resourceKey: "claiming-resource",
    containerId: claimingContainerId,
    llmGatewayKeyId: "claiming-key",
    secretPayload: "claiming-secret"
  });
  await fixture.store.claim("project-claiming");
  await runtimeStore.provisioningLeases.acquire("project-claiming", "live-claim", 60_000);

  const cleaningContainerId = await addWarmResources(fixture, "cleaning-slot", "cleaning-resource");
  fixture.store.seedReady({
    id: "cleaning-slot",
    resourceKey: "cleaning-resource",
    containerId: cleaningContainerId,
    llmGatewayKeyId: "cleaning-key",
    secretPayload: "cleaning-secret"
  });
  await fixture.store.claim("project-cleaning");
  runtime.deleteProject("project-cleaning");
  await fixture.store.acquireCleanup("cleaning-slot", "claiming", {
    ownerId: "live-cleaner",
    now: start.toISOString(),
    expiresAt: afterLeaseExpiry.toISOString()
  });

  await fixture.pool.reconcile();
  assert.deepEqual(
    (await fixture.store.list()).map((slot) => slot.state).sort(),
    ["claiming", "cleaning"]
  );

  const sweep = startWarmPoolSweep(fixture.pool, { intervalMs: 10 });
  t.after(() => sweep.stop());
  runtime.advance(60_001);
  fixture.setNow(afterLeaseExpiry);
  t.mock.timers.tick(10);
  await new Promise(setImmediate);

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas.sort(), ["claiming-resource", "cleaning-resource"]);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.docker.state.volumes.length, 0);
});
