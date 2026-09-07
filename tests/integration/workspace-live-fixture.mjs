import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";
import { WorkspaceRuntimeRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-runtime-repository.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";
import { resolveWorkspaceRuntimeOptions } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import {
  createMinioObjectStorageProvisioner,
  createDockerMinioIdentityAdmin,
  MinioClient
} from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";
import {
  createPgClientPostgresProvisioner,
  schemaNameFor,
  roleNameFor
} from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";
import {
  createPgRunSql,
  createPgQuery
} from "../../apps/platform-api/src/workspace-orchestrator/pg-runner.ts";
import {
  createLiteLlmGatewayAdmin,
  bucketNameFor,
  resourceKeyForProject
} from "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createPgSecretPersistence } from "../../apps/platform-api/src/workspace-orchestrator/secret-persistence.ts";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";
import { workspaceVolumeName } from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";
import {
  assertLiveContainerAbsent,
  assertLiveWorkspaceDatabaseEmpty
} from "./workspace-live-assertions.mjs";
import { waitForWorkspaceLiveIdle } from "./workspace-live-idle.mjs";
import { reconcileRetiredWarmPreparations } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-retirement.ts";

// Wrap the actual adapter calls; never replace their external effects with counters.
export function instrumentWorkspaceLifecycle(docker) {
  const counts = { createContainer: 0, startContainer: 0, stopContainer: 0, removeContainer: 0 };
  for (const name of Object.keys(counts)) {
    const operation = docker[name].bind(docker);
    docker[name] = (...args) => {
      counts[name] += 1;
      return operation(...args);
    };
  }
  return {
    snapshot: () => ({ ...counts }),
    since: (before) =>
      Object.fromEntries(
        Object.entries(counts).map(([name, count]) => [name, count - before[name]])
      )
  };
}

export async function createWorkspaceLiveFixture(
  context,
  { targetSize = 0, env = process.env } = {}
) {
  assert.equal(
    env.EVCP_WORKSPACE_REAL_ADAPTERS,
    "1",
    "live tests require real adapters explicitly"
  );
  for (const key of [
    "EVCP_WORKSPACE_LIVE_DATABASE_URL",
    "EVCP_WORKSPACE_SECRET_KEY",
    "POSTGRES_DB",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "EVCP_LITELLM_BASE_URL",
    "EVCP_LITELLM_MASTER_KEY"
  ])
    assert.ok(env[key], `${key} must be configured for the isolated live test`);
  const databaseUrl = env.EVCP_WORKSPACE_LIVE_DATABASE_URL;
  const url = new URL(databaseUrl);
  assert.equal(
    decodeURIComponent(url.pathname.slice(1)),
    env.POSTGRES_DB,
    "POSTGRES_DB must name the dedicated live-test database"
  );
  assert.equal(url.searchParams.get("schema") ?? "public", "public");

  const require = createRequire(new URL("../../apps/platform-api/package.json", import.meta.url));
  const { PrismaClient } = require("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const store = new WorkspaceWarmSlotRepositoryBackedStore(client);
  const token = randomUUID().replaceAll("-", "").slice(0, 16);
  const projectId = `prj_live_${token}`;
  const ownerId = `user_live_${token}`;
  const projectKey = resourceKeyForProject(projectId);
  const resourceKeys = new Set();
  const slotIds = new Set();
  const keyIds = new Set();
  const keyResourceKeys = new Map();
  const activeIdentities = new Set();
  const containerNames = new Set();
  const pendingRefills = new Set();
  const pendingProvisions = new Set();
  const calls = { schemas: 0, buckets: 0, keys: 0 };
  const audits = [];
  let closing = false;
  let refillGate;
  let refillRequested;
  let deps;
  let orchestrator;
  let fixture;
  let pool;
  let projectCreated = false;
  let slotSequence = 0;

  // Register before connecting or provisioning so setup and assertion failures also clean up.
  context.after(async () => {
    closing = true;
    refillGate?.resolve();
    await waitForWorkspaceLiveIdle(pool, pendingProvisions, pendingRefills);
    const failures = [];
    const attempt = async (label, operation) => {
      try {
        await operation();
      } catch {
        failures.push(label);
      }
    };
    try {
      if (!deps) return;
      await attempt("project workspace deletion", () => orchestrator?.deleteWorkspace(projectId));
      // Every target was recorded before its create request. Never enumerate unrelated resources.
      for (const name of containerNames) {
        await attempt(`container ${name}`, async () => {
          const container = await deps.docker.inspectContainer(name);
          if (container) await deps.docker.removeContainer(container.containerId);
        });
      }
      for (const resourceKey of resourceKeys) {
        await attempt(`schema ${resourceKey}`, () => deps.postgres.releaseSchema(resourceKey));
        await attempt(`bucket ${resourceKey}`, () => deps.objectStorage.releaseBucket(resourceKey));
        await attempt(`volume ${resourceKey}`, () =>
          deps.docker.removeVolume(workspaceVolumeName(resourceKey))
        );
      }
      for (const keyId of keyIds) {
        await attempt("gateway key revocation", () => deps.llmGateway.revokeVirtualKey(keyId));
      }
      for (const resourceKey of resourceKeys) {
        await attempt("gateway generation retirement", () =>
          deps.llmGateway.revokeVirtualKeysForResource(resourceKey)
        );
      }
      await attempt("project secrets", () => deps.secrets.removeAll(projectId));
      if (failures.length === 0) {
        await fixture.assertResourcesRemoved();
        for (const id of slotIds) await store.remove(id);
        await reconcileRetiredWarmPreparations({ store, deps });
        assert.equal(
          (await store.preparations.list()).filter((intent) => resourceKeys.has(intent.resourceKey))
            .length,
          0,
          "ambiguous preparation intents remain; preserve the database for later cleanup"
        );
        if (projectCreated) {
          await client.project.delete({ where: { id: projectId } });
          await client.platformUser.delete({ where: { id: ownerId } });
        }
        assert.equal((await store.list()).filter((slot) => slotIds.has(slot.id)).length, 0);
      }
      assert.deepEqual(
        failures,
        [],
        "live cleanup failed; inspect only this run's recorded targets"
      );
      context.diagnostic(
        "live cleanup complete: project, slots, containers, volumes, schemas, buckets, and keys"
      );
    } finally {
      await client.$disconnect();
    }
  });

  await assertLiveWorkspaceDatabaseEmpty(store, client.workspaceRuntimeRecord);
  const docker = createDockerSocketEngine();
  const dockerMetrics = instrumentWorkspaceLifecycle(docker);
  const createContainer = docker.createContainer.bind(docker);
  docker.createContainer = async (spec) => {
    containerNames.add(spec.name);
    return createContainer(spec);
  };
  const storageOptions = {
    endPoint: env.EVCP_S3_ADMIN_HOST ?? env.EVCP_S3_HOST ?? "minio",
    port: Number(env.EVCP_S3_PORT ?? 9000),
    useSSL: env.EVCP_S3_SSL === "true",
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD
  };
  const minio = new MinioClient(storageOptions);
  const postgres = createPgClientPostgresProvisioner(
    createPgRunSql({ connectionString: databaseUrl })
  );
  const identityAdmin = createDockerMinioIdentityAdmin(docker, {
    containerName: env.EVCP_MINIO_CONTAINER_NAME ?? "evcp-minio",
    adminAccessKey: env.MINIO_ROOT_USER,
    adminSecretKey: env.MINIO_ROOT_PASSWORD
  });
  const objectStorage = createMinioObjectStorageProvisioner({
    ...storageOptions,
    identityAdmin: {
      async provision(input) {
        activeIdentities.add(input.bucket);
        return identityAdmin.provision(input);
      },
      async release(input) {
        await identityAdmin.release(input);
        activeIdentities.delete(input.bucket);
      }
    }
  });
  const llmGateway = createLiteLlmGatewayAdmin({
    baseUrl: env.EVCP_LITELLM_BASE_URL,
    masterKey: env.EVCP_LITELLM_MASTER_KEY
  });
  const provisionSchema = postgres.provisionSchema.bind(postgres);
  postgres.provisionSchema = async (key) => {
    resourceKeys.add(key);
    calls.schemas += 1;
    return provisionSchema(key);
  };
  const provisionBucket = objectStorage.provisionBucket.bind(objectStorage);
  objectStorage.provisionBucket = async (key) => {
    resourceKeys.add(key);
    calls.buckets += 1;
    return provisionBucket(key);
  };
  const createKey = llmGateway.createVirtualKey.bind(llmGateway);
  llmGateway.createVirtualKey = async (input) => {
    resourceKeys.add(input.slug);
    calls.keys += 1;
    const key = await createKey(input);
    keyIds.add(key.keyId);
    keyResourceKeys.set(key.keyId, input.slug);
    return key;
  };
  const revokeKey = llmGateway.revokeVirtualKey.bind(llmGateway);
  llmGateway.revokeVirtualKey = async (keyId) => {
    await revokeKey(keyId);
    keyIds.delete(keyId);
  };
  const secrets = createProjectSecretStore({
    encryptionKeyHex: env.EVCP_WORKSPACE_SECRET_KEY,
    persistence: createPgSecretPersistence(databaseUrl)
  });
  deps = {
    docker,
    postgres,
    objectStorage,
    llmGateway,
    secrets,
    runtimeRecords: new WorkspaceRuntimeRepositoryBackedStore(client),
    ...resolveWorkspaceRuntimeOptions(env),
    onAudit: (event) => audits.push(event)
  };
  fixture = {
    projectId,
    ownerId,
    projectKey,
    store,
    docker,
    dockerMetrics,
    image: deps.image ?? "evcp/workspace-next:1",
    calls,
    audits,
    get orchestrator() {
      return orchestrator;
    },
    holdRefill() {
      refillGate = Promise.withResolvers();
      refillRequested = Promise.withResolvers();
    },
    async releaseRefill() {
      assert.ok(refillRequested, "hold refill before claiming");
      await refillRequested.promise;
      const gate = refillGate;
      refillGate = undefined;
      gate.resolve();
      await Promise.all(pendingRefills);
      await pool.waitForIdle();
    },
    async assertResourcesRemoved({ resourceKey } = {}) {
      const targets = resourceKey ? [resourceKey] : [...resourceKeys];
      const query = createPgQuery({ connectionString: databaseUrl });
      for (const key of targets) {
        const schema = await query(
          "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
          [schemaNameFor(key)]
        );
        assert.equal(schema.rowCount, 0, "test schema must be removed");
        const role = await query("SELECT 1 FROM pg_roles WHERE rolname = $1", [roleNameFor(key)]);
        assert.equal(role.rowCount, 0, "test database role must be removed");
        assert.equal(
          await minio.bucketExists(bucketNameFor(key)),
          false,
          "test bucket must be removed"
        );
        assert.equal(
          activeIdentities.has(bucketNameFor(key)),
          false,
          "scoped MinIO user and policy must be removed successfully"
        );
      }
      const names = resourceKey ? [`evcp-ws-${resourceKey}`] : [...containerNames];
      for (const name of names) await assertLiveContainerAbsent(docker, name);
      const volumes = await docker.listManagedVolumes();
      assert.equal(
        volumes.some((volume) => targets.some((key) => volume.name === workspaceVolumeName(key))),
        false
      );
      assert.equal(
        [...keyIds].some((id) => targets.includes(keyResourceKeys.get(id))),
        false,
        "every created gateway key must be revoked successfully"
      );
      assert.deepEqual(
        await secrets.listNames(projectId),
        [],
        "project credentials must be removed"
      );
      const persistedSecrets = await query("SELECT 1 FROM project_secrets WHERE project_id = $1", [
        projectId
      ]);
      assert.equal(persistedSecrets.rowCount, 0, "persisted project credentials must be removed");
      assert.equal(
        (await deps.runtimeRecords.list()).some(({ record }) => record.projectId === projectId),
        false,
        "project runtime ownership must be removed"
      );
    }
  };
  await secrets.hydrate();
  await client.project.create({
    data: {
      id: projectId,
      name: "Disposable workspace live test",
      owner: {
        create: { id: ownerId, email: `${token}@workspace-live.invalid`, name: "Live test" }
      }
    }
  });
  projectCreated = true;
  pool = createWorkspaceWarmPool({
    targetSize,
    store,
    deps,
    codec: createWarmPoolSecretCodec(env.EVCP_WORKSPACE_SECRET_KEY),
    createSlotIdentity: () => {
      const id = `warm_live_${token}_${++slotSequence}`;
      slotIds.add(id);
      return { id, resourceKey: `warm-live-${token}-${slotSequence}` };
    }
  });
  orchestrator = createWorkspaceOrchestrator(deps);
  const provisionWorkspace = orchestrator.provisionWorkspace.bind(orchestrator);
  orchestrator.provisionWorkspace = (input) => {
    const pending = provisionWorkspace(input);
    pendingProvisions.add(pending);
    void pending.finally(() => pendingProvisions.delete(pending)).catch(() => undefined);
    return pending;
  };
  orchestrator.configureWarmPool({
    ...pool,
    ensureCapacity() {
      refillRequested?.resolve();
      const pending = Promise.resolve(refillGate?.promise).then(() => {
        if (!closing) return pool.ensureCapacity();
      });
      pendingRefills.add(pending);
      void pending.finally(() => pendingRefills.delete(pending)).catch(() => undefined);
      return pending;
    }
  });
  return fixture;
}
