import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { initializeWorkspaceRuntime } from "../../apps/platform-api/src/workspace-orchestrator/runtime-startup.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";

export async function createCrashedWarmStartupFixture({
  envOverrides = {},
  projectId = "prj_crash"
} = {}) {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords, operationLeaseMs: 1_000 });
  const secretSql = createSecretSqlFixture(persistence);
  fixture.deps.secrets = createProjectSecretStore({
    encryptionKeyHex: "2".repeat(64),
    persistence: secretSql.persistence
  });
  await fixture.pool.ensureCapacity();
  await runtimeRecords.provisioningLeases.acquire(projectId, "crashed-owner", 1_000);
  const allocation = await fixture.pool.claim(projectId);
  const { containerId } = allocation;
  const container = fixture.docker.state.containers.find(
    (item) => item.containerId === containerId
  );
  for (const [name, value] of Object.entries(envOverrides)) {
    container.spec.env = container.spec.env.filter((entry) => !entry.startsWith(`${name}=`));
    container.spec.env.push(`${name}=${value}`);
  }
  persistence.advance(1_001);
  return {
    ...fixture,
    persistence,
    secretSql,
    runtimeRecords,
    allocation,
    containerId,
    createReplica() {
      const pool = fixture.createPool();
      const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps });
      return {
        pool,
        orchestrator,
        async boot() {
          await initializeWorkspaceRuntime(orchestrator, undefined, () => pool, {
            createRuntimeRecordStore: async () => runtimeRecords,
            createWarmSlotStore: async () => fixture.store
          });
          await pool.waitForIdle();
        }
      };
    }
  };
}

export function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
