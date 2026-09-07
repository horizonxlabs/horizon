import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createFixture } from "./workspace-orchestrator-warm-fixture.mjs";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";

test("a ready allocation transfers logical ownership without mutating its running container", async () => {
  const fixture = await createFixture();
  const original = await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1");
  const lifecycleCalls = [];
  for (const operation of [
    "stopContainer",
    "removeContainer",
    "createContainer",
    "startContainer"
  ]) {
    const invoke = fixture.deps.docker[operation].bind(fixture.deps.docker);
    fixture.deps.docker[operation] = async (...args) => {
      lifecycleCalls.push(operation);
      return invoke(...args);
    };
  }
  const lifecycleBefore = lifecycleCalls.length;
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_new",
    slug: "new"
  });
  assert.equal(record.state, "running");
  assert.equal(record.resourceKey, "warm-resource-1");
  assert.equal(record.containerId, original.containerId);
  assert.deepEqual(lifecycleCalls.slice(lifecycleBefore), []);
  assert.equal(record.projectId, "prj_new");
  assert.equal(record.id, "ws-prj-new");
  assert.deepEqual(fixture.coldCalls, []);
  const [container] = fixture.prepared.docker.state.containers;
  assert.equal(container.spec.name, "evcp-ws-warm-resource-1");
  assert.ok(container.spec.env.includes("EVCP_PREVIEW_BASE=/preview/warm-resource-1"));
  assert.equal(container.spec.hostConfig.Mounts[0].Source, "evcp-ws-warm-resource-1-data");
  assert.equal((await fixture.orchestrator.resolveEnv("prj_new")).LLM_GATEWAY_KEY, "llm-secret-1");
  assert.equal(fixture.snapshots.get("prj_new").llmGatewayKeyId, "key-1");
  assert.equal((await fixture.prepared.store.list()).length, 0);
  assert.ok(fixture.order.indexOf("health") < fixture.order.indexOf("persist:running"));
  assert.ok(fixture.order.indexOf("persist:running") < fixture.order.indexOf("complete"));
  assert.ok(fixture.order.indexOf("complete") < fixture.order.indexOf("refill"));
  assert.deepEqual(
    fixture.events.map((event) => event.action),
    ["workspace.pool_claimed"]
  );
  assert.doesNotMatch(JSON.stringify(fixture.events), /pg-secret|storage-secret|llm-secret/);
});

test("an empty pool immediately falls back cold and emits a sanitized fallback event", async () => {
  const fixture = await createFixture({ ready: false });
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_cold",
    slug: "cold"
  });
  assert.equal(record.resourceKey, "prj-cold");
  assert.deepEqual(fixture.coldCalls, ["prj-cold"]);
  assert.equal(fixture.events[0].action, "workspace.pool_cold_fallback");
  assert.equal(fixture.order.includes("refill"), false);
});

test("the claimed audit contains only the slot identity and finite monotonic phase durations", async () => {
  const fixture = await createFixture();
  await fixture.orchestrator.provisionWorkspace({ projectId: "prj_timing", slug: "timing" });
  const metadata = fixture.events.find(
    ({ action }) => action === "workspace.pool_claimed"
  ).metadata;
  assert.deepEqual(Object.keys(metadata).sort(), [
    "completeMs",
    "healthMs",
    "runtimeMs",
    "secretsMs",
    "slotId",
    "totalMs"
  ]);
  assert.equal(metadata.slotId, fixture.slot.id);
  for (const phase of ["healthMs", "secretsMs", "runtimeMs", "completeMs", "totalMs"]) {
    assert.equal(typeof metadata[phase], "number");
    assert.ok(Number.isFinite(metadata[phase]) && metadata[phase] >= 0);
    assert.ok(metadata[phase] <= metadata.totalMs);
  }
  assert.doesNotMatch(
    JSON.stringify(fixture.events),
    /pg-secret|storage-secret|llm-secret|secretPayload|DATABASE_URL/
  );
});

for (const failure of ["health", "secret", "persist", "complete"]) {
  test(`a ${failure} handoff failure destroys slot resources once before cold fallback`, async () => {
    const fixture = await createFixture({ failure });
    const record = await fixture.orchestrator.provisionWorkspace({
      projectId: "prj_retry",
      slug: "retry"
    });
    assert.equal(record.state, "running");
    assert.equal(record.resourceKey, "prj-retry");
    assert.deepEqual(fixture.coldCalls, ["prj-retry"]);
    assert.deepEqual(fixture.prepared.releasedSchemas, ["warm-resource-1"]);
    assert.deepEqual(fixture.prepared.releasedBuckets, ["warm-resource-1"]);
    assert.deepEqual(fixture.prepared.revokedKeys, ["key-1"]);
    assert.deepEqual(fixture.localCleanup, [], "only the pool destroys slot-owned infrastructure");
    assert.equal(fixture.prepared.docker.state.containers.length, 1);
    assert.deepEqual(
      fixture.prepared.docker.state.volumes.map((volume) => volume.name),
      ["evcp-ws-prj-retry-data"]
    );
    assert.equal((await fixture.prepared.store.list()).length, 0);
    assert.equal(fixture.snapshots.get("prj_retry").record.resourceKey, "prj-retry");
    assert.equal(fixture.snapshots.get("prj_retry").llmGatewayKeyId, "cold-key-id");
    assert.ok(fixture.order.indexOf("remove-secrets") < fixture.order.indexOf("fail"));
    assert.ok(fixture.order.indexOf("fail") < fixture.order.indexOf("refill"));
    assert.equal(fixture.events[0].action, "workspace.pool_claim_failed");
    assert.doesNotMatch(JSON.stringify(fixture.events), /pg-secret|storage-secret|llm-secret/);
  });
}

for (const unavailable of ["missing", "stopped", "mismatched"]) {
  test(`a ${unavailable} physical warm container is rejected before cold fallback`, async () => {
    const fixture = await createFixture();
    const inspect = fixture.deps.docker.inspectContainer.bind(fixture.deps.docker);
    fixture.deps.docker.inspectContainer = async (name) => {
      const found = await inspect(name);
      if (name !== "evcp-ws-warm-resource-1" || !found) return found;
      if (unavailable === "missing") return null;
      if (unavailable === "stopped") return { ...found, running: false };
      return { ...found, containerId: "another-container" };
    };
    const record = await fixture.orchestrator.provisionWorkspace({
      projectId: "prj_retry",
      slug: "retry"
    });
    assert.equal(record.resourceKey, "prj-retry");
    assert.deepEqual(fixture.prepared.releasedSchemas, ["warm-resource-1"]);
    assert.equal(fixture.events[0].action, "workspace.pool_claim_failed");
    assert.ok(fixture.order.indexOf("remove-secrets") < fixture.order.indexOf("fail"));
  });
}

test("a claimed audit transport failure cannot destroy a successfully owned workspace", async () => {
  const fixture = await createFixture({ failure: "audit" });
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_audit",
    slug: "audit"
  });
  assert.equal(record.resourceKey, "warm-resource-1");
  assert.deepEqual(fixture.prepared.releasedSchemas, []);
  assert.deepEqual(fixture.coldCalls, []);
});

test("persisted workspace recovery precedes selection of another warm allocation", async () => {
  const fixture = await createFixture();
  await fixture.orchestrator.provisionWorkspace({ projectId: "prj_recover", slug: "recover" });
  const recovered = createWorkspaceOrchestrator(fixture.deps);
  await recovered.hydrateRuntimeRecords(fixture.deps.runtimeRecords);
  fixture.order.length = 0;
  const record = await recovered.provisionWorkspace({ projectId: "prj_recover", slug: "renamed" });
  assert.equal(record.resourceKey, "warm-resource-1");
  assert.equal(fixture.order.includes("claim"), false);
  assert.deepEqual(fixture.coldCalls, []);
});

test("same-project callers share a promise and claim only one warm slot", async () => {
  const fixture = await createFixture();
  const input = { projectId: "prj_shared", slug: "shared" };
  const first = fixture.orchestrator.provisionWorkspace(input);
  const second = fixture.orchestrator.provisionWorkspace(input);
  assert.equal(first, second);
  const results = await Promise.all([first, second]);
  assert.equal(results[0], results[1]);
  assert.equal(fixture.order.filter((step) => step === "claim").length, 1);
  assert.deepEqual(fixture.coldCalls, []);
});

test("physical recovery never adopts a legacy-name container with a different persisted ID", async () => {
  const fixture = await createFixture();
  await fixture.orchestrator.provisionWorkspace({ projectId: "prj_recover", slug: "recover" });
  const inspect = fixture.deps.docker.inspectContainer.bind(fixture.deps.docker);
  let legacyInspections = 0;
  fixture.deps.docker.inspectContainer = async (name) => {
    if (name === "evcp-ws-warm-resource-1") return null;
    if (name === "evcp-ws-prj-recover") {
      legacyInspections += 1;
      return { containerId: "unrelated-container", running: true, env: [] };
    }
    return inspect(name);
  };
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_recover",
    slug: "recover"
  });
  assert.equal(legacyInspections, 1);
  assert.notEqual(record.containerId, "unrelated-container");
  assert.equal(record.resourceKey, "warm-resource-1");
});

test("two replicas preserve the durable warm winner without cold provisioning or secret rollback", async () => {
  const fixture = await createFixture();
  const persistence = createRuntimeLeaseFixture();
  const create = fixture.prepared.docker.createContainer.bind(fixture.prepared.docker);
  fixture.prepared.docker.createContainer = async (spec) => {
    if (fixture.prepared.docker.state.containers.some((item) => item.spec.name === spec.name)) {
      throw new Error("Docker container name is already in use");
    }
    return create(spec);
  };
  let releaseWinner;
  const winnerFinished = new Promise((resolve) => {
    releaseWinner = resolve;
  });
  let claims = 0;
  const claim = fixture.deps.warmPool.claim.bind(fixture.deps.warmPool);
  fixture.deps.warmPool.claim = async (projectId) => {
    claims += 1;
    if (claims > 1) await winnerFinished;
    return claim(projectId);
  };
  const first = createWorkspaceOrchestrator({
    ...fixture.deps,
    runtimeRecords: persistence.createStore()
  });
  const second = createWorkspaceOrchestrator({
    ...fixture.deps,
    runtimeRecords: persistence.createStore()
  });
  const input = { projectId: "prj_race", slug: "race" };
  const a = first.provisionWorkspace(input);
  const b = second.provisionWorkspace(input);
  a.then(releaseWinner, releaseWinner);
  const results = await Promise.allSettled([a, b]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fulfilled", "fulfilled"]
  );
  assert.deepEqual(
    results.map((result) => result.value.resourceKey),
    ["warm-resource-1", "warm-resource-1"]
  );
  assert.equal(fixture.prepared.docker.state.containers.length, 1);
  assert.equal(results[0].value.containerId, fixture.slot.containerId);
  assert.equal(results[1].value.containerId, fixture.slot.containerId);
  assert.equal(persistence.records.get("prj_race").state, "running");
  assert.equal(persistence.records.get("prj_race").resourceKey, "warm-resource-1");
  assert.equal((await fixture.deps.secrets.resolveEnv("prj_race")).LLM_GATEWAY_KEY, "llm-secret-1");
  assert.deepEqual(fixture.coldCalls, []);
  assert.equal(fixture.order.includes("remove-secrets"), false);
});

test("an expired provisioning lease can be taken over without waiting for the crashed replica", async () => {
  const fixture = await createFixture();
  const persistence = createRuntimeLeaseFixture();
  const store = persistence.createStore();
  await store.provisioningLeases.acquire("prj_crashed", "crashed-token", 1000);
  persistence.advance(1000);
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: store });
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj_crashed",
    slug: "crashed"
  });
  assert.equal(record.state, "running");
  assert.equal(record.resourceKey, "warm-resource-1");
  assert.deepEqual(fixture.coldCalls, []);
  assert.equal(persistence.leases.size, 0);
});

test("an expired lease owner falls back cold without destroying a stale claimed slot", async () => {
  const fixture = await createFixture();
  const persistence = createRuntimeLeaseFixture();
  const store = persistence.createStore();
  await store.provisioningLeases.acquire("prj_stale_claim", "crashed", 1000);
  const stale = await fixture.prepared.pool.claim("prj_stale_claim");
  persistence.advance(1000);
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: store });
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj_stale_claim",
    slug: "stale-claim"
  });
  assert.equal(record.state, "running");
  assert.equal(record.resourceKey, "prj-stale-claim");
  assert.deepEqual(fixture.coldCalls, ["prj-stale-claim"]);
  assert.equal((await fixture.prepared.store.list())[0].id, stale.slotId);
  assert.equal((await fixture.prepared.store.list())[0].state, "claiming");
  assert.deepEqual(fixture.prepared.releasedSchemas, []);
});

test("a handoff that loses its lease cannot remove the new owner's secrets or container", async () => {
  const fixture = await createFixture();
  const persistence = createRuntimeLeaseFixture();
  const store = persistence.createStore();
  const originalExec = fixture.deps.docker.execInContainer.bind(fixture.deps.docker);
  fixture.deps.docker.execInContainer = async (containerId, command) => {
    await originalExec(containerId, command);
    persistence.advance(5 * 60_000);
    assert.equal(
      await store.provisioningLeases.acquire("prj_takeover", "new-owner", 300_000),
      "acquired"
    );
    await fixture.deps.secrets.put("prj_takeover", "LLM_GATEWAY_KEY", "new-owner-secret");
    await store.provisioningLeases.save(
      {
        record: {
          id: "ws-prj-takeover",
          projectId: "prj_takeover",
          slug: "takeover",
          resourceKey: "warm-resource-1",
          state: "running",
          containerId,
          cpuCores: 1,
          memoryMb: 2048,
          lastActivityAt: "2026-09-05T00:00:00.000Z",
          createdAt: "2026-09-05T00:00:00.000Z",
          updatedAt: "2026-09-05T00:00:00.000Z"
        },
        llmGatewayKeyId: "key-1"
      },
      "new-owner",
      300_000
    );
    throw new Error("stale worker resumed after takeover");
  };
  const orchestrator = createWorkspaceOrchestrator({ ...fixture.deps, runtimeRecords: store });
  await assert.rejects(
    orchestrator.provisionWorkspace({ projectId: "prj_takeover", slug: "takeover" }),
    /lease is no longer owned/
  );
  assert.equal(
    (await fixture.deps.secrets.resolveEnv("prj_takeover")).LLM_GATEWAY_KEY,
    "new-owner-secret"
  );
  assert.equal(fixture.prepared.docker.state.containers.length, 1);
  assert.equal((await store.list())[0].record.resourceKey, "warm-resource-1");
  assert.deepEqual(fixture.coldCalls, []);
  assert.deepEqual(fixture.prepared.releasedSchemas, []);
  assert.equal(persistence.leases.get("prj_takeover").token, "new-owner");
});
test("orchestrator attaches a pool after construction and exposes aggregate status only", async () => {
  const fixture = await createFixture({ ready: false });
  fixture.deps.warmPool = undefined;
  const { orchestrator } = fixture;
  assert.deepEqual(await orchestrator.getWarmPoolStatus(), {
    target: 0,
    preparing: 0,
    ready: 0,
    claiming: 0,
    failed: 0,
    staleImage: 0
  });
  orchestrator.configureWarmPool(fixture.prepared.pool);
  await orchestrator.ensureWarmPoolCapacity();
  await orchestrator.reconcileWarmPool();
  assert.deepEqual(await orchestrator.getWarmPoolStatus(), {
    target: 1,
    preparing: 0,
    ready: 1,
    claiming: 0,
    failed: 0,
    staleImage: 0
  });
  assert.deepEqual(await orchestrator.cleanupOrphanContainers(), []);
  const record = await orchestrator.provisionWorkspace({
    projectId: "late-attachment",
    slug: "late-attachment"
  });
  assert.equal(record.resourceKey, "warm-resource-1");
});
