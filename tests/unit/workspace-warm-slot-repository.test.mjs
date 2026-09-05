import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";

const schemaUrl = new URL("../../apps/platform-api/prisma/schema.prisma", import.meta.url);

import {
  AtomicCapacityPersistenceClient,
  DeterministicWarmSlotPersistenceClient
} from "./workspace-warm-slot-persistence-fixture.mjs";

const slotFixture = { id: "warm_1", resourceKey: "warm-resource-1" };
const readyPatch = {
  containerId: "container_1",
  llmGatewayKeyId: "gateway_key_1",
  secretPayload: "sealed-payload"
};
const operationLease = {
  ownerId: "preparer",
  now: "2026-09-05T00:00:00.000Z",
  expiresAt: "2026-09-05T00:05:00.000Z"
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
    first.reservePreparing(3, identities("first"), operationLease),
    second.reservePreparing(3, identities("second"), operationLease)
  ]);

  assert.equal(reservations.flat().length, 3);
  assert.equal((await first.list()).length, 3);
  assert.match(client.executedStatements[0], /pg_advisory_xact_lock/i);
  assert.equal(
    client.claimQueries.some((query) => /pg_advisory_xact_lock/i.test(query)),
    false
  );
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

test("cleanup ownership is acquired by exactly one repository after operation expiry", async () => {
  const client = new DeterministicWarmSlotPersistenceClient();
  const first = new WorkspaceWarmSlotRepositoryBackedStore(client);
  const second = new WorkspaceWarmSlotRepositoryBackedStore(client);
  await first.createPreparing(slotFixture, {
    ownerId: "preparer",
    now: "2026-09-05T00:00:00.000Z",
    expiresAt: "2026-09-05T00:05:00.000Z"
  });

  assert.equal(
    await second.acquireCleanup(slotFixture.id, "preparing", {
      ownerId: "early-cleaner",
      now: "2026-09-05T00:04:59.999Z",
      expiresAt: "2026-09-05T00:09:59.999Z"
    }),
    null
  );
  const owners = await Promise.all([
    first.acquireCleanup(slotFixture.id, "preparing", {
      ownerId: "cleaner-one",
      now: "2026-09-05T00:05:00.001Z",
      expiresAt: "2026-09-05T00:10:00.001Z"
    }),
    second.acquireCleanup(slotFixture.id, "preparing", {
      ownerId: "cleaner-two",
      now: "2026-09-05T00:05:00.001Z",
      expiresAt: "2026-09-05T00:10:00.001Z"
    })
  ]);

  assert.equal(owners.filter(Boolean).length, 1);
  assert.equal(owners.find(Boolean).state, "cleaning");
  assert.equal(
    await second.acquireCleanup(slotFixture.id, "preparing", {
      ownerId: "wrong-resumer",
      now: "2026-09-05T00:10:00.002Z",
      expiresAt: "2026-09-05T00:15:00.002Z"
    }),
    null
  );
  assert.equal(
    (
      await second.acquireCleanup(slotFixture.id, "cleaning", {
        ownerId: "cleaning-resumer",
        now: "2026-09-05T00:10:00.002Z",
        expiresAt: "2026-09-05T00:15:00.002Z"
      })
    ).state,
    "cleaning"
  );
});

test("repository retains retry history while cleanup occupies capacity and restarts the same row", async () => {
  const client = new AtomicCapacityPersistenceClient();
  const store = new WorkspaceWarmSlotRepositoryBackedStore(client);
  await store.createPreparing(slotFixture, operationLease);
  await store.markReady(slotFixture.id, readyPatch, operationLease);
  await store.markFailed(
    slotFixture.id,
    {
      lastError: "preview_unhealthy",
      failureCount: 3,
      retryAfter: "2026-09-05T00:05:00.000Z"
    }
  );
  const retryLease = {
    ownerId: "retry-owner",
    now: "2026-09-05T00:05:00.000Z",
    expiresAt: "2026-09-05T00:10:00.000Z"
  };
  await store.acquireCleanup(slotFixture.id, "failed", retryLease);

  const concurrentReservation = await store.reservePreparing(1, [
    { id: "replacement", resourceKey: "replacement-resource" }
  ], retryLease);
  const retrying = await store.retryPreparing(slotFixture.id, "retry-generation-resource", retryLease);

  assert.deepEqual(concurrentReservation, []);
  assert.equal(retrying.id, slotFixture.id);
  assert.equal(retrying.state, "preparing");
  assert.equal(retrying.failureCount, 3);
  assert.equal(retrying.resourceKey, "retry-generation-resource");
  assert.equal(retrying.containerId, null);
  assert.equal(retrying.llmGatewayKeyId, null);
  assert.equal(retrying.secretPayload, null);
  assert.equal(retrying.readyAt, null);
});

test("warm-slot Prisma schema uniquely identifies resources and indexes claim candidates", async () => {
  const schema = await readFile(schemaUrl, "utf8");
  const model = schema.match(/model WorkspaceWarmSlot \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const states =
    schema.match(/enum WorkspaceWarmSlotState \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(model, /resourceKey\s+String\s+@unique\s+@map\("resource_key"\)/);
  assert.match(model, /state\s+WorkspaceWarmSlotState/);
  assert.match(states, /\bcleaning\b/);
  assert.match(model, /operationOwner\s+String\?\s+@map\("operation_owner"\)/);
  assert.match(model, /operationExpiresAt\s+DateTime\?\s+@map\("operation_expires_at"\)/);
  assert.match(model, /@@index\(\[state, createdAt\]\)/);
});
