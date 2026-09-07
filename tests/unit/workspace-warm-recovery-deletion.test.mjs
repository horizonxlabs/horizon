import assert from "node:assert/strict";
import test from "node:test";
import { deletePersistedProject } from "../../apps/platform-api/src/project-deletion.ts";
import { deletePersistedProjectResources } from "../../apps/platform-api/src/persistence/project-file-cleanup.ts";
import { createCrashedWarmStartupFixture, deferred } from "./workspace-warm-startup-fixture.mjs";

async function pauseRecoveryRenewal(fixture, replica, expectFailure = true) {
  const execute = fixture.persistence.client.$executeRawUnsafe;
  const entered = deferred();
  const resume = deferred();
  let paused = false;
  fixture.persistence.client.$executeRawUnsafe = async (...args) => {
    const result = await execute(...args);
    if (
      !paused &&
      result === 1 &&
      args[0].trimStart().startsWith("UPDATE") &&
      args[1] === "prj_crash" &&
      fixture.persistence.records.has("prj_crash")
    ) {
      paused = true;
      entered.resolve();
      await resume.promise;
    }
    return result;
  };
  const boot = replica.boot();
  const recovery = expectFailure ? assert.rejects(boot, /lease is no longer owned/) : boot;
  await entered.promise;
  return { recovery, resume };
}

async function resourceAbsence(fixture, replica) {
  return {
    container: (await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")) === null,
    volume: !fixture.docker.state.volumes.some(
      (volume) => volume.name === "evcp-ws-warm-resource-1-data"
    ),
    schema: fixture.releasedSchemas.includes("warm-resource-1"),
    bucket: fixture.releasedBuckets.includes("warm-resource-1"),
    key: fixture.revokedKeys.includes("key-1"),
    secrets: (await replica.orchestrator.listSecretNames("prj_crash")).length === 0,
    runtime: !(await fixture.runtimeRecords.list()).some(
      (snapshot) => snapshot.record.projectId === "prj_crash"
    )
  };
}

const allAbsent = {
  container: true,
  volume: true,
  schema: true,
  bucket: true,
  key: true,
  secrets: true,
  runtime: true
};

test(
  "project deletion removes an unpublished warm runtime before cascade and rejects delayed recovery publication",
  { timeout: 5_000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const replica = fixture.createReplica();
    const { recovery, resume } = await pauseRecoveryRenewal(fixture, replica);
    let absenceBeforeCascade;
    try {
      assert.equal(replica.orchestrator.getWorkspace("prj_crash"), null);
      const result = await deletePersistedProject({
        actor: { id: "owner", role: "creator" },
        encodedProjectId: "prj_crash",
        persistence: {
          async listProjects() {
            return [{ id: "prj_crash" }];
          },
          async deleteProject(_actor, projectId) {
            absenceBeforeCascade = await resourceAbsence(fixture, replica);
            fixture.persistence.deleteProject(projectId);
          },
          async recordAudit() {}
        },
        cleanup: (projectId, fence) =>
          deletePersistedProjectResources(
            projectId,
            { workspace: replica.orchestrator },
            undefined,
            fence
          )
      });
      assert.deepEqual(result, { id: "prj_crash", deleted: true });
      resume.resolve();
      await recovery;
      assert.equal(replica.orchestrator.getWorkspace("prj_crash"), null);
      assert.deepEqual(absenceBeforeCascade, allAbsent);
      assert.deepEqual(await resourceAbsence(fixture, replica), allAbsent);
    } finally {
      resume.resolve();
      await recovery;
    }
  }
);

test(
  "failed deletion of an unpublished warm runtime rejects stale recovery and retains durable cleanup for retry",
  { timeout: 5_000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const replica = fixture.createReplica();
    const { recovery, resume } = await pauseRecoveryRenewal(fixture, replica, false);
    const releaseSchema = fixture.deps.postgres.releaseSchema;
    fixture.deps.postgres.releaseSchema = async () => {
      throw new Error("schema unavailable");
    };
    try {
      await assert.rejects(
        deletePersistedProjectResources("prj_crash", { workspace: replica.orchestrator }),
        (error) =>
          error instanceof AggregateError &&
          error.errors.some((cause) => cause.message === "schema unavailable")
      );
      resume.resolve();
      await recovery;
      assert.equal(replica.orchestrator.getWorkspace("prj_crash"), null);
      assert.equal((await fixture.runtimeRecords.list())[0].record.resourceKey, "warm-resource-1");
      fixture.deps.postgres.releaseSchema = releaseSchema;
      await deletePersistedProjectResources("prj_crash", { workspace: replica.orchestrator });
      assert.deepEqual(await resourceAbsence(fixture, replica), allAbsent);
      await replica.orchestrator.deleteWorkspace("prj_crash");
      assert.equal(replica.orchestrator.getWorkspace("prj_crash"), null);
    } finally {
      resume.resolve();
      await recovery;
    }
  }
);

test(
  "deletion ownership lost during an unpublished runtime lookup preserves the successor and its resources",
  { timeout: 5_000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const replica = fixture.createReplica();
    const { recovery, resume } = await pauseRecoveryRenewal(fixture, replica);
    const lookupEntered = deferred();
    const lookupResume = deferred();
    const findMany = fixture.persistence.client.workspaceRuntimeRecord.findMany;
    let lookupPaused = false;
    fixture.persistence.client.workspaceRuntimeRecord.findMany = async (...args) => {
      const result = await findMany(...args);
      if (!lookupPaused) {
        lookupPaused = true;
        lookupEntered.resolve();
        await lookupResume.promise;
      }
      return result;
    };
    let current = true;
    const deletion = assert.rejects(
      replica.orchestrator.deleteWorkspace("prj_crash", {
        epoch: 1,
        async assertCurrent() {
          if (!current) throw new Error("deletion ownership lost");
        }
      }),
      /deletion ownership lost/
    );
    await lookupEntered.promise;
    try {
      current = false;
      fixture.persistence.advance(1_001);
      await replica.orchestrator.provisionWorkspace({ projectId: "prj_crash", slug: "successor" });
      await replica.orchestrator.stopWorkspace("prj_crash");
      lookupResume.resolve();
      await deletion;
      resume.resolve();
      await recovery;
      const cached = replica.orchestrator.getWorkspace("prj_crash");
      const [durable] = await fixture.runtimeRecords.list();
      assert.equal(cached.slug, "successor");
      assert.equal(cached.state, "idle");
      assert.deepEqual(cached, durable.record);
      assert.deepEqual(await resourceAbsence(fixture, replica), {
        container: false,
        volume: false,
        schema: false,
        bucket: false,
        key: false,
        secrets: false,
        runtime: false
      });
    } finally {
      lookupResume.resolve();
      resume.resolve();
      await deletion;
      await recovery;
    }
  }
);
