import test from "node:test";
import assert from "node:assert/strict";

const { buildCreateUserPayload, generateTempPassword } = await import(
  "../../apps/admin-web/src/main.tsx"
);

test("buildCreateUserPayload trims + defaults role to creator", () => {
  const payload = buildCreateUserPayload({
    email: "  New@Co.com ",
    name: " New ",
    role: "",
    tempPassword: "temp-pass-1"
  });
  assert.deepEqual(payload, {
    email: "new@co.com",
    name: "New",
    role: "creator",
    tempPassword: "temp-pass-1"
  });
});

test("generateTempPassword yields a >= 8 char string", () => {
  const pw = generateTempPassword();
  assert.ok(pw.length >= 8);
});
