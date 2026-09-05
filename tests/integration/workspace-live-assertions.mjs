import assert from "node:assert/strict";

export async function assertLiveContainerAbsent(docker, name) {
  const absent = (await docker.inspectContainer(name)) === null;
  assert.equal(absent, true, `container ${name} must be removed`);
}

export async function assertLiveWorkspaceDatabaseEmpty(store, runtimes) {
  assert.equal(
    (await store.list()).length,
    0,
    "use a migrated, empty database with no API or other live test running"
  );
  assert.equal(await runtimes.count(), 0, "live-test database must have no workspaces");
  assert.equal(
    (await store.preparations.list()).length,
    0,
    "live-test database must have no preparation intents from prior runs"
  );
}
