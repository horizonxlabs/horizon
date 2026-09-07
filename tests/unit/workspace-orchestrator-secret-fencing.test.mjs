import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createFixture } from "./workspace-orchestrator-warm-fixture.mjs";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a delayed runtime commit response cannot retire a hot slot after lease takeover", async () => {
  const fixture = await createFixture();
  const runtime = createRuntimeLeaseFixture();
  const store = runtime.createStore();
  const save = store.provisioningLeases.save.bind(store.provisioningLeases);
  store.provisioningLeases.save = async (...args) => {
    const saved = await save(...args);
    runtime.advance(300_001);
    assert.equal(
      await store.provisioningLeases.acquire("prj_delayed", "successor", 300_000),
      "acquired"
    );
    return saved;
  };
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: store });
  await assert.rejects(
    orchestrator.provisionWorkspace({ projectId: "prj_delayed", slug: "delayed" }),
    /lease is no longer owned/
  );
  assert.equal((await fixture.prepared.store.list())[0].state, "claiming");
  assert.equal((await store.list())[0].record.containerId, fixture.slot.containerId);
  assert.equal(
    (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running,
    true
  );
  assert.equal(fixture.order.includes("complete"), false);
  assert.equal(fixture.order.includes("remove-secrets"), false);
  assert.deepEqual(fixture.coldCalls, []);
});

test("a delayed completed handoff cannot publish after losing its project lease", async () => {
  const fixture = await createFixture();
  const runtime = createRuntimeLeaseFixture();
  const store = runtime.createStore();
  const complete = fixture.deps.warmPool.completeClaim;
  fixture.deps.warmPool.completeClaim = async (...args) => {
    await complete(...args);
    runtime.advance(300_001);
    assert.equal(
      await store.provisioningLeases.acquire("prj_delayed", "successor", 300_000),
      "acquired"
    );
  };
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: store });
  await assert.rejects(
    orchestrator.provisionWorkspace({ projectId: "prj_delayed", slug: "delayed" }),
    /lease is no longer owned/
  );
  assert.equal(orchestrator.getWorkspace("prj_delayed"), null);
  assert.equal((await store.list())[0].record.containerId, fixture.slot.containerId);
  assert.equal(fixture.order.includes("remove-secrets"), false);
  assert.deepEqual(fixture.prepared.releasedSchemas, []);
});

test("a transient ownership check after retirement cannot roll back the durable hot runtime", async () => {
  const fixture = await createFixture();
  const runtime = createRuntimeLeaseFixture();
  const store = runtime.createStore();
  const complete = fixture.deps.warmPool.completeClaim;
  const renew = store.provisioningLeases.renew.bind(store.provisioningLeases);
  let failRenewal = false;
  fixture.deps.warmPool.completeClaim = async (...args) => {
    await complete(...args);
    failRenewal = true;
  };
  store.provisioningLeases.renew = async (...args) => {
    if (failRenewal) {
      failRenewal = false;
      throw new Error("ownership lookup unavailable");
    }
    return renew(...args);
  };
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: store });
  await assert.rejects(
    orchestrator.provisionWorkspace({ projectId: "prj_delayed", slug: "delayed" })
  );
  assert.equal((await store.list())[0].record.containerId, fixture.slot.containerId);
  assert.equal(fixture.order.includes("remove-secrets"), false);
  assert.deepEqual(fixture.coldCalls, []);
});

for (const { mode, mutation } of [
  { mode: "warm", mutation: "delete" },
  { mode: "warm", mutation: "write" },
  { mode: "cold", mutation: "delete" },
  { mode: "cold", mutation: "write" },
  { mode: "recovered", mutation: "delete" }
]) {
  test(`a suspended ${mode} secret ${mutation} cannot corrupt a successor that finishes after lease takeover`, async () => {
    const fixture = await createFixture({ ready: mode !== "cold" });
    let keySequence = 0;
    fixture.deps.llmGateway.createVirtualKey = async () => {
      keySequence += 1;
      return { keyId: `attempt-key-${keySequence}`, key: `attempt-secret-${keySequence}` };
    };
    const runtime = createRuntimeLeaseFixture();
    const firstStore = runtime.createStore();
    const started = deferred();
    const resume = deferred();
    const sql = createSecretSqlFixture(runtime);
    const secrets = createProjectSecretStore({
      encryptionKeyHex: "4".repeat(64),
      persistence: sql.persistence
    });
    fixture.deps.secrets = secrets;
    let paused = false;
    sql.beforeQuery = async (statement) => {
      const target =
        mutation === "delete"
          ? "DELETE FROM project_secrets"
          : "SELECT token FROM workspace_provisioning_leases";
      if (!paused && statement.includes(target)) {
        paused = true;
        started.resolve();
        await resume.promise;
      }
    };
    if (mode === "recovered") {
      fixture.deps.warmPool.completeClaim = async () => {
        throw new Error("claim completion unavailable");
      };
    } else if (mutation === "delete") {
      const save = firstStore.provisioningLeases.save.bind(firstStore.provisioningLeases);
      firstStore.provisioningLeases.save = async (snapshot, ...args) => {
        if (snapshot.record.state === "running") throw new Error("runtime save unavailable");
        return save(snapshot, ...args);
      };
    }
    const first = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: firstStore });
    const input = { projectId: "prj_secret_race", slug: "secret-race" };
    const stale = first.provisionWorkspace(input);
    const rejection = assert.rejects(stale, /lease is no longer owned/);
    await started.promise;
    runtime.advance(300_000);
    // Model the crashed worker's disposable final container being absent on takeover.
    const partial = await fixture.deps.docker.inspectContainer("evcp-ws-prj-secret-race");
    if (partial) await fixture.deps.docker.removeContainer(partial.containerId);
    const successor = createWorkspaceOrchestrator({
      ...fixture.deps,
      runtimeRecords: runtime.createStore()
    });
    const winner = await successor.provisionWorkspace(input);
    const expected = await secrets.resolveEnv(input.projectId);
    assert.equal(Object.keys(expected).length, 6);
    assert.equal(winner.state, "running");
    if (mode === "recovered") assert.equal(winner.resourceKey, "warm-resource-1");
    resume.resolve();
    await rejection;
    assert.deepEqual(await secrets.resolveEnv(input.projectId), expected);
    const reloaded = createProjectSecretStore({
      encryptionKeyHex: "4".repeat(64),
      persistence: sql.persistence
    });
    await reloaded.hydrate();
    assert.deepEqual(await reloaded.resolveEnv(input.projectId), expected);
    assert.equal(runtime.records.get(input.projectId).containerId, winner.containerId);
    assert.equal(runtime.records.get(input.projectId).state, "running");
  });
}
