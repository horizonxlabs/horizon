import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("apps/landing-web/package.json", "utf8"));

test("landing-web satisfies the workspace script contract", () => {
  assert.equal(manifest.name, "@evcp/landing-web");
  for (const script of ["dev", "build", "start", "typecheck"]) {
    assert.ok(manifest.scripts?.[script], `missing script ${script}`);
  }
});

test("landing-web runs on its own dev port", () => {
  assert.match(manifest.scripts.dev, /4103/);
});

test("landing-web depends on the shared design system", () => {
  assert.equal(manifest.dependencies["@evcp/ui"], "workspace:*");
});

test("next is configured for a standalone monorepo build", () => {
  const config = readFileSync("apps/landing-web/next.config.ts", "utf8");
  assert.match(config, /output:\s*"standalone"/);
  assert.match(config, /outputFileTracingRoot/);
});

test("the css entry only pulls in the shared design system", () => {
  const css = readFileSync("apps/landing-web/src/app/globals.css", "utf8");
  assert.match(css, /@import "@evcp\/ui\/styles\.css";/);
  assert.match(css, /@import "@evcp\/ui\/marketing\.css";/);
  assert.doesNotMatch(css, /\{/);
});

test("next build output is ignored by the repo tooling", () => {
  for (const path of [".gitignore", ".prettierignore"]) {
    assert.match(readFileSync(path, "utf8"), /^\.next$/m, `${path} must ignore .next`);
  }
  const oxlint = JSON.parse(readFileSync(".oxlintrc.json", "utf8"));
  assert.ok(oxlint.ignorePatterns.includes(".next/"), "oxlint must ignore .next/");
});

test("unit tests can resolve the landing-web @/ alias", () => {
  const testConfig = JSON.parse(readFileSync("tsconfig.test.json", "utf8"));
  assert.deepEqual(testConfig.compilerOptions.paths["@/*"], [
    "./apps/creator-web/src/*",
    "./apps/landing-web/src/*"
  ]);
});
