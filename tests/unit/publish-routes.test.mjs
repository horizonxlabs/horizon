import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublishRoutes,
  resolveAppsTarget
} from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

function fakeService(outcome) {
  return { publish: async () => outcome };
}

test("publish route rejects non-members with 403 and does not call the service", async () => {
  let called = false;
  const routes = createPublishRoutes({
    publishService: {
      publish: async () => {
        called = true;
        return { ok: true, deployment: {} };
      }
    },
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish(
    { userId: "u1", roles: ["creator"], projectIds: ["other"] },
    { projectId: "p1", slug: "app", environment: "production" }
  );
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("publish route forwards the environment to the service and returns 201 on success", async () => {
  let seenEnv = null;
  const routes = createPublishRoutes({
    publishService: {
      publish: async (input) => {
        seenEnv = input.environment;
        return {
          ok: true,
          deployment: { id: "dep-1", healthStatus: "healthy", environment: input.environment }
        };
      }
    },
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish(
    { userId: "u1", roles: ["creator"], projectIds: ["p1"] },
    { projectId: "p1", slug: "app", environment: "staging" }
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.deployment.id, "dep-1");
  assert.equal(seenEnv, "staging");
});

test("publish route returns 422 with failures when pre-checks fail", async () => {
  const routes = createPublishRoutes({
    publishService: fakeService({
      ok: false,
      reason: "pre_checks_failed",
      failures: ["next build failed"]
    }),
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish(
    { userId: "u1", roles: ["creator"], projectIds: ["p1"] },
    { projectId: "p1", slug: "app", environment: "production" }
  );
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.failures, ["next build failed"]);
});

test("publish route surfaces infra failures as 500 publish_failed with the reason", async () => {
  const routes = createPublishRoutes({
    publishService: {
      publish: async () => {
        throw new Error("no dev container for project 'p1'");
      }
    },
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish(
    { userId: "u1", roles: ["creator"], projectIds: ["p1"] },
    { projectId: "p1", slug: "app", environment: "staging" }
  );
  assert.equal(res.status, 500);
  assert.equal(res.body.error, "publish_failed");
  assert.equal(res.body.message, "no dev container for project 'p1'");
});

test("promote route: 403 non-member, 409 when no staging, 201 with deployment on success", async () => {
  const deployments = createMemoryDeploymentStore();
  // non-member
  const noAccess = createPublishRoutes({
    publishService: {
      publish: async () => ({}),
      promote: async () => ({ ok: true, deployment: {} })
    },
    deployments
  });
  assert.equal(
    (
      await noAccess.promote(
        { userId: "u", roles: [], projectIds: ["other"] },
        { projectId: "p1", slug: "app" }
      )
    ).status,
    403
  );

  // no healthy staging → service throws → 409
  const throwing = createPublishRoutes({
    publishService: {
      publish: async () => ({}),
      promote: async () => {
        throw new Error("no healthy staging deployment to promote for slug 'app'");
      }
    },
    deployments
  });
  const conflict = await throwing.promote(
    { userId: "u", roles: [], projectIds: ["p1"] },
    { projectId: "p1", slug: "app" }
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, "no_staging_deployment");

  // success
  const ok = createPublishRoutes({
    publishService: {
      publish: async () => ({}),
      promote: async () => ({ ok: true, deployment: { id: "dep-9", environment: "production" } })
    },
    deployments
  });
  const res = await ok.promote(
    { userId: "u", roles: [], projectIds: ["p1"] },
    { projectId: "p1", slug: "app" }
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.deployment.id, "dep-9");
});

test("resolveAppsTarget: production is unavailable until a healthy deploy exists", async () => {
  const deployments = createMemoryDeploymentStore();
  // Authentication is enforced by the HTTP route; this resolver owns deployment readiness only.
  assert.deepEqual(await resolveAppsTarget(deployments, "app"), { ok: false, status: 404 });

  const dep = deployments.create({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "s",
    imageTag: "t",
    containerId: "c",
    publishedByUserId: "u1"
  });
  // A pending (not-yet-healthy) deployment must not be served.
  assert.deepEqual(await resolveAppsTarget(deployments, "app"), { ok: false, status: 404 });

  deployments.updateHealth(dep.id, "healthy");
  // Healthy production returns the project id needed by the HTTP membership check.
  assert.deepEqual(await resolveAppsTarget(deployments, "app"), {
    ok: true,
    upstream: "http://evcp-production-app:3000",
    projectId: "p1"
  });
});

test("resolveAppsTarget rechecks the deployment store after restart rehydration", async () => {
  const deployments = createMemoryDeploymentStore();
  let rehydrated = 0;

  assert.deepEqual(
    await resolveAppsTarget(deployments, "prj-e8204c2a1b7e4901a1db54c2317b4852", "staging", async () => {
      rehydrated += 1;
      const deployment = deployments.create({
        projectId: "prj_e8204c2a1b7e4901a1db54c2317b4852",
        slug: "prj-e8204c2a1b7e4901a1db54c2317b4852",
        environment: "staging",
        commitSha: "abc123",
        imageTag: "evcp-staging-prj-e8204c2a1b7e4901a1db54c2317b4852:abc123",
        containerId: "container-123",
        publishedByUserId: "system-rehydration"
      });
      deployments.updateHealth(deployment.id, "healthy");
    }),
    {
      ok: true,
      upstream: "http://evcp-staging-prj-e8204c2a1b7e4901a1db54c2317b4852:3000",
      projectId: "prj_e8204c2a1b7e4901a1db54c2317b4852"
    }
  );
  assert.equal(rehydrated, 1);
});

test("resolveAppsTarget: staging environment resolves to the staging upstream, isolated from production", async () => {
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

  // staging tier resolves to the staging container...
  assert.deepEqual(await resolveAppsTarget(deployments, "app", "staging"), {
    ok: true,
    upstream: "http://evcp-staging-app:3000",
    projectId: "p1"
  });
  // ...while production is still unavailable (a staging deploy must not satisfy the prod route)
  assert.deepEqual(await resolveAppsTarget(deployments, "app", "production"), {
    ok: false,
    status: 404
  });
});

test("resolveAppsTarget: staging and production resolve independently once healthy", async () => {
  const deployments = createMemoryDeploymentStore();
  const stg = deployments.create({
    projectId: "p1",
    slug: "app",
    environment: "staging",
    commitSha: "s",
    imageTag: "t",
    containerId: "c",
    publishedByUserId: "u1"
  });
  deployments.updateHealth(stg.id, "healthy");
  assert.deepEqual(await resolveAppsTarget(deployments, "app", "staging"), {
    ok: true,
    upstream: "http://evcp-staging-app:3000",
    projectId: "p1"
  });

  // Production is independently healthy too.
  const prod = deployments.create({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "s",
    imageTag: "t",
    containerId: "c2",
    publishedByUserId: "u1"
  });
  deployments.updateHealth(prod.id, "healthy");
  assert.deepEqual(await resolveAppsTarget(deployments, "app", "production"), {
    ok: true,
    upstream: "http://evcp-production-app:3000",
    projectId: "p1"
  });
});
