import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
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

test("app file with a bare color keyword (bg-white) is rejected", () => {
  const result = runCheck("BareColor.tsx", 'export const x = <div className="bg-white" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("app file with a non-token shadow utility (shadow-lg) is rejected", () => {
  const result = runCheck("Shadow.tsx", 'export const x = <div className="shadow-lg" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /shadow\/radius/i);
});

test("app file with a non-token radius utility (rounded-full) is rejected", () => {
  const result = runCheck("Radius.tsx", 'export const x = <div className="rounded-full" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /shadow\/radius/i);
});

test("app file using token radius/shadow utilities passes", () => {
  const result = runCheck(
    "Tokens.tsx",
    'export const x = <div className="rounded-card shadow-card rounded-control rounded-pill" />;\n'
  );
  assert.equal(result.ok, true);
});

test("app file using a Tailwind variant arbitrary value (data-[state=open]:) passes", () => {
  const result = runCheck(
    "Variant.tsx",
    'export const x = <div className="data-[state=open]:flex aria-[expanded=true]:block" />;\n'
  );
  assert.equal(result.ok, true);
});

function runLandingCheck(relFile, contents) {
  const root = process.cwd();
  const dir = join(root, "apps/landing-web/src/app/__govtest__");
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

test("landing-web sources are governed like every other app surface", () => {
  const result = runLandingCheck("Bad.tsx", 'export const x = <div className="bg-blue-500" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("landing-web may import the marketing stylesheet", () => {
  const result = runLandingCheck("Ok.tsx", 'import "@evcp/ui/marketing.css";\n');
  assert.equal(result.ok, true);
});

test("an app-local stylesheet in landing-web is still rejected", () => {
  const result = runLandingCheck("extra.css", ".x { display: flex; }\n");
  assert.equal(result.ok, false);
  assert.match(result.output, /app-local stylesheet/i);
});

function runGlobalsCheck(contents) {
  const root = process.cwd();
  const dir = join(root, "apps/landing-web/src/app");
  const file = join(dir, "globals.css");
  const existed = existsSync(file);
  const previous = existed ? readFileSync(file, "utf8") : null;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, contents, "utf8");
  try {
    execFileSync("node", ["scripts/quality/check-design-system.mjs", file], { cwd: root });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? "") + String(error.stderr ?? "") };
  } finally {
    if (existed) writeFileSync(file, previous, "utf8");
    else rmSync(file, { force: true });
  }
}

test("globals.css passes when it only imports @evcp/ui and declares sources", () => {
  const result = runGlobalsCheck(
    '/* entry */\n@import "@evcp/ui/styles.css";\n@import "@evcp/ui/marketing.css";\n@source "../";\n'
  );
  assert.equal(result.ok, true);
});

test("globals.css fails when it declares its own styling", () => {
  const result = runGlobalsCheck('@import "@evcp/ui/styles.css";\n.hero { color: red; }\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /globals\.css/i);
});
