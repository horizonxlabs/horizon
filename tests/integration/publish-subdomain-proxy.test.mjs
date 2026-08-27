import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { registerPublishedSubdomainHttpRoutes } from "../../apps/platform-api/src/publish/subdomain-http-routes.ts";

const PROJECT_ID = "prj-sales";
const RESOURCE_KEY = "rk-sales";

function healthyDeployments() {
  const deployments = createMemoryDeploymentStore();
  const deployment = deployments.create({
    projectId: PROJECT_ID,
    slug: RESOURCE_KEY,
    environment: "production",
    commitSha: "sha1",
    imageTag: "sales:sha1",
    imageDigest: "digest1",
    containerId: "container1",
    containerName: "evcp-production-rk-sales",
    publishedByUserId: "user1"
  });
  deployments.updateHealth(deployment.id, "healthy");
  return deployments;
}

function nodeHttpCapture(requests) {
  return {
    request(options, onResponse) {
      const proxyRequest = {
        on() {
          return proxyRequest;
        },
        setHeader() {},
        write() {},
        end() {
          requests.push(options);
          onResponse({ statusCode: 200, headers: {}, pipe() {} });
        }
      };
      return proxyRequest;
    }
  };
}

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
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
    end() {},
    write() {}
  };
}

test("a published-subdomain browser root proxies through the generated app base path", async () => {
  const handlers = new Map();
  const requests = [];
  await registerPublishedSubdomainHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    nodeHttp: nodeHttpCapture(requests),
    deployments: healthyDeployments(),
    baseDomain: "localhost",
    secureCookie: false,
    resolvePublishedSubdomain: async (subdomain) =>
      subdomain === "sales"
        ? {
            appSlug: "sales-app",
            projectId: PROJECT_ID,
            routePath: `/apps/${RESOURCE_KEY}`,
            subdomain: "sales"
          }
        : null,
    resolvePublishAuth: async (headers) =>
      headers.authorization === "Bearer app-token"
        ? { userId: "user1", roles: ["end_user"], projectIds: [PROJECT_ID] }
        : null,
    canAccessDeployment: async () => true,
    async rehydrateDeployment() {
      return null;
    }
  });
  const response = responseCapture();

  await handlers.get("/__subdomain")(
    {
      params: {},
      method: "GET",
      headers: { host: "sales.localhost:9800", cookie: "evcp_app_token=app-token" },
      url: "/__subdomain/",
      originalUrl: "/__subdomain/",
      on() {}
    },
    response
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/apps/rk-sales/");
});

test("generated base-path assets remain compatible and container headers exclude credentials", async () => {
  const handlers = new Map();
  const requests = [];
  const authorizationHeaders = [];
  await registerPublishedSubdomainHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    nodeHttp: nodeHttpCapture(requests),
    deployments: healthyDeployments(),
    baseDomain: "localhost",
    secureCookie: false,
    resolvePublishedSubdomain: async () => ({
      appSlug: "sales-app",
      projectId: PROJECT_ID,
      routePath: `/apps/${RESOURCE_KEY}`,
      subdomain: "sales"
    }),
    resolvePublishAuth: async (headers) => {
      authorizationHeaders.push(headers);
      return headers.authorization === "Bearer app-token"
        ? { userId: "user1", roles: ["end_user"], projectIds: [PROJECT_ID] }
        : null;
    },
    canAccessDeployment: async () => true,
    async rehydrateDeployment() {
      return null;
    }
  });
  const response = responseCapture();

  await handlers.get("/__subdomain/*splat")(
    {
      params: { splat: ["apps", RESOURCE_KEY, "_next", "static", "app.js"] },
      method: "GET",
      headers: {
        host: "sales.localhost:9800",
        authorization: "Bearer incoming-platform-token",
        cookie: "other=value; evcp_app_token=app-token",
        "x-request-id": "req-1"
      },
      url: `/__subdomain/apps/${RESOURCE_KEY}/_next/static/app.js?build=1`,
      originalUrl: `/__subdomain/apps/${RESOURCE_KEY}/_next/static/app.js?build=1`,
      on() {}
    },
    response
  );

  assert.equal(authorizationHeaders.length, 1);
  assert.equal(authorizationHeaders[0].authorization, "Bearer app-token");
  assert.equal(authorizationHeaders[0].cookie, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/apps/rk-sales/_next/static/app.js?build=1");
  assert.equal(requests[0].headers.authorization, undefined);
  assert.equal(requests[0].headers.cookie, undefined);
  assert.equal(requests[0].headers["x-request-id"], "req-1");
  assert.equal(requests[0].headers.host, "evcp-production-rk-sales:3000");
});

test("Caddy and Compose route one platform subdomain label with trusted runtime configuration", () => {
  const localCaddyfile = readFileSync("docker/Caddyfile", "utf8");
  const releaseCaddyfile = readFileSync("docker/Caddyfile.release", "utf8");
  const localCompose = readFileSync("docker/docker-compose.yml", "utf8");
  const releaseCompose = readFileSync("docker/docker-compose.release.yml", "utf8");

  const localPublishedRoute = localCaddyfile.indexOf("@published_subdomain {");
  const localCatchAll = localCaddyfile.indexOf("\n\thandle {");
  assert.notEqual(localPublishedRoute, -1);
  assert.ok(localPublishedRoute < localCatchAll);
  assert.match(localCaddyfile, /host \*\.localhost/);
  assert.match(localCaddyfile, /header_regexp published Host \^\[a-z0-9\]/);
  assert.match(localCaddyfile, /rewrite \* \/__subdomain\{uri\}/);
  assert.match(localCaddyfile, /reverse_proxy platform-api:3100/);

  assert.match(releaseCaddyfile, /\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/);
  assert.match(
    releaseCaddyfile,
    /\{\$EVCP_CADDY_ADDRESS:localhost\}, \*\.\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/
  );
  assert.match(
    releaseCaddyfile,
    /host \*\.\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/
  );
  assert.match(releaseCaddyfile, /rewrite \* \/__subdomain\{uri\}/);
  assert.ok(
    releaseCaddyfile.indexOf("@published_subdomain") < releaseCaddyfile.indexOf("\n\thandle {")
  );

  for (const compose of [localCompose, releaseCompose]) {
    assert.match(compose, /EVCP_APP_SUBDOMAIN_BASE_DOMAIN:/);
    assert.match(compose, /REDIS_URL:/);
  }
  assert.match(
    releaseCompose,
    /caddy:[\s\S]*EVCP_APP_SUBDOMAIN_BASE_DOMAIN: \$\{EVCP_APP_SUBDOMAIN_BASE_DOMAIN:-localhost\}/
  );
});
