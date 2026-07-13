import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/admin-web/src/app/AdminApp.tsx", "utf8");

test("AdminApp is a small composition root", () => {
  assert.ok(source.split("\n").length <= 400);
  assert.match(source, /from "@\/features\/admin-console"/);
});

test("admin console is exposed only through its feature barrel", () => {
  const barrel = readFileSync("apps/admin-web/src/features/admin-console/index.ts", "utf8");
  assert.match(barrel, /AdminConsole/);
});
