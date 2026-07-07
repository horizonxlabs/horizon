import test from "node:test";
import assert from "node:assert/strict";

const { MemoryCorePersistenceClient } = await import(
  "../../apps/platform-api/src/persistence/core-repositories.ts"
);
const { createCorePersistenceCredentialStore, createUserWithRole } = await import(
  "../../apps/platform-api/src/auth/prisma-credential-store.ts"
);

test("createUserWithRole + setPassword + getByEmail/getById round-trips", async () => {
  const client = new MemoryCorePersistenceClient();
  const store = createCorePersistenceCredentialStore(client);

  const user = await createUserWithRole(client, {
    id: "usr_1",
    email: "New@Co.com",
    name: "New User",
    role: "creator"
  });
  assert.equal(user.email, "new@co.com");
  assert.equal(user.id, "usr_1");
  assert.equal(user.status, "active");

  await store.setPassword("usr_1", { passwordHash: "hash-abc", mustChangePassword: true });

  const byEmail = await store.getByEmail("new@co.com");
  assert.deepEqual(byEmail, {
    userId: "usr_1",
    passwordHash: "hash-abc",
    mustChangePassword: true
  });

  const byId = await store.getById("usr_1");
  assert.equal(byId.passwordHash, "hash-abc");
  assert.equal(byId.mustChangePassword, true);
});

test("getByEmail returns null for unknown email", async () => {
  const store = createCorePersistenceCredentialStore(new MemoryCorePersistenceClient());
  assert.equal(await store.getByEmail("missing@co.com"), null);
});

test("getById returns null for unknown user", async () => {
  const store = createCorePersistenceCredentialStore(new MemoryCorePersistenceClient());
  assert.equal(await store.getById("usr_missing"), null);
});
