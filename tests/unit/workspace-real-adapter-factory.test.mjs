import test from "node:test";
import assert from "node:assert/strict";

const {
  resolveWorkspaceAdapterMode,
  resolveWorkspaceRuntimeOptions,
  createDefaultWorkspaceOrchestrator
} = await import("../../apps/platform-api/src/workspace-orchestrator/factory.ts");

test("real factory offers deferred pool construction and memory mode stays unattached", async () => {
  let buildPool;
  const memory = createDefaultWorkspaceOrchestrator({
    env: {},
    onWarmPoolFactory: (factory) => {
      buildPool = factory;
    }
  });
  assert.equal(buildPool, undefined);
  assert.equal((await memory.getWarmPoolStatus()).target, 0);
  const real = createDefaultWorkspaceOrchestrator({
    env: {
      EVCP_WORKSPACE_REAL_ADAPTERS: "1",
      EVCP_WORKSPACE_WARM_POOL_SIZE: "2",
      EVCP_LITELLM_BASE_URL: "http://litellm:4000",
      EVCP_LITELLM_MASTER_KEY: "sk-master",
      EVCP_WORKSPACE_SECRET_KEY: "0".repeat(64),
      MINIO_ROOT_USER: "root",
      MINIO_ROOT_PASSWORD: "root-secret"
    },
    onWarmPoolFactory: (factory) => {
      buildPool = factory;
    }
  });
  assert.equal(typeof buildPool, "function");
  assert.equal((await real.getWarmPoolStatus()).target, 0);
  real.configureWarmPool(
    buildPool({
      async list() {
        return [];
      }
    })
  );
  assert.deepEqual(await real.getWarmPoolStatus(), {
    target: 2,
    preparing: 0,
    ready: 0,
    claiming: 0,
    failed: 0,
    staleImage: 0
  });
});

test("adapter mode defaults to memory and flips to real via env", () => {
  assert.equal(resolveWorkspaceAdapterMode({}), "memory");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "1" }), "real");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "0" }), "memory");
});

test("memory mode still provisions against fakes (no infra)", async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator();
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj-demo-app",
    slug: "demo-app"
  });
  assert.equal(record.state, "running");
});

test("real mode builds an orchestrator without throwing at construction", () => {
  const orchestrator = createDefaultWorkspaceOrchestrator({
    env: {
      EVCP_WORKSPACE_REAL_ADAPTERS: "1",
      EVCP_LITELLM_BASE_URL: "http://litellm:4000",
      EVCP_LITELLM_MASTER_KEY: "sk-master",
      EVCP_WORKSPACE_SECRET_KEY: "0".repeat(64),
      MINIO_ROOT_USER: "root",
      MINIO_ROOT_PASSWORD: "root-secret"
    }
  });
  assert.equal(typeof orchestrator.provisionWorkspace, "function");
});

test("real mode refuses to start without an injected workspace encryption key", () => {
  assert.throws(
    () =>
      createDefaultWorkspaceOrchestrator({
        env: { EVCP_WORKSPACE_REAL_ADAPTERS: "1" }
      }),
    /EVCP_WORKSPACE_SECRET_KEY.*required/i
  );
});

test("real mode refuses to silently substitute a memory LiteLLM admin", () => {
  assert.throws(
    () =>
      createDefaultWorkspaceOrchestrator({
        env: {
          EVCP_WORKSPACE_REAL_ADAPTERS: "1",
          EVCP_WORKSPACE_SECRET_KEY: "0".repeat(64)
        }
      }),
    /EVCP_LITELLM_BASE_URL.*EVCP_LITELLM_MASTER_KEY.*required/i
  );
});

test("real mode refuses to provision buckets without server-held MinIO admin credentials", () => {
  assert.throws(
    () =>
      createDefaultWorkspaceOrchestrator({
        env: {
          EVCP_WORKSPACE_REAL_ADAPTERS: "1",
          EVCP_WORKSPACE_SECRET_KEY: "0".repeat(64),
          EVCP_LITELLM_BASE_URL: "http://litellm:4000",
          EVCP_LITELLM_MASTER_KEY: "sk-master"
        }
      }),
    /MINIO_ROOT_USER.*MINIO_ROOT_PASSWORD.*required/i
  );
});

test("real mode runtime options honor release compose workspace env", () => {
  const options = resolveWorkspaceRuntimeOptions({
    EVCP_WORKSPACE_IMAGE: "ghcr.io/0xlabsteam/evcp-workspace-next:v9.9.9",
    EVCP_WORKSPACE_NETWORK: "evcp-private-server_evcp-internal",
    POSTGRES_DB: "tenantdb",
    EVCP_PG_HOST: "postgres",
    EVCP_PG_PORT: "5432",
    EVCP_S3_HOST: "minio",
    EVCP_S3_PORT: "9000",
    EVCP_S3_SSL: "false"
  });

  assert.equal(options.image, "ghcr.io/0xlabsteam/evcp-workspace-next:v9.9.9");
  assert.equal(options.network, "evcp-private-server_evcp-internal");
  assert.equal(options.databaseName, "tenantdb");
  assert.equal(options.postgresHost, "postgres:5432");
  assert.equal(options.s3Endpoint, "http://minio:9000");
});
