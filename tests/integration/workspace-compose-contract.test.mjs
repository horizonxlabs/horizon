import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, parseDocument } from "yaml";

const compose = parseDocument(
  readFileSync(new URL("../../docker/docker-compose.yml", import.meta.url), "utf8"),
  { merge: true }
).toJS();
const releaseCompose = parse(
  readFileSync(new URL("../../docker/docker-compose.release.yml", import.meta.url), "utf8")
);
const releaseCaddyfile = readFileSync(
  new URL("../../docker/Caddyfile.release", import.meta.url),
  "utf8"
);

function environmentEntries(service) {
  const env = service.environment ?? {};
  return Array.isArray(env) ? env : Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

function serviceNetworks(service) {
  const networks = service.networks ?? [];
  return Array.isArray(networks) ? networks : Object.keys(networks);
}

test("declares litellm service on internal network without published LLM admin port", () => {
  const litellm = compose.services.litellm;
  assert.ok(litellm, "litellm service missing");
  assert.match(litellm.image, /litellm/);
  assert.ok(!litellm.ports, "litellm must not publish ports to host");
  assert.ok(litellm.networks.includes("evcp-internal"));
  assert.ok(litellm.volumes.some((volume) => volume.includes("litellm-config.yaml")));
});

test("development compose initializes the litellm database before healthy startup", () => {
  const init = compose.services["litellm-db-init"];
  assert.ok(init, "development compose must create the litellm database on fresh volumes");
  assert.equal(init.depends_on.postgres.condition, "service_healthy");
  assert.match(init.image, /^postgres:/);
  assert.match(init.command.join(" "), /CREATE DATABASE litellm/);

  const litellm = compose.services.litellm;
  assert.equal(litellm.depends_on["litellm-db-init"].condition, "service_completed_successfully");
  assert.ok(litellm.healthcheck, "development litellm must expose a readiness healthcheck");
  assert.equal(compose.services["platform-api"].depends_on.litellm.condition, "service_healthy");
});

test("platform-api can reach docker socket and litellm", () => {
  const api = compose.services["platform-api"];
  assert.ok(api.volumes.some((volume) => volume.includes("/var/run/docker.sock")));
  const joined = environmentEntries(api).join("\n");
  assert.match(joined, /EVCP_LITELLM_BASE_URL/);
  assert.match(joined, /EVCP_LITELLM_MASTER_KEY/);
  assert.match(joined, /EVCP_WORKSPACE_SECRET_KEY/);
  assert.match(joined, /EVCP_WORKSPACE_IMAGE/);
});

test("real workspace deployments configure a three-slot warm pool", () => {
  assert.equal(
    compose.services["platform-api"].environment.EVCP_WORKSPACE_WARM_POOL_SIZE,
    "${EVCP_WORKSPACE_WARM_POOL_SIZE:-3}"
  );
  assert.equal(
    releaseCompose.services["platform-api"].environment.EVCP_WORKSPACE_WARM_POOL_SIZE,
    "${EVCP_WORKSPACE_WARM_POOL_SIZE:-3}"
  );
});

test("development and release compose leave Pi cumulative token caps opt-in", () => {
  for (const api of [compose.services["platform-api"], releaseCompose.services["platform-api"]]) {
    const joined = environmentEntries(api).join("\n");
    assert.match(joined, /EVCP_PI_MAX_MODEL_ROUNDS=.*:-48/);
    assert.doesNotMatch(joined, /EVCP_PI_MAX_TURN_TOKENS/);
    assert.match(joined, /EVCP_PI_MODEL_ROUND_TIMEOUT_MS=.*:-300000/);
    assert.match(joined, /EVCP_PI_TURN_TIMEOUT_MS=.*:-1800000/);
  }
});

test("development and release compose expose image generation runtime limits", () => {
  for (const api of [compose.services["platform-api"], releaseCompose.services["platform-api"]]) {
    const joined = environmentEntries(api).join("\n");
    assert.match(joined, /EVCP_AI_IMAGE_TIMEOUT_MS=.*:-60000/);
    assert.match(joined, /EVCP_PI_MAX_IMAGE_CALLS=.*:-4/);
    assert.match(joined, /EVCP_PI_IMAGE_MAX_BYTES=.*:-4194304/);
    assert.doesNotMatch(joined, /EVCP_AI_IMAGE_TOKEN_EQUIVALENT/);
  }
});

test("dev Node services isolate Linux dependencies from the host bind mount", () => {
  for (const name of ["platform-api", "admin-web", "creator-web", "app-store-pwa"]) {
    const volumes = compose.services[name].volumes ?? [];
    assert.ok(
      volumes.includes("evcp_node_modules:/workspace/node_modules"),
      `${name} must not reuse host node_modules inside Linux`
    );
  }
  assert.ok(
    Object.hasOwn(compose.volumes ?? {}, "evcp_node_modules"),
    "named node_modules volume is missing"
  );
});

test("Keycloak bootstrap configures post-logout redirects for every Horizon surface", () => {
  const bootstrap = compose.services["keycloak-bootstrap"];
  const environment = environmentEntries(bootstrap).join("\n");
  for (const key of ["EVCP_ADMIN_WEB_URL", "EVCP_CREATOR_WEB_URL", "EVCP_STORE_WEB_URL"]) {
    assert.match(environment, new RegExp(key));
  }
  const script = readFileSync(
    new URL("../../apps/platform-api/keycloak/bootstrap-clients.sh", import.meta.url),
    "utf8"
  );
  assert.match(script, /post\.logout\.redirect\.uris/);
});

test("release compose pulls workspace image and disables dev auth bridge", () => {
  const imageService = releaseCompose.services["workspace-next-image"];
  assert.ok(imageService, "release compose must include a workspace image pull/cache service");
  assert.match(
    imageService.image,
    /\/evcp-workspace-next:\$\{EVCP_VERSION:\?EVCP_VERSION required\}/
  );
  assert.deepEqual(imageService.command, ["true"]);
  assert.equal(
    imageService.deploy?.mode,
    "replicated-job",
    "workspace image pull must run as a one-shot swarm job (no depends_on to gate ordering)"
  );

  const api = releaseCompose.services["platform-api"];
  const joined = environmentEntries(api).join("\n");
  assert.match(joined, /EVCP_WORKSPACE_IMAGE=.*evcp-workspace-next/);
  assert.match(joined, /EVCP_ALLOW_SIMULATE_LOGIN=0/);
});

test("release API, runtime image, and image-cache job resolve to the same selected release", () => {
  const api = releaseCompose.services["platform-api"];
  for (const version of ["v1.2.3", "v1.2.4-rc.1"]) {
    const values = { EVCP_IMAGE_REPOSITORY: "registry.example/evcp", EVCP_VERSION: version };
    const resolve = (value) =>
      value.replace(/\$\{([A-Z_]+):\?[^}]*\}/g, (_match, name) => {
        assert.ok(Object.hasOwn(values, name), `unexpected required release variable ${name}`);
        return values[name];
      });
    assert.equal(resolve(api.image), `registry.example/evcp/evcp-platform-api:${version}`);
    assert.equal(resolve(api.environment.EVCP_VERSION), version);
    assert.equal(
      resolve(api.environment.EVCP_WORKSPACE_IMAGE),
      `registry.example/evcp/evcp-workspace-next:${version}`
    );
    assert.equal(
      resolve(releaseCompose.services["workspace-next-image"].image),
      `registry.example/evcp/evcp-workspace-next:${version}`
    );
  }
});

test("release ingress is the only published network boundary and supports domain TLS", () => {
  for (const name of [
    "postgres",
    "redis",
    "minio",
    "keycloak",
    "platform-api",
    "admin-web",
    "creator-web",
    "app-store-pwa"
  ]) {
    assert.ok(
      !releaseCompose.services[name].ports,
      `${name} must remain internal-only in release mode`
    );
  }
  assert.deepEqual(releaseCompose.services.caddy.ports, [
    "${EVCP_HTTP_PORT:-8080}:80",
    "${EVCP_HTTPS_PORT:-8443}:443"
  ]);
  assert.match(releaseCaddyfile, /\{\$EVCP_CADDY_ADDRESS:localhost\}/);
  assert.match(releaseCaddyfile, /\{\$EVCP_STORAGE_CADDY_ADDRESS:storage\.localhost\}/);
  assert.match(releaseCaddyfile, /reverse_proxy minio:9000/);
  const apiEnvironment = environmentEntries(releaseCompose.services["platform-api"]).join("\n");
  assert.match(apiEnvironment, /EVCP_S3_PUBLIC_URL=\$\{EVCP_S3_PUBLIC_URL:\?/);
});

test("release compose initializes the litellm database before litellm starts", () => {
  const init = releaseCompose.services["litellm-db-init"];
  assert.ok(init, "release compose must create the litellm database on fresh volumes");
  // Swarm carries no depends_on, so ordering is enforced by the job waiting on Postgres itself
  // (retried via deploy.restart_policy) rather than a compose-level condition.
  assert.match(
    init.command.join(" "),
    /until pg_isready/,
    "litellm-db-init must wait for postgres itself since depends_on is unavailable in swarm"
  );
  assert.equal(init.deploy?.mode, "replicated-job");
  assert.equal(init.deploy?.restart_policy?.condition, "on-failure");
  assert.match(init.image, /^postgres:/);
  assert.match(init.command.join(" "), /CREATE DATABASE litellm/);

  const litellm = releaseCompose.services.litellm;
  assert.ok(litellm.healthcheck, "release litellm must expose a readiness healthcheck");
  const joined = environmentEntries(litellm).join("\n");
  assert.match(joined, /DATABASE_URL_FILE=\/run\/secrets\/evcp_litellm_database_url/);
  assert.match(joined, /LITELLM_DATABASE_URL_FILE=\/run\/secrets\/evcp_litellm_database_url/);
  assert.doesNotMatch(
    joined,
    /POSTGRES_PASSWORD.*@postgres:5432\/litellm/,
    "release compose must not synthesize a database URL from a raw password"
  );
});

test("evcp-internal network is declared and used by workspace-facing services", () => {
  assert.ok(compose.networks?.["evcp-internal"], "evcp-internal network missing");
  for (const name of ["platform-api", "litellm", "postgres", "minio", "caddy"]) {
    assert.ok(
      compose.services[name].networks?.includes("evcp-internal"),
      `${name} must join evcp-internal`
    );
  }
});

test("default Redis consumers share a Compose network with Redis", () => {
  for (const [name, document] of [
    ["development", compose],
    ["release", releaseCompose]
  ]) {
    const redisNetworks = new Set(serviceNetworks(document.services.redis));
    const consumers = Object.entries(document.services).filter(([, service]) =>
      environmentEntries(service).some((entry) => entry.includes("redis://redis:6379"))
    );

    assert.ok(consumers.length > 0, `${name} compose must declare a default Redis consumer`);
    for (const [serviceName, service] of consumers) {
      assert.ok(
        serviceNetworks(service).some((network) => redisNetworks.has(network)),
        `${name} ${serviceName} must share a network with Redis`
      );
    }
  }
});

test("LiteLLM config has no upstream provider credential source", () => {
  const config = parse(
    readFileSync(new URL("../../docker/litellm-config.yaml", import.meta.url), "utf8")
  );
  assert.deepEqual(config.model_list ?? [], []);
  assert.doesNotMatch(JSON.stringify(config), /ANTHROPIC_API_KEY|OPENAI_API_KEY/);

  for (const service of [compose.services.litellm, releaseCompose.services.litellm]) {
    const environment = environmentEntries(service).join("\n");
    assert.doesNotMatch(environment, /ANTHROPIC_API_KEY|OPENAI_API_KEY/);
  }
});
