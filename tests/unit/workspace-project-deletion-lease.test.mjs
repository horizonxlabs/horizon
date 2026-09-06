import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { runWorkspaceProjectDeletion } from "../../apps/platform-api/src/workspace-orchestrator/project-deletion-ownership.ts";

for (const status of ["deleting", "deleted"]) {
  test(`provisioning acquisition atomically rejects a ${status} project tombstone`, async () => {
    const fixture = createRuntimeLeaseFixture();
    fixture.lifecycleStates.set("prj_delete", { status, epoch: 1 });
    assert.equal(
      await fixture.createStore().provisioningLeases.acquire("prj_delete", "new-owner", 1000),
      "deleting_project"
    );
    assert.equal(fixture.leases.has("prj_delete"), false);
  });
}

test("a tombstone after project cascade reports definite absence for orphan cleanup without acquiring ownership", async () => {
  const fixture = createRuntimeLeaseFixture();
  fixture.lifecycleStates.set("prj_gone", { status: "deleted", epoch: 1 });
  fixture.deleteProject("prj_gone");
  assert.equal(
    await fixture.createStore().provisioningLeases.acquire("prj_gone", "late", 1000),
    "missing_project"
  );
  assert.equal(fixture.leases.has("prj_gone"), false);
});

test("a malformed project-presence response cannot authorize orphan cleanup", async () => {
  const fixture = createRuntimeLeaseFixture();
  fixture.lifecycleStates.set("prj_delete", { status: "deleting", epoch: 1 });
  const query = fixture.client.$queryRawUnsafe;
  fixture.client.$queryRawUnsafe = async (...args) =>
    args[0].includes('FROM "projects"') ? [{}] : query(...args);
  await assert.rejects(
    () => fixture.createStore().provisioningLeases.acquire("prj_delete", "late", 1000),
    /presence lookup/
  );
});

test("deletion ownership requires the exact current deletion epoch and drains the preceding provisioner", async () => {
  const fixture = createRuntimeLeaseFixture();
  const leases = fixture.createStore().provisioningLeases;
  assert.equal(await leases.acquire("prj_delete", "provisioner", 1000), "acquired");
  fixture.lifecycleStates.set("prj_delete", {
    status: "deleting",
    epoch: 2,
    deletion_owner_id: "delete-owner",
    deletion_lease_current: true
  });
  assert.equal(
    await leases.acquire("prj_delete", "deleter", 1000, { ownerId: "delete-owner", epoch: 1 }),
    "deleting_project"
  );
  assert.equal(
    await leases.acquire("prj_delete", "deleter", 1000, { ownerId: "delete-owner", epoch: 2 }),
    "contended"
  );
  fixture.advance(1001);
  assert.equal(
    await leases.acquire("prj_delete", "deleter", 1000, { ownerId: "delete-owner", epoch: 2 }),
    "acquired"
  );
  assert.equal(
    await leases.save({ record: { projectId: "prj_delete" } }, "provisioner", 1000),
    false
  );
  assert.equal(fixture.records.has("prj_delete"), false);
});

test("outer workspace ownership renews across external cleanup and cascade and releases afterward", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const fixture = createRuntimeLeaseFixture();
  const runtimeRecords = fixture.createStore();
  const authority = { ownerId: "delete-owner", epoch: 1 };
  fixture.lifecycleStates.set("prj_delete", {
    status: "deleting",
    epoch: 1,
    deletion_owner_id: "delete-owner",
    deletion_lease_current: true
  });
  await runWorkspaceProjectDeletion(
    { runtimeRecords, docker: {} },
    "prj_delete",
    { ...authority, assertCurrent: async () => {} },
    async (fence) => {
      for (const phase of ["external cleanup", "cascade"]) {
        fixture.advance(200000);
        t.mock.timers.tick(100000);
        await new Promise(setImmediate);
        fixture.advance(100000);
        assert.equal(
          await runtimeRecords.provisioningLeases.acquire(
            "prj_delete",
            `other-${phase}`,
            1000,
            authority
          ),
          "contended"
        );
        await fence.assertCurrent();
      }
    }
  );
  assert.equal(fixture.leases.has("prj_delete"), false);
});
