import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import deps from "../../docker/workspace-dependencies.cjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "horizon-deps-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const template = join(root, "template"),
    workspace = join(root, "workspace");
  const manifest = {
    name: "base",
    scripts: { dev: "next dev" },
    dependencies: { next: "15.5.25" }
  };
  for (const dir of [template, workspace]) {
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  }
  mkdirSync(join(template, "node_modules"));
  deps.writeStamp(template);
  symlinkSync(join(template, "node_modules"), join(workspace, "node_modules"));
  return { workspace, template, manifest };
}
test("renaming a project or changing dev scripts reuses dependencies without an install", (t) => {
  const { workspace, template, manifest } = fixture(t);
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify(
      { ...manifest, name: "staking-projection", scripts: { dev: "next dev --turbopack" } },
      null,
      2
    )
  );
  assert.equal(
    deps.ensureDependencies(workspace, template, () => assert.fail("unnecessary install")),
    "cached"
  );
});
test("stores the post-install lockfile fingerprint so a restart does not install again", (t) => {
  const { workspace, template, manifest } = fixture(t);
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({ ...manifest, dependencies: { next: "15.5.25", clsx: "2.1.1" } })
  );
  let installs = 0;
  const install = () => {
    installs++;
    mkdirSync(join(workspace, "node_modules"));
    writeFileSync(
      join(workspace, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: { "node_modules/clsx": { version: "2.1.1", integrity: "sha512-test" } }
      })
    );
  };
  assert.equal(deps.ensureDependencies(workspace, template, install), "installed");
  assert.equal(deps.ensureDependencies(workspace, template, install), "cached");
  assert.equal(installs, 1);
  assert.equal(
    readFileSync(join(template, "node_modules/.evcp-dependencies-v2"), "utf8"),
    deps.fingerprint(template)
  );
});
test("lock resolution and install hooks invalidate cache; formatting and root name do not", (t) => {
  const { workspace, manifest } = fixture(t);
  const lock = {
    name: "base",
    lockfileVersion: 3,
    packages: { "": manifest, "node_modules/next": { version: "15.5.25" } }
  };
  const write = (value) =>
    writeFileSync(join(workspace, "package-lock.json"), JSON.stringify(value));
  write(lock);
  const original = deps.fingerprint(workspace);
  write({
    ...lock,
    name: "renamed",
    packages: { ...lock.packages, "": { ...manifest, name: "renamed" } }
  });
  assert.equal(deps.fingerprint(workspace), original);
  write({ ...lock, packages: { ...lock.packages, "node_modules/next": { version: "15.5.26" } } });
  assert.notEqual(deps.fingerprint(workspace), original);
  write(lock);
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({ ...manifest, scripts: { prepare: "node setup.js" } })
  );
  assert.notEqual(deps.fingerprint(workspace), original);
});
test("a failed install never writes a successful cache stamp", (t) => {
  const { workspace, template, manifest } = fixture(t);
  writeFileSync(join(workspace, "package.json"), JSON.stringify({ ...manifest, dependencies: {} }));
  assert.throws(
    () =>
      deps.ensureDependencies(workspace, template, () => {
        throw new Error("install failed");
      }),
    /install failed/
  );
});
