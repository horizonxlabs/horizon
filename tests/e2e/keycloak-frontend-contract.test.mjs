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
  for (const label of ["Create user", "Disable", "Enable", "Reset password", "Role"])
    assert.match(source, new RegExp(label));
});
