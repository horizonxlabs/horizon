import test from "node:test";
import assert from "node:assert/strict";

import { deploymentProxyPath } from "../../apps/platform-api/src/publish/http-routes.ts";

test("deployment proxy preserves the app base path for staging pages and assets", () => {
  assert.equal(
    deploymentProxyPath("/apps/prj-123/staging"),
    "/api/apps/prj-123/staging"
  );
  assert.equal(
    deploymentProxyPath("/apps/prj-123/staging/_next/static/chunks/app.js?cache=1"),
    "/api/apps/prj-123/staging/_next/static/chunks/app.js?cache=1"
  );
});
