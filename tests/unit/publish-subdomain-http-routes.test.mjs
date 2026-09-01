import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { MemoryLaunchGrantStore } from "../../apps/platform-api/src/publish/launch-grant-store.ts";
import { registerPublishedSubdomainHttpRoutes } from "../../apps/platform-api/src/publish/subdomain-http-routes.ts";
import {
  MemoryPublishStorePersistenceClient,
  createPublishStoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/publish-store-repositories.ts";

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
      this.headersSent = true;
    },
    write() {}
  };
}

async function fixture({
  resolvePublishedSubdomain = async () => null,
  deployments = createMemoryDeploymentStore(),
  launchGrantStore,
  secureCookie = false,
  resolvePublishAuth = async () => null,
  canAccessDeployment = async () => false
} = {}) {
  const handlers = new Map();
  await registerPublishedSubdomainHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    nodeHttp: {},
    deployments,
    launchGrantStore,
    baseDomain: "localhost",
    secureCookie,
    resolvePublishedSubdomain,
    resolvePublishAuth,
    canAccessDeployment,
    async rehydrateDeployment() {
      return null;
    }
  });
  return { handlers };
}

test("an unknown direct-child platform subdomain returns 404", async () => {
  const { handlers } = await fixture();
  const response = responseCapture();

  await handlers.get("/__subdomain/*splat")(
    {
      params: { splat: ["missing"] },
      method: "GET",
      headers: { host: "missing.localhost:9800" },
      url: "/__subdomain/missing",
      originalUrl: "/__subdomain/missing",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "app_not_found" });
});

test("a valid host-bound grant sets a host-only app cookie and redirects to root", async () => {
  const deployments = createMemoryDeploymentStore();
  const deployment = deployments.create({
    projectId: "prj-sales",
    slug: "rk-sales",
    environment: "production",
    commitSha: "sha1",
    imageTag: "sales:sha1",
    containerId: "container1",
    containerName: "evcp-production-rk-sales",
    publishedByUserId: "user1"
  });
  deployments.updateHealth(deployment.id, "healthy");
  const launchGrantStore = new MemoryLaunchGrantStore({ randomId: () => "valid-grant" });
  await launchGrantStore.create(
    {
      appSlug: "sales-app",
      projectId: "prj-sales",
      routePath: "/apps/rk-sales",
      subdomain: "sales",
      bearerToken: "host-app-token"
    },
    60
  );
  const { handlers } = await fixture({
    deployments,
    launchGrantStore,
    resolvePublishAuth: async (headers) =>
      headers.authorization === "Bearer host-app-token"
        ? { userId: "user1", roles: ["end_user"], projectIds: ["prj-sales"] }
        : null,
    canAccessDeployment: async () => true,
    resolvePublishedSubdomain: async (subdomain) =>
      subdomain === "sales"
        ? {
            appSlug: "sales-app",
            projectId: "prj-sales",
            routePath: "/apps/rk-sales",
            subdomain: "sales"
          }
        : null
  });
  const response = responseCapture();

  await handlers.get("/__subdomain/__launch/:grant")(
    {
      params: { grant: "valid-grant" },
      method: "GET",
      headers: { host: "sales.localhost:9800" },
      url: "/__subdomain/__launch/valid-grant",
      originalUrl: "/__subdomain/__launch/valid-grant",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.Location, "/");
  assert.equal(
    response.headers["Set-Cookie"],
    "evcp_app_token=host-app-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=900"
  );
});

test("launch grants can only be exchanged with GET", async () => {
  let consumeCalls = 0;
  const { handlers } = await fixture({
    launchGrantStore: {
      async create() {
        throw new Error("not used");
      },
      async consume() {
        consumeCalls += 1;
        return null;
      }
    }
  });
  const response = responseCapture();

  await handlers.get("/__subdomain/__launch/:grant")(
    {
      params: { grant: "grant" },
      method: "POST",
      headers: { host: "sales.localhost" },
      url: "/__subdomain/__launch/grant",
      originalUrl: "/__subdomain/__launch/grant",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.body, { error: "method_not_allowed" });
  assert.equal(consumeCalls, 0);
});

test("a known published subdomain without a healthy production deployment returns 503", async () => {
  const { handlers } = await fixture({
    resolvePublishedSubdomain: async (subdomain) =>
      subdomain === "sales"
        ? {
            appSlug: "sales-app",
            projectId: "prj-sales",
            routePath: "/apps/rk-sales",
            subdomain: "sales"
          }
        : null
  });
  const response = responseCapture();

  await handlers.get("/__subdomain")(
    {
      params: {},
      method: "GET",
      headers: { host: "sales.localhost" },
      url: "/__subdomain/",
      originalUrl: "/__subdomain/",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: "app_unavailable" });
});

test("expired, reused, and wrong-host grants return the same generic 403", async () => {
  let now = 1_000;
  let grantNumber = 0;
  const launchGrantStore = new MemoryLaunchGrantStore({
    now: () => now,
    randomId: () => `grant-${++grantNumber}`
  });
  const grant = {
    appSlug: "sales-app",
    projectId: "prj-sales",
    routePath: "/apps/rk-sales",
    subdomain: "sales",
    bearerToken: "host-app-token"
  };
  const expiredId = await launchGrantStore.create(grant, 60);
  now += 60_000;
  const reusedId = await launchGrantStore.create(grant, 60);
  await launchGrantStore.consume(reusedId);
  const wrongHostId = await launchGrantStore.create(grant, 60);
  const { handlers } = await fixture({
    launchGrantStore,
    resolvePublishedSubdomain: async (subdomain) =>
      subdomain === "sales"
        ? {
            appSlug: "sales-app",
            projectId: "prj-sales",
            routePath: "/apps/rk-sales",
            subdomain: "sales"
          }
        : subdomain === "finance"
          ? {
              appSlug: "finance-app",
              projectId: "prj-finance",
              routePath: "/apps/rk-finance",
              subdomain: "finance"
            }
          : null
  });
  const runExchange = async (id, host) => {
    const response = responseCapture();
    await handlers.get("/__subdomain/__launch/:grant")(
      {
        params: { grant: id },
        method: "GET",
        headers: { host },
        url: `/__subdomain/__launch/${id}`,
        originalUrl: `/__subdomain/__launch/${id}`,
        on() {}
      },
      response
    );
    return response;
  };

  const expired = await runExchange(expiredId, "sales.localhost");
  const reused = await runExchange(reusedId, "sales.localhost");
  const wrongHost = await runExchange(wrongHostId, "finance.localhost");
  const burnedOnCorrectHost = await runExchange(wrongHostId, "sales.localhost");

  for (const response of [expired, reused, wrongHost, burnedOnCorrectHost]) {
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: "launch_unavailable" });
    assert.equal(JSON.stringify(response.body).includes("sales"), false);
    assert.equal(response.headers["Set-Cookie"], undefined);
  }
});

test("grant exchange rejects app-slug and project binding mismatches without app detail", async () => {
  const grants = [
    {
      appSlug: "other-app",
      projectId: "prj-sales",
      routePath: "/apps/rk-sales",
      subdomain: "sales",
      bearerToken: "host-app-token"
    },
    {
      appSlug: "sales-app",
      projectId: "prj-other",
      routePath: "/apps/rk-sales",
      subdomain: "sales",
      bearerToken: "host-app-token"
    }
  ];
  const { handlers } = await fixture({
    launchGrantStore: {
      async create() {
        throw new Error("not used");
      },
      async consume() {
        return grants.shift() ?? null;
      }
    },
    resolvePublishedSubdomain: async () => ({
      appSlug: "sales-app",
      projectId: "prj-sales",
      routePath: "/apps/rk-sales",
      subdomain: "sales"
    })
  });

  for (const id of ["wrong-app", "wrong-project"]) {
    const response = responseCapture();
    await handlers.get("/__subdomain/__launch/:grant")(
      {
        params: { grant: id },
        method: "GET",
        headers: { host: "sales.localhost" },
        url: `/__subdomain/__launch/${id}`,
        originalUrl: `/__subdomain/__launch/${id}`,
        on() {}
      },
      response
    );
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: "launch_unavailable" });
  }
});

test("host resolution reads only published entries from the persisted registry", async () => {
  const registryEntry = (subdomain, status) => ({
    id: `registry-${subdomain}`,
    appId: `app-${subdomain}`,
    projectId: `project-${subdomain}`,
    deploymentRecordId: `deployment-${subdomain}`,
    slug: `${subdomain}-app`,
    subdomain,
    name: `${subdomain} app`,
    route: `/apps/resource-${subdomain}`,
    status,
    visibility: "restricted",
    accessMode: "membership_or_invite",
    roleKeys: ["employee"],
    ownerUserId: "creator1",
    manifestVersion: "1",
    publishedAt: "2026-08-27T00:00:00.000Z"
  });
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      registry: [registryEntry("sales", "published"), registryEntry("draft-app", "draft")]
    }),
    { baseDomain: "apps.example.test", secure: true }
  );

  const published = await service.resolvePublishedSubdomain("SALES");

  assert.equal(published?.slug, "sales-app");
  assert.equal(published?.route, "/apps/resource-sales");
  assert.equal(await service.resolvePublishedSubdomain("draft-app"), null);
  assert.equal(await service.resolvePublishedSubdomain("missing"), null);
});
