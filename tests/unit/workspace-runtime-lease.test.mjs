import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";

const snapshot = {
  record: {
    id: "ws-prj-shared",
    projectId: "prj_shared",
    resourceKey: "warm-resource-1",
    slug: "shared",
    state: "running",
    containerId: "winner",
    cpuCores: 1,
    memoryMb: 2048,
    lastActivityAt: "2026-09-05T00:00:00.000Z",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z"
  },
  llmGatewayKeyId: "warm-key-1"
};

test("runtime provisioning leases atomically exclude another replica until expiry", async () => {
  const fixture = createRuntimeLeaseFixture();
  const first = fixture.createStore().provisioningLeases;
  const second = fixture.createStore().provisioningLeases;
  const results = await Promise.all([
    first.acquire("prj_shared", "first", 1000),
    second.acquire("prj_shared", "second", 1000)
  ]);
  assert.deepEqual(results, [true, false]);
  fixture.advance(999);
  assert.equal(await second.acquire("prj_shared", "second", 1000), false);
  fixture.advance(1);
  assert.equal(await second.acquire("prj_shared", "second", 1000), true);
  assert.equal(await first.renew("prj_shared", "first", 1000), false);
});

test("expired owners cannot save or roll back the durable winner and cannot release its lease", async () => {
  const fixture = createRuntimeLeaseFixture();
  const store = fixture.createStore();
  const leases = store.provisioningLeases;
  await leases.acquire("prj_shared", "old", 1000);
  fixture.advance(1000);
  assert.equal(await leases.save(snapshot, "old", 1000), false);
  await leases.acquire("prj_shared", "winner", 1000);
  assert.equal(await leases.save(snapshot, "winner", 1000), true);
  assert.equal(
    await leases.save(
      { ...snapshot, record: { ...snapshot.record, resourceKey: "prj-shared" } },
      "old",
      1000
    ),
    false
  );
  assert.equal(await leases.remove("prj_shared", "old", 1000), false);
  await leases.release("prj_shared", "old");
  assert.equal(await leases.acquire("prj_shared", "intruder", 1000), false);
  assert.equal((await store.list())[0].record.resourceKey, "warm-resource-1");
  assert.equal(await leases.remove("prj_shared", "winner", 1000), true);
  assert.deepEqual(await store.list(), []);
});
