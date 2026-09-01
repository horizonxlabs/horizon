import assert from "node:assert/strict";
import test from "node:test";

import { registerAppLaunchSessionRoute } from "../../apps/platform-api/src/publish/app-launch-session-route.ts";

function fixture({ authorization = "Bearer session-token", registryEntry, launchGrantStore } = {}) {
  let handler;
  const headers = {};
  let status;
  let body;
  registerAppLaunchSessionRoute({
    routes: {
      post(path, next) {
        assert.equal(path, "/store/apps/:appSlug/launch-session");
        handler = next;
      }
    },
    authorize: async (_requestHeaders, appSlug, routePath) => {
      assert.equal(appSlug, "sales-app");
      assert.equal(routePath, "/apps/prj-sales");
      return (
        registryEntry ?? {
          appSlug: "sales-app",
          projectId: "prj-sales",
          routePath: "/apps/prj-sales"
        }
      );
    },
    launchGrantStore
  });
  return {
    run: (requestAuthorization = authorization) =>
      handler(
        {
          headers: requestAuthorization ? { authorization: requestAuthorization } : {},
          params: { appSlug: "sales-app" },
          body: { routePath: "/apps/prj-sales" }
        },
        {
          status(code) {
            status = code;
            return this;
          },
          setHeader(name, value) {
            headers[name] = value;
          },
          json(value) {
            body = value;
          }
        }
      ),
    result: () => ({ status, headers, body })
  };
}

test("app launch session issues a trusted subdomain launch URL without setting a platform-origin app cookie", async () => {
  const created = [];
  const request = fixture({
    registryEntry: {
      appSlug: "sales-app",
      projectId: "prj-sales",
      routePath: "/apps/prj-sales",
      subdomain: "sales",
      subdomainUrl: "https://sales.apps.example.test"
    },
    launchGrantStore: {
      async create(grant, ttlSeconds) {
        created.push({ grant, ttlSeconds });
        return "opaque-launch-grant";
      },
      async consume() {
        throw new Error("not used by launch session creation");
      }
    }
  });
  await request.run();

  assert.equal(request.result().status, 200);
  assert.equal(request.result().headers["Set-Cookie"], undefined);
  assert.deepEqual(created, [
    {
      grant: {
        appSlug: "sales-app",
        projectId: "prj-sales",
        routePath: "/apps/prj-sales",
        subdomain: "sales",
        bearerToken: "session-token"
      },
      ttlSeconds: 60
    }
  ]);
  assert.deepEqual(request.result().body.data, {
    authorized: true,
    launchUrl: "https://sales.apps.example.test/__launch/opaque-launch-grant"
  });
});

test("app launch session preserves the scoped bearer cookie and path launch URL for legacy registry entries", async () => {
  const request = fixture();
  await request.run();

  assert.equal(request.result().status, 200);
  assert.match(
    request.result().headers["Set-Cookie"],
    /^evcp_app_token=session-token; Path=\/apps\/prj-sales; HttpOnly; SameSite=Strict; Max-Age=900/
  );
  assert.deepEqual(request.result().body.data, {
    authorized: true,
    launchUrl: "/apps/prj-sales"
  });
});

test("app launch session rejects requests without a Platform bearer token", async () => {
  const request = fixture();
  await request.run("");
  assert.equal(request.result().status, 401);
  assert.equal(request.result().body.ok, false);
});
