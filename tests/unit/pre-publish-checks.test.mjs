import test from "node:test";
import assert from "node:assert/strict";
import { runPrePublishChecks } from "../../apps/platform-api/src/publish/pre-publish-checks.ts";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

function dockerWithBuild(exitCode) {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "build log", stderr: exitCode === 0 ? "" : "build failed", exitCode };
  };
  return docker;
}

test("passes when build succeeds, migrations applied, tree clean", async () => {
  const migrations = createMemoryMigrationStore();
  migrations.recordMigration({ projectId: "p1", name: "001_init", sql: "-- init", commitSha: "s" });
  const git = createMemoryGitPort({
    p1: { clean: true, head: "s", migrationNames: { s: ["001_init"] } }
  });
  const result = await runPrePublishChecks(
    { docker: dockerWithBuild(0), git, migrations },
    { projectId: "p1", slug: "app", containerId: "c1", commitSha: "s" }
  );
  assert.deepEqual(result, { ok: true });
});

test("fails and lists all failing checks", async () => {
  const migrations = createMemoryMigrationStore();
  migrations.recordMigration({ projectId: "p1", name: "001_init", sql: "-- init", commitSha: "s" });
  const git = createMemoryGitPort({
    p1: { clean: false, head: "s", migrationNames: { s: ["001_init", "002_users"] } }
  });
  const result = await runPrePublishChecks(
    { docker: dockerWithBuild(1), git, migrations },
    { projectId: "p1", slug: "app", containerId: "c1", commitSha: "s" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 3);
  assert.ok(result.failures.some((f) => /build/i.test(f)));
  assert.ok(result.failures.some((f) => /working tree/i.test(f)));
  assert.ok(result.failures.some((f) => /pending migration/i.test(f) && /002_users/.test(f)));
});

test("runs the project build script in dev container", async () => {
  const docker = dockerWithBuild(0);
  const git = createMemoryGitPort({ p1: { clean: true, head: "s", migrationNames: {} } });
  await runPrePublishChecks(
    { docker, git, migrations: createMemoryMigrationStore() },
    { projectId: "p1", slug: "app", containerId: "c1", commitSha: "s" }
  );
  const buildCall = docker.state.execCalls.find((c) => c.cmd.join(" ").includes("npm run build"));
  assert.ok(buildCall, "expected `npm run build` exec in dev container");
  assert.equal(buildCall.containerId, "c1");
});
