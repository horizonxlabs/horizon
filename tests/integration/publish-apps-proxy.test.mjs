import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppsTarget } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

test("/apps/{slug} resolution gates only on a healthy deployment", async () => {
  const deployments = createMemoryDeploymentStore();

  // no deployment yet
  assert.equal((await resolveAppsTarget(deployments, "app")).ok, false);

  // pending deployment does not route
  const dep = deployments.create({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "s1",
    imageTag: "evcp-prod-app:s1",
    containerId: "c1",
    publishedByUserId: "u1"
  });
  assert.equal((await resolveAppsTarget(deployments, "app")).ok, false);

  // healthy deployment routes to the production container
  deployments.updateHealth(dep.id, "healthy");
  const resolved = await resolveAppsTarget(deployments, "app");
  assert.deepEqual(resolved, { ok: true, upstream: "http://evcp-production-app:3000" });
});

test("/apps/{slug}/staging resolves independently from production", async () => {
  const deployments = createMemoryDeploymentStore();

  const staging = deployments.create({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    commitSha: "s1",
    imageTag: "evcp-staging-app:s1",
    containerId: "c-stg",
    publishedByUserId: "u1"
  });
  deployments.updateHealth(staging.id, "healthy");

  // staging serve route resolves to the staging container
  assert.deepEqual(await resolveAppsTarget(deployments, "app", "staging"), {
    ok: true,
    upstream: "http://evcp-staging-app:3000"
  });
  // production serve route is NOT satisfied by a staging-only deployment
  assert.equal((await resolveAppsTarget(deployments, "app", "production")).ok, false);
});
