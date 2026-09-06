import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import {
  proxyPublishedDeployment,
  registerPublishedSubdomainHttpRoutes
} from "../../apps/platform-api/src/publish/subdomain-http-routes.ts";

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

function nodeHttpCapture(requests, responseFactory) {
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
          onResponse(responseFactory(options));
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
    end() {
      this.headersSent = true;
    },
    write() {}
  };
}

test("a published-subdomain root stays at root instead of redirecting to the internal app path", async () => {
  const handlers = new Map();
  const requests = [];
  await registerPublishedSubdomainHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    nodeHttp: nodeHttpCapture(requests, (options) => {
      const hasTrailingSlash = options.path === `/apps/${RESOURCE_KEY}/`;
      return {
        statusCode: hasTrailingSlash ? 308 : 200,
        headers: hasTrailingSlash ? { location: `/apps/${RESOURCE_KEY}` } : {},
        pipe(response) {
          response.end();
        }
      };
    }),
    deployments: healthyDeployments(),
    baseDomain: "localhost",
    secureCookie: false,
    resolvePublishedSubdomain: async () => ({
      appSlug: "sales-app",
      projectId: PROJECT_ID,
      routePath: `/apps/${RESOURCE_KEY}`,
      subdomain: "sales",
      visibility: "public"
    }),
    resolvePublishAuth: async () => null,
    canAccessDeployment: async () => false,
    async rehydrateDeployment() {
      return null;
    }
  });
  const response = responseCapture();

  await handlers.get("/__subdomain")(
    {
      params: {},
      method: "GET",
      headers: { host: "sales.localhost:9800" },
      url: "/__subdomain/",
      originalUrl: "/__subdomain/",
      on() {}
    },
    response
  );

  assert.equal(requests[0].path, `/apps/${RESOURCE_KEY}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.location, undefined);
});

test("published-subdomain redirects never expose the internal app base path", () => {
  const requests = [];
  const response = responseCapture();

  proxyPublishedDeployment({
    nodeHttp: nodeHttpCapture(requests, () => ({
      statusCode: 308,
      headers: { location: `/apps/${RESOURCE_KEY}/agenda/?day=1` },
      pipe(target) {
        target.end();
      }
    })),
    request: {
      params: {},
      method: "GET",
      headers: { host: "sales.localhost:9800" },
      url: "/__subdomain/agenda/",
      originalUrl: "/__subdomain/agenda/",
      on() {}
    },
    response,
    upstream: "http://evcp-production-rk-sales:3000",
    path: `/apps/${RESOURCE_KEY}/agenda/`,
    browserRoutePrefixToStrip: `/apps/${RESOURCE_KEY}`
  });

  assert.equal(response.statusCode, 308);
  assert.equal(response.headers.location, "/agenda/?day=1");
});

test("an incoming legacy app path redirects to the canonical subdomain root", async () => {
  const handlers = new Map();
  const requests = [];
  await registerPublishedSubdomainHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    nodeHttp: nodeHttpCapture(requests, () => ({
      statusCode: 200,
      headers: {},
      pipe(response) {
        response.end();
      }
    })),
    deployments: healthyDeployments(),
    baseDomain: "localhost",
    secureCookie: false,
    resolvePublishedSubdomain: async () => ({
      appSlug: "sales-app",
      projectId: PROJECT_ID,
      routePath: `/apps/${RESOURCE_KEY}`,
      subdomain: "sales",
      visibility: "public"
    }),
    resolvePublishAuth: async () => null,
    canAccessDeployment: async () => false,
    async rehydrateDeployment() {
      return null;
    }
  });
  const response = responseCapture();

  await handlers.get("/__subdomain/*splat")(
    {
      params: { splat: ["apps", RESOURCE_KEY] },
      method: "GET",
      headers: { host: "sales.localhost:9800" },
      url: `/__subdomain/apps/${RESOURCE_KEY}`,
      originalUrl: `/__subdomain/apps/${RESOURCE_KEY}`,
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 308);
  assert.equal(response.headers.Location, "/");
  assert.equal(requests.length, 0);
});
