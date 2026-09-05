import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";

const schemaUrl = new URL("../../apps/platform-api/prisma/schema.prisma", import.meta.url);

class DeterministicWarmSlotPersistenceClient {
  rows = new Map();
  claimQueries = [];
  waitingQueries = [];

  workspaceWarmSlot = {
    findMany: async () => [...this.rows.values()].sort(byCreatedAt).map(cloneRow),
    count: async ({ where }) =>
      [...this.rows.values()].filter((row) => where.state.in.includes(row.state)).length,
    create: async ({ data }) => {
      const now = new Date("2026-09-05T00:00:00.000Z");
      const row = {
        ...data,
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
        createdAt: now,
        updatedAt: now
      };
      this.rows.set(row.id, row);
      return cloneRow(row);
    },
    update: async ({ where, data }) => {
      const row = this.rows.get(where.id);
      if (!row) throw new Error(`unknown warm slot '${where.id}'`);
      Object.assign(row, data, { updatedAt: new Date("2026-09-05T00:00:01.000Z") });
      return cloneRow(row);
    },
    updateMany: async ({ where, data }) => {
      const row = this.rows.get(where.id);
      if (!row || row.state !== where.state) return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date("2026-09-05T00:00:02.000Z") });
      return { count: 1 };
    },
    findUnique: async ({ where }) => cloneRow(this.rows.get(where.id) ?? null),
    deleteMany: async ({ where }) => ({ count: this.rows.delete(where.id) ? 1 : 0 })
  };

  async $queryRawUnsafe(query) {
    this.claimQueries.push(query);
    const candidate = [...this.rows.values()]
      .filter((row) => row.state === "ready")
      .sort(byCreatedAt)[0];
    const result = candidate ? [{ id: candidate.id }] : [];

    if (candidate && this.claimQueries.length <= 2) {
      await new Promise((resolve) => {
        this.waitingQueries.push(resolve);
        if (this.waitingQueries.length === 2) {
          for (const release of this.waitingQueries.splice(0)) release();
        }
      });
    }

    return result;
  }

  async $transaction(operation) {
    return operation(this);
  }
}

class AtomicCapacityPersistenceClient extends DeterministicWarmSlotPersistenceClient {
  transactionTail = Promise.resolve();

  async $transaction(operation) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation(this);
    } finally {
      release();
    }
  }
}

const slotFixture = { id: "warm_1", resourceKey: "warm-resource-1" };
const readyPatch = {
  containerId: "container_1",
  llmGatewayKeyId: "gateway_key_1",
  secretPayload: "sealed-payload"
};

test("two concurrent claims cannot acquire the same ready slot", async () => {
  const client = new DeterministicWarmSlotPersistenceClient();
  const store = new WorkspaceWarmSlotRepositoryBackedStore(client);
  await store.createPreparing(slotFixture);
  await store.markReady(slotFixture.id, readyPatch);

  const claims = await Promise.all([store.claim("prj_a"), store.claim("prj_b")]);

  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(new Set(claims.filter(Boolean).map((slot) => slot.id)).size, 1);
  assert.match(client.claimQueries[0], /FOR\s+UPDATE\s+SKIP\s+LOCKED\s+LIMIT\s+1/i);
});

test("two repository instances atomically reserve no more than the capacity target", async () => {
  const client = new AtomicCapacityPersistenceClient();
  const first = new WorkspaceWarmSlotRepositoryBackedStore(client);
  const second = new WorkspaceWarmSlotRepositoryBackedStore(client);
  const identities = (prefix) =>
    Array.from({ length: 3 }, (_, index) => ({
      id: `${prefix}_${index}`,
      resourceKey: `${prefix}-resource-${index}`
    }));

  const reservations = await Promise.all([
    first.reservePreparing(3, identities("first")),
    second.reservePreparing(3, identities("second"))
  ]);

  assert.equal(reservations.flat().length, 3);
  assert.equal((await first.list()).length, 3);
  assert.match(client.claimQueries[0], /pg_advisory_xact_lock/i);
});

test("preparation ownership is persisted incrementally without changing slot state", async () => {
  const client = new DeterministicWarmSlotPersistenceClient();
  const store = new WorkspaceWarmSlotRepositoryBackedStore(client);
  await store.createPreparing(slotFixture);

  await store.recordPreparedResources(slotFixture.id, {
    llmGatewayKeyId: "gateway_key_1",
    secretPayload: "sealed-payload"
  });
  await store.recordPreparingContainer(slotFixture.id, "container_1");

  const [slot] = await store.list();
  assert.equal(slot.state, "preparing");
  assert.equal(slot.llmGatewayKeyId, "gateway_key_1");
  assert.equal(slot.secretPayload, "sealed-payload");
  assert.equal(slot.containerId, "container_1");
});

test("warm-slot Prisma schema uniquely identifies resources and indexes claim candidates", async () => {
  const schema = await readFile(schemaUrl, "utf8");
  const model = schema.match(/model WorkspaceWarmSlot \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(model, /resourceKey\s+String\s+@unique\s+@map\("resource_key"\)/);
  assert.match(model, /@@index\(\[state, createdAt\]\)/);
});

function byCreatedAt(left, right) {
  return left.createdAt.getTime() - right.createdAt.getTime();
}

function cloneRow(row) {
  return row === null ? null : structuredClone(row);
}
