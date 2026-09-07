import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { deferred } from "./workspace-warm-startup-fixture.mjs";

async function createFailedHandoffFixture() {
  const persistence = createRuntimeLeaseFixture();
  const runtimeRecords = persistence.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords });
  fixture.deps.secrets = createProjectSecretStore({
    encryptionKeyHex: "2".repeat(64),
    persistence: createSecretSqlFixture(persistence).persistence
  });
  await fixture.pool.ensureCapacity();
  const [ready] = await fixture.store.list();
  const execute = fixture.docker.execInContainer.bind(fixture.docker);
  let failed = false;
  fixture.docker.execInContainer = async (containerId, command) => {
    if (!failed && containerId === ready.containerId) {
      failed = true;
      return { stdout: "", stderr: "unhealthy", exitCode: 1 };
    }
    return execute(containerId, command);
  };
  return { ...fixture, persistence, runtimeRecords };
}

for (const boundary of ["runtime read", "final inspection"]) {
  test(
    `an expired foreground warm cleanup cannot delete a cold successor after its ${boundary}`,
    { timeout: 5_000 },
    async () => {
      const fixture = await createFailedHandoffFixture();
      const { persistence, runtimeRecords } = fixture;
      const entered = deferred();
      const resume = deferred();
      const findMany = persistence.client.workspaceRuntimeRecord.findMany;
      let paused = false;
      persistence.client.workspaceRuntimeRecord.findMany = async (...args) => {
        const records = await findMany(...args);
        if (
          boundary === "runtime read" &&
          !paused &&
          (await fixture.store.list()).some(({ state }) => state === "cleaning")
        ) {
          paused = true;
          entered.resolve();
          await resume.promise;
        }
        return records;
      };
      const inspect = fixture.docker.inspectContainer.bind(fixture.docker);
      fixture.docker.inspectContainer = async (...args) => {
        if (
          boundary === "final inspection" &&
          !paused &&
          (await fixture.store.list()).some(({ state }) => state === "cleaning")
        ) {
          paused = true;
          entered.resolve();
          await resume.promise;
        }
        return inspect(...args);
      };
      const first = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
      const stale = assert.rejects(
        first.provisionWorkspace({ projectId: "prj_crash", slug: "old" }),
        /lease is no longer owned/
      );
      await entered.promise;
      try {
        persistence.advance(300_001);
        const successor = createWorkspaceOrchestrator({
          ...fixture.deps,
          warmPool: fixture.createPool()
        });
        const winner = await successor.provisionWorkspace({
          projectId: "prj_crash",
          slug: "successor"
        });
        assert.equal(winner.resourceKey, "prj-crash");
        const expected = await runtimeRecords.list();
        const expectedSecrets = await fixture.deps.secrets.resolveEnv("prj_crash");
        resume.resolve();
        await stale;
        await fixture.pool.waitForIdle();
        const final = await fixture.docker.inspectContainer("evcp-ws-prj-crash");
        assert.equal(final?.running, true);
        assert.equal(final?.containerId, winner.containerId);
        assert.deepEqual(await runtimeRecords.list(), expected);
        assert.equal(
          JSON.stringify(await fixture.deps.secrets.resolveEnv("prj_crash")) ===
            JSON.stringify(expectedSecrets),
          true
        );
        assert.equal(fixture.releasedSchemas.includes("prj-crash"), false);
        assert.equal(fixture.revokedKeys.includes("key-2"), false);
      } finally {
        resume.resolve();
        await stale;
      }
    }
  );
}

test(
  "foreground failed-claim cleanup uses its held project lease and completes cold fallback without reacquiring",
  { timeout: 5_000 },
  async () => {
    const fixture = await createFailedHandoffFixture();
    const execute = fixture.persistence.client.$executeRawUnsafe;
    let acquisitions = 0;
    fixture.persistence.client.$executeRawUnsafe = async (...args) => {
      if (args[0].includes('INSERT INTO "workspace_provisioning_leases"')) acquisitions += 1;
      return execute(...args);
    };
    const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
    const record = await orchestrator.provisionWorkspace({
      projectId: "prj_crash",
      slug: "fallback"
    });
    await fixture.pool.waitForIdle();
    assert.equal(acquisitions, 1);
    assert.equal(record.state, "running");
    assert.equal(record.resourceKey, "prj-crash");
    assert.equal((await fixture.runtimeRecords.list())[0].record.containerId, record.containerId);
    assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
    assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
    assert.equal(fixture.revokedKeys.includes("key-1"), true);
  }
);

test("a corrupt allocation with lost caller ownership is quarantined before runtime lookup or resource cleanup", async () => {
  const fixture = await createFailedHandoffFixture();
  const [slot] = await fixture.store.list();
  fixture.store.seedReady({ ...slot, secretPayload: "corrupt" });
  let runtimeReads = 0;
  const findMany = fixture.persistence.client.workspaceRuntimeRecord.findMany;
  fixture.persistence.client.workspaceRuntimeRecord.findMany = async (...args) => {
    runtimeReads += 1;
    return findMany(...args);
  };
  assert.equal(
    await fixture.pool.claim("prj_crash", async () => {
      throw new Error("project lease is no longer owned");
    }),
    null
  );
  await fixture.pool.waitForIdle();
  assert.equal(runtimeReads, 0);
  assert.equal((await fixture.store.list())[0].state, "failed");
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running, true);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
});
