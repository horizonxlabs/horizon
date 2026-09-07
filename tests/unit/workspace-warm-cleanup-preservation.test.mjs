import assert from "node:assert/strict";
import test from "node:test";
import { createRetainedRuntimeFixture } from "./workspace-warm-owned-repair-fixture.mjs";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";

for (const identity of ["resource-key", "container-only"]) {
  for (const caller of [
    "failClaim",
    "deleteProjectClaims",
    "retry",
    "drain-retry",
    "reconciliation"
  ]) {
    for (const guard of ["first", "second"]) {
      test(`${caller} preserves a ${identity} owner discovered by the ${guard} cleanup guard`, async () => {
        const fixture = await createRetainedRuntimeFixture();
        if (caller !== "failClaim" && caller !== "deleteProjectClaims")
          await fixture.pool.failClaim(fixture.slot.id, new Error("quarantine"), async () => {});
        await fixture.runtimeRecords.remove("prj_rollback");
        const [before] = await fixture.store.list();
        const now = new Date(before.retryAfter ?? "2026-09-05T00:05:00.000Z");
        fixture.setNow(now);
        const owner = {
          ...fixture.snapshot,
          record: {
            ...fixture.snapshot.record,
            projectId: "prj_beta",
            id: "ws-beta",
            slug: "beta",
            resourceKey: identity === "resource-key" ? before.resourceKey : "beta-other-resource"
          }
        };
        await fixture.deps.secrets.put("prj_beta", "DATABASE_URL", "beta-private-value");
        const rows = JSON.stringify([...fixture.secretSql.rows]);
        const acquire = fixture.store.acquireCleanup.bind(fixture.store);
        const list = fixture.runtimeRecords.list.bind(fixture.runtimeRecords);
        let armed = false;
        let reads = 0;
        fixture.store.acquireCleanup = async (...args) => {
          const acquired = await acquire(...args);
          if (acquired?.id === before.id) armed = true;
          return acquired;
        };
        fixture.runtimeRecords.list = async () => {
          // The caller's post-CAS lookup sees no owner. Ownership becomes durable only inside cleanup.
          if (armed && ++reads === (guard === "first" ? 2 : 3))
            await fixture.runtimeRecords.save(owner);
          return list();
        };
        if (caller === "failClaim")
          await fixture.pool.failClaim(before.id, new Error("rollback"), async () => {});
        else if (caller === "deleteProjectClaims")
          await assert.rejects(
            fixture.pool.deleteProjectClaims("prj_rollback", async () => {}),
            /cleanup remains pending/
          );
        else if (caller === "retry") await fixture.pool.ensureCapacity();
        else {
          const drain = createWorkspaceWarmPool({
            deps: fixture.deps,
            store: fixture.store,
            codec: createWarmPoolSecretCodec("1".repeat(64)),
            targetSize: 0,
            now: () => now
          });
          if (caller === "drain-retry") await drain.ensureCapacity();
          else await drain.reconcile();
        }
        const retained = (await fixture.store.list()).find(({ id }) => id === before.id);
        assert.ok(
          retained,
          "cleanup preservation must retain the slot, not report successful destruction"
        );
        assert.equal(retained.resourceKey, before.resourceKey);
        assert.equal(retained.claimProjectId, before.claimProjectId);
        assert.equal(retained.secretPayload === before.secretPayload, true);
        assert.equal(["ready", "preparing"].includes(retained.state), false);
        assert.deepEqual(await list(), [owner]);
        assert.deepEqual(await fixture.deps.secrets.listNames("prj_rollback"), []);
        assert.equal(JSON.stringify([...fixture.secretSql.rows]) === rows, true);
        const container = await fixture.docker.inspectContainer(`evcp-ws-${before.resourceKey}`);
        assert.equal(container?.containerId, before.containerId);
        assert.equal(container?.running, true);
        assert.equal(
          (await fixture.docker.listManagedVolumes()).some(
            ({ name }) => name === `evcp-ws-${before.resourceKey}-data`
          ),
          true
        );
        assert.deepEqual(fixture.releasedSchemas, []);
        assert.deepEqual(fixture.releasedBuckets, []);
        assert.deepEqual(fixture.revokedKeys, []);
        assert.equal(
          Object.values(fixture.expectedEnv).some((value) =>
            JSON.stringify(fixture.audits).includes(value)
          ),
          false
        );
      });
    }
  }
}

for (const identity of ["resource-key", "container-only"]) {
  for (const guard of ["first", "second"]) {
    test(`failed preparation retains its journal when the ${guard} cleanup guard preserves ${identity} ownership`, async () => {
      const runtimeRecords = createRuntimeLeaseFixture().createStore();
      const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords });
      fixture.deps.secrets = createProjectSecretStore({ encryptionKeyHex: "2".repeat(64) });
      await fixture.deps.secrets.put("prj_beta", "DATABASE_URL", "beta-private-value");
      let slot;
      let owner;
      let reads = 0;
      const list = runtimeRecords.list.bind(runtimeRecords);
      const exec = fixture.docker.execInContainer.bind(fixture.docker);
      fixture.docker.execInContainer = async (...args) => {
        const result = await exec(...args);
        [slot] = await fixture.store.list();
        owner = {
          record: {
            id: "ws-beta",
            projectId: "prj_beta",
            slug: "beta",
            resourceKey: identity === "resource-key" ? slot.resourceKey : "beta-other-resource",
            containerId: slot.containerId,
            state: "running",
            cpuCores: 1,
            memoryMb: 2048,
            createdAt: slot.createdAt,
            updatedAt: slot.updatedAt,
            lastActivityAt: slot.updatedAt
          },
          llmGatewayKeyId: slot.llmGatewayKeyId
        };
        return { ...result, exitCode: 1 };
      };
      runtimeRecords.list = async () => {
        if (owner && ++reads === (guard === "first" ? 1 : 2)) await runtimeRecords.save(owner);
        return list();
      };
      await fixture.pool.ensureCapacity();
      assert.equal(
        (await fixture.store.preparations.list()).some(
          ({ resourceKey }) => resourceKey === slot.resourceKey
        ),
        true,
        "a preserved cleanup must not certify preparation disposal"
      );
      const retained = (await fixture.store.list()).find(({ id }) => id === slot.id);
      assert.equal(retained?.secretPayload === slot.secretPayload, true);
      assert.equal(retained.state, "failed");
      assert.equal(retained.resourceKey, slot.resourceKey);
      assert.equal(retained.claimProjectId, slot.claimProjectId);
      assert.deepEqual(await list(), [owner]);
      assert.deepEqual(await fixture.deps.secrets.listNames(slot.id), []);
      assert.equal(
        (await fixture.deps.secrets.resolveEnv("prj_beta")).DATABASE_URL === "beta-private-value",
        true
      );
      assert.equal(
        (await fixture.docker.inspectContainer(`evcp-ws-${slot.resourceKey}`))?.running,
        true
      );
      assert.equal(
        (await fixture.docker.listManagedVolumes()).some(
          ({ name }) => name === `evcp-ws-${slot.resourceKey}-data`
        ),
        true
      );
      assert.deepEqual(fixture.releasedSchemas, []);
      assert.deepEqual(fixture.releasedBuckets, []);
      assert.deepEqual(fixture.revokedKeys, []);
    });
  }
}

for (const guard of ["first", "second"]) {
  test(`a same-owner allocation preserved by the ${guard} cleanup guard is repaired on fenced retry`, async () => {
    const fixture = await createRetainedRuntimeFixture();
    await fixture.runtimeRecords.remove("prj_rollback");
    const list = fixture.runtimeRecords.list.bind(fixture.runtimeRecords);
    let reads = 0;
    fixture.runtimeRecords.list = async () => {
      if (++reads === (guard === "first" ? 2 : 3))
        await fixture.runtimeRecords.save(fixture.snapshot);
      return list();
    };
    await fixture.pool.failClaim(fixture.slot.id, new Error("rollback"), async () => {});
    const retained = (await fixture.store.list()).find(({ id }) => id === fixture.slot.id);
    assert.equal(retained?.secretPayload === fixture.slot.secretPayload, true);
    assert.deepEqual(await fixture.deps.secrets.listNames("prj_rollback"), []);
    fixture.runtimeRecords.list = list;
    fixture.setNow(new Date(retained.retryAfter));
    await fixture.pool.ensureCapacity();
    assert.equal(
      (await fixture.store.list()).some(({ id }) => id === fixture.slot.id),
      false
    );
    const env = await fixture.deps.secrets.resolveEnv("prj_rollback");
    assert.equal(
      Object.entries(fixture.expectedEnv).every(([name, value]) => env[name] === value),
      true
    );
    assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running, true);
    assert.deepEqual(fixture.releasedSchemas, []);
    assert.deepEqual(fixture.releasedBuckets, []);
    assert.deepEqual(fixture.revokedKeys, []);
  });
}
