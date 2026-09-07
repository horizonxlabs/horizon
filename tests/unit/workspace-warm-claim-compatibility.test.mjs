import assert from "node:assert/strict";
import test from "node:test";
import { createFixture } from "./workspace-orchestrator-warm-fixture.mjs";
import { createCrashedWarmStartupFixture } from "./workspace-warm-startup-fixture.mjs";

function invalidate(container, mismatch) {
  if (mismatch === "image") container.spec.image = "private.example/workspace:old";
  else {
    container.spec.env = container.spec.env.filter(
      (entry) => !entry.startsWith("EVCP_PREVIEW_BASE=")
    );
    if (mismatch !== "missing-base")
      container.spec.env.push("EVCP_PREVIEW_BASE=/preview/wrong-private-key");
    if (mismatch === "duplicate-base")
      container.spec.env.unshift("EVCP_PREVIEW_BASE=/preview/warm-resource-1");
  }
}

function observeWrites(fixture) {
  const imports = [];
  const runtimeWrites = [];
  const replace = fixture.deps.secrets.replaceForProvisioning.bind(fixture.deps.secrets);
  fixture.deps.secrets.replaceForProvisioning = async (...args) => {
    imports.push(args[1]);
    return replace(...args);
  };
  const save = fixture.deps.runtimeRecords.save.bind(fixture.deps.runtimeRecords);
  fixture.deps.runtimeRecords.save = async (snapshot) => {
    runtimeWrites.push(snapshot.record.resourceKey);
    return save(snapshot);
  };
  return { imports, runtimeWrites };
}

async function assertColdRejection(fixture, writes, record) {
  assert.equal(record.resourceKey, "prj-compatible");
  assert.deepEqual(fixture.coldCalls, ["prj-compatible"]);
  assert.equal(writes.imports.length, 1, "only cold credentials may be imported");
  assert.equal(writes.imports[0].LLM_GATEWAY_KEY, "cold-key");
  assert.ok(writes.runtimeWrites.every((key) => key === "prj-compatible"));
  assert.deepEqual(fixture.prepared.releasedSchemas, ["warm-resource-1"]);
  assert.deepEqual(fixture.prepared.releasedBuckets, ["warm-resource-1"]);
  assert.deepEqual(fixture.prepared.revokedKeys, ["key-1"]);
  assert.equal(await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1"), null);
  assert.doesNotMatch(
    JSON.stringify(fixture.events),
    /private|wrong-private|pg-secret|storage-secret|llm-secret|DATABASE_URL|EVCP_PREVIEW_BASE/
  );
}

for (const mismatch of ["image", "missing-base", "wrong-base", "duplicate-base"]) {
  test(`a claimed ${mismatch} mismatch is rejected before secret import or runtime persistence`, async () => {
    const fixture = await createFixture();
    invalidate(fixture.prepared.docker.state.containers[0], mismatch);
    const writes = observeWrites(fixture);
    const record = await fixture.orchestrator.provisionWorkspace({
      projectId: "prj_compatible",
      slug: "compatible"
    });
    await assertColdRejection(fixture, writes, record);
  });
}

test("a claim winning the stale reconciliation race still rejects the stale allocation and falls back cold", async () => {
  const fixture = await createFixture();
  invalidate(fixture.prepared.docker.state.containers[0], "image");
  const writes = observeWrites(fixture);
  const atCleanup = Promise.withResolvers();
  const resumeCleanup = Promise.withResolvers();
  const acquire = fixture.prepared.store.acquireCleanup.bind(fixture.prepared.store);
  let first = true;
  fixture.prepared.store.acquireCleanup = async (...args) => {
    if (first) {
      first = false;
      atCleanup.resolve();
      await resumeCleanup.promise;
    }
    return acquire(...args);
  };
  const reconciling = fixture.prepared.pool.reconcile();
  await atCleanup.promise;
  try {
    const record = await fixture.orchestrator.provisionWorkspace({
      projectId: "prj_compatible",
      slug: "compatible"
    });
    resumeCleanup.resolve();
    await reconciling;
    await assertColdRejection(fixture, writes, record);
    assert.equal(
      (await fixture.deps.docker.inspectContainer("evcp-ws-prj-compatible")).running,
      true
    );
  } finally {
    resumeCleanup.resolve();
    await reconciling;
  }
});

for (const mismatch of ["image", "duplicate-base"]) {
  test(`startup refuses a ${mismatch} mismatch in an unpersisted physical claim`, async () => {
    const fixture = await createCrashedWarmStartupFixture();
    invalidate(fixture.docker.state.containers[0], mismatch);
    await fixture.createReplica().boot();
    assert.deepEqual(await fixture.runtimeRecords.list(), []);
    assert.deepEqual(await fixture.deps.secrets.listNames("prj_crash"), []);
    assert.equal(await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"), null);
    assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
    assert.deepEqual(fixture.revokedKeys, ["key-1"]);
  });
}

test("an established durable warm workspace survives a configured release change", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  await fixture.createReplica().boot();
  const [owner] = await fixture.runtimeRecords.list();
  fixture.deps.image = "repo/workspace:v2";
  await fixture.createReplica().boot();
  assert.deepEqual(await fixture.runtimeRecords.list(), [owner]);
  assert.equal(
    (await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")).containerId,
    fixture.containerId
  );
  assert.ok(!fixture.releasedSchemas.includes("warm-resource-1"));
  assert.ok(!fixture.revokedKeys.includes("key-1"));
});
