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

test("the landing image runs the standalone server", () => {
  const dockerfile = readFileSync("docker/landing-web.Dockerfile", "utf8");
  assert.match(dockerfile, /node:22/);
  assert.match(dockerfile, /pnpm --filter @evcp\/landing-web build/);
  assert.match(dockerfile, /apps\/landing-web\/server\.js/);
  assert.match(dockerfile, /^USER node$/m);
});

test("the image accepts the public origin as a build argument", () => {
  const dockerfile = readFileSync("docker/landing-web.Dockerfile", "utf8");
  const argIndex = dockerfile.indexOf("ARG NEXT_PUBLIC_SITE_URL");
  const buildIndex = dockerfile.indexOf("pnpm --filter @evcp/landing-web build");
  assert.ok(argIndex !== -1, "Dockerfile must declare ARG NEXT_PUBLIC_SITE_URL");
  assert.ok(argIndex < buildIndex, "the ARG must be declared before the build runs");
});
