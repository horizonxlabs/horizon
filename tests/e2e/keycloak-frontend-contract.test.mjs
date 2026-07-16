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
  const hookSource = await readFile(
    "apps/admin-web/src/features/user-management/use-keycloak-users.ts",
    "utf8"
  );
  const [consoleSource, addDrawerSource, manageDrawerSource] = await Promise.all([
    readFile("apps/admin-web/src/features/user-management/UsersConsole.tsx", "utf8"),
    readFile("apps/admin-web/src/features/user-management/AddUserDrawer.tsx", "utf8"),
    readFile("apps/admin-web/src/features/user-management/ManageUserDrawer.tsx", "utf8")
  ]);
  const uiSource = [consoleSource, addDrawerSource, manageDrawerSource].join("\n");

  // Lifecycle actions live in the hook.
  for (const action of ["createUser", "updateUser", "changeRole", "setEnabled", "resetPassword"])
    assert.match(hookSource, new RegExp(`\\b${action}\\b`));

  // The redesigned UI wires those hook actions to real controls: creation, editing,
  // enable/disable, reset password, role change, and pagination.
  for (const label of ["Add user", "Create user", "Manage", "Save profile", "Disable", "Enable", "Reset password", "Save role", "Next"])
    assert.match(uiSource, new RegExp(label));

  assert.match(hookSource, /keycloak\.list\(\{ first: page \* pageSize, max: pageSize \}\)/);
  assert.match(hookSource, /result\.meta/);
  assert.match(uiSource, /meta\.total/);
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
