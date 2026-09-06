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
