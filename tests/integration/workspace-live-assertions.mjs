import assert from "node:assert/strict";

export async function assertLiveContainerAbsent(docker, name) {
  const absent = (await docker.inspectContainer(name)) === null;
  assert.equal(absent, true, `container ${name} must be removed`);
}
