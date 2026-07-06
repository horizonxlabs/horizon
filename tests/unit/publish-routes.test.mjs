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
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["other"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("publish route returns 201 with the deployment on success", async () => {
  const routes = createPublishRoutes({
    publishService: fakeService({ ok: true, deployment: { id: "dep-1", healthStatus: "healthy" } }),
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["p1"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 201);
  assert.equal(res.body.deployment.id, "dep-1");
});

test("publish route returns 422 with failures when pre-checks fail", async () => {
  const routes = createPublishRoutes({
    publishService: fakeService({ ok: false, reason: "pre_checks_failed", failures: ["next build failed"] }),
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["p1"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.failures, ["next build failed"]);
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
  assert.deepEqual(await resolveAppsTarget(deployments, { userId: "u", roles: [], projectIds: [] }, "app"), {
    ok: true, upstream: "http://evcp-prod-app:3000"
  });
});
