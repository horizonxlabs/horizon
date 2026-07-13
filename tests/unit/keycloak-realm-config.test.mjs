import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Keycloak realm import and environment config expose only the required EVCP clients and groups", async () => {
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  const realm = JSON.parse(await readFile("apps/platform-api/keycloak/evcp-realm.json", "utf8"));
  const config = readKeycloakConfig({
    KEYCLOAK_ISSUER_URL: "http://keycloak:8080/realms/evcp",
    KEYCLOAK_REALM: "evcp",
    KEYCLOAK_PLATFORM_CLIENT_ID: "evcp-platform-api",
    KEYCLOAK_PLATFORM_CLIENT_SECRET: "secret",
    KEYCLOAK_ADMIN_CLIENT_ID: "evcp-admin-service",
    KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-secret",
    EVCP_PUBLIC_API_URL: "http://localhost:3100"
  });

  assert.deepEqual(
    realm.groups.map(({ name }) => name).sort(),
    ["evcp-admins", "evcp-creators", "evcp-users"]
  );
  assert.equal(config.issuerUrl, "http://keycloak:8080/realms/evcp");
  assert.equal(config.callbackUrl, "http://localhost:3100/auth/keycloak/callback");
});
