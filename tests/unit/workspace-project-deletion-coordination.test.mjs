import assert from "node:assert/strict";
import test from "node:test";
import { deletePersistedProject } from "../../apps/platform-api/src/project-deletion.ts";
import { createCrashedWarmStartupFixture, deferred } from "./workspace-warm-startup-fixture.mjs";
import {
  deletionLifecycle,
  assertClaimResourcesAbsent
} from "./workspace-project-deletion-fixture.mjs";

test("outer deletion fences a stale empty runtime lookup, warm recovery and cascade", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const { pool, orchestrator } = fixture.createReplica();
  orchestrator.configureWarmPool(pool);
  const lifecycle = deletionLifecycle(fixture.persistence);
  await fixture.deps.secrets.put("prj_crash", "DATABASE_URL", "pending-recovery-secret");
  const list = fixture.persistence.client.workspaceRuntimeRecord.findMany;
  let lookup = false;
  fixture.persistence.client.workspaceRuntimeRecord.findMany = async (...args) => {
    const result = await list(...args);
    if (!lookup) {
      lookup = true;
      assert.equal(result.length, 0);
      await orchestrator.reconcileWarmPool();
    }
    return result;
  };
  let cascades = 0;
  const input = {
    actor: { id: "owner", role: "creator" },
    encodedProjectId: "prj_crash",
    lifecycle,
    workspace: orchestrator,
    persistence: {
      listProjects: async () => [{ id: "prj_crash" }],
      recordAudit: async () => {},
      async deleteProject(_actor, id, fence) {
        await assertClaimResourcesAbsent(assert, fixture, orchestrator);
        assert.equal(fixture.persistence.leases.get(id)?.token, fence.workspaceToken);
        cascades++;
        fixture.persistence.deleteProject(id);
      }
    },
    cleanup: (id, fence) => orchestrator.deleteWorkspace(id, fence)
  };
  assert.deepEqual(await deletePersistedProject(input), { id: "prj_crash", deleted: true });
  await assertClaimResourcesAbsent(assert, fixture, orchestrator);
  assert.deepEqual(await deletePersistedProject(input), { id: "prj_crash", deleted: true });
  assert.equal(cascades, 1);
});

test(
  "outer deletion drains an active replica's delayed runtime save before cleanup",
  { timeout: 5000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const { pool, orchestrator } = fixture.createReplica();
    orchestrator.configureWarmPool(pool);
    const saved = deferred();
    const resume = deferred();
    const save = fixture.runtimeRecords.provisioningLeases.save.bind(
      fixture.runtimeRecords.provisioningLeases
    );
    fixture.runtimeRecords.provisioningLeases.save = async (...args) => {
      saved.resolve();
      await resume.promise;
      return save(...args);
    };
    const recovery = orchestrator.reconcileWarmPool();
    await saved.promise;
    let cleanupStarted = false;
    const deletion = deletePersistedProject({
      actor: { id: "owner", role: "creator" },
      encodedProjectId: "prj_crash",
      lifecycle: deletionLifecycle(fixture.persistence),
      workspace: orchestrator,
      persistence: {
        listProjects: async () => [{ id: "prj_crash" }],
        recordAudit: async () => {},
        async deleteProject(_actor, id, fence) {
          await assertClaimResourcesAbsent(assert, fixture, orchestrator);
          assert.equal(fixture.persistence.leases.get(id)?.token, fence.workspaceToken);
          fixture.persistence.deleteProject(id);
        }
      },
      async cleanup(id, fence) {
        cleanupStarted = true;
        await orchestrator.deleteWorkspace(id, fence);
      }
    });
    const outcome = deletion.then(
      () => null,
      (error) => error
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(cleanupStarted, false, "cleanup must wait until the recovery owner drains");
    } finally {
      resume.resolve();
      await recovery;
    }
    assert.equal(await outcome, null);
    await assertClaimResourcesAbsent(assert, fixture, orchestrator);
  }
);

test(
  "deletion takes over an expired replica and rejects its delayed runtime save after cascade",
  { timeout: 5000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const recoveryReplica = fixture.createReplica();
    recoveryReplica.orchestrator.configureWarmPool(recoveryReplica.pool);
    const deleter = fixture.createReplica();
    deleter.orchestrator.configureWarmPool(deleter.pool);
    const entered = deferred();
    const resume = deferred();
    const save = fixture.runtimeRecords.provisioningLeases.save.bind(
      fixture.runtimeRecords.provisioningLeases
    );
    fixture.runtimeRecords.provisioningLeases.save = async (...args) => {
      entered.resolve();
      await resume.promise;
      return save(...args);
    };
    const recovery = assert.rejects(
      recoveryReplica.orchestrator.reconcileWarmPool(),
      /lease is no longer owned/
    );
    await entered.promise;
    fixture.persistence.advance(1_001);
    try {
      await deletePersistedProject({
        actor: { id: "owner", role: "creator" },
        encodedProjectId: "prj_crash",
        lifecycle: deletionLifecycle(fixture.persistence),
        workspace: deleter.orchestrator,
        persistence: {
          listProjects: async () => [{ id: "prj_crash" }],
          recordAudit: async () => {},
          async deleteProject(_actor, id) {
            await assertClaimResourcesAbsent(assert, fixture, deleter.orchestrator);
            fixture.persistence.deleteProject(id);
          }
        },
        cleanup: (id, fence) => deleter.orchestrator.deleteWorkspace(id, fence)
      });
    } finally {
      resume.resolve();
      await recovery;
    }
    await assertClaimResourcesAbsent(assert, fixture, recoveryReplica.orchestrator);
  }
);

test("outer deletion reads the durable physical winner even when its local cache contains an older allocation", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const { pool, orchestrator } = fixture.createReplica();
  orchestrator.configureWarmPool(pool);
  await orchestrator.reconcileWarmPool();
  const [snapshot] = await fixture.runtimeRecords.list();
  // Another replica's replacement is durable; this replica still caches the previous allocation.
  await fixture.runtimeRecords.save({
    record: { ...snapshot.record, resourceKey: "warm-successor" },
    llmGatewayKeyId: "key-successor"
  });
  await fixture.docker.ensureVolume("evcp-ws-warm-successor-data", { "evcp.managed": "true" });
  await deletePersistedProject({
    actor: { id: "owner", role: "creator" },
    encodedProjectId: "prj_crash",
    lifecycle: deletionLifecycle(fixture.persistence),
    workspace: orchestrator,
    persistence: {
      listProjects: async () => [{ id: "prj_crash" }],
      recordAudit: async () => {},
      async deleteProject(_actor, id) {
        assert.equal(fixture.releasedSchemas.includes("warm-successor"), true);
        assert.equal(fixture.releasedBuckets.includes("warm-successor"), true);
        assert.equal(fixture.revokedKeys.includes("key-successor"), true);
        assert.equal(
          fixture.docker.state.volumes.some(({ name }) => name === "evcp-ws-warm-successor-data"),
          false
        );
        fixture.persistence.deleteProject(id);
      }
    },
    cleanup: (id, fence) => orchestrator.deleteWorkspace(id, fence)
  });
});
