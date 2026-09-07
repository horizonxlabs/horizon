import assert from "node:assert/strict";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { initializeWorkspaceRuntime } from "../../apps/platform-api/src/workspace-orchestrator/runtime-startup.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";
import { MANAGED_WORKSPACE_SECRET_NAMES } from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";

export async function seedCompleteOwnedSecrets(fixture, projectId) {
  fixture.deps.secrets = createProjectSecretStore({ encryptionKeyHex: "2".repeat(64) });
  for (const name of MANAGED_WORKSPACE_SECRET_NAMES)
    await fixture.deps.secrets.put(projectId, name, `existing-${name}`);
}

export async function createRetainedRuntimeFixture() {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords, operationLeaseMs: 1_000 });
  const secretSql = createSecretSqlFixture(persistence);
  fixture.deps.secrets = createProjectSecretStore({
    encryptionKeyHex: "2".repeat(64),
    persistence: secretSql.persistence
  });
  await fixture.pool.ensureCapacity();
  const [slot] = await fixture.store.list();
  const expectedEnv = createWarmPoolSecretCodec("1".repeat(64)).open(slot.secretPayload);
  const remove = runtimeRecords.provisioningLeases.remove;
  runtimeRecords.provisioningLeases.remove = async () => {
    throw new Error("runtime rollback unavailable");
  };
  const orchestrator = createWorkspaceOrchestrator({
    ...fixture.deps,
    warmPool: {
      ...fixture.pool,
      async completeClaim() {
        throw new Error("slot retirement unavailable");
      },
      async ensureCapacity() {}
    }
  });
  await assert.rejects(
    orchestrator.provisionWorkspace({ projectId: "prj_rollback", slug: "rollback" }),
    /rollback/
  );
  runtimeRecords.provisioningLeases.remove = remove;
  assert.deepEqual(await fixture.deps.secrets.listNames("prj_rollback"), []);
  const [snapshot] = await runtimeRecords.list();
  assert.equal(snapshot.record.containerId, slot.containerId);
  return {
    ...fixture,
    persistence,
    runtimeRecords,
    secretSql,
    slot,
    snapshot,
    expectedEnv,
    createReplica() {
      const pool = fixture.createPool();
      const recovered = createWorkspaceOrchestrator({ ...fixture.deps });
      return {
        pool,
        orchestrator: recovered,
        async boot() {
          await initializeWorkspaceRuntime(recovered, undefined, () => pool, {
            createRuntimeRecordStore: async () => runtimeRecords,
            createWarmSlotStore: async () => fixture.store
          });
          await pool.waitForIdle();
        }
      };
    }
  };
}
