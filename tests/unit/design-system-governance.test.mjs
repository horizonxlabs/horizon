import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

// check-design-system.mjs resolves every target relative to its own process.cwd(), so tests
// that need to exercise a real repo-relative path (e.g. the landing-web globals.css/layout.tsx
// exemptions) run the check against a scratch directory shaped like the repo instead of
// writing into the real app source tree — those real files are read concurrently by other
// test files under the parallel `node --test` runner, and in-place mutation would race them.
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

test("landing-web sources are governed like every other app surface", () => {
  const result = runCheck(
    "apps/landing-web/src/Bad.tsx",
    'export const x = <div className="bg-blue-500" />;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("landing-web may import the marketing stylesheet", () => {
  const result = runCheck("apps/landing-web/src/Ok.tsx", 'import "@evcp/ui/marketing.css";\n');
  assert.equal(result.ok, true);
});

test("an app-local stylesheet in landing-web is still rejected", () => {
  const result = runCheck("apps/landing-web/src/extra.css", ".x { display: flex; }\n");
  assert.equal(result.ok, false);
  assert.match(result.output, /app-local stylesheet/i);
});

test("globals.css passes when it only imports @evcp/ui and declares sources", () => {
  const result = runCheck(
    "apps/landing-web/src/app/[lang]/globals.css",
    '/* entry */\n@import "@evcp/ui/styles.css";\n@import "@evcp/ui/marketing.css";\n@source "../";\n'
  );
  assert.equal(result.ok, true);
});

test("globals.css fails when it declares its own styling", () => {
  const result = runCheck(
    "apps/landing-web/src/app/[lang]/globals.css",
    '@import "@evcp/ui/styles.css";\n.hero { color: red; }\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /globals\.css/i);
});

test("globals.css rejects a declaration appended after a legal import on the same line", () => {
  const result = runCheck(
    "apps/landing-web/src/app/[lang]/globals.css",
    '@import "@evcp/ui/styles.css"; .hero{color:red}\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /globals\.css/i);
});

test("globals.css accepts a multi-line block comment without leading stars", () => {
  const result = runCheck(
    "apps/landing-web/src/app/[lang]/globals.css",
    '/* first line\n   second line without a star */\n@import "@evcp/ui/styles.css";\n'
  );
  assert.equal(result.ok, true);
});

test("globals.css rejects an import of a package other than @evcp/ui", () => {
  const result = runCheck(
    "apps/landing-web/src/app/[lang]/globals.css",
    '@import "@evcp/ui/styles.css";\n@import "tailwindcss";\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /globals\.css/i);
});

test("the landing-web root layout may import its own globals.css", () => {
  const result = runCheck(
    "apps/landing-web/src/app/[lang]/layout.tsx",
    'import "./globals.css";\nexport const x = 1;\n'
  );
  assert.equal(result.ok, true);
});

test("a non-layout landing-web file importing a local .css is still rejected", () => {
  const result = runCheck(
    "apps/landing-web/src/app/NotLayout.tsx",
    'import "./globals.css";\nexport const x = 1;\n'
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /local CSS import/i);
});
