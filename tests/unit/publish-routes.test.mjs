import test from "node:test";
import assert from "node:assert/strict";
import { createPublishRoutes, resolveAppsTarget } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

function fakeService(outcome) {
  return { publish: async () => outcome };
}

test("publish route rejects non-members with 403 and does not call the service", async () => {
  let called = false;
  const routes = createPublishRoutes({
    publishService: { publish: async () => { called = true; return { ok: true, deployment: {} }; } },
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["other"] }, { projectId: "p1", slug: "app", environment: "production" });
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("publish route forwards the environment to the service and returns 201 on success", async () => {
  let seenEnv = null;
  const routes = createPublishRoutes({
    publishService: {
      publish: async (input) => { seenEnv = input.environment; return { ok: true, deployment: { id: "dep-1", healthStatus: "healthy", environment: input.environment } }; }
    },
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["p1"] }, { projectId: "p1", slug: "app", environment: "staging" });
  assert.equal(res.status, 201);
  assert.equal(res.body.deployment.id, "dep-1");
  assert.equal(seenEnv, "staging");
});

test("publish route returns 422 with failures when pre-checks fail", async () => {
  const routes = createPublishRoutes({
    publishService: fakeService({ ok: false, reason: "pre_checks_failed", failures: ["next build failed"] }),
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["p1"] }, { projectId: "p1", slug: "app", environment: "production" });
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.failures, ["next build failed"]);
});

test("promote route: 403 non-member, 409 when no staging, 201 with deployment on success", async () => {
  const deployments = createMemoryDeploymentStore();
  // non-member
  const noAccess = createPublishRoutes({ publishService: { publish: async () => ({}), promote: async () => ({ ok: true, deployment: {} }) }, deployments });
  assert.equal((await noAccess.promote({ userId: "u", roles: [], projectIds: ["other"] }, { projectId: "p1", slug: "app" })).status, 403);

  // no healthy staging → service throws → 409
  const throwing = createPublishRoutes({
    publishService: { publish: async () => ({}), promote: async () => { throw new Error("no healthy staging deployment to promote for slug 'app'"); } },
    deployments
  });
  const conflict = await throwing.promote({ userId: "u", roles: [], projectIds: ["p1"] }, { projectId: "p1", slug: "app" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, "no_staging_deployment");

  // success
  const ok = createPublishRoutes({
    publishService: { publish: async () => ({}), promote: async () => ({ ok: true, deployment: { id: "dep-9", environment: "production" } }) },
    deployments
  });
  const res = await ok.promote({ userId: "u", roles: [], projectIds: ["p1"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 201);
  assert.equal(res.body.deployment.id, "dep-9");
});

test("resolveAppsTarget: 401 no auth, 404 no healthy deployment, 200 upstream when healthy", async () => {
  const deployments = createMemoryDeploymentStore();
  assert.deepEqual(await resolveAppsTarget(deployments, null, "app"), { ok: false, status: 401 });
  assert.deepEqual(await resolveAppsTarget(deployments, { userId: "u", roles: [], projectIds: [] }, "app"), { ok: false, status: 404 });

  const dep = deployments.create({
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "s", imageTag: "t", containerId: "c", publishedByUserId: "u1"
  });
  deployments.updateHealth(dep.id, "healthy");
  assert.deepEqual(await resolveAppsTarget(deployments, { userId: "u", roles: [], projectIds: ["p1"] }, "app"), {
    ok: true, upstream: "http://evcp-production-app:3000"
  });
});

test("resolveAppsTarget: staging environment resolves to the staging upstream, isolated from production", async () => {
  const deployments = createMemoryDeploymentStore();
  const auth = { userId: "u", roles: [], projectIds: ["p1"] };
  const staging = deployments.create({
    projectId: "p1", slug: "app", environment: "staging",
    commitSha: "s1", imageTag: "evcp-staging-app:s1", containerId: "c-stg", publishedByUserId: "u1"
  });
  deployments.updateHealth(staging.id, "healthy");

  // staging tier resolves to the staging container...
  assert.deepEqual(await resolveAppsTarget(deployments, auth, "app", "staging"), {
    ok: true, upstream: "http://evcp-staging-app:3000"
  });
  // ...while production is still unavailable (a staging deploy must not satisfy the prod route)
  assert.deepEqual(await resolveAppsTarget(deployments, auth, "app", "production"), { ok: false, status: 404 });
});

test("resolveAppsTarget: 403 when caller is not a member of the deployment's project", async () => {
  const deployments = createMemoryDeploymentStore();
  const dep = deployments.create({
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "s", imageTag: "t", containerId: "c", publishedByUserId: "u1"
  });
  deployments.updateHealth(dep.id, "healthy");
  assert.deepEqual(await resolveAppsTarget(deployments, { userId: "u", roles: [], projectIds: ["other"] }, "app"), {
    ok: false, status: 403
  });
});
