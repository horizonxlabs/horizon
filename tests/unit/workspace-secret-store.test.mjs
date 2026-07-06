// tests/unit/workspace-secret-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createProjectSecretStore } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts"
);

const keyHex = randomBytes(32).toString("hex");

test("stores secrets encrypted and lists names only", () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  store.put("p1", "DATABASE_URL", "postgresql://app:pw@postgres/evcp?schema=app_x");
  store.put("p1", "S3_SECRET_KEY", "super-secret");
  assert.deepEqual(store.listNames("p1").sort(), ["DATABASE_URL", "S3_SECRET_KEY"]);
  const dump = JSON.stringify(store);
  assert.ok(!dump.includes("super-secret"), "plaintext must not appear in store state");
});

test("resolveEnv round-trips plaintext for container injection", () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  store.put("p1", "DATABASE_URL", "postgresql://x");
  assert.deepEqual(store.resolveEnv("p1"), { DATABASE_URL: "postgresql://x" });
});

test("rotate replaces value and stamps rotatedAt; removeAll clears project", () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  store.put("p1", "S3_SECRET_KEY", "old");
  store.rotate("p1", "S3_SECRET_KEY", "new");
  assert.equal(store.resolveEnv("p1").S3_SECRET_KEY, "new");
  store.removeAll("p1");
  assert.deepEqual(store.listNames("p1"), []);
});

test("rejects invalid encryption key", () => {
  assert.throws(() => createProjectSecretStore({ encryptionKeyHex: "too-short" }), /encryption key/i);
});
