import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("platform auth session contract exposes signed bearer sessions with mock fallback labeled", () => {
  const servicesSource = readFileSync("apps/platform-api/src/platform-services.ts", "utf8");
  const appFactorySource = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");

  assert.match(servicesSource, /createHmac/);
  assert.match(servicesSource, /evcp_session\./);
  assert.match(servicesSource, /Expired platform session token/);
  assert.match(servicesSource, /provisionSsoUser/);
  assert.match(appFactorySource, /platform_session_with_mock_fallback/);
  assert.match(appFactorySource, /legacyMockFallback/);
  assert.match(appFactorySource, /authResolution\.mode/);
});
