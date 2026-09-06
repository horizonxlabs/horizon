import assert from "node:assert/strict";
import test from "node:test";
import { buildDevContainerSpec } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

async function createOrphanRaceFixture() {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords });
  await fixture.pool.ensureCapacity();
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
  return { ...fixture, persistence, runtimeRecords, orchestrator };
}

async function addUnassignedProjectContainer(fixture) {
  await fixture.docker.ensureVolume("evcp-ws-prj-orphan-data", {
    "evcp.managed": "true",
    "evcp.project-id": "prj_orphan",
    "evcp.kind": "workspace-data"
  });
  const { containerId } = await fixture.docker.createContainer(
    buildDevContainerSpec({
      projectId: "prj_orphan",
      slug: "prj-orphan",
      image: "evcp/workspace-next:1",
      env: {},
      cpuCores: 1,
      memoryMb: 2048,
      network: "evcp-internal",
      workspaceVolume: "evcp-ws-prj-orphan-data"
    })
  );
  await fixture.docker.startContainer(containerId);
  return containerId;
}

test("generic orphan cleanup leaves both container and volume untouched while a project lease is live", async () => {
  const fixture = await createOrphanRaceFixture();
  await addUnassignedProjectContainer(fixture);
  await fixture.runtimeRecords.provisioningLeases.acquire("prj_orphan", "live-owner", 10_000);
  assert.deepEqual(await fixture.orchestrator.cleanupOrphanContainers(), []);
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-orphan")) !== null, true);
  assert.equal(
    (await fixture.docker.listManagedVolumes()).some(
      ({ name }) => name === "evcp-ws-prj-orphan-data"
    ),
    true
  );
});

for (const failure of ["acquire", "runtime-read", "claim-read", "lost-lease"]) {
  test(`generic orphan cleanup fails closed on ${failure} at its leased deletion boundary`, async () => {
    const fixture = await createOrphanRaceFixture();
    await addUnassignedProjectContainer(fixture);
    if (failure === "acquire") {
      const execute = fixture.persistence.client.$executeRawUnsafe;
      fixture.persistence.client.$executeRawUnsafe = async (...args) => {
        if (args[0].trimStart().startsWith("INSERT INTO"))
          throw new Error("lease database unavailable");
        return execute(...args);
      };
    } else if (failure === "runtime-read") {
      const findMany = fixture.persistence.client.workspaceRuntimeRecord.findMany;
      let reads = 0;
      fixture.persistence.client.workspaceRuntimeRecord.findMany = async (...args) => {
        if (++reads === 2) throw new Error("runtime database unavailable");
        return findMany(...args);
      };
    } else if (failure === "claim-read") {
      const list = fixture.store.list;
      let reads = 0;
      fixture.store.list = async () => {
        if (++reads === 3) throw new Error("claim database unavailable");
        return list();
      };
    } else {
      const inspect = fixture.docker.inspectContainer;
      let expired = false;
      fixture.docker.inspectContainer = async (name) => {
        if (name === "evcp-ws-prj-orphan" && !expired) {
          expired = true;
          fixture.persistence.advance(300_001);
          await fixture.runtimeRecords.provisioningLeases.acquire(
            "prj_orphan",
            "successor",
            10_000
          );
        }
        return inspect(name);
      };
    }
    await assert.rejects(
      fixture.orchestrator.cleanupOrphanContainers(),
      /unavailable|lease is no longer owned/
    );
    assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-orphan")) !== null, true);
    assert.equal(
      (await fixture.docker.listManagedVolumes()).some(
        ({ name }) => name === "evcp-ws-prj-orphan-data"
      ),
      true
    );
  });
}

for (const disposition of ["claiming", "assigned"]) {
  test(`orphan cleanup protects a ready slot that becomes ${disposition} after its ID snapshots`, async () => {
    const fixture = await createOrphanRaceFixture();
    const inventory = fixture.docker.listManagedContainers;
    let handoff = false;
    fixture.docker.listManagedContainers = async () => {
      if (!handoff) {
        handoff = true;
        await fixture.runtimeRecords.provisioningLeases.acquire("prj_late", "claimant", 10_000);
        const allocation = await fixture.pool.claim("prj_late");
        await fixture.docker.removeContainer(allocation.containerId);
        const { containerId } = await fixture.docker.createContainer(
          buildDevContainerSpec({
            projectId: "prj_late",
            slug: "prj-late",
            image: "evcp/workspace-next:1",
            env: { ...allocation.env, EVCP_PREVIEW_BASE: "/preview/prj-late" },
            cpuCores: 1,
            memoryMb: 2048,
            network: "evcp-internal",
            workspaceVolume: "evcp-ws-warm-resource-1-data"
          })
        );
        await fixture.docker.startContainer(containerId);
        if (disposition === "assigned") {
          await fixture.runtimeRecords.save({
            record: {
              id: "ws-prj-late",
              projectId: "prj_late",
              slug: "late",
              resourceKey: "warm-resource-1",
              state: "running",
              containerId,
              cpuCores: 1,
              memoryMb: 2048,
              lastActivityAt: "2026-09-05T00:00:00.000Z",
              createdAt: "2026-09-05T00:00:00.000Z",
              updatedAt: "2026-09-05T00:00:00.000Z"
            },
            llmGatewayKeyId: "key-1"
          });
          await fixture.pool.completeClaim(allocation.slotId);
        }
        await fixture.runtimeRecords.provisioningLeases.release("prj_late", "claimant");
      }
      return inventory();
    };
    await fixture.orchestrator.cleanupOrphanContainers();
    assert.equal(handoff, true);
    assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-late")) !== null, true);
    assert.equal(
      (await fixture.docker.listManagedVolumes()).some(
        ({ name }) => name === "evcp-ws-warm-resource-1-data"
      ),
      true
    );
    assert.deepEqual(fixture.releasedSchemas, []);
  });
}
