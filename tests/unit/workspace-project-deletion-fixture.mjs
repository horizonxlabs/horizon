import {
  createMemoryProjectLifecycleStore,
  createProjectLifecycleCoordinator
} from "../../apps/platform-api/src/project-lifecycle.ts";

export function deletionLifecycle(persistence) {
  const store = createMemoryProjectLifecycleStore({ now: () => new Date(persistence.now) });
  return createProjectLifecycleCoordinator({
    store: {
      ...store,
      async beginDeletion(input) {
        const result = await store.beginDeletion(input);
        if (result.status === "acquired")
          persistence.lifecycleStates.set(input.projectId, {
            status: "deleting",
            epoch: result.epoch,
            deletion_owner_id: input.ownerId,
            deletion_lease_current: true
          });
        return result;
      }
    }
  });
}

export async function assertClaimResourcesAbsent(assert, fixture, orchestrator) {
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash")) === null, true);
  assert.equal(fixture.docker.state.volumes.length, 0);
  assert.equal(fixture.releasedSchemas.includes("warm-resource-1"), true);
  assert.equal(fixture.releasedBuckets.includes("warm-resource-1"), true);
  assert.equal(fixture.revokedKeys.includes("key-1"), true);
  assert.deepEqual(await fixture.runtimeRecords.list(), []);
  assert.deepEqual(await fixture.deps.secrets.listNames("prj_crash"), []);
  assert.deepEqual(await fixture.store.list(), []);
  assert.equal(orchestrator.getWorkspace("prj_crash"), null);
}
