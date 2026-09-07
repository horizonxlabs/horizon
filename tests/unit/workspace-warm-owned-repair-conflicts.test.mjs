import assert from "node:assert/strict";
import test from "node:test";
import { createRetainedRuntimeFixture } from "./workspace-warm-owned-repair-fixture.mjs";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";

for (const path of ["startup", "cleanup-retry", "startup-cleanup-race"]) {
  for (const secrets of ["missing", "partial", "complete"]) {
    test(`${path} preserves cross-owner preparation with ${secrets} managed secrets`, async () => {
      const fixture = await createRetainedRuntimeFixture();
      await fixture.runtimeRecords.remove("prj_rollback");
      const owner = {
        ...fixture.snapshot,
        record: { ...fixture.snapshot.record, id: "ws-beta", projectId: "prj_beta", slug: "beta" }
      };
      if (path !== "startup-cleanup-race") await fixture.runtimeRecords.save(owner);
      if (secrets !== "missing")
        await fixture.deps.secrets.put("prj_beta", "DATABASE_URL", "newer-owner-value");
      if (secrets === "complete")
        for (const name of Object.keys(fixture.expectedEnv).filter(
          (name) => name !== "DATABASE_URL"
        ))
          await fixture.deps.secrets.put("prj_beta", name, `owner-${name}`);
      const encryptedBefore = JSON.stringify([...fixture.secretSql.rows]);
      const [retained] = await fixture.store.list();
      const replica = fixture.createReplica();
      if (path === "startup-cleanup-race") {
        // A failed claim skips adoption; B appears only after the cleanup CAS, beyond recovery's check.
        await fixture.runtimeRecords.save(fixture.snapshot);
        await fixture.pool.failClaim(fixture.slot.id, new Error("retry cleanup"), async () => {});
        await fixture.runtimeRecords.remove("prj_rollback");
        const failed = (await fixture.store.list()).find(({ id }) => id === fixture.slot.id);
        fixture.setNow(new Date(failed.retryAfter));
        const acquire = fixture.store.acquireCleanup.bind(fixture.store);
        fixture.store.acquireCleanup = async (...args) => {
          const acquired = await acquire(...args);
          if (acquired?.id === fixture.slot.id) await fixture.runtimeRecords.save(owner);
          return acquired;
        };
        const drain = createWorkspaceWarmPool({
          deps: fixture.deps,
          store: fixture.store,
          codec: createWarmPoolSecretCodec("1".repeat(64)),
          targetSize: 0,
          now: () => new Date(failed.retryAfter)
        });
        await drain.reconcile();
      } else if (path === "startup") {
        await replica.boot();
        await replica.pool.reconcile();
      } else {
        await fixture.pool.failClaim(fixture.slot.id, new Error("retry cleanup"), async () => {});
        const failed = (await fixture.store.list()).find(({ id }) => id === fixture.slot.id);
        fixture.setNow(new Date(failed.retryAfter));
        await fixture.pool.ensureCapacity();
      }
      const protectedSlot = (await fixture.store.list()).find(({ id }) => id === fixture.slot.id);
      assert.ok(
        protectedSlot,
        "conflicting ownership must preserve the preparation for safe retry"
      );
      assert.equal(protectedSlot.resourceKey, retained.resourceKey);
      assert.equal(protectedSlot.claimProjectId, "prj_rollback");
      assert.equal(["ready", "preparing"].includes(protectedSlot.state), false);
      assert.equal(protectedSlot.secretPayload === retained.secretPayload, true);
      assert.deepEqual(await fixture.runtimeRecords.list(), [owner]);
      assert.deepEqual(await fixture.deps.secrets.listNames("prj_rollback"), []);
      assert.equal(JSON.stringify([...fixture.secretSql.rows]) === encryptedBefore, true);
      const container = await fixture.docker.inspectContainer("evcp-ws-warm-resource-1");
      assert.equal(container.containerId, retained.containerId);
      assert.equal(container.running, true);
      assert.equal(
        (await fixture.docker.listManagedVolumes()).some(
          ({ name }) => name === "evcp-ws-warm-resource-1-data"
        ),
        true
      );
      assert.deepEqual(fixture.releasedSchemas, []);
      assert.deepEqual(fixture.releasedBuckets, []);
      assert.deepEqual(fixture.revokedKeys, []);
      const audit = JSON.stringify(fixture.audits);
      assert.equal(
        Object.values(fixture.expectedEnv).some((value) => audit.includes(value)),
        false
      );
    });
  }
}

test("duplicate durable ownership cannot retire preparation even when claimant secrets are complete", async () => {
  const fixture = await createRetainedRuntimeFixture();
  for (const [name, value] of Object.entries(fixture.expectedEnv))
    await fixture.deps.secrets.put("prj_rollback", name, value);
  await fixture.runtimeRecords.save({
    ...fixture.snapshot,
    record: { ...fixture.snapshot.record, projectId: "prj_beta", id: "ws-beta", slug: "beta" }
  });
  const before = JSON.stringify([...fixture.secretSql.rows]);
  await fixture.createReplica().boot();
  const retained = (await fixture.store.list()).find(({ id }) => id === fixture.slot.id);
  assert.ok(retained);
  assert.equal(retained.secretPayload === fixture.slot.secretPayload, true);
  assert.equal(JSON.stringify([...fixture.secretSql.rows]) === before, true);
  assert.deepEqual(await fixture.deps.secrets.listNames("prj_beta"), []);
  assert.equal((await fixture.runtimeRecords.list()).length, 2);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
});
