import test from "node:test";
import assert from "node:assert/strict";
import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { buildPublishServiceDeps } from "./publish-service-test-helpers.mjs";

test("publish fails before starting a deployment when workspace secrets cannot be resolved", async () => {
  const deps = buildPublishServiceDeps();
  deps.resolveEnv = async () => { throw new Error("workspace secrets unavailable"); };
  const service = createPublishService(deps);

  await assert.rejects(() => service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  }), /workspace secrets unavailable/);
  assert.equal(deps.docker.state.containers.some((item) => item.spec.name === "evcp-production-app"), false);
});

test("rollback is rejected before checkout when the target predates an applied migration", async () => {
  const deps = buildPublishServiceDeps();
  deps.git.state.projects.p1.head = "sha2";
  deps.git.state.projects.p1.migrationNames = { sha1: [], sha2: ["20260714_add_approvals"] };
  await deps.migrations.recordMigration({
    projectId: "p1",
    name: "20260714_add_approvals",
    sql: "create table approvals(id text primary key)",
    commitSha: "sha2"
  });

  const outcome = await createPublishService(deps).publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "sha1",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "pre_checks_failed");
  assert.match(outcome.failures.join("\n"), /predates applied migrations/);
  assert.match(outcome.failures.join("\n"), /Restore a compatible database backup/);
  assert.equal(deps.git.state.projects.p1.head, "sha2");
  assert.deepEqual(deps.git.state.projects.p1.checkouts ?? [], []);
  assert.equal(deps.docker.state.builds.length, 0);
});
