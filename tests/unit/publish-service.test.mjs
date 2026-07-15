import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublishService,
  PRODUCTION_DOCKERFILE
} from "../../apps/platform-api/src/publish/publish-service.ts";
import { resourceKeyForProject } from "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts";
import { buildPublishServiceDeps as buildDeps } from "./publish-service-test-helpers.mjs";

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
  assert.match(outcome.deployment.imageTag, /^evcp-production-app:sha1-[a-f0-9]{8}$/);
  // built a REAL production image (Dockerfile /build), not a `docker commit` snapshot
  assert.equal(deps.docker.state.builds.length, 1);
  assert.equal(deps.docker.state.commits.length, 0);
  assert.equal(deps.docker.state.builds[0].imageTag, outcome.deployment.imageTag);
  // the production Dockerfile + .dockerignore are injected into the build-context tar (extraFiles),
  // NOT written into the dev container's /workspace — writing them there would dirty the app's git
  // tree and break the clean-tree pre-check on the next publish.
  assert.deepEqual(deps.docker.state.builds[0].extraFiles.map((file) => file.name).sort(), [
    ".dockerignore",
    ".env.production",
    "Dockerfile"
  ]);
  assert.ok(
    !deps.docker.state.execCalls.some((c) => c.cmd.join(" ").includes("/workspace/Dockerfile")),
    "must NOT write a Dockerfile into the workspace"
  );
  assert.match(outcome.deployment.containerName, /^evcp-production-app-sha1-[a-f0-9]{8}$/);
  assert.ok(
    deps.docker.state.containers.some((c) => c.spec.name === outcome.deployment.containerName)
  );
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

test("staging publish runs the immutable image without a shared writable workspace volume", async () => {
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
  assert.match(outcome.deployment.imageTag, /^evcp-staging-app:sha1-[a-f0-9]{8}$/);
  assert.match(outcome.deployment.containerName, /^evcp-staging-app-sha1-[a-f0-9]{8}$/);
  assert.ok(
    deps.docker.state.containers.some((c) => c.spec.name === outcome.deployment.containerName)
  );
  const staging = deps.docker.state.containers.find(
    (c) => c.spec.name === outcome.deployment.containerName
  );
  assert.deepEqual(staging.spec.hostConfig.Binds, []);
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
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha0", "sha1"]);
});

test("queues image builds across projects so a second deploy cannot compete for host resources", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p2 = { clean: true, head: "sha2", migrationNames: {} };
  const originalBuild = deps.docker.buildImage.bind(deps.docker);
  let releaseFirstBuild;
  const firstBuildStarted = new Promise((resolve) => {
    deps.docker.buildImage = async (...args) => {
      if (args[1].startsWith("evcp-staging-app-one:sha1-")) {
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
  assert.match(deps.docker.state.builds[0].imageTag, /^evcp-staging-app-one:sha1-[a-f0-9]{8}$/);
  assert.match(deps.docker.state.builds[1].imageTag, /^evcp-staging-app-two:sha2-[a-f0-9]{8}$/);
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

test("failed replacement uses blue-green naming and preserves the previous healthy container and route", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const first = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });
  assert.equal(first.ok, true);

  deps.git.state.projects.p1.head = "sha2";
  deps.health.check = async () => false;
  const failed = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });

  assert.equal(failed.ok, false);
  assert.notEqual(failed.deployment.containerName, first.deployment.containerName);
  assert.equal(deps.deployments.getCurrent("app").id, first.deployment.id);
  assert.ok(
    deps.docker.state.containers.some((item) => item.containerId === first.deployment.containerId)
  );
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
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha1", "sha2"]);
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
  assert.match(promoted.deployment.imageTag, /^evcp-production-app:sha1-[a-f0-9]{8}$/);
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
    /^evcp-staging-prj-d91441edb0024adc874d6cb80cf2c6af:sha1-[a-f0-9]{8}$/
  );
  const container = deps.docker.state.containers.find(
    (c) => c.spec.name === outcome.deployment.containerName
  );
  assert.ok(container, "container name must be evcp-<env>-<resourceKey>");
  assert.deepEqual(container.spec.hostConfig.Binds, []);
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
