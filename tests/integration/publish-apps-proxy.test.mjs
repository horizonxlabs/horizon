import test from "node:test";
import assert from "node:assert/strict";
import { registerPublishHttpRoutes } from "../../apps/platform-api/src/publish/http-routes.ts";
import { resolveAppsTarget } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const PROJECT_ID = "prj-published-app";
const APP_SLUG = "published-app";

function healthyDeploymentStore() {
  const deployments = createMemoryDeploymentStore();
  const deployment = deployments.create({
    projectId: PROJECT_ID,
    slug: APP_SLUG,
    environment: "production",
    commitSha: "sha-published",
    imageTag: "evcp-production-published-app:sha-published",
    containerId: "container-published",
    publishedByUserId: "publisher"
  });
  deployments.updateHealth(deployment.id, "healthy");
  return deployments;
}

function createProxyHarness({ auth, canAccess }) {
  const handlers = new Map();
  const proxyRequests = [];
  const deployments = healthyDeploymentStore();
  registerPublishHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: {
      request(options) {
        proxyRequests.push(options);
        return {
          on() {},
          end() {},
          setHeader() {},
          write() {}
        };
      }
    },
    env: {},
    resolvePublishAuth: async () => auth,
    canAccessDeployment: async (_auth, projectId) => canAccess(projectId),
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish() {
          throw new Error("not used by generated-app proxy tests");
        },
        async promote() {
          throw new Error("not used by generated-app proxy tests");
        }
      },
      deployments,
      async rehydrateDeployment() {
        return null;
      }
    }
  });

  const response = {
    statusCode: 200,
    headersSent: false,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return {
        json: (body) => {
          this.body = body;
          this.headersSent = true;
        }
      };
    },
    setHeader() {},
    end() {},
    write() {}
  };
  const request = {
    params: { slug: APP_SLUG },
    method: "GET",
    headers: { authorization: "Bearer browser-session" },
    url: `/apps/${APP_SLUG}`,
    originalUrl: `/apps/${APP_SLUG}`,
    on() {}
  };

  return {
    handler: handlers.get("/apps/:slug"),
    request,
    response,
    proxyRequests
  };
}

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
  assert.deepEqual(resolved, {
    ok: true,
    upstream: "http://evcp-production-app:3000",
    projectId: "p1"
  });
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
    upstream: "http://evcp-staging-app:3000",
    projectId: "p1"
  });
  // production serve route is NOT satisfied by a staging-only deployment
  assert.equal((await resolveAppsTarget(deployments, "app", "production")).ok, false);
});

test("generated-app proxy returns 401 when the request is unauthenticated", async () => {
  const harness = createProxyHarness({ auth: null, canAccess: () => true });

  await harness.handler(harness.request, harness.response);

  assert.equal(harness.response.statusCode, 401);
  assert.deepEqual(harness.response.body, { error: "unauthorized" });
  assert.equal(harness.proxyRequests.length, 0);
});

test("generated-app proxy returns 403 for an authenticated nonmember without proxying", async () => {
  const auth = { userId: "outsider", roles: ["creator"], projectIds: [] };
  const checkedProjects = [];
  const harness = createProxyHarness({
    auth,
    canAccess(projectId) {
      checkedProjects.push(projectId);
      return false;
    }
  });

  await harness.handler(harness.request, harness.response);

  assert.deepEqual(checkedProjects, [PROJECT_ID]);
  assert.equal(harness.response.statusCode, 403);
  assert.deepEqual(harness.response.body, { error: "forbidden" });
  assert.equal(harness.proxyRequests.length, 0);
});

test("generated-app proxy forwards an authorized member to the healthy deployment", async () => {
  const auth = { userId: "member", roles: ["creator"], projectIds: [PROJECT_ID] };
  const harness = createProxyHarness({ auth, canAccess: (projectId) => projectId === PROJECT_ID });

  await harness.handler(harness.request, harness.response);

  assert.equal(harness.proxyRequests.length, 1);
  assert.equal(harness.proxyRequests[0].hostname, `evcp-production-${APP_SLUG}`);
  assert.equal(harness.proxyRequests[0].path, `/api/apps/${APP_SLUG}`);
  assert.equal(harness.proxyRequests[0].headers.authorization, undefined);
});
