import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";

const START = new Date("2026-09-05T00:00:00.000Z");

test("ensureCapacity prepares exactly the missing slots", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3, readySlots: 1 });

  await fixture.pool.ensureCapacity();

  assert.equal((await fixture.store.list()).filter((slot) => slot.state === "ready").length, 3);
  assert.equal(
    fixture.docker.state.containers.filter((item) => item.status === "running").length,
    2
  );
});

test("parallel ensureCapacity calls collapse into one preparation pass", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3 });

  await Promise.all([fixture.pool.ensureCapacity(), fixture.pool.ensureCapacity()]);

  assert.equal((await fixture.store.list()).length, 3);
  assert.equal(fixture.prepareAttempts, 3);
});

test("a slot is ready only after preview health succeeds", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });

  await fixture.pool.ensureCapacity();

  assert.equal((await fixture.store.list())[0].state, "failed");
  assert.equal(fixture.revokedKeys.length, 1);
  assert.equal(fixture.releasedSchemas.length, 1);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.audits.at(-1).action, "workspace.pool_prepare_failed");
  assert.equal(fixture.audits.at(-1).metadata.errorCategory, "preview_unhealthy");
  assert.equal(fixture.audits.at(-1).metadata.failedCount, 1);
});

test("preparation failure applies bounded exponential retry", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });

  await fixture.pool.ensureCapacity();
  await fixture.pool.ensureCapacity();

  assert.equal(fixture.prepareAttempts, 1);
  assert.equal((await fixture.store.list())[0].retryAfter, "2026-09-05T00:00:05.000Z");
});

test("replacement failures preserve exponential history and cap retries at five minutes", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();

  for (let failureCount = 2; failureCount <= 7; failureCount += 1) {
    const failed = (await fixture.store.list())[0];
    fixture.setNow(new Date(failed.retryAfter));
    await fixture.pool.ensureCapacity();
    assert.equal((await fixture.store.list())[0].failureCount, failureCount);
  }

  const failed = (await fixture.store.list())[0];
  assert.equal(failed.retryAfter, "2026-09-05T00:10:15.000Z");
});

test("an expired failed slot is removed and replaced", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  const failedId = (await fixture.store.list())[0].id;
  fixture.previewExitCode = 0;
  fixture.setNow(new Date("2026-09-05T00:00:05.000Z"));

  await fixture.pool.ensureCapacity();

  const slots = await fixture.store.list();
  assert.equal(slots.length, 1);
  assert.notEqual(slots[0].id, failedId);
  assert.equal(slots[0].state, "ready");
});

test("prepared slots and audit metadata are anonymous and contain no decrypted secrets", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });

  await fixture.pool.ensureCapacity();

  const slot = (await fixture.store.list())[0];
  const container = fixture.docker.state.containers[0];
  assert.equal(container.spec.labels["evcp.project-id"], undefined);
  assert.equal(container.spec.labels["evcp.kind"], "workspace-warm");
  assert.equal(container.spec.labels["evcp.warm-slot-id"], slot.id);
  assert.equal(fixture.docker.state.volumes[0].labels["evcp.project-id"], undefined);
  assert.equal(fixture.docker.state.volumes[0].labels["evcp.kind"], "workspace-warm");
  assert.doesNotMatch(slot.secretPayload, /pg-secret|storage-secret|llm-secret/);
  assert.doesNotMatch(JSON.stringify(fixture.audits), /pg-secret|storage-secret|llm-secret/);
  assert.deepEqual(
    fixture.audits.map((event) => event.action),
    ["workspace.pool_prepare_started", "workspace.pool_ready"]
  );
});

test("claim opens the prepared allocation and completeClaim retires its slot", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();

  const allocation = await fixture.pool.claim("prj_new");

  assert.ok(allocation);
  assert.equal(allocation.env.LLM_GATEWAY_KEY, "llm-secret-1");
  assert.equal((await fixture.store.list())[0].claimProjectId, "prj_new");
  await fixture.pool.completeClaim(allocation.slotId);
  assert.equal((await fixture.store.list()).length, 0);
});

test("failClaim destroys every slot-owned resource and retires its row", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const allocation = await fixture.pool.claim("prj_broken");
  assert.ok(allocation);

  await fixture.pool.failClaim(allocation.slotId, new Error("handoff exposed-secret-value failed"));

  assert.equal((await fixture.store.list()).length, 0);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.docker.state.volumes.length, 0);
  assert.deepEqual(fixture.releasedSchemas, [allocation.resourceKey]);
  assert.deepEqual(fixture.releasedBuckets, [allocation.resourceKey]);
  assert.deepEqual(fixture.revokedKeys, [allocation.llmGatewayKeyId]);
  assert.doesNotMatch(JSON.stringify(fixture.audits), /exposed-secret-value/);
});

function createWarmPoolFixture({ targetSize, readySlots = 0, previewExitCode = 0 }) {
  const store = createMemoryWarmSlotStore();
  const docker = createMemoryDockerEngine();
  const releasedSchemas = [];
  const releasedBuckets = [];
  const revokedKeys = [];
  const audits = [];
  let prepareAttempts = 0;
  let currentNow = START;
  let nextId = readySlots + 1;
  const codec = createWarmPoolSecretCodec("1".repeat(64));

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

  fixture.pool = createWorkspaceWarmPool({
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
          releasedBuckets.push(resourceKey);
        }
      },
      llmGateway: {
        async createVirtualKey() {
          return { keyId: `key-${prepareAttempts}`, key: `llm-secret-${prepareAttempts}` };
        },
        async revokeVirtualKey(keyId) {
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
  });

  return fixture;
}

function createMemoryWarmSlotStore() {
  const slots = new Map();
  let timestamp = 0;
  const iso = () => new Date(START.getTime() + timestamp++).toISOString();
  const clone = (value) => structuredClone(value);

  return {
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
}
