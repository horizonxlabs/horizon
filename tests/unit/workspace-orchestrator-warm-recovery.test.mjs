import assert from "node:assert/strict";
import test from "node:test";
import { buildDevContainerSpec } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test("recovery preserves a claimed physical allocation when the final container predates its runtime record", async () => {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords });
  fixture.deps.secrets = createProjectSecretStore({ encryptionKeyHex: "2".repeat(64) });
  await fixture.pool.ensureCapacity();
  await runtimeRecords.provisioningLeases.acquire("prj_crash", "crashed-owner", 1_000);
  const allocation = await fixture.pool.claim("prj_crash");
  await fixture.docker.removeContainer(allocation.containerId);
  const { containerId } = await fixture.docker.createContainer(
    buildDevContainerSpec({
      projectId: "prj_crash",
      slug: "prj-crash",
      image: "evcp/workspace-next:1",
      env: { ...allocation.env, EVCP_PREVIEW_BASE: "/preview/prj-crash" },
      cpuCores: 1,
      memoryMb: 2048,
      network: "evcp-internal",
      workspaceVolume: "evcp-ws-warm-resource-1-data"
    })
  );
  await fixture.docker.startContainer(containerId);
  // The process dies here, before secrets/runtime persistence and claim completion.
  persistence.advance(1_001);

  const recovered = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
  const record = await recovered.provisionWorkspace({ projectId: "prj_crash", slug: "renamed" });

  assert.equal(record.state, "running");
  assert.equal(record.containerId, containerId);
  assert.equal(record.resourceKey, "warm-resource-1");
  assert.equal((await runtimeRecords.list())[0].llmGatewayKeyId, "key-1");
  assert.equal((await recovered.resolveEnv("prj_crash")).LLM_GATEWAY_KEY, "llm-secret-1");
  await fixture.pool.waitForIdle();
  await fixture.pool.reconcile();
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
  assert.ok(await fixture.docker.inspectContainer("evcp-ws-prj-crash"));
  assert.ok(
    (await fixture.docker.listManagedVolumes()).some(
      (volume) => volume.name === "evcp-ws-warm-resource-1-data"
    )
  );
  assert.equal(
    (await fixture.store.list()).some((slot) => slot.id === allocation.slotId),
    false
  );

  await recovered.deleteWorkspace("prj_crash");
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
  assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
  assert.deepEqual(fixture.revokedKeys, ["key-1"]);
  assert.equal(await fixture.docker.inspectContainer("evcp-ws-prj-crash"), null);
  assert.equal(
    (await fixture.docker.listManagedVolumes()).some(
      (volume) => volume.name === "evcp-ws-warm-resource-1-data"
    ),
    false
  );
});

test("recovery keeps cold identity and preserves unmatched warm preparation for safe retry", async () => {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords });
  fixture.deps.secrets = createProjectSecretStore({ encryptionKeyHex: "2".repeat(64) });
  await fixture.pool.ensureCapacity();
  await runtimeRecords.provisioningLeases.acquire("prj_cold", "crashed-owner", 1_000);
  const allocation = await fixture.pool.claim("prj_cold");
  const prepared = (await fixture.store.list()).find(({ id }) => id === allocation.slotId);
  persistence.advance(1_001);
  const initial = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
  await initial.provisionWorkspace({ projectId: "prj_cold", slug: "cold" });
  // Reproduce a cold container whose creation completed before the runtime write was durable.
  await runtimeRecords.remove("prj_cold");

  const recovered = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
  const record = await recovered.provisionWorkspace({ projectId: "prj_cold", slug: "cold" });

  assert.equal(record.resourceKey, "prj-cold");
  await fixture.pool.reconcile();
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
  const retained = (await fixture.store.list()).find(({ id }) => id === allocation.slotId);
  assert.equal(retained?.secretPayload === prepared.secretPayload, true);
  assert.ok(await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"));
  assert.ok(await fixture.docker.inspectContainer("evcp-ws-prj-cold"));
  assert.ok(
    (await fixture.docker.listManagedVolumes()).some(
      (volume) => volume.name === "evcp-ws-prj-cold-data"
    )
  );
});
