import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("packages/auth-sdk/src/index.ts", "utf8");

test("mock auth defines surface access for admin creator and store", () => {
  assert.match(source, /admin: \["admin"\]/);
  assert.match(source, /creator: \["creator", "admin"\]/);
  assert.match(source, /store: \["end_user", "creator", "admin"\]/);
  assert.match(source, /canAccessSurface/);
});

test("mock permissions include separate admin creator and end user capabilities", () => {
  assert.match(source, /platform:admin/);
  assert.match(source, /project:create/);
  assert.match(source, /ticket:create/);
});

