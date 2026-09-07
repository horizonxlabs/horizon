import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createFixture } from "./workspace-orchestrator-warm-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { cleanupWarmSlotResources } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-cleanup.ts";

async function assignedWorkspace() {
  const fixture = await createFixture();
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_alpha",
    slug: "alpha"
  });
  assert.equal(record.resourceKey, "warm-resource-1");
  return { ...fixture, record };
}

test("hydration preserves a running assigned physical container", async () => {
  const fixture = await assignedWorkspace();
  const restarted = createWorkspaceOrchestrator(fixture.deps);
  await restarted.hydrateRuntimeRecords(fixture.deps.runtimeRecords);
  const hydrated = restarted.getWorkspace("prj_alpha");
  assert.equal(hydrated.state, "running");
  assert.equal(hydrated.containerId, fixture.record.containerId);
  assert.equal(hydrated.projectId, "prj_alpha");
});

test("wake recreates the assigned physical container and preview base on its existing volume", async () => {
  const fixture = await assignedWorkspace();
  await fixture.orchestrator.stopWorkspace("prj_alpha");
  await fixture.deps.docker.removeContainer(fixture.record.containerId);
  const volumes = structuredClone(fixture.deps.docker.state.volumes);
  const record = await fixture.orchestrator.wakeWorkspace("prj_alpha");
  const container = await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1");
  assert.ok(container, "wake must recreate the physical container");
  assert.equal(record.containerId, container.containerId);
  assert.ok(container.env.includes("EVCP_PREVIEW_BASE=/preview/warm-resource-1"));
  const spec = fixture.deps.docker.state.containers[0].spec;
  assert.equal(spec.hostConfig.Mounts[0].Source, "evcp-ws-warm-resource-1-data");
  assert.equal(spec.labels["evcp.project-id"], "prj_alpha");
  assert.deepEqual(fixture.deps.docker.state.volumes, volumes);
  assert.deepEqual(fixture.coldCalls, []);
});

test("archive locates the assigned physical container when the persisted ID is stale", async () => {
  const fixture = await assignedWorkspace();
  const original = fixture.deps.docker.state.containers[0].spec;
  await fixture.deps.docker.removeContainer(fixture.record.containerId);
  await fixture.deps.docker.createContainer({ ...original, name: "evcp-ws-prj-alpha" });
  const replacement = await fixture.deps.docker.createContainer(original);
  await fixture.deps.docker.startContainer(replacement.containerId);
  const volumes = structuredClone(fixture.deps.docker.state.volumes);

  const archived = await fixture.orchestrator.archiveWorkspace("prj_alpha");
  assert.equal(
    (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1")) === null,
    true,
    "physical container removed"
  );
  assert.equal(archived.state, "archived");
  assert.equal(archived.resourceKey, "warm-resource-1");
  assert.equal(archived.containerId, null);
  assert.ok(await fixture.deps.docker.inspectContainer("evcp-ws-prj-alpha"));
  assert.deepEqual(fixture.deps.docker.state.volumes, volumes);
  assert.deepEqual(fixture.localCleanup, []);
  assert.ok((await fixture.orchestrator.listSecretNames("prj_alpha")).length > 0);
});

test("delete releases physical resources while retaining an unrelated logical-name container", async () => {
  const fixture = await assignedWorkspace();
  await fixture.deps.docker.createContainer({
    ...fixture.deps.docker.state.containers[0].spec,
    name: "evcp-ws-prj-alpha"
  });

  await fixture.orchestrator.deleteWorkspace("prj_alpha");
  assert.equal(
    (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1")) === null,
    true,
    "physical container removed"
  );
  assert.ok(await fixture.deps.docker.inspectContainer("evcp-ws-prj-alpha"));
  assert.equal(fixture.deps.docker.state.volumes.length, 0);
  assert.deepEqual(fixture.localCleanup, ["warm-resource-1", "warm-resource-1", "key-1"]);
  assert.deepEqual(await fixture.orchestrator.listSecretNames("prj_alpha"), []);
  assert.equal(fixture.snapshots.has("prj_alpha"), false);
  assert.equal(fixture.orchestrator.getWorkspace("prj_alpha"), null);
});

for (const claimProjectId of [null, "prj_alpha"]) {
  test(`cleanup locates the physical container with no saved ID (${claimProjectId ?? "anonymous"})`, async () => {
    const fixture = createWarmPoolFixture({ targetSize: 1 });
    await fixture.pool.ensureCapacity();
    const [slot] = await fixture.store.list();
    await fixture.docker.createContainer({
      ...fixture.docker.state.containers[0].spec,
      name: "evcp-ws-prj-alpha"
    });
    await cleanupWarmSlotResources(fixture.deps, { ...slot, containerId: null, claimProjectId });
    assert.equal(
      (await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")) === null,
      true,
      "physical container removed"
    );
    assert.ok(await fixture.docker.inspectContainer("evcp-ws-prj-alpha"));
    assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
    assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
    assert.deepEqual(fixture.revokedKeys, ["key-1"]);
  });
}

test("cleanup preserves a physical allocation held by any durable runtime owner", async () => {
  const fixture = await assignedWorkspace();
  await cleanupWarmSlotResources(fixture.deps, { ...fixture.slot, claimProjectId: "prj_other" });
  assert.equal(
    (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1")) !== null,
    true
  );
  assert.equal(fixture.deps.docker.state.volumes.length, 1);
  assert.deepEqual(fixture.localCleanup, []);
});

for (const operation of ["hydrate", "wakeWorkspace", "archiveWorkspace", "deleteWorkspace"]) {
  test(`${operation} never adopts an unrelated logical container when the physical one is absent`, async () => {
    const fixture = await assignedWorkspace();
    const decoy = await fixture.deps.docker.createContainer({
      ...fixture.deps.docker.state.containers[0].spec,
      name: "evcp-ws-prj-alpha"
    });
    await fixture.deps.docker.startContainer(decoy.containerId);
    if (operation === "wakeWorkspace") await fixture.orchestrator.stopWorkspace("prj_alpha");
    await fixture.deps.docker.removeContainer(fixture.record.containerId);
    if (operation === "hydrate") {
      const restarted = createWorkspaceOrchestrator(fixture.deps);
      await restarted.hydrateRuntimeRecords(fixture.deps.runtimeRecords);
      assert.equal(restarted.getWorkspace("prj_alpha").state, "idle");
    } else {
      await fixture.orchestrator[operation]("prj_alpha");
    }
    const preserved = await fixture.deps.docker.inspectContainer("evcp-ws-prj-alpha");
    assert.equal(preserved?.containerId, decoy.containerId);
    assert.equal(preserved?.running, true);
    if (operation === "wakeWorkspace") {
      const awake = fixture.orchestrator.getWorkspace("prj_alpha");
      assert.notEqual(awake.containerId, decoy.containerId);
      assert.equal(awake.resourceKey, "warm-resource-1");
    }
  });
}

test("cleanup stops after a physical inspection when the allocation fence is lost", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const [slot] = await fixture.store.list();
  const inspect = fixture.docker.inspectContainer.bind(fixture.docker);
  let owned = true;
  fixture.docker.inspectContainer = async (name) => {
    const found = await inspect(name);
    owned = false;
    return found;
  };
  await assert.rejects(
    cleanupWarmSlotResources(fixture.deps, slot, async () => {
      if (!owned) throw new Error("allocation fence lost");
    }),
    /allocation fence lost/
  );
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
});
