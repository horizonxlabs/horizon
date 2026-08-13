import test from "node:test";
import assert from "node:assert/strict";

import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { resourceKeyForProject } from "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts";
import { buildPublishServiceDeps as buildDeps } from "./publish-service-test-helpers.mjs";

test("promote: rebuilds the healthy staging commit with the production base path", async () => {
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
  const buildsBefore = deps.docker.state.builds.length;

  const promoted = await service.promote({ projectId: "p1", slug: "app", publishedByUserId: "u1" });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.deployment.environment, "production");
  // Production uses the same source commit validated in staging, not the newer HEAD.
  assert.equal(promoted.deployment.commitSha, "sha1");
  assert.match(promoted.deployment.imageTag, /^evcp-production-app:sha1-[a-f0-9]{8}$/);
  assert.equal(deps.docker.state.commits.length, 0);
  assert.equal(deps.docker.state.builds.length, buildsBefore + 1);
  const productionEnvironment = deps.docker.state.builds
    .at(-1)
    .extraFiles.find((file) => file.name === ".env.production");
  assert.equal(productionEnvironment.content, "EVCP_PREVIEW_BASE=/apps/app\n");
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha1", "sha2"]);
  assert.ok(deps._audits.some((e) => e.action === "workspace.promote"));
});

test("containers are keyed by the id-derived resource key (evcp-<env>-<resourceKey>), not a slug", async () => {
  // The publish HTTP layer feeds the resource key (projectId with `_`→`-`) as the container key,
  // since projects no longer carry a resource-usable slug after the slug→UUID change.
  const resourceKey = resourceKeyForProject("prj_d91441edb0024adc874d6cb80cf2c6af");
  assert.equal(resourceKey, "prj-d91441edb0024adc874d6cb80cf2c6af");

  const deps = buildDeps();
  deps.git.state.projects.p1.head = "0123456789abcdef0123456789abcdef01234567";
  let healthUrl = "";
  deps.health.check = async (url) => {
    healthUrl = url;
    return true;
  };
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
    /^evcp-staging-prj-d91441edb0024adc874d6cb80cf2c6af:0123456789ab-[a-f0-9]{8}$/
  );
  const container = deps.docker.state.containers.find(
    (c) => c.spec.name === outcome.deployment.containerName
  );
  assert.ok(container, "container name must be evcp-<env>-<resourceKey>");
  assert.ok(
    outcome.deployment.containerName.length <= 63,
    "the deployment hostname must fit one Docker DNS label"
  );
  assert.equal(new URL(healthUrl).hostname, outcome.deployment.containerName);
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
