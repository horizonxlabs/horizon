import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("browser applications start Keycloak login and do not retain simulated SSO bridges", async () => {
  for (const file of [
    "apps/admin-web/src/login-screen.tsx",
    "apps/creator-web/src/app/creator-app-helpers.ts",
    "apps/app-store-pwa/src/features/storefront/bootstrap.ts"
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /simulateSsoLogin|SimulatedSsoLoginInput/);
    assert.match(source, /startKeycloakLogin|window\.location\.assign/);
  }
});

test("admin user page exposes Keycloak lifecycle actions", async () => {
  const source = await readFile(
    "apps/admin-web/src/features/user-management/KeycloakUserManagement.tsx",
    "utf8"
  );
  for (const label of ["Create user", "Edit", "Disable", "Enable", "Reset password", "Role", "Next page"])
    assert.match(source, new RegExp(label));
  assert.match(source, /keycloak\.list\(\{ first: page \* pageSize, max: pageSize \}\)/);
  assert.match(source, /result\.meta\.total/);
});

test("Creator consumes a Platform session handoff before its auth gate and Store has no mock identity", async () => {
  const [creator, store] = await Promise.all([
    readFile("apps/creator-web/src/app/CreatorApp.tsx", "utf8"),
    readFile("apps/app-store-pwa/src/features/storefront/platform-client.ts", "utf8")
  ]);
  assert.match(creator, /consumeCreatorSessionHandoff\(\)[\s\S]*hasValidSession/);
  assert.doesNotMatch(store, /legacyUserEmail/);
});

test("simulate login is disabled unless explicitly enabled", async () => {
  const source = await readFile("apps/platform-api/src/app-factory.ts", "utf8");
  assert.match(source, /EVCP_ALLOW_SIMULATE_LOGIN \?\? "0"/);
  assert.match(source, /!== "1"/);
});
