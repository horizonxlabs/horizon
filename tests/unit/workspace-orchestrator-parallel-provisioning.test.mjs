import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

const { createWorkspaceOrchestrator } =
  await import("../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts");
const { createPgClientPostgresProvisioner } =
  await import("../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts");
const { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } =
  await import("../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts");
const { createProjectSecretStore } =
  await import("../../apps/platform-api/src/workspace-orchestrator/secret-store.ts");
const { createMemoryDockerEngine } =
  await import("../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts");
const { persistWorkspaceSecrets } =
  await import("../../apps/platform-api/src/workspace-orchestrator/workspace-provisioning.ts");

function createDeps(overrides = {}) {
  return {
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine(),
    onAudit: () => {},
    ...overrides
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("provisionWorkspace starts independent infrastructure work in parallel", async () => {
  const release = deferred();
  const started = new Set();
  const markStarted = async (name, value) => {
    started.add(name);
    await release.promise;
    return value;
  };
  const deps = createDeps({
    postgres: {
      provisionSchema: () =>
        markStarted("postgres", {
          schemaName: "app_prj_parallel",
          roleName: "app_prj_parallel_role",
          password: "pg-secret"
        }),
      releaseSchema: async () => {}
    },
    objectStorage: {
      provisionBucket: () =>
        markStarted("object-storage", {
          bucket: "proj-prj-parallel",
          accessKey: "access-key",
          secretKey: "storage-secret"
        }),
      releaseBucket: async () => {}
    },
    llmGateway: {
      createVirtualKey: () => markStarted("llm-gateway", { keyId: "key-1", key: "llm-secret" }),
      revokeVirtualKey: async () => {}
    }
  });
  const ensureVolume = deps.docker.ensureVolume.bind(deps.docker);
  deps.docker.ensureVolume = async (...args) => {
    started.add("workspace-volume");
    await release.promise;
    return ensureVolume(...args);
  };
  const orchestrator = createWorkspaceOrchestrator(deps);

  const provisioning = orchestrator.provisionWorkspace({
    projectId: "prj_parallel",
    slug: "parallel"
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([...started].sort(), [
      "llm-gateway",
      "object-storage",
      "postgres",
      "workspace-volume"
    ]);
  } finally {
    release.resolve();
  }

  assert.equal((await provisioning).state, "running");
});

test("provisionWorkspace persists independent encrypted secrets in parallel", async () => {
  const release = deferred();
  const started = new Set();
  const deps = createDeps();
  const put = deps.secrets.put.bind(deps.secrets);
  deps.secrets.put = async (projectId, name, value) => {
    started.add(name);
    await release.promise;
    return put(projectId, name, value);
  };
  const orchestrator = createWorkspaceOrchestrator(deps);

  const provisioning = orchestrator.provisionWorkspace({
    projectId: "prj_parallel_secrets",
    slug: "parallel-secrets"
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([...started].sort(), [
      "DATABASE_URL",
      "LLM_GATEWAY_KEY",
      "S3_ACCESS_KEY",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_SECRET_KEY"
    ]);
  } finally {
    release.resolve();
  }

  assert.equal((await provisioning).state, "running");
});

test("parallel secret persistence waits for every write before rollback", async () => {
  const release = deferred();
  const completed = [];
  const secrets = {
    put: async (_projectId, name) => {
      if (name === "DATABASE_URL") throw new Error("secret persistence unavailable");
      await release.promise;
      completed.push(name);
    }
  };
  let rejectionObserved = false;
  const persistence = persistWorkspaceSecrets({ secrets }, "prj_parallel_secret_failure", {
    DATABASE_URL: "postgresql://unavailable",
    S3_ENDPOINT: "http://minio:9000"
  });
  const rejected = assert.rejects(persistence, /secret persistence unavailable/).finally(() => {
    rejectionObserved = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rejectionObserved, false, "must wait for all in-flight writes before rejecting");
  release.resolve();

  await rejected;
  assert.deepEqual(completed, ["S3_ENDPOINT"]);
});
