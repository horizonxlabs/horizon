import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

function runCheck(relFile, contents) {
  const root = process.cwd();
  const dir = join(root, "apps/admin-web/src/__govtest__");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, relFile);
  writeFileSync(file, contents, "utf8");
  try {
    execFileSync("node", ["scripts/quality/check-design-system.mjs", file], { cwd: root });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? "") + String(error.stderr ?? "") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("app file with an arbitrary Tailwind value is rejected", () => {
  const result = runCheck("Bad.tsx", 'export const x = <div className="p-[13px]" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /arbitrary/i);
});

test("app file with a color utility is rejected", () => {
  const result = runCheck("BadColor.tsx", 'export const x = <div className="bg-blue-500" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("app file with only layout utilities passes", () => {
  const result = runCheck("Good.tsx", 'export const x = <div className="flex gap-4 p-2" />;\n');
  assert.equal(result.ok, true);
});
