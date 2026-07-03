import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("packages/api-client/src/index.ts", "utf8");

test("api client exposes success and failure response envelope helpers", () => {
  assert.match(source, /export function success/);
  assert.match(source, /export function failure/);
  assert.match(source, /ok: true/);
  assert.match(source, /ok: false/);
  assert.match(source, /traceId/);
});

