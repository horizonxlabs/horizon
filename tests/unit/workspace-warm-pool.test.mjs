import assert from "node:assert/strict";
import test from "node:test";

import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test("ensureCapacity prepares exactly the missing slots", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3, readySlots: 1 });

  await fixture.pool.ensureCapacity();

  assert.equal((await fixture.store.list()).filter((slot) => slot.state === "ready").length, 3);
  assert.equal(
    fixture.docker.state.containers.filter((item) => item.status === "running").length,
    2
  );
});

test("parallel ensureCapacity calls collapse into one preparation pass", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3 });

  await Promise.all([fixture.pool.ensureCapacity(), fixture.pool.ensureCapacity()]);

  assert.equal((await fixture.store.list()).length, 3);
  assert.equal(fixture.prepareAttempts, 3);
});

test("two managers sharing a durable store never reserve beyond target capacity", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3 });
  const secondManager = fixture.createPool();

  await Promise.all([fixture.pool.ensureCapacity(), secondManager.ensureCapacity()]);

  const slots = await fixture.store.list();
  assert.equal(slots.length, 3);
  assert.equal(slots.filter((slot) => slot.state === "ready").length, 3);
});

test("preparation persists resource and container ownership before start and readiness", async () => {
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    previewExitCode: 1,
    cleanupFailure: "schema"
  });
  let beforeContainerCreate;
  let beforeContainerStart;
  const createContainer = fixture.docker.createContainer.bind(fixture.docker);
  fixture.docker.createContainer = async (spec) => {
    [beforeContainerCreate] = await fixture.store.list();
    return createContainer(spec);
  };
  const startContainer = fixture.docker.startContainer.bind(fixture.docker);
  fixture.docker.startContainer = async (containerId) => {
    [beforeContainerStart] = await fixture.store.list();
    return startContainer(containerId);
  };

  await fixture.pool.ensureCapacity();

  assert.equal(beforeContainerCreate.state, "preparing");
  assert.equal(beforeContainerCreate.llmGatewayKeyId, "key-1");
  assert.ok(beforeContainerCreate.secretPayload);
  assert.equal(beforeContainerCreate.containerId, null);
  assert.equal(beforeContainerStart.state, "preparing");
  assert.match(beforeContainerStart.containerId, /^mem-/);
  const [failed] = await fixture.store.list();
  assert.equal(failed.state, "failed");
  assert.equal(failed.llmGatewayKeyId, "key-1");
  assert.ok(failed.secretPayload);
  assert.match(failed.containerId, /^mem-/);
});

test("a slot is ready only after preview health succeeds", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });

  await fixture.pool.ensureCapacity();

  assert.equal((await fixture.store.list())[0].state, "failed");
  assert.equal(fixture.revokedKeys.length, 1);
  assert.equal(fixture.releasedSchemas.length, 1);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.audits.at(-1).action, "workspace.pool_prepare_failed");
  assert.equal(fixture.audits.at(-1).metadata.errorCategory, "preview_unhealthy");
  assert.equal(fixture.audits.at(-1).metadata.failedCount, 1);
});

test("preparation failure applies bounded exponential retry", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });

  await fixture.pool.ensureCapacity();
  await fixture.pool.ensureCapacity();

  assert.equal(fixture.prepareAttempts, 1);
  assert.equal((await fixture.store.list())[0].retryAfter, "2026-09-05T00:00:05.000Z");
});

test("replacement failures preserve exponential history and cap retries at five minutes", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();

  for (let failureCount = 2; failureCount <= 7; failureCount += 1) {
    const failed = (await fixture.store.list())[0];
    fixture.setNow(new Date(failed.retryAfter));
    await fixture.pool.ensureCapacity();
    assert.equal((await fixture.store.list())[0].failureCount, failureCount);
  }

  const failed = (await fixture.store.list())[0];
  assert.equal(failed.retryAfter, "2026-09-05T00:10:15.000Z");
});

test("an expired failed slot restarts its durable retry row", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  const failedId = (await fixture.store.list())[0].id;
  fixture.previewExitCode = 0;
  fixture.setNow(new Date("2026-09-05T00:00:05.000Z"));

  await fixture.pool.ensureCapacity();

  const slots = await fixture.store.list();
  assert.equal(slots.length, 1);
  assert.equal(slots[0].id, failedId);
  assert.equal(slots[0].state, "ready");
});

test("prepared slots and audit metadata are anonymous and contain no decrypted secrets", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });

  await fixture.pool.ensureCapacity();

  const slot = (await fixture.store.list())[0];
  const container = fixture.docker.state.containers[0];
  assert.equal(container.spec.labels["evcp.project-id"], undefined);
  assert.equal(container.spec.labels["evcp.kind"], "workspace-warm");
  assert.equal(container.spec.labels["evcp.warm-slot-id"], slot.id);
  assert.equal(fixture.docker.state.volumes[0].labels["evcp.project-id"], undefined);
  assert.equal(fixture.docker.state.volumes[0].labels["evcp.kind"], "workspace-warm");
  assert.doesNotMatch(slot.secretPayload, /pg-secret|storage-secret|llm-secret/);
  assert.doesNotMatch(JSON.stringify(fixture.audits), /pg-secret|storage-secret|llm-secret/);
  assert.deepEqual(
    fixture.audits.map((event) => event.action),
    ["workspace.pool_prepare_started", "workspace.pool_ready"]
  );
});

test("claim opens the prepared allocation and completeClaim retires its slot", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();

  const allocation = await fixture.pool.claim("prj_new");

  assert.ok(allocation);
  assert.equal(allocation.env.LLM_GATEWAY_KEY, "llm-secret-1");
  assert.equal((await fixture.store.list())[0].claimProjectId, "prj_new");
  await fixture.pool.completeClaim(allocation.slotId);
  assert.equal((await fixture.store.list()).length, 0);
});

test("a disabled zero-target pool never claims an existing ready allocation", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 0, readySlots: 1 });

  assert.equal(await fixture.pool.claim("prj_cold"), null);
  assert.equal((await fixture.store.list())[0].state, "ready");
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("concurrent claims across pool managers allocate a ready slot only once", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const results = await Promise.all([
    fixture.pool.claim("prj_first"),
    fixture.createPool().claim("prj_second")
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const [slot] = await fixture.store.list();
  assert.equal(slot.state, "claiming");
  assert.equal(slot.claimProjectId, "prj_first");
});

test("a project with an existing claim cannot consume another ready slot", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 2 });
  await fixture.pool.ensureCapacity();
  const original = await fixture.pool.claim("prj_existing_claim");
  assert.ok(original);
  assert.equal(await fixture.pool.claim("prj_existing_claim"), null);
  const slots = await fixture.store.list();
  assert.equal(slots.filter((slot) => slot.state === "claiming").length, 1);
  assert.equal(slots.filter((slot) => slot.state === "ready").length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("a racing project-claim uniqueness conflict returns no allocation without cleanup", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  fixture.store.claim = async () => {
    throw Object.assign(new Error("unique project claim"), {
      code: "P2002",
      meta: { target: ["claim_project_id"] }
    });
  };
  assert.equal(await fixture.pool.claim("prj_conflict"), null);
  assert.equal((await fixture.store.list())[0].state, "ready");
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("an unreadable claimed envelope is quarantined with sanitized audit and asynchronous refill", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const [slot] = await fixture.store.list();
  await fixture.store.markReady(slot.id, { ...slot, secretPayload: "invalid-secret-envelope" });
  let refillRequested = false;
  fixture.pool.ensureCapacity = () => {
    refillRequested = true;
    return new Promise(() => {});
  };

  assert.equal(await fixture.pool.claim("prj_corrupt"), null);

  assert.equal((await fixture.store.list()).length, 0);
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
  const event = fixture.audits.at(-1);
  assert.equal(event.action, "workspace.pool_claim_failed");
  assert.equal(event.projectId, "prj_corrupt");
  assert.doesNotMatch(
    JSON.stringify(event),
    /invalid-secret-envelope|pg-secret|storage-secret|llm-secret/
  );
  assert.equal(refillRequested, true);
});

test("failClaim destroys every slot-owned resource and retires its row", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const allocation = await fixture.pool.claim("prj_broken");
  assert.ok(allocation);

  await fixture.pool.failClaim(allocation.slotId, new Error("handoff exposed-secret-value failed"));

  assert.equal((await fixture.store.list()).length, 0);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.docker.state.volumes.length, 0);
  assert.deepEqual(fixture.releasedSchemas, [allocation.resourceKey]);
  assert.deepEqual(fixture.releasedBuckets, [allocation.resourceKey]);
  assert.deepEqual(fixture.revokedKeys, [allocation.llmGatewayKeyId]);
  assert.doesNotMatch(JSON.stringify(fixture.audits), /exposed-secret-value/);
});

for (const cleanupFailure of ["key", "schema", "bucket", "volume"]) {
  test(`a ${cleanupFailure} cleanup failure retains the quarantined row until a successful retry`, async () => {
    const fixture = createWarmPoolFixture({ targetSize: 1, cleanupFailure });
    await fixture.pool.ensureCapacity();
    const allocation = await fixture.pool.claim(`prj_${cleanupFailure}_failure`);
    assert.ok(allocation);

    await fixture.pool.failClaim(allocation.slotId, new Error("handoff failed"));

    const [quarantined] = await fixture.store.list();
    assert.equal(quarantined.id, allocation.slotId);
    assert.equal(quarantined.state, "failed");
    assert.equal(quarantined.containerId, allocation.containerId);
    assert.equal(quarantined.llmGatewayKeyId, allocation.llmGatewayKeyId);
    assert.ok(quarantined.secretPayload);

    fixture.setNow(new Date(quarantined.retryAfter));
    await fixture.pool.ensureCapacity();

    const slots = await fixture.store.list();
    assert.equal(slots.some((slot) => slot.id === allocation.slotId), true);
    assert.equal(slots.filter((slot) => slot.state === "ready").length, 1);
  });
}
