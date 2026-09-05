import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";

const START = new Date("2026-09-05T00:00:00.000Z");

export function createWarmPoolFixture({
  targetSize,
  readySlots = 0,
  previewExitCode = 0,
  cleanupFailure,
  runtimeRecords,
  operationLeaseMs,
  createOperationOwner
}) {
  let currentNow = START;
  const store = createMemoryWarmSlotStore(() => currentNow);
  const docker = createMemoryDockerEngine();
  const releasedSchemas = [];
  const releasedBuckets = [];
  const revokedKeys = [];
  const audits = [];
  let prepareAttempts = 0;
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
    operationLeaseMs,
    createOperationOwner,
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
      runtimeRecords,
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

function createMemoryWarmSlotStore(now) {
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
        operationOwner: null,
        operationExpiresAt: null,
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
    async createPreparing(input, lease) {
      if (slots.has(input.id)) throw new Error(`duplicate slot '${input.id}'`);
      const createdAt = iso();
      const slot = {
        ...input,
        state: "preparing",
        containerId: null,
        llmGatewayKeyId: null,
        secretPayload: null,
        claimProjectId: null,
        operationOwner: lease?.ownerId ?? null,
        operationExpiresAt: lease?.expiresAt ?? null,
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
    async reservePreparing(targetSize, candidates, lease) {
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
          reserved.push(await store.createPreparing(candidate, lease));
        }
        return reserved;
      } finally {
        release();
      }
    },
    async recordPreparedResources(id, patch, lease) {
      return updateOwned(id, patch, lease);
    },
    async recordPreparingContainer(id, containerId, lease) {
      return updateOwned(id, { containerId }, lease);
    },
    async markReady(id, patch, lease) {
      return updateOwned(
        id,
        {
          ...patch,
          state: "ready",
          lastError: null,
          retryAfter: null,
          operationOwner: null,
          operationExpiresAt: null,
          readyAt: iso()
        },
        lease,
        false
      );
    },
    async markFailed(id, patch, lease) {
      return updateOwned(
        id,
        {
          ...patch,
          state: "failed",
          ...(lease ? { operationExpiresAt: patch.retryAfter } : {})
        },
        lease,
        false
      );
    },
    async renewOperation(id, lease) {
      const slot = slots.get(id);
      if (!owns(slot, lease)) return false;
      Object.assign(slot, { operationExpiresAt: lease.expiresAt, updatedAt: iso() });
      return true;
    },
    async acquireCleanup(id, expectedState, lease) {
      const slot = slots.get(id);
      if (
        !slot ||
        slot.state !== expectedState ||
        (slot.operationExpiresAt !== null &&
          new Date(slot.operationExpiresAt).getTime() > new Date(lease.now).getTime())
      ) {
        return null;
      }
      Object.assign(slot, {
        state: "cleaning",
        operationOwner: lease.ownerId,
        operationExpiresAt: lease.expiresAt,
        updatedAt: iso()
      });
      return clone(slot);
    },
    async claim(projectId) {
      const slot = [...slots.values()].find(
        (candidate) =>
          candidate.state === "ready" &&
          (candidate.operationExpiresAt === null ||
            new Date(candidate.operationExpiresAt).getTime() <= now().getTime())
      );
      if (!slot) return null;
      Object.assign(slot, { state: "claiming", claimProjectId: projectId, claimedAt: iso() });
      return clone(slot);
    },
    async remove(id, ownerId) {
      const slot = slots.get(id);
      if (!slot || (ownerId && slot.operationOwner !== ownerId)) return false;
      slots.delete(id);
      return true;
    }
  };

  function owns(slot, lease) {
    return Boolean(
      slot &&
      slot.operationOwner === lease.ownerId &&
      slot.operationExpiresAt !== null &&
      new Date(slot.operationExpiresAt).getTime() > new Date(lease.now).getTime()
    );
  }

  function updateOwned(id, patch, lease, renew = true) {
    const slot = slots.get(id);
    if (!slot || (lease && !owns(slot, lease))) return false;
    Object.assign(slot, patch, {
      ...(lease && renew ? { operationExpiresAt: lease.expiresAt } : {}),
      updatedAt: iso()
    });
    return true;
  }
  return store;
}
