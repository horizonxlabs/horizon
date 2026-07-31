import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredEnvironment = {
  KEYCLOAK_ISSUER_URL: "http://localhost:8080/auth/realms/evcp",
  KEYCLOAK_INTERNAL_ISSUER_URL: "http://keycloak:8080/auth/realms/evcp",
  KEYCLOAK_REALM: "evcp",
  KEYCLOAK_PLATFORM_CLIENT_ID: "evcp-platform-api",
  KEYCLOAK_PLATFORM_CLIENT_SECRET: "secret",
  KEYCLOAK_ADMIN_CLIENT_ID: "evcp-admin-service",
  KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-secret",
  EVCP_PUBLIC_API_URL: "http://localhost:3100"
};

test("Keycloak realm permits authorization-code login only through the confidential Platform API client", async () => {
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  const [realmSource, bootstrap] = await Promise.all([
    readFile("apps/platform-api/keycloak/evcp-realm.json", "utf8"),
    readFile("apps/platform-api/keycloak/bootstrap-clients.sh", "utf8")
  ]);
  const realm = JSON.parse(realmSource);
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
  assert.equal("serviceAccountClientRoles" in adminClient, false);
  assert.match(bootstrap, /add-roles/);
  assert.match(bootstrap, /--cclientid realm-management/);
  assert.match(bootstrap, /for role in query-users view-users manage-users; do/);
  for (const client of realm.clients) {
    assert.equal(client.directAccessGrantsEnabled, false);
    assert.equal("secret" in client, false, `${client.clientId} secret must be bootstrapped at runtime`);
  }

  assert.equal(config.issuerUrl, "http://localhost:8080/auth/realms/evcp");
  assert.equal(config.callbackUrl, "http://localhost:3100/auth/keycloak/callback");
});

test("Keycloak configuration rejects missing required values and normalizes the callback URL", async () => {
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  assert.throws(
    () => readKeycloakConfig({ ...requiredEnvironment, KEYCLOAK_ADMIN_CLIENT_SECRET: "  " }),
    /KEYCLOAK_ADMIN_CLIENT_SECRET is required/
  );
  assert.throws(
    () => readKeycloakConfig({ ...requiredEnvironment, KEYCLOAK_INTERNAL_ISSUER_URL: "  " }),
    /KEYCLOAK_INTERNAL_ISSUER_URL is required/
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

  // Common to both stacks: realm import, a bootstrap step, and the confidential client secrets.
  for (const compose of [developmentCompose, releaseCompose]) {
    assert.match(compose, /--import-realm/);
    assert.match(compose, /keycloak-bootstrap:/);
    assert.match(compose, /KEYCLOAK_PLATFORM_CLIENT_SECRET/);
    assert.match(compose, /KEYCLOAK_ADMIN_CLIENT_SECRET/);
  }
  // Dev (docker compose): realm mounted read-only, ordering enforced via depends_on.
  assert.match(developmentCompose, /evcp-realm\.json:\/opt\/keycloak\/data\/import\/evcp-realm\.json:ro/);
  assert.match(developmentCompose, /service_completed_successfully/);
  // Release (docker stack deploy / swarm): realm delivered as a config, bootstrap as a replicated-job.
  assert.match(releaseCompose, /keycloak-realm:/);
  assert.match(releaseCompose, /file: \.\.\/apps\/platform-api\/keycloak\/evcp-realm\.json/);
  assert.match(releaseCompose, /target: \/opt\/keycloak\/data\/import\/evcp-realm\.json/);
  assert.match(releaseCompose, /mode: replicated-job/);
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

test("bootstrap reconciles the public callback and compose exposes a public Keycloak issuer", async () => {
  const [bootstrap, developmentCompose, releaseCompose, caddy, releaseCaddy] = await Promise.all([
    readFile("apps/platform-api/keycloak/bootstrap-clients.sh", "utf8"),
    readFile("docker/docker-compose.yml", "utf8"),
    readFile("docker/docker-compose.release.yml", "utf8"),
    readFile("docker/Caddyfile", "utf8"),
    readFile("docker/Caddyfile.release", "utf8")
  ]);

  assert.match(bootstrap, /EVCP_PUBLIC_API_URL/);
  assert.match(bootstrap, /redirectUris/);
  assert.match(bootstrap, /auth\/keycloak\/callback/);
  assert.match(bootstrap, /KEYCLOAK_INTERNAL_ISSUER_URL/);
  assert.doesNotMatch(bootstrap, /--server http:\/\/keycloak:8080/);
  for (const compose of [developmentCompose, releaseCompose]) {
    assert.match(compose, /KEYCLOAK_INTERNAL_ISSUER_URL/);
    assert.match(compose, /KC_HTTP_RELATIVE_PATH: \/auth/);
    assert.match(compose, /KC_HOSTNAME/);
  }
  for (const config of [caddy, releaseCaddy]) {
    assert.match(config, /handle \/auth\/\*/);
    assert.match(config, /reverse_proxy keycloak:8080/);
  }
});

test("Keycloak Admin client preserves the internal /auth path for its token and REST endpoints", async () => {
  const { KeycloakAdminClient } = await import("../../apps/platform-api/src/keycloak/admin-client.ts");
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  const urls = [];
  const client = new KeycloakAdminClient({
    config: { ...readKeycloakConfig(requiredEnvironment) },
    fetch: async (url) => {
      urls.push(String(url));
      return urls.length === 1 ? new Response(JSON.stringify({ access_token: "service-token" })) : new Response(JSON.stringify([]));
    }
  });
  await client.get("/users?first=0&max=1");
  assert.deepEqual(urls, [
    "http://keycloak:8080/auth/realms/evcp/protocol/openid-connect/token",
    "http://keycloak:8080/auth/admin/realms/evcp/users?first=0&max=1"
  ]);
});
