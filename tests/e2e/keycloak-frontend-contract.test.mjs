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
  for (const label of [
    "Add user",
    "Create user",
    "Manage",
    "Save profile",
    "Disable",
    "Enable",
    "Reset password",
    "Save role",
    "Next"
  ])
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
  assert.match(creator, /consumeCreatorSessionHandoff\(\)[\s\S]*canEnterWorkspace/);
  assert.doesNotMatch(store, /legacyUserEmail/);
});

test("simulate login is disabled unless explicitly enabled", async () => {
  const source = await readFile("apps/platform-api/src/app-factory.ts", "utf8");
  assert.match(source, /EVCP_ALLOW_SIMULATE_LOGIN \?\? "0"/);
  assert.match(source, /!== "1"/);
});

test("the Keycloak login theme follows the compact Horizon application auth design", async () => {
  const [template, styles] = await Promise.all([
    readFile("apps/platform-api/keycloak/themes/horizon/login/template.ftl", "utf8"),
    readFile(
      "apps/platform-api/keycloak/themes/horizon/login/resources/css/horizon-login.css",
      "utf8"
    )
  ]);

  assert.match(template, /horizon-brand-badge/);
  assert.match(template, /horizon-benefits/);
  assert.match(template, /Governed by default/);
  assert.match(styles, /\.horizon-brand-badge[\s\S]*background:\s*#ffffff/);
  assert.match(styles, /\.horizon-auth-shell[\s\S]*width:\s*min\(884px/);
  assert.match(styles, /border-radius:\s*10px/);
  assert.match(styles, /@media \(max-width:\s*767px\)/);
});

test("the Keycloak password field presents its visibility control as one unified input", async () => {
  const styles = await readFile(
    "apps/platform-api/keycloak/themes/horizon/login/resources/css/horizon-login.css",
    "utf8"
  );

  const unifiedField = styles.match(
    /\.horizon-auth-panel \.pf-v5-c-input-group,\s*\.horizon-auth-panel \.pf-c-input-group\s*\{([^}]*)\}/
  )?.[1];
  assert.ok(unifiedField, "password input group must have a shared visual container");
  assert.match(unifiedField, /border:\s*1px solid #cbd5e1;/);
  assert.match(unifiedField, /border-radius:\s*10px;/);
  assert.match(unifiedField, /overflow:\s*hidden;/);

  const focusState = styles.match(
    /\.horizon-auth-panel \.pf-v5-c-input-group:focus-within,\s*\.horizon-auth-panel \.pf-c-input-group:focus-within\s*\{([^}]*)\}/
  )?.[1];
  assert.ok(focusState, "password input group must expose a unified focus state");
  assert.match(focusState, /border-color:\s*var\(--horizon-primary\);/);
  assert.match(focusState, /box-shadow:\s*0 0 0 3px rgba\(37, 99, 235, 0\.16\);/);

  const visibilityControl = styles.match(
    /\.horizon-auth-panel \.pf-v5-c-input-group button,[\s\S]*?\.horizon-auth-panel \.pf-c-button\.pf-m-control\s*\{([^}]*)\}/
  )?.[1];
  assert.ok(visibilityControl, "password visibility control must join the input container");
  assert.match(visibilityControl, /border:\s*0;/);
  assert.match(visibilityControl, /border-left:\s*1px solid var\(--horizon-border\);/);
  assert.match(visibilityControl, /border-radius:\s*0;/);
});
