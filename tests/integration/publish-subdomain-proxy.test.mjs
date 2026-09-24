import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// The Caddyfile is piped in on stdin rather than bind-mounted. A bind mount is resolved by
// the Docker daemon against its own filesystem, so it breaks whenever the daemon does not
// share a path with this process — notably on a self-hosted CI runner that is itself a
// container with /var/run/docker.sock mounted in, which fails with "mounts denied: the path
// ... is not shared from the host". Piping runs the same real `caddy adapt` and was verified
// to produce byte-identical output for both Caddyfiles, with and without env overrides.
function adaptCaddyfile(file, env = {}) {
  const envArgs = Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
  const adapted = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      ...envArgs,
      "caddy:2.8-alpine",
      "sh",
      "-c",
      "cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile"
    ],
    { encoding: "utf8", input: readFileSync(resolve(file), "utf8") }
  );
  assert.equal(adapted.status, 0, adapted.stderr);
  return JSON.parse(adapted.stdout);
}

function wildcardHostMatches(pattern, host) {
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  if (!pattern.startsWith("*.")) return hostname === pattern.toLowerCase();
  const suffix = pattern.slice(2).toLowerCase();
  return (
    hostname.endsWith(`.${suffix}`) &&
    hostname.slice(0, -(suffix.length + 1)).includes(".") === false
  );
}

function matcherSetMatches(matcher, host, path) {
  if (matcher.host && !matcher.host.some((pattern) => wildcardHostMatches(pattern, host)))
    return false;
  if (matcher.path) {
    const matchesPath = matcher.path.some((pattern) =>
      pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern
    );
    if (!matchesPath) return false;
  }
  if (matcher.header_regexp?.Host) {
    if (!new RegExp(matcher.header_regexp.Host.pattern).test(host)) return false;
  }
  if (matcher.expression) {
    assert.match(matcher.expression, /\.split\("\."\)\[0\]\.size\(\) >= 3/);
    assert.match(matcher.expression, /\.split\("\."\)\[0\]\.size\(\) <= 63/);
    const labelLength = host.replace(/:\d+$/, "").split(".")[0].length;
    if (labelLength < 3 || labelLength > 63) return false;
  }
  if (matcher.not?.some((negated) => matcherSetMatches(negated, host, path))) return false;
  return true;
}

function routeMatches(route, host, path) {
  return !route.match || route.match.some((matcher) => matcherSetMatches(matcher, host, path));
}

function adaptedRoutingOutcome(routes, host, path) {
  for (const route of routes ?? []) {
    if (!routeMatches(route, host, path)) continue;
    for (const handler of route.handle ?? []) {
      if (handler.handler === "subroute") {
        const nested = adaptedRoutingOutcome(handler.routes, host, path);
        if (nested) return nested;
      }
      if (handler.handler === "reverse_proxy") {
        return `proxy:${handler.upstreams?.[0]?.dial}`;
      }
      if (handler.handler === "static_response") {
        return `status:${handler.status_code}`;
      }
    }
  }
  return null;
}

function caddyOutcome(config, host, path) {
  const server = Object.values(config.apps.http.servers).find((candidate) => candidate.routes);
  assert.ok(server);
  return adaptedRoutingOutcome(server.routes, host, path);
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
  assert.equal(requests[0].path, "/apps/rk-sales");
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

  assert.match(localCaddyfile, /@published_subdomain \{/);
  assert.match(localCaddyfile, /host \*\.localhost/);
  assert.match(localCaddyfile, /header_regexp published Host \^\[a-z0-9\]/);
  assert.match(localCaddyfile, /not host[^\n]*dash\.localhost/);
  assert.match(localCaddyfile, /rewrite \* \/__subdomain\{uri\}/);
  assert.match(localCaddyfile, /reverse_proxy platform-api:3100/);

  assert.match(releaseCaddyfile, /\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/);
  assert.match(
    releaseCaddyfile,
    /\{\$EVCP_CADDY_ADDRESS:localhost\}, \*\.\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/
  );
  assert.match(releaseCaddyfile, /host \*\.\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/);
  assert.match(releaseCaddyfile, /rewrite \* \/__subdomain\{uri\}/);
  assert.match(releaseCaddyfile, /@published_subdomain \{/);
  assert.match(
    releaseCaddyfile,
    /not host[^\n]*dash\.\{\$EVCP_APP_SUBDOMAIN_BASE_DOMAIN:localhost\}/
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

test("adapted Caddy routes every valid app-host path before platform redirects", () => {
  const local = adaptCaddyfile("docker/Caddyfile");
  const release = adaptCaddyfile("docker/Caddyfile.release", {
    EVCP_CADDY_ADDRESS: "platform.example.test",
    EVCP_APP_SUBDOMAIN_BASE_DOMAIN: "apps.example.test",
    EVCP_STORAGE_CADDY_ADDRESS: "storage.example.test"
  });

  for (const path of ["/creator", "/store"]) {
    assert.equal(caddyOutcome(local, "sales.localhost", path), "proxy:platform-api:3100");
    assert.equal(caddyOutcome(release, "sales.apps.example.test", path), "proxy:platform-api:3100");
  }

  assert.equal(caddyOutcome(local, "localhost", "/creator"), "status:308");
  assert.equal(caddyOutcome(local, "localhost", "/store"), "status:308");
  assert.equal(caddyOutcome(release, "platform.example.test", "/creator"), "status:308");
  assert.equal(caddyOutcome(release, "platform.example.test", "/store"), "status:308");
});

test("adapted Caddy accepts exactly the shared published-subdomain label contract", () => {
  const configurations = [
    { config: adaptCaddyfile("docker/Caddyfile"), suffix: "localhost" },
    {
      config: adaptCaddyfile("docker/Caddyfile.release", {
        EVCP_CADDY_ADDRESS: "platform.example.test",
        EVCP_APP_SUBDOMAIN_BASE_DOMAIN: "apps.example.test",
        EVCP_STORAGE_CADDY_ADDRESS: "storage.example.test"
      }),
      suffix: "apps.example.test"
    }
  ];
  const overlong = "a".repeat(64);

  for (const { config, suffix } of configurations) {
    for (const label of ["sales", "abc", "a".repeat(63)]) {
      assert.equal(caddyOutcome(config, `${label}.${suffix}`, "/"), "proxy:platform-api:3100");
    }
    for (const label of [
      "a",
      "ab",
      "Sales",
      "-sales",
      "sales-",
      "sales--ops",
      "admin",
      "api",
      "auth",
      "creator",
      "dash",
      "store",
      "storage",
      "www",
      overlong
    ]) {
      assert.notEqual(caddyOutcome(config, `${label}.${suffix}`, "/"), "proxy:platform-api:3100");
    }
    assert.notEqual(caddyOutcome(config, `deep.sales.${suffix}`, "/"), "proxy:platform-api:3100");
  }
});
