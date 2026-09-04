import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { registerPublishHttpRoutes } from "../../apps/platform-api/src/publish/http-routes.ts";
import { registerPublishedSubdomainHttpRoutes } from "../../apps/platform-api/src/publish/subdomain-http-routes.ts";

function responseCapture() {
  return {
    statusCode: 200, headers: {}, body: undefined, headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; },
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; this.headersSent = true; },
    write() {}
  };
}

function healthyDeployment() {
  const deployments = createMemoryDeploymentStore();
  const deployment = deployments.create({
    projectId: "prj-iot",
    slug: "rk-iot",
    environment: "production",
    commitSha: "sha1",
    imageTag: "iot:sha1",
    containerId: "container-iot",
    containerName: "evcp-production-rk-iot",
    publishedByUserId: "creator1"
  });
  deployments.updateHealth(deployment.id, "healthy");
  return deployments;
}

function successfulNodeHttp() {
  return {
    request(_options, onResponse) {
      onResponse({
        statusCode: 200,
        headers: { "content-type": "text/html" },
        pipe(response) { response.end("public app"); }
      });
      return { on() {}, end() {}, setHeader() {}, write() {} };
    }
  };
}

async function requestSubdomain(visibility) {
  const handlers = new Map();
  registerPublishedSubdomainHttpRoutes({
    rawApp: { all(path, handler) { handlers.set(path, handler); } },
    nodeHttp: successfulNodeHttp(),
    deployments: healthyDeployment(),
    baseDomain: "localhost",
    secureCookie: false,
    resolvePublishedSubdomain: async () => ({
      appSlug: "iot-app",
      projectId: "prj-iot",
      routePath: "/apps/rk-iot",
      subdomain: "iot",
      visibility
    }),
    resolvePublishAuth: async () => null,
    canAccessDeployment: async () => false,
    rehydrateDeployment: async () => null
  });
  const response = responseCapture();
  await handlers.get("/__subdomain")(
    {
      params: {}, method: "GET", headers: { host: "iot.localhost" },
      url: "/__subdomain/", originalUrl: "/__subdomain/", on() {}
    },
    response
  );
  return response;
}

test("public subdomains allow anonymous requests", async () => {
  const response = await requestSubdomain("public");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, "public app");
});

test("restricted subdomains continue to require authentication", async () => {
  const response = await requestSubdomain("restricted");
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "unauthorized" });
});

test("Store launch for a public app bypasses membership and returns its direct subdomain", async () => {
  const handlers = new Map();
  const deployments = healthyDeployment();
  await registerPublishHttpRoutes({
    rawApp: { all(path, handler) { handlers.set(path, handler); } },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: successfulNodeHttp(),
    resolvePublishAuth: async () => ({
      userId: "end-user", roles: ["end_user"], projectIds: [], actor: { id: "end-user" }
    }),
    canAccessDeployment: async () => false,
    resolveAppLaunch: async () => ({
      appSlug: "iot-app",
      projectId: "prj-iot",
      routePath: "/apps/rk-iot",
      subdomain: "iot",
      subdomainUrl: "https://iot.gethorizon.org",
      visibility: "public"
    }),
    launchGrantStore: {
      async create() { assert.fail("public launch must not create a bearer grant"); },
      async consume() { return null; }
    },
    recordAudit() {},
    publishStack: {
      publishService: {},
      deployments,
      rehydrateDeployment: async () => null
    }
  });
  const response = responseCapture();

  await handlers.get("/store/apps/:appSlug/launch-session")(
    {
      params: { appSlug: "iot-app" },
      method: "POST",
      headers: { authorization: "Bearer store-session" },
      body: { routePath: "/apps/rk-iot" },
      url: "/store/apps/iot-app/launch-session",
      originalUrl: "/store/apps/iot-app/launch-session",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.launchUrl, "https://iot.gethorizon.org");
});
