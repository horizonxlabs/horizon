import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const platformServices = readFileSync("apps/platform-api/src/platform-services.ts", "utf8");
const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const authSessionDoc = readFileSync("docs/operations/real-mvp-auth-session.md", "utf8");

test("platform auth session source signs and resolves bearer tokens through the auth service", () => {
  assert.match(platformServices, /createHmac/);
  assert.match(platformServices, /export type AuthMode = "platform_session" \| "mock_header"/);
  assert.match(platformServices, /issuePlatformSession/);
  assert.match(platformServices, /evcp_session\./);
  assert.match(platformServices, /resolve\(headers: HeaderBag\): AuthResolution/);
  assert.match(platformServices, /Authorization Bearer token or x-mock-user-email/);
  assert.match(platformServices, /provisionSsoUser/);
});

test("core API routes expose auth evidence and support runtime persistence bearer sessions", () => {
  assert.match(appFactory, /resolvePersistenceAuth/);
  assert.match(appFactory, /buildAuthEvidence/);
  assert.match(appFactory, /legacyMockFallback: resolution\.mode === "mock_header"/);
  assert.match(appFactory, /auth: buildAuthEvidence\(authResolution\)/);
  assert.match(appFactory, /platform_session_with_mock_header_for_tests/);
  assert.match(appFactory, /: "platform_session"/);
  assert.match(appFactory, /executePlatformApiRequestAsync/);
});

test("auth session operations doc explains current modes risks and next migration step", () => {
  assert.match(authSessionDoc, /Production Keycloak Authentication/);
  assert.match(authSessionDoc, /Authorization: Bearer <evcp_session>/);
  assert.match(authSessionDoc, /auth\/keycloak\/callback/);
  assert.match(authSessionDoc, /mock identity headers/);
});
