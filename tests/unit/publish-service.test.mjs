import test from "node:test";
import assert from "node:assert/strict";
import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryHealthChecker } from "../../apps/platform-api/src/publish/health-checker.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

function buildDeps({ buildExit = 0, healthy = true } = {}) {
  const docker = createMemoryDockerEngine();
  // Seed the already-running dev container (created earlier by the workspace
  // orchestrator, not as part of the publish flow) so commitContainer can find it.
  docker.state.containers.push({
    containerId: "dev-c1",
    spec: { name: "evcp-ws-app" },
    status: "running"
  });
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "", stderr: buildExit === 0 ? "" : "err", exitCode: buildExit };
  };
  const git = createMemoryGitPort({ p1: { clean: true, head: "sha1", migrationNames: {} } });
  const audits = [];
  return {
    docker,
    git,
    migrations: createMemoryMigrationStore(),
    deployments: createMemoryDeploymentStore(),
    health: createMemoryHealthChecker(healthy),
    resolveEnv: () => ({ DATABASE_URL: "postgres://x" }),
    getDevContainerId: () => "dev-c1",
    network: "evcp-internal",
    onAudit: (e) => audits.push(e),
    _audits: audits
  };
}

test("happy path: checks pass, image built, prod container started, healthy deployment recorded + audited", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", publishedByUserId: "u1" });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.healthStatus, "healthy");
  assert.equal(outcome.deployment.commitSha, "sha1");
  assert.match(outcome.deployment.imageTag, /^evcp-prod-app:sha1$/);
  // built an image and started a prod container
  assert.equal(deps.docker.state.commits.length, 1);
  assert.ok(deps.docker.state.containers.some((c) => c.spec.name === "evcp-prod-app"));
  // audit events: publish + deploy
  assert.ok(deps._audits.some((e) => e.action === "workspace.publish"));
  assert.ok(deps._audits.some((e) => e.action === "workspace.deploy"));
  // secret values never appear in audit metadata
  assert.ok(!JSON.stringify(deps._audits).includes("postgres://x"));
});

test("pre-checks fail: no image built, returns failures, no deployment recorded", async () => {
  const deps = buildDeps({ buildExit: 1 });
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", publishedByUserId: "u1" });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "pre_checks_failed");
  assert.ok(outcome.failures.some((f) => /build/i.test(f)));
  assert.equal(deps.docker.state.commits.length, 0);
  assert.equal(deps.deployments.list("p1").length, 0);
});

test("health check fails: deployment recorded as failed, marked not-current", async () => {
  const deps = buildDeps({ healthy: false });
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", publishedByUserId: "u1" });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "health_failed");
  assert.equal(outcome.deployment.healthStatus, "failed");
  assert.equal(deps.deployments.getCurrent("app"), null, "a failed deploy must not become current");
});

test("rollback: publishing an explicit older commit checks out that commit and tags the image with it", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p1.head = "sha2"; // HEAD is newer
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", commitSha: "sha1", publishedByUserId: "u1" });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.commitSha, "sha1");
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha1"]);
  assert.ok(deps._audits.some((e) => e.action === "workspace.rollback"));
});
