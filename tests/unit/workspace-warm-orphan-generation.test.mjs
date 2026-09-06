import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { cleanupOrphanWorkspaceResources } from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";

test("anonymous orphan cleanup preserves resources when fresh ownership checking is unavailable", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  assert.deepEqual(
    await cleanupOrphanWorkspaceResources({ docker: fixture.docker, activeProjectIds: new Set() }),
    []
  );
});

for (const inventory of ["listManagedContainers", "listManagedVolumes"]) {
  test(`warm orphan ${inventory} preserves a generation prepared by a second manager after ownership snapshots`, async () => {
    const fixture = createWarmPoolFixture({ targetSize: 1 });
    const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
    const list = fixture.docker[inventory];
    let prepared = false;
    fixture.docker[inventory] = async () => {
      if (!prepared) {
        prepared = true;
        await fixture.createPool().ensureCapacity();
      }
      return list();
    };
    assert.deepEqual(await orchestrator.cleanupOrphanContainers(), []);
    const [slot] = await fixture.store.list();
    assert.equal(slot.state, "ready");
    assert.equal(
      (await fixture.docker.inspectContainer(`evcp-ws-${slot.resourceKey}`))?.running,
      true
    );
    assert.equal(fixture.docker.state.volumes.length, 1);
  });
}

for (const inventory of ["listManagedContainers", "listManagedVolumes"]) {
  test(`warm orphan ${inventory} fails closed when the fresh ownership query fails`, async () => {
    const fixture = createWarmPoolFixture({ targetSize: 1 });
    const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
    const list = fixture.docker[inventory];
    fixture.docker[inventory] = async () => {
      await fixture.createPool().ensureCapacity();
      fixture.store.list = async () => {
        throw new Error("ownership unavailable");
      };
      return list();
    };
    await assert.rejects(orchestrator.cleanupOrphanContainers(), /ownership unavailable/);
    assert.equal(fixture.docker.state.containers.length, 1);
    assert.equal(fixture.docker.state.volumes.length, 1);
  });
}

test("fresh warm ownership check reads runtime after a claim retires during its slot query", async () => {
  const snapshots = [];
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: { list: async () => snapshots }
  });
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
  const inventory = fixture.docker.listManagedVolumes;
  fixture.docker.listManagedVolumes = async () => {
    await fixture.createPool().ensureCapacity();
    const allocation = await fixture.pool.claim("prj_new");
    const list = fixture.store.list;
    fixture.store.list = async () => {
      snapshots.push({ record: { projectId: "prj_new", resourceKey: allocation.resourceKey } });
      fixture.store.list = list;
      await fixture.pool.completeClaim(allocation.slotId);
      return list();
    };
    return inventory();
  };
  assert.deepEqual(await orchestrator.cleanupOrphanContainers(), []);
  assert.equal(fixture.docker.state.volumes.length, 1);
});
