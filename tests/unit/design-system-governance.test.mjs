import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

// check-design-system.mjs resolves every target relative to its own process.cwd(), so tests
// run the check against a scratch directory shaped like the repo instead of writing into the
// real app source tree — those real files are read concurrently by other test files under the
// parallel `node --test` runner, and in-place mutation would race them.
function runCheck(relFile, contents) {
  const scriptPath = join(process.cwd(), "scripts/quality/check-design-system.mjs");
  const scratchRoot = mkdtempSync(join(tmpdir(), "evcp-design-system-"));
  const file = join(scratchRoot, relFile);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
  try {
    execFileSync("node", [scriptPath, relFile], { cwd: scratchRoot });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? "") + String(error.stderr ?? "") };
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

test("app file with an arbitrary Tailwind value is rejected", () => {
  const result = runCheck(
    "apps/admin-web/src/Bad.tsx",
    'export const x = <div className="p-[13px]" />;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /arbitrary/i);
});

test("app file with a color utility is rejected", () => {
  const result = runCheck(
    "apps/admin-web/src/BadColor.tsx",
    'export const x = <div className="bg-blue-500" />;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("app file with only layout utilities passes", () => {
  const result = runCheck(
    "apps/admin-web/src/Good.tsx",
    'export const x = <div className="flex gap-4 p-2" />;\n'
  );
  assert.equal(result.ok, true);
});

test("app file with a bare color keyword (bg-white) is rejected", () => {
  const result = runCheck(
    "apps/admin-web/src/BareColor.tsx",
    'export const x = <div className="bg-white" />;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("app file with a non-token shadow utility (shadow-lg) is rejected", () => {
  const result = runCheck(
    "apps/admin-web/src/Shadow.tsx",
    'export const x = <div className="shadow-lg" />;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /shadow\/radius/i);
});

test("app file with a non-token radius utility (rounded-full) is rejected", () => {
  const result = runCheck(
    "apps/admin-web/src/Radius.tsx",
    'export const x = <div className="rounded-full" />;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /shadow\/radius/i);
});

test("app file using token radius/shadow utilities passes", () => {
  const result = runCheck(
    "apps/admin-web/src/Tokens.tsx",
    'export const x = <div className="rounded-card shadow-card rounded-control rounded-pill" />;\n'
  );
  assert.equal(result.ok, true);
});

test("app file using a Tailwind variant arbitrary value (data-[state=open]:) passes", () => {
  const result = runCheck(
    "apps/admin-web/src/Variant.tsx",
    'export const x = <div className="data-[state=open]:flex aria-[expanded=true]:block" />;\n'
  );
  assert.equal(result.ok, true);
});
