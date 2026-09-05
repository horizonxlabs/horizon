import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import {
  workspaceVolumeName,
  workspaceWarmResourceLabels
} from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";

test("zero target drains unclaimed ready slots without deleting assigned runtime resources", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 0, runtimeRecords: runtimeStore });
  const createSlotResources = async (slotId, resourceKey) => {
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
  };
  const assignedContainerId = await createSlotResources("assigned-slot", "assigned-resource");
  fixture.store.seedReady({
    id: "assigned-slot",
    resourceKey: "assigned-resource",
    containerId: assignedContainerId,
    llmGatewayKeyId: "assigned-key",
    secretPayload: "assigned-secret"
  });
  await fixture.store.claim("project-live");
  await runtimeStore.save({
    record: {
      id: "ws-project-live",
      projectId: "project-live",
      slug: "live",
      resourceKey: "assigned-resource",
      state: "running",
      containerId: assignedContainerId,
      cpuCores: 1,
      memoryMb: 2048,
      lastActivityAt: "2026-09-05T00:00:00.000Z",
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z"
    }
  });
  const unclaimedContainerId = await createSlotResources("unclaimed-slot", "unclaimed-resource");
  fixture.store.seedReady({
    id: "unclaimed-slot",
    resourceKey: "unclaimed-resource",
    containerId: unclaimedContainerId,
    llmGatewayKeyId: "unclaimed-key",
    secretPayload: "unclaimed-secret"
  });

  await fixture.pool.reconcile();

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["unclaimed-resource"]);
  assert.deepEqual(fixture.releasedBuckets, ["unclaimed-resource"]);
  assert.deepEqual(fixture.revokedKeys, ["unclaimed-key"]);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.equal((await runtimeStore.list())[0].record.resourceKey, "assigned-resource");
});
