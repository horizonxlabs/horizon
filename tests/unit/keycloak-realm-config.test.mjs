import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredEnvironment = {
  KEYCLOAK_ISSUER_URL: "http://keycloak:8080/realms/evcp",
  KEYCLOAK_REALM: "evcp",
  KEYCLOAK_PLATFORM_CLIENT_ID: "evcp-platform-api",
  KEYCLOAK_PLATFORM_CLIENT_SECRET: "secret",
  KEYCLOAK_ADMIN_CLIENT_ID: "evcp-admin-service",
  KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-secret",
  EVCP_PUBLIC_API_URL: "http://localhost:3100"
};

test("Keycloak realm permits authorization-code login only through the confidential Platform API client", async () => {
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  const realm = JSON.parse(await readFile("apps/platform-api/keycloak/evcp-realm.json", "utf8"));
  const config = readKeycloakConfig(requiredEnvironment);

  assert.deepEqual(
    realm.groups.map(({ name }) => name).sort(),
    ["evcp-admins", "evcp-creators", "evcp-users"]
  );
  assert.deepEqual(realm.clients.map(({ clientId }) => clientId).sort(), [
    "evcp-admin-service",
    "evcp-platform-api"
  ]);

  const platformClient = realm.clients.find(({ clientId }) => clientId === "evcp-platform-api");
  const adminClient = realm.clients.find(({ clientId }) => clientId === "evcp-admin-service");
  assert.equal(platformClient.publicClient, false);
  assert.equal(platformClient.standardFlowEnabled, true);
  assert.deepEqual(platformClient.redirectUris, ["http://localhost:3100/auth/keycloak/callback"]);
  assert.equal(adminClient.publicClient, false);
  assert.equal(adminClient.standardFlowEnabled, false);
  assert.equal(adminClient.serviceAccountsEnabled, true);
  assert.deepEqual(adminClient.serviceAccountClientRoles["realm-management"].sort(), [
    "manage-users",
    "query-users",
    "view-users"
  ]);
  for (const client of realm.clients) {
    assert.equal(client.directAccessGrantsEnabled, false);
    assert.equal("secret" in client, false, `${client.clientId} secret must be bootstrapped at runtime`);
  }

  assert.equal(config.issuerUrl, "http://keycloak:8080/realms/evcp");
  assert.equal(config.callbackUrl, "http://localhost:3100/auth/keycloak/callback");
});

test("Keycloak configuration rejects missing required values and normalizes the callback URL", async () => {
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  assert.throws(
    () => readKeycloakConfig({ ...requiredEnvironment, KEYCLOAK_ADMIN_CLIENT_SECRET: "  " }),
    /KEYCLOAK_ADMIN_CLIENT_SECRET is required/
  );
  assert.equal(
    readKeycloakConfig({ ...requiredEnvironment, EVCP_PUBLIC_API_URL: "http://localhost:3100/" }).callbackUrl,
    "http://localhost:3100/auth/keycloak/callback"
  );
});

test("Compose imports the realm and bootstraps confidential client secrets before Platform API starts", async () => {
  const [developmentCompose, releaseCompose] = await Promise.all([
    readFile("docker/docker-compose.yml", "utf8"),
    readFile("docker/docker-compose.release.yml", "utf8")
  ]);

  for (const compose of [developmentCompose, releaseCompose]) {
    assert.match(compose, /--import-realm/);
    assert.match(compose, /evcp-realm\.json:\/opt\/keycloak\/data\/import\/evcp-realm\.json:ro/);
    assert.match(compose, /keycloak-bootstrap:/);
    assert.match(compose, /KEYCLOAK_PLATFORM_CLIENT_SECRET/);
    assert.match(compose, /KEYCLOAK_ADMIN_CLIENT_SECRET/);
    assert.match(compose, /service_completed_successfully/);
  }
  assert.match(developmentCompose, /command: start-dev --import-realm --http-port=8080/);
  assert.match(releaseCompose, /command: start --import-realm --http-enabled=true --http-port=8080/);

  const developmentSharedNodeService = developmentCompose.slice(0, developmentCompose.indexOf("services:"));
  const developmentPlatformApi = developmentCompose.slice(
    developmentCompose.indexOf("  platform-api:"),
    developmentCompose.indexOf("  admin-web:")
  );
  assert.doesNotMatch(developmentSharedNodeService, /env_file:/);
  assert.match(developmentPlatformApi, /env_file:/);
});
