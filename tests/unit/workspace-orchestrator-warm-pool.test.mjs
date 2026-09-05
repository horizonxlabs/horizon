import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

async function createFixture({ ready = true, failure } = {}) {
  const prepared = createWarmPoolFixture({ targetSize: 1 });
  if (ready) await prepared.pool.ensureCapacity();
  const [slot] = await prepared.store.list();
  const events = [];
  const snapshots = new Map();
  const coldCalls = [];
  const localCleanup = [];
  const order = [];
  let failOnce = failure;
  const maybeFail = (step) => {
    if (failOnce !== step) return;
    failOnce = undefined;
    throw new Error("handoff failed with pg-secret-1 storage-secret-1 llm-secret-1");
  };
  const secrets = createProjectSecretStore({ encryptionKeyHex: "2".repeat(64) });
  const put = secrets.put.bind(secrets);
  secrets.put = async (...args) => {
    maybeFail("secret");
    return put(...args);
  };
  const removeAll = secrets.removeAll.bind(secrets);
  secrets.removeAll = async (projectId) => {
    order.push("remove-secrets");
    return removeAll(projectId);
  };
  const start = prepared.docker.startContainer.bind(prepared.docker);
  prepared.docker.startContainer = async (id) => {
    maybeFail("start");
    return start(id);
  };
  const exec = prepared.docker.execInContainer.bind(prepared.docker);
  prepared.docker.execInContainer = async (...args) => {
    maybeFail("health");
    order.push("health");
    return exec(...args);
  };
  const remove = prepared.docker.removeContainer.bind(prepared.docker);
  prepared.docker.removeContainer = async (id) => {
    order.push(`remove:${id}`);
    return remove(id);
  };
  const pool = {
    ...prepared.pool,
    async claim(projectId) {
      order.push("claim");
      return prepared.pool.claim(projectId);
    },
    async completeClaim(slotId) {
      order.push("complete");
      maybeFail("complete");
      return prepared.pool.completeClaim(slotId);
    },
    async failClaim(slotId, error) {
      order.push("fail");
      return prepared.pool.failClaim(slotId, error);
    },
    ensureCapacity() {
      order.push("refill");
      // An unresolved refill proves request completion is independent of preparation.
      return new Promise(() => {});
    }
  };
  const deps = {
    warmPool: pool,
    docker: prepared.docker,
    secrets,
    postgres: {
      async provisionSchema(key) {
        coldCalls.push(key);
        return { schemaName: "cold_schema", roleName: "cold_role", password: "cold-password" };
      },
      async releaseSchema(key) {
        localCleanup.push(key);
      }
    },
    objectStorage: {
      async provisionBucket() {
        return { bucket: "cold-bucket", accessKey: "cold-access", secretKey: "cold-secret" };
      },
      async releaseBucket(key) {
        localCleanup.push(key);
      }
    },
    llmGateway: {
      async createVirtualKey() {
        return { keyId: "cold-key-id", key: "cold-key" };
      },
      async revokeVirtualKey(key) {
        localCleanup.push(key);
      }
    },
    runtimeRecords: {
      async list() {
        return [...snapshots.values()];
      },
      async save(snapshot) {
        maybeFail("persist");
        snapshots.set(snapshot.record.projectId, structuredClone(snapshot));
        order.push(`persist:${snapshot.record.state}`);
      },
      async remove(projectId) {
        snapshots.delete(projectId);
      }
    },
    onAudit(event) {
      events.push(event);
      if (event.action === "workspace.pool_claimed") maybeFail("audit");
    }
  };
  return {
    prepared,
    slot,
    events,
    snapshots,
    coldCalls,
    localCleanup,
    order,
    deps,
    orchestrator: createWorkspaceOrchestrator(deps)
  };
}

test("a ready allocation uses the logical container and preview with prepared physical resources", async () => {
  const fixture = await createFixture();
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_new",
    slug: "new"
  });
  assert.equal(record.state, "running");
  assert.equal(record.resourceKey, "warm-resource-1");
  assert.deepEqual(fixture.coldCalls, []);
  const [container] = fixture.prepared.docker.state.containers;
  assert.equal(container.spec.name, "evcp-ws-prj-new");
  assert.ok(container.spec.env.includes("EVCP_PREVIEW_BASE=/preview/prj-new"));
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

for (const failure of ["start", "health", "secret", "persist", "complete"]) {
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
