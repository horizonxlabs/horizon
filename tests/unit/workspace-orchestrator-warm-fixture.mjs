import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

export async function createFixture({ ready = true, failure } = {}) {
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
  const replace = secrets.replaceForProvisioning.bind(secrets);
  secrets.replaceForProvisioning = async (...args) => {
    maybeFail("secret");
    return replace(...args);
  };
  const removeSecrets = secrets.removeProvisioning.bind(secrets);
  secrets.removeProvisioning = async (...args) => {
    order.push("remove-secrets");
    return removeSecrets(...args);
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
