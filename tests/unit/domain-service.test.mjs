import test from "node:test";
import assert from "node:assert/strict";
import {
  createDomainService,
  InvalidDomain
} from "../../apps/platform-api/src/system/domain-service.ts";
import { createSwarmServiceEngine } from "../../apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts";

test("domain updates preserve release image and release environment through the engine env wrapper", async () => {
  const posts = [];
  const engine = createSwarmServiceEngine({
    request: async ({ method, path, body }) => {
      if (method === "POST") posts.push({ path, body });
      return {
        status: 200,
        json: async () => ({
          Version: { Index: 8 },
          Spec: {
            TaskTemplate: {
              ContainerSpec: {
                Image: "repo/service:v2",
                Env: [
                  "EVCP_VERSION=v2",
                  "EVCP_WORKSPACE_IMAGE=repo/evcp-workspace-next:v2",
                  "SECRET=value=with=equals"
                ]
              }
            }
          }
        })
      };
    }
  });
  await makeService({ engine }).service.setDomain("app.example.com");
  await new Promise(setImmediate);
  assert.equal(posts.length, 3);
  for (const { path, body } of posts) {
    assert.match(path, /update\?version=8$/);
    assert.equal(body.TaskTemplate.ContainerSpec.Image, "repo/service:v2");
    assert.ok(body.TaskTemplate.ContainerSpec.Env.includes("EVCP_VERSION=v2"));
    assert.ok(
      body.TaskTemplate.ContainerSpec.Env.includes(
        "EVCP_WORKSPACE_IMAGE=repo/evcp-workspace-next:v2"
      )
    );
    assert.ok(body.TaskTemplate.ContainerSpec.Env.includes("SECRET=value=with=equals"));
  }
  assert.match(posts.at(-1).path, /evcp_platform-api/);
});

function fakeEngine() {
  const calls = [];
  return {
    calls,
    async updateServiceEnv(serviceName, envPatch) {
      calls.push({ serviceName, envPatch });
    }
  };
}

function fakeSettings() {
  let domain = null;
  return {
    get domain() {
      return domain;
    },
    async getBusinessSettings() {
      return { domain };
    },
    async setDomain(next) {
      domain = next;
      return { domain };
    }
  };
}

function fakeKeycloak() {
  const calls = [];
  return {
    calls,
    async get(path) {
      calls.push({ method: "GET", path });
      return { status: 200, data: [{ id: "client-123" }], headers: new Headers() };
    },
    async put(path, body) {
      calls.push({ method: "PUT", path, body });
      return { status: 204, data: undefined, headers: new Headers() };
    }
  };
}

function fakeWriter() {
  const writes = [];
  return {
    writes,
    write(path, content) {
      writes.push({ path, content });
    }
  };
}

function makeService(overrides = {}) {
  const engine = overrides.engine ?? fakeEngine();
  const settings = overrides.settings ?? fakeSettings();
  const keycloak = "keycloak" in overrides ? overrides.keycloak : fakeKeycloak();
  const writer = overrides.writer ?? fakeWriter();
  const service = createDomainService({
    engine,
    settings,
    keycloak,
    writeDomainEnv: writer.write,
    env: { KEYCLOAK_REALM: "evcp", EVCP_STACK_ENV_DIR: "/opt/evcp", ...overrides.env }
  });
  return { service, engine, settings, keycloak, writer };
}

test("setDomain rejects an invalid domain", async () => {
  const { service } = makeService();
  await assert.rejects(() => service.setDomain("not a domain"), InvalidDomain);
  await assert.rejects(() => service.setDomain("http://x"), InvalidDomain);
});

test("setDomain persists the domain to settings", async () => {
  const { service, settings } = makeService();
  await service.setDomain("app.example.com");
  assert.equal(settings.domain, "app.example.com");
});

test("setDomain writes a domain.env with the full domain-carrying var set and no secrets", async () => {
  const { service, writer } = makeService();
  await service.setDomain("app.example.com");

  assert.equal(writer.writes.length, 1);
  const { path, content } = writer.writes[0];
  assert.equal(path, "/opt/evcp/domain.env");
  assert.match(content, /(^|\n)EVCP_CADDY_ADDRESS=app\.example\.com($|\n)/);
  assert.match(content, /(^|\n)EVCP_STORAGE_CADDY_ADDRESS=storage\.app\.example\.com($|\n)/);
  assert.match(content, /(^|\n)EVCP_PUBLIC_API_URL=https:\/\/app\.example\.com\/api($|\n)/);
  assert.match(content, /(^|\n)EVCP_ADMIN_WEB_URL=https:\/\/app\.example\.com($|\n)/);
  assert.match(content, /(^|\n)EVCP_CREATOR_WEB_URL=https:\/\/app\.example\.com($|\n)/);
  assert.match(content, /(^|\n)EVCP_STORE_WEB_URL=https:\/\/app\.example\.com($|\n)/);
  assert.match(content, /(^|\n)EVCP_S3_PUBLIC_URL=https:\/\/storage\.app\.example\.com($|\n)/);
  assert.match(content, /(^|\n)KEYCLOAK_PUBLIC_URL=https:\/\/app\.example\.com\/auth($|\n)/);
  assert.match(
    content,
    /(^|\n)KEYCLOAK_ISSUER_URL=https:\/\/app\.example\.com\/auth\/realms\/evcp($|\n)/
  );
  assert.doesNotMatch(content.toLowerCase(), /secret|password|token/);
});

test("setDomain reconciles the Keycloak client redirect URI + web origin", async () => {
  const { service, keycloak } = makeService();
  await service.setDomain("app.example.com");

  const get = keycloak.calls.find((c) => c.method === "GET");
  assert.ok(get, "expected a GET lookup for the client");
  assert.match(get.path, /clients\?clientId=evcp-platform-api/);

  const put = keycloak.calls.find((c) => c.method === "PUT");
  assert.ok(put, "expected a PUT to reconcile the client");
  assert.equal(put.path, "/clients/client-123");
  assert.deepEqual(put.body.redirectUris, ["https://app.example.com/api/auth/keycloak/callback"]);
  assert.deepEqual(put.body.webOrigins, ["https://app.example.com"]);
});

test("setDomain skips the Keycloak reconcile (without throwing) when no admin client is configured", async () => {
  const { service } = makeService({ keycloak: undefined });
  const result = await service.setDomain("app.example.com");
  assert.deepEqual(result, { accepted: true, domain: "app.example.com" });
});

test("setDomain rolls evcp_caddy, evcp_keycloak, then evcp_platform-api LAST and not awaited", async () => {
  const { service, engine } = makeService();
  const result = await service.setDomain("app.example.com");

  assert.deepEqual(result, { accepted: true, domain: "app.example.com" });
  // platform-api is fire-and-forget; give the microtask a tick to land.
  await new Promise((resolve) => setTimeout(resolve, 10));

  const names = engine.calls.map((c) => c.serviceName);
  assert.deepEqual(names.slice(0, 2), ["evcp_caddy", "evcp_keycloak"]);
  assert.equal(names[names.length - 1], "evcp_platform-api");

  const caddy = engine.calls.find((c) => c.serviceName === "evcp_caddy");
  assert.equal(caddy.envPatch.EVCP_CADDY_ADDRESS, "app.example.com");
  assert.equal(caddy.envPatch.EVCP_STORAGE_CADDY_ADDRESS, "storage.app.example.com");

  const keycloakSvc = engine.calls.find((c) => c.serviceName === "evcp_keycloak");
  assert.equal(keycloakSvc.envPatch.KC_HOSTNAME, "https://app.example.com/auth");

  const platformApi = engine.calls.find((c) => c.serviceName === "evcp_platform-api");
  assert.equal(platformApi.envPatch.EVCP_PUBLIC_API_URL, "https://app.example.com/api");
});

test("getDomainStatus reflects the persisted domain and current env", async () => {
  const { service } = makeService({
    env: { EVCP_PUBLIC_API_URL: "http://x", EVCP_CADDY_ADDRESS: ":80" }
  });
  const before = await service.getDomainStatus();
  assert.equal(before.domain, null);

  await service.setDomain("app.example.com");
  const after = await service.getDomainStatus();
  assert.equal(after.domain, "app.example.com");
});
