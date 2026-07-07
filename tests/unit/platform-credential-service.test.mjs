import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformCredentialService, MemoryCredentialStore } = await import(
  "../../apps/platform-api/src/auth/platform-credential-service.ts"
);

test("setPassword rejects a weak password", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]);
  const svc = createPlatformCredentialService(store);
  const result = await svc.setPassword("u1", "short7!", { mustChange: true });
  assert.deepEqual(result, { ok: false, reason: "weak_password" });
});

test("verifyLogin succeeds after setPassword and reports mustChange", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]);
  const svc = createPlatformCredentialService(store);
  await svc.setPassword("u1", "temp-pass-1", { mustChange: true });
  const ok = await svc.verifyLogin("a@co", "temp-pass-1");
  assert.deepEqual(ok, { userId: "u1", mustChangePassword: true });
});

test("verifyLogin returns null for unknown email and for a user with no hash", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]); // no password set
  const svc = createPlatformCredentialService(store);
  assert.equal(await svc.verifyLogin("missing@co", "whatever8"), null);
  assert.equal(await svc.verifyLogin("a@co", "whatever8"), null);
});

test("changePassword requires the correct current password and clears mustChange", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]);
  const svc = createPlatformCredentialService(store);
  await svc.setPassword("u1", "temp-pass-1", { mustChange: true });
  assert.deepEqual(await svc.changePassword("u1", "wrong-pass-1", "new-pass-12"), {
    ok: false,
    reason: "wrong_current"
  });
  assert.deepEqual(await svc.changePassword("u1", "temp-pass-1", "weak7!"), {
    ok: false,
    reason: "weak_password"
  });
  assert.deepEqual(await svc.changePassword("u1", "temp-pass-1", "new-pass-12"), { ok: true });
  const relogin = await svc.verifyLogin("a@co", "new-pass-12");
  assert.deepEqual(relogin, { userId: "u1", mustChangePassword: false });
});
