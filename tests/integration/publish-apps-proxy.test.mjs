import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppsTarget } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

test("/apps/{slug} resolution gates on a healthy deployment and auth", async () => {
  const deployments = createMemoryDeploymentStore();
  const auth = { userId: "u1", roles: ["creator"], projectIds: ["p1"] };

  // no deployment yet
  assert.equal((await resolveAppsTarget(deployments, auth, "app")).ok, false);

  // pending deployment does not route
  const dep = deployments.create({
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "s1", imageTag: "evcp-prod-app:s1", containerId: "c1", publishedByUserId: "u1"
  });
  assert.equal((await resolveAppsTarget(deployments, auth, "app")).ok, false);

  // healthy deployment routes to the production container
  deployments.updateHealth(dep.id, "healthy");
  const resolved = await resolveAppsTarget(deployments, auth, "app");
  assert.deepEqual(resolved, { ok: true, upstream: "http://evcp-prod-app:3000" });

  // no auth → 401
  assert.deepEqual(await resolveAppsTarget(deployments, null, "app"), { ok: false, status: 401 });
});
