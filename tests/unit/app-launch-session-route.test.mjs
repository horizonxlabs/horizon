import assert from "node:assert/strict";
import test from "node:test";

import { registerAppLaunchSessionRoute } from "../../apps/platform-api/src/publish/app-launch-session-route.ts";

function fixture() {
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
      return { routePath: "/apps/prj-sales" };
    }
  });
  return {
    run: (authorization) =>
      handler(
        {
          headers: authorization ? { authorization } : {},
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

test("app launch session authorizes access and scopes the bearer cookie to the runtime route", async () => {
  const request = fixture();
  await request.run("Bearer session-token");

  assert.equal(request.result().status, 200);
  assert.match(
    request.result().headers["Set-Cookie"],
    /^evcp_app_token=session-token; Path=\/apps\/prj-sales; HttpOnly; SameSite=Strict; Max-Age=900/
  );
  assert.equal(request.result().body.ok, true);
});

test("app launch session rejects requests without a Platform bearer token", async () => {
  const request = fixture();
  await request.run();
  assert.equal(request.result().status, 401);
  assert.equal(request.result().body.ok, false);
});
