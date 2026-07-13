import assert from "node:assert/strict";
import test from "node:test";

const { KeycloakOidcService } = await import(
  "../../apps/platform-api/src/keycloak/oidc-service.ts"
);

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function unsignedJwt(claims) {
  return `${base64Url(JSON.stringify({ alg: "none" }))}.${base64Url(JSON.stringify(claims))}.signature`;
}

function createKeycloakOidcHarness({ groups = ["evcp-users"] } = {}) {
  const fetchCalls = [];
  const issued = [];
  const config = {
    issuerUrl: "https://keycloak.example.test/realms/evcp",
    realm: "evcp",
    platformClientId: "evcp-platform-api",
    platformClientSecret: "server-only-client-secret",
    adminClientId: "evcp-admin-service",
    adminClientSecret: "server-only-admin-secret",
    callbackUrl: "https://api.example.test/auth/keycloak/callback"
  };
  const service = new KeycloakOidcService({
    config,
    allowedReturnOrigins: ["https://admin.example.test"],
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return new Response(
        JSON.stringify({
          id_token: unsignedJwt({
            iss: config.issuerUrl,
            aud: config.platformClientId,
            sub: "keycloak-user-001",
            email: "admin@example.test",
            name: "OIDC Admin",
            nonce: "verified-by-harness",
            groups
          })
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
    verifyIdToken: async () => ({
      subject: "keycloak-user-001",
      email: "admin@example.test",
      name: "OIDC Admin",
      groups
    }),
    issueKeycloakSession: (claims) => {
      issued.push(claims);
      return {
        id: "psess_keycloak_001",
        providerId: "authprov_keycloak_default_001",
        providerType: "keycloak",
        token: "evcp_session.keycloak-session",
        claims,
        issuedAt: "2026-07-13T00:00:00.000Z",
        expiresAt: "2026-07-13T01:00:00.000Z"
      };
    },
    randomBytes: (size) => Buffer.alloc(size, 7),
    now: () => new Date("2026-07-13T00:00:00.000Z")
  });
  return { service, fetchCalls, issued };
}

test("OIDC callback rejects a mismatched state before exchanging a code", async () => {
  const { service, fetchCalls } = createKeycloakOidcHarness();
  const { authorizationUrl } = service.start("admin", "https://admin.example.test/");
  assert.match(authorizationUrl, /code_challenge=/);
  await assert.rejects(() => service.complete({ code: "code", state: "wrong" }), /invalid_oidc_state/);
  assert.equal(fetchCalls.length, 0);
});

test("OIDC callback maps Keycloak groups and issues a platform session", async () => {
  const { service, fetchCalls, issued } = createKeycloakOidcHarness({ groups: ["evcp-admins"] });
  const { state } = service.start("admin", "https://admin.example.test/");
  const result = await service.complete({ code: "valid", state });

  assert.equal(result.session.claims.platformRoles[0], "admin");
  assert.match(result.session.token, /^evcp_session\./);
  assert.equal(result.returnTo, "https://admin.example.test/");
  assert.equal(issued.length, 1);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.method, "POST");
  assert.match(String(fetchCalls[0].options.body), /code_verifier=/);
  assert.doesNotMatch(result.session.token, /server-only-client-secret/);
});
