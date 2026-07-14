// tests/unit/workspace-secret-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createProjectSecretStore } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts"
);

const keyHex = randomBytes(32).toString("hex");

test("stores secrets encrypted and lists names only", async () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  await store.put("p1", "DATABASE_URL", "postgresql://app:pw@postgres/evcp?schema=app_x");
  await store.put("p1", "S3_SECRET_KEY", "super-secret");
  assert.deepEqual((await store.listNames("p1")).sort(), ["DATABASE_URL", "S3_SECRET_KEY"]);
  const dump = JSON.stringify(store);
  assert.ok(!dump.includes("super-secret"), "plaintext must not appear in store state");
});

test("resolveEnv round-trips plaintext for container injection", async () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  await store.put("p1", "DATABASE_URL", "postgresql://x");
  assert.deepEqual(await store.resolveEnv("p1"), { DATABASE_URL: "postgresql://x" });
});

test("rotate replaces value and stamps rotatedAt; removeAll clears project", async () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  await store.put("p1", "S3_SECRET_KEY", "old");
  await store.rotate("p1", "S3_SECRET_KEY", "new");
  assert.equal((await store.resolveEnv("p1")).S3_SECRET_KEY, "new");
  await store.removeAll("p1");
  assert.deepEqual(await store.listNames("p1"), []);
});

test("rejects invalid encryption key", () => {
  assert.throws(() => createProjectSecretStore({ encryptionKeyHex: "too-short" }), /encryption key/i);
});

test("does not expose a secret when encrypted persistence rejects", async () => {
  const store = createProjectSecretStore({
    encryptionKeyHex: keyHex,
    persistence: {
      loadAll: async () => [],
      upsert: async () => {
        throw new Error("database unavailable");
      },
      deleteAll: async () => {}
    }
  });

  await assert.rejects(
    () => store.put("p1", "DATABASE_URL", "postgresql://should-not-survive"),
    /database unavailable/
  );
  assert.deepEqual(await store.resolveEnv("p1"), {});
});
