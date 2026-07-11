import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublishService,
  PRODUCTION_DOCKERFILE
} from "../../apps/platform-api/src/publish/publish-service.ts";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryHealthChecker } from "../../apps/platform-api/src/publish/health-checker.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { resourceKeyForProject } from "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts";

function buildDeps({ healthy = true } = {}) {
  const docker = createMemoryDockerEngine();
  // Seed the already-running dev container (created earlier by the workspace
  // orchestrator, not as part of the publish flow) so buildImage/commit can find it.
  docker.state.containers.push({
    containerId: "dev-c1",
    spec: { name: "evcp-ws-app" },
    status: "running"
  });
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

test("production Dockerfile preserves the npm dependency cache across source-only edits", () => {
  const manifestCopy = PRODUCTION_DOCKERFILE.indexOf("COPY package*.json ./");
  const install = PRODUCTION_DOCKERFILE.indexOf("RUN npm ci --no-audit --no-fund");
  const sourceCopy = PRODUCTION_DOCKERFILE.indexOf("COPY . .");

  assert.ok(manifestCopy >= 0, "package manifests must be copied into their own cacheable layer");
  assert.ok(manifestCopy < install, "npm ci must run after the manifest-only copy");
  assert.ok(install < sourceCopy, "application source must be copied only after npm ci is cached");
});

test("happy path: checks pass, image built, prod container started, healthy deployment recorded + audited", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const outcome = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.healthStatus, "healthy");
  assert.equal(outcome.deployment.environment, "production");
  assert.equal(outcome.deployment.commitSha, "sha1");
  assert.match(outcome.deployment.imageTag, /^evcp-production-app:sha1$/);
  // built a REAL production image (Dockerfile /build), not a `docker commit` snapshot
  assert.equal(deps.docker.state.builds.length, 1);
  assert.equal(deps.docker.state.commits.length, 0);
  assert.equal(deps.docker.state.builds[0].imageTag, "evcp-production-app:sha1");
  // the production Dockerfile + .dockerignore are injected into the build-context tar (extraFiles),
  // NOT written into the dev container's /workspace — writing them there would dirty the app's git
  // tree and break the clean-tree pre-check on the next publish.
  assert.deepEqual(deps.docker.state.builds[0].extraFiles.map((file) => file.name).sort(), [
    ".dockerignore",
    ".env.production",
    "Dockerfile",
  ]);
  assert.ok(
    !deps.docker.state.execCalls.some((c) => c.cmd.join(" ").includes("/workspace/Dockerfile")),
    "must NOT write a Dockerfile into the workspace"
  );
  assert.ok(deps.docker.state.containers.some((c) => c.spec.name === "evcp-production-app"));
  // audit events: publish + deploy
  assert.ok(deps._audits.some((e) => e.action === "workspace.publish"));
  assert.ok(deps._audits.some((e) => e.action === "workspace.deploy"));
  // secret values never appear in audit metadata
  assert.ok(!JSON.stringify(deps._audits).includes("postgres://x"));
});

test("staging image is built with a Next base path that keeps navigation behind the staging proxy", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);

  await service.publish({
    projectId: "p1",
    slug: "prj-123",
    environment: "staging",
    publishedByUserId: "u1"
  });

  const environmentFile = deps.docker.state.builds[0].extraFiles.find(
    (file) => file.name === ".env.production"
  );
  assert.ok(environmentFile, "the deployment environment must be injected in-memory");
  assert.equal(environmentFile.content, "EVCP_PREVIEW_BASE=/api/apps/prj-123/staging\n");
});

test("production image is built with its public app proxy base path", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);

  await service.publish({
    projectId: "p1",
    slug: "prj-123",
    environment: "production",
    publishedByUserId: "u1"
  });

  const environmentFile = deps.docker.state.builds[0].extraFiles.find(
    (file) => file.name === ".env.production"
  );
  assert.ok(environmentFile, "the deployment environment must be injected in-memory");
  assert.equal(environmentFile.content, "EVCP_PREVIEW_BASE=/api/apps/prj-123\n");
});

test("staging publish: produces an evcp-staging-<slug> container/image + records environment 'staging'", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const outcome = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.environment, "staging");
  assert.match(outcome.deployment.imageTag, /^evcp-staging-app:sha1$/);
  assert.ok(deps.docker.state.containers.some((c) => c.spec.name === "evcp-staging-app"));
  // its own per-env workspace volume (staging cannot corrupt production's disk)
  const staging = deps.docker.state.containers.find((c) => c.spec.name === "evcp-staging-app");
  assert.ok(staging.spec.hostConfig.Binds.includes("evcp-ws-app-staging-data:/workspace"));
});

test("pre-checks fail: no image built, returns failures, no deployment recorded", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p1.clean = false;
  const service = createPublishService(deps);
  const outcome = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "pre_checks_failed");
  assert.ok(outcome.failures.some((f) => /working tree/i.test(f)));
  assert.equal(deps.docker.state.builds.length, 0);
  assert.equal(deps.docker.state.commits.length, 0);
  assert.equal(deps.deployments.list("p1").length, 0);
});

test("publish never runs a Next build in the active dev container", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);

  const outcome = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, true);
  assert.equal(deps.docker.state.execCalls.length, 0);
  assert.equal(
    deps.docker.state.builds.length,
    1,
    "the isolated image build remains responsible for npm run build"
  );
});

test("serializes concurrent publish and rollback for the same project", async () => {
  const deps = buildDeps();
  const originalBuild = deps.docker.buildImage.bind(deps.docker);
  let releaseFirstBuild;
  const firstBuildStarted = new Promise((resolve) => {
    deps.docker.buildImage = async (...args) => {
      if (!releaseFirstBuild) {
        resolve();
        await new Promise((release) => {
          releaseFirstBuild = release;
        });
      }
      return originalBuild(...args);
    };
  });
  const service = createPublishService(deps);

  const first = service.publish({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    publishedByUserId: "u1"
  });
  await firstBuildStarted;
  const rollback = service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "sha0",
    publishedByUserId: "u1"
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    deps.git.state.projects.p1.checkouts ?? [],
    [],
    "rollback must wait for the active publish"
  );
  releaseFirstBuild();
  await Promise.all([first, rollback]);
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha0"]);
});

test("queues image builds across projects so a second deploy cannot compete for host resources", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p2 = { clean: true, head: "sha2", migrationNames: {} };
  const originalBuild = deps.docker.buildImage.bind(deps.docker);
  let releaseFirstBuild;
  const firstBuildStarted = new Promise((resolve) => {
    deps.docker.buildImage = async (...args) => {
      if (args[1] === "evcp-staging-app-one:sha1") {
        resolve();
        await new Promise((release) => {
          releaseFirstBuild = release;
        });
      }
      return originalBuild(...args);
    };
  });
  const service = createPublishService(deps);

  const first = service.publish({
    projectId: "p1",
    slug: "app-one",
    environment: "staging",
    publishedByUserId: "u1"
  });
  await firstBuildStarted;
  const second = service.publish({
    projectId: "p2",
    slug: "app-two",
    environment: "staging",
    publishedByUserId: "u2"
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    deps.docker.state.builds.length,
    0,
    "second project's image build must wait for the first deploy"
  );
  releaseFirstBuild();
  await Promise.all([first, second]);
  assert.deepEqual(
    deps.docker.state.builds.map((build) => build.imageTag),
    ["evcp-staging-app-one:sha1", "evcp-staging-app-two:sha2"]
  );
});

test("health check fails: deployment recorded as failed, marked not-current", async () => {
  const deps = buildDeps({ healthy: false });
  const service = createPublishService(deps);
  const outcome = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "health_failed");
  assert.equal(outcome.deployment.healthStatus, "failed");
  assert.equal(deps.deployments.getCurrent("app"), null, "a failed deploy must not become current");
});

test("rollback: publishing an explicit older commit checks out that commit and tags the image with it", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p1.head = "sha2"; // HEAD is newer
  const service = createPublishService(deps);
  const outcome = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "sha1",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.commitSha, "sha1");
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha1"]);
  assert.ok(deps._audits.some((e) => e.action === "workspace.rollback"));
});

test("promote: reuses the healthy staging commitSha for production WITHOUT a rebuild from dev/HEAD", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);

  // First deploy staging at HEAD (sha1); it becomes the current healthy staging deployment.
  const staging = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    publishedByUserId: "u1"
  });
  assert.equal(staging.ok, true);

  // Advance dev HEAD so a rebuild-from-dev would pick a DIFFERENT commit — promote must NOT.
  deps.git.state.projects.p1.head = "sha2";
  const commitsBefore = deps.docker.state.commits.length;

  const promoted = await service.promote({ projectId: "p1", slug: "app", publishedByUserId: "u1" });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.deployment.environment, "production");
  // production runs the exact bits validated in staging (same commit), not the newer HEAD
  assert.equal(promoted.deployment.commitSha, "sha1");
  assert.match(promoted.deployment.imageTag, /^evcp-production-app:sha1$/);
  // the source of the promote image is the running staging container (no dev rebuild / pre-checks)
  const lastCommit = deps.docker.state.commits[deps.docker.state.commits.length - 1];
  assert.equal(lastCommit.containerId, staging.deployment.containerId);
  assert.equal(deps.docker.state.commits.length, commitsBefore + 1);
  assert.ok(deps._audits.some((e) => e.action === "workspace.promote"));
});

test("containers are keyed by the id-derived resource key (evcp-<env>-<resourceKey>), not a slug", async () => {
  // The publish HTTP layer feeds the resource key (projectId with `_`→`-`) as the container key,
  // since projects no longer carry a resource-usable slug after the slug→UUID change.
  const resourceKey = resourceKeyForProject("prj_d91441edb0024adc874d6cb80cf2c6af");
  assert.equal(resourceKey, "prj-d91441edb0024adc874d6cb80cf2c6af");

  const deps = buildDeps();
  const service = createPublishService(deps);
  const outcome = await service.publish({
    projectId: "p1",
    slug: resourceKey,
    environment: "staging",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.slug, resourceKey);
  assert.match(
    outcome.deployment.imageTag,
    /^evcp-staging-prj-d91441edb0024adc874d6cb80cf2c6af:sha1$/
  );
  const container = deps.docker.state.containers.find(
    (c) => c.spec.name === "evcp-staging-prj-d91441edb0024adc874d6cb80cf2c6af"
  );
  assert.ok(container, "container name must be evcp-<env>-<resourceKey>");
  assert.ok(
    container.spec.hostConfig.Binds.includes(
      "evcp-ws-prj-d91441edb0024adc874d6cb80cf2c6af-staging-data:/workspace"
    )
  );
});

test("promote: errors when there is no healthy staging deployment to promote", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  await assert.rejects(
    () => service.promote({ projectId: "p1", slug: "app", publishedByUserId: "u1" }),
    /no healthy staging deployment/i
  );
});

test("promote: ignores a FAILED staging deployment (only healthy staging can be promoted)", async () => {
  const deps = buildDeps({ healthy: false });
  const service = createPublishService(deps);
  const staging = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    publishedByUserId: "u1"
  });
  assert.equal(staging.ok, false);
  await assert.rejects(
    () => service.promote({ projectId: "p1", slug: "app", publishedByUserId: "u1" }),
    /no healthy staging deployment/i
  );
});
