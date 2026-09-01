import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { registerPublishHttpRoutes } from "../../apps/platform-api/src/publish/http-routes.ts";

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

test("the legacy path proxy keeps the existing 401 policy when no app token is present", async () => {
  const handlers = new Map();
  await registerPublishHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: {},
    env: {},
    resolvePublishAuth: async () => null,
    canAccessDeployment: async () => false,
    resolveAppLaunch: async () => {
      throw new Error("not used");
    },
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish() {
          throw new Error("not used");
        },
        async promote() {
          throw new Error("not used");
        }
      },
      deployments: createMemoryDeploymentStore(),
      async rehydrateDeployment() {
        return null;
      }
    }
  });
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
    setHeader() {},
    end() {},
    write() {},
    headersSent: false
  };

  await handlers.get("/apps/:slug")(
    {
      params: { slug: "rk-sales" },
      method: "GET",
      headers: {},
      url: "/apps/rk-sales",
      originalUrl: "/apps/rk-sales",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "unauthorized" });
});

test("the subdomain proxy ignores an incoming bearer token when its host-only app cookie is missing", async () => {
  const handlers = new Map();
  await registerPublishHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: {},
    env: {},
    subdomainBaseDomain: "localhost",
    subdomainSecureCookie: false,
    resolvePublishedSubdomain: async () => ({
      appSlug: "sales-app",
      projectId: PROJECT_ID,
      routePath: `/apps/${RESOURCE_KEY}`,
      subdomain: "sales"
    }),
    resolvePublishAuth: async (headers) =>
      headers.authorization === "Bearer platform-token"
        ? { userId: "user1", roles: ["end_user"], projectIds: [PROJECT_ID] }
        : null,
    canAccessDeployment: async () => true,
    resolveAppLaunch: async () => {
      throw new Error("not used");
    },
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish() {
          throw new Error("not used");
        },
        async promote() {
          throw new Error("not used");
        }
      },
      deployments: healthyDeployments(),
      async rehydrateDeployment() {
        return null;
      }
    }
  });
  const response = {
    statusCode: 200,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
    setHeader() {},
    end() {},
    write() {}
  };

  await handlers.get("/__subdomain")(
    {
      params: {},
      method: "GET",
      headers: { host: "sales.localhost", authorization: "Bearer platform-token" },
      url: "/__subdomain/",
      originalUrl: "/__subdomain/",
      on() {}
    },
    response
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "unauthorized" });
});

test("the subdomain proxy keeps existing 401 and 403 policy for invalid or unauthorized app cookies", async () => {
  const handlers = new Map();
  await registerPublishHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: {},
    env: {},
    subdomainBaseDomain: "localhost",
    subdomainSecureCookie: false,
    resolvePublishedSubdomain: async () => ({
      appSlug: "sales-app",
      projectId: PROJECT_ID,
      routePath: `/apps/${RESOURCE_KEY}`,
      subdomain: "sales"
    }),
    resolvePublishAuth: async (headers) =>
      headers.authorization === "Bearer denied-token"
        ? { userId: "user2", roles: ["end_user"], projectIds: [] }
        : null,
    canAccessDeployment: async () => false,
    resolveAppLaunch: async () => {
      throw new Error("not used");
    },
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish() {
          throw new Error("not used");
        },
        async promote() {
          throw new Error("not used");
        }
      },
      deployments: healthyDeployments(),
      async rehydrateDeployment() {
        return null;
      }
    }
  });
  const run = async (cookie) => {
    const response = {
      statusCode: 200,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
      },
      setHeader() {},
      end() {},
      write() {}
    };
    await handlers.get("/__subdomain")(
      {
        params: {},
        method: "GET",
        headers: { host: "sales.localhost", cookie },
        url: "/__subdomain/",
        originalUrl: "/__subdomain/",
        on() {}
      },
      response
    );
    return response;
  };

  const invalid = await run("evcp_app_token=%not-encoded");
  const forbidden = await run("evcp_app_token=denied-token");

  assert.equal(invalid.statusCode, 401);
  assert.deepEqual(invalid.body, { error: "unauthorized" });
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(forbidden.body, { error: "forbidden" });
});

test("the legacy path fallback keeps its base path and strips credentials before the app container", async () => {
  const handlers = new Map();
  const requests = [];
  await registerPublishHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: nodeHttpCapture(requests),
    env: {},
    resolvePublishAuth: async (headers) =>
      headers.authorization === "Bearer path-token"
        ? { userId: "user1", roles: ["end_user"], projectIds: [PROJECT_ID] }
        : null,
    canAccessDeployment: async () => true,
    resolveAppLaunch: async () => {
      throw new Error("not used");
    },
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish() {
          throw new Error("not used");
        },
        async promote() {
          throw new Error("not used");
        }
      },
      deployments: healthyDeployments(),
      async rehydrateDeployment() {
        return null;
      }
    }
  });

  await handlers.get("/apps/:slug/*splat")(
    {
      params: { slug: RESOURCE_KEY, splat: ["_next", "static", "app.js"] },
      method: "GET",
      headers: {
        authorization: "Bearer incoming-token",
        cookie: "evcp_app_token=path-token",
        "x-request-id": "req-path"
      },
      url: `/apps/${RESOURCE_KEY}/_next/static/app.js`,
      originalUrl: `/apps/${RESOURCE_KEY}/_next/static/app.js`,
      on() {}
    },
    {
      statusCode: 200,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
      },
      setHeader() {},
      end() {},
      write() {}
    }
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/apps/rk-sales/_next/static/app.js");
  assert.equal(requests[0].headers.authorization, undefined);
  assert.equal(requests[0].headers.cookie, undefined);
  assert.equal(requests[0].headers["x-request-id"], "req-path");
});
