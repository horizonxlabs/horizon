import { buildDevContainerSpec } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { initializeWorkspaceRuntime } from "../../apps/platform-api/src/workspace-orchestrator/runtime-startup.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";

export async function createCrashedWarmStartupFixture({ envOverrides = {} } = {}) {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords, operationLeaseMs: 1_000 });
  const secretSql = createSecretSqlFixture(persistence);
  fixture.deps.secrets = createProjectSecretStore({
    encryptionKeyHex: "2".repeat(64),
    persistence: secretSql.persistence
  });
  await fixture.pool.ensureCapacity();
  await runtimeRecords.provisioningLeases.acquire("prj_crash", "crashed-owner", 1_000);
  const allocation = await fixture.pool.claim("prj_crash");
  await fixture.docker.removeContainer(allocation.containerId);
  const { containerId } = await fixture.docker.createContainer(
    buildDevContainerSpec({
      projectId: "prj_crash",
      slug: "prj-crash",
      image: "evcp/workspace-next:1",
      env: { ...allocation.env, ...envOverrides, EVCP_PREVIEW_BASE: "/preview/prj-crash" },
      cpuCores: 1,
      memoryMb: 2048,
      network: "evcp-internal",
      workspaceVolume: "evcp-ws-warm-resource-1-data"
    })
  );
  await fixture.docker.startContainer(containerId);
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
