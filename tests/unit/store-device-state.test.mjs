import assert from "node:assert/strict";
import test from "node:test";

const { createStoreDeviceState, STORE_DEVICE_STATE_KEY } = await import("../../apps/app-store-pwa/src/features/storefront/device-state.ts");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test("device state recovers from invalid JSON and orders recent apps newest first", () => {
  const repository = createStoreDeviceState(memoryStorage({ [STORE_DEVICE_STATE_KEY]: "invalid" }));
  assert.deepEqual(repository.read().favorites, []);
  repository.recordRecent("leave"); repository.recordRecent("assets"); repository.recordRecent("leave");
  assert.deepEqual(repository.read().recent, ["leave", "assets"]);
});

test("device state fail-closes incompatible values and returns defensive snapshots", () => {
  const repository = createStoreDeviceState(memoryStorage({ [STORE_DEVICE_STATE_KEY]: JSON.stringify({ version: 2, favorites: ["leave"] }) }));
  const snapshot = repository.read();
  snapshot.favorites.push("mutated");
  assert.deepEqual(repository.read(), { version: 1, favorites: [], recent: [], ticketIds: [], accessReceipts: [] });
});

test("device state deduplicates, caps histories, persists receipts, and tolerates storage failures", () => {
  const storage = memoryStorage();
  const repository = createStoreDeviceState(storage);
  repository.toggleFavorite("leave"); repository.toggleFavorite("leave"); repository.toggleFavorite("assets");
  assert.deepEqual(repository.read().favorites, ["assets"]);
  for (let index = 0; index < 55; index++) repository.rememberTicket(`ticket_${index}`);
  for (let index = 0; index < 22; index++) repository.recordRecent(`app_${index}`);
  repository.rememberAccessReceipt({ id: "request_1", appSlug: "leave", requestedRoleKey: "manager", requesterEmail: "user@example.com", status: "pending", reason: "Need access", createdAt: "2026-07-29T00:00:00.000Z" });
  repository.rememberAccessReceipt({ id: "request_1", appSlug: "leave", requestedRoleKey: "manager", requesterEmail: "user@example.com", status: "pending", reason: "Need access", createdAt: "2026-07-29T00:00:00.000Z" });
  const snapshot = repository.read();
  assert.equal(snapshot.ticketIds.length, 50);
  assert.equal(snapshot.ticketIds[0], "ticket_54");
  assert.equal(snapshot.recent.length, 20);
  assert.equal(snapshot.recent[0], "app_21");
  assert.equal(snapshot.accessReceipts.length, 1);
  const unavailable = createStoreDeviceState({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });
  assert.doesNotThrow(() => unavailable.recordRecent("leave"));
  assert.deepEqual(unavailable.read().recent, ["leave"]);
});
