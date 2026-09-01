import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryLaunchGrantStore,
  RedisLaunchGrantStore
} from "../../apps/platform-api/src/publish/launch-grant-store.ts";

const grant = {
  appSlug: "sales-app",
  projectId: "prj-sales",
  routePath: "/apps/prj-sales",
  subdomain: "sales",
  bearerToken: "session-token-that-must-stay-opaque"
};

test("memory launch grant uses a 32-byte opaque base64url identifier", async () => {
  const store = new MemoryLaunchGrantStore();

  const id = await store.create(grant, 60);

  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(id, "base64url").byteLength, 32);
  assert.equal(id.includes(grant.appSlug), false);
  assert.equal(id.includes(grant.projectId), false);
  assert.equal(id.includes(grant.bearerToken), false);
});

test("memory launch grant expires exactly at its 60-second deadline", async () => {
  let now = 1_000;
  const store = new MemoryLaunchGrantStore({
    now: () => now,
    randomId: () => "deterministic-expiring-grant"
  });
  await store.create(grant, 60);

  now += 60_000;

  assert.equal(await store.consume("deterministic-expiring-grant"), null);
});

test("memory launch grant can only be consumed once", async () => {
  const store = new MemoryLaunchGrantStore({
    randomId: () => "deterministic-single-use-grant"
  });
  await store.create(grant, 60);

  assert.deepEqual(await store.consume("deterministic-single-use-grant"), grant);
  assert.equal(await store.consume("deterministic-single-use-grant"), null);
});

test("redis launch grants use a fixed namespace, expiry, and atomic consumption", async () => {
  const calls = [];
  const store = new RedisLaunchGrantStore(
    {
      async set(key, value, options) {
        calls.push({ operation: "set", key, value, options });
      },
      async getDel(key) {
        calls.push({ operation: "getDel", key });
        return JSON.stringify(grant);
      }
    },
    { randomId: () => "deterministic-redis-grant" }
  );

  const id = await store.create(grant, 60);
  const consumed = await store.consume(id);

  assert.equal(id, "deterministic-redis-grant");
  assert.deepEqual(consumed, grant);
  assert.deepEqual(calls, [
    {
      operation: "set",
      key: "evcp:launch-grant:deterministic-redis-grant",
      value: JSON.stringify(grant),
      options: { EX: 60 }
    },
    {
      operation: "getDel",
      key: "evcp:launch-grant:deterministic-redis-grant"
    }
  ]);
});
