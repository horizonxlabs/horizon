import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";

const START = new Date("2026-09-05T00:00:00.000Z");

export function createWarmPoolFixture({
  targetSize,
  readySlots = 0,
  previewExitCode = 0,
  cleanupFailure
}) {
  const store = createMemoryWarmSlotStore();
  const docker = createMemoryDockerEngine();
  const releasedSchemas = [];
  const releasedBuckets = [];
  const revokedKeys = [];
  const audits = [];
  let prepareAttempts = 0;
  let currentNow = START;
  let nextId = readySlots + 1;
  let remainingCleanupFailures = cleanupFailure ? 1 : 0;
  const codec = createWarmPoolSecretCodec("1".repeat(64));
  const failCleanupOnce = (kind) => {
    if (cleanupFailure !== kind || remainingCleanupFailures === 0) return;
    remainingCleanupFailures -= 1;
    throw new Error(`${kind} cleanup unavailable`);
  };

  for (let index = 1; index <= readySlots; index += 1) {
    store.seedReady({
      id: `warm_slot_${index}`,
      resourceKey: `warm-resource-${index}`,
      containerId: `existing-container-${index}`,
      llmGatewayKeyId: `existing-key-${index}`,
      secretPayload: codec.seal({ DATABASE_URL: `postgresql://existing-${index}` })
    });
  }

  const fixture = {
    store,
    docker,
    releasedSchemas,
    releasedBuckets,
    revokedKeys,
    audits,
    createPool: undefined,
    get prepareAttempts() {
      return prepareAttempts;
    },
    get previewExitCode() {
      return previewExitCode;
    },
    set previewExitCode(value) {
      previewExitCode = value;
    },
    setNow(value) {
      currentNow = value;
    }
  };

  const execInContainer = docker.execInContainer.bind(docker);
  docker.execInContainer = async (containerId, command) => {
    await execInContainer(containerId, command);
    return {
      stdout: "",
      stderr: previewExitCode === 0 ? "" : "not ready",
      exitCode: previewExitCode
    };
  };
  const removeVolume = docker.removeVolume.bind(docker);
  docker.removeVolume = async (volumeName) => {
    failCleanupOnce("volume");
    return removeVolume(volumeName);
  };

  const poolOptions = {
    targetSize,
    store,
    codec,
    now: () => currentNow,
    createSlotIdentity: () => {
      const sequence = nextId++;
      return { id: `warm_slot_${sequence}`, resourceKey: `warm-resource-${sequence}` };
    },
    deps: {
      postgres: {
        async provisionSchema(resourceKey) {
          prepareAttempts += 1;
          return {
            schemaName: `app_${resourceKey.replaceAll("-", "_")}`,
            roleName: `app_${resourceKey.replaceAll("-", "_")}_role`,
            password: `pg-secret-${prepareAttempts}`
          };
        },
        async releaseSchema(resourceKey) {
          failCleanupOnce("schema");
          releasedSchemas.push(resourceKey);
        }
      },
      objectStorage: {
        async provisionBucket(resourceKey) {
          return {
            bucket: `proj-${resourceKey}`,
            accessKey: `access-key-${prepareAttempts}`,
            secretKey: `storage-secret-${prepareAttempts}`
          };
        },
        async releaseBucket(resourceKey) {
          failCleanupOnce("bucket");
          releasedBuckets.push(resourceKey);
        }
      },
      llmGateway: {
        async createVirtualKey() {
          return { keyId: `key-${prepareAttempts}`, key: `llm-secret-${prepareAttempts}` };
        },
        async revokeVirtualKey(keyId) {
          failCleanupOnce("key");
          revokedKeys.push(keyId);
        }
      },
      secrets: {
        async put() {},
        async listNames() {
          return [];
        },
        async resolveEnv() {
          return {};
        },
        async rotate() {},
        async removeAll() {},
        async hydrate() {}
      },
      docker,
      postgresHost: "postgres:5432",
      databaseName: "evcp",
      s3Endpoint: "http://minio:9000",
      onAudit: (event) => audits.push(event)
    }
  };
  fixture.createPool = () => createWorkspaceWarmPool(poolOptions);
  fixture.pool = fixture.createPool();

  return fixture;
}

function createMemoryWarmSlotStore() {
  const slots = new Map();
  let timestamp = 0;
  const iso = () => new Date(START.getTime() + timestamp++).toISOString();
  const clone = (value) => structuredClone(value);
  let reservationTail = Promise.resolve();

  const store = {
    seedReady(input) {
      const createdAt = iso();
      slots.set(input.id, {
        ...input,
        state: "ready",
        claimProjectId: null,
        lastError: null,
        retryAfter: null,
        failureCount: 0,
        readyAt: createdAt,
        claimedAt: null,
        createdAt,
        updatedAt: createdAt
      });
    },
    async list() {
      return [...slots.values()].map(clone);
    },
    async createPreparing(input) {
      if (slots.has(input.id)) throw new Error(`duplicate slot '${input.id}'`);
      const createdAt = iso();
      const slot = {
        ...input,
        state: "preparing",
        containerId: null,
        llmGatewayKeyId: null,
        secretPayload: null,
        claimProjectId: null,
        lastError: null,
        retryAfter: null,
        failureCount: 0,
        readyAt: null,
        claimedAt: null,
        createdAt,
        updatedAt: createdAt
      };
      slots.set(slot.id, slot);
      return clone(slot);
    },
    async reservePreparing(targetSize, candidates) {
      const previous = reservationTail;
      let release;
      reservationTail = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const current = [...slots.values()].filter(
          (slot) => slot.state === "preparing" || slot.state === "ready"
        ).length;
        const missing = Math.max(0, targetSize - current);
        const reserved = [];
        for (const candidate of candidates.slice(0, missing)) {
          reserved.push(await store.createPreparing(candidate));
        }
        return reserved;
      } finally {
        release();
      }
    },
    async recordPreparedResources(id, patch) {
      Object.assign(slots.get(id), patch, { updatedAt: iso() });
    },
    async recordPreparingContainer(id, containerId) {
      Object.assign(slots.get(id), { containerId, updatedAt: iso() });
    },
    async markReady(id, patch) {
      Object.assign(slots.get(id), patch, {
        state: "ready",
        lastError: null,
        retryAfter: null,
        readyAt: iso(),
        updatedAt: iso()
      });
    },
    async markFailed(id, patch) {
      Object.assign(slots.get(id), patch, { state: "failed", updatedAt: iso() });
    },
    async claim(projectId) {
      const slot = [...slots.values()].find((candidate) => candidate.state === "ready");
      if (!slot) return null;
      Object.assign(slot, { state: "claiming", claimProjectId: projectId, claimedAt: iso() });
      return clone(slot);
    },
    async remove(id) {
      slots.delete(id);
    }
  };
  return store;
}
