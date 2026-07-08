import test from "node:test";
import assert from "node:assert/strict";

const { hashPassword, verifyPassword, isStrongEnough, MIN_PASSWORD_LENGTH } = await import(
  "../../apps/platform-api/src/auth/password-hash.ts"
);

test("hash is not the plaintext and verifies", async () => {
  const hash = await hashPassword("correct horse 8");
  assert.notEqual(hash, "correct horse 8");
  assert.equal(await verifyPassword("correct horse 8", hash), true);
});

test("verify fails for the wrong password", async () => {
  const hash = await hashPassword("correct horse 8");
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("isStrongEnough enforces the minimum length", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(isStrongEnough("short7!"), false);
  assert.equal(isStrongEnough("longenough8"), true);
});
