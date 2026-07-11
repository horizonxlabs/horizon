import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const compose = parse(
  readFileSync(new URL("../../docker/docker-compose.yml", import.meta.url), "utf8")
);
const releaseCompose = parse(
  readFileSync(new URL("../../docker/docker-compose.release.yml", import.meta.url), "utf8")
);

function environmentEntries(service) {
  const env = service.environment ?? {};
  return Array.isArray(env) ? env : Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

test("declares litellm service on internal network without published LLM admin port", () => {
  const litellm = compose.services.litellm;
  assert.ok(litellm, "litellm service missing");
  assert.match(litellm.image, /litellm/);
  assert.ok(!litellm.ports, "litellm must not publish ports to host");
  assert.ok(litellm.networks.includes("evcp-internal"));
  assert.ok(litellm.volumes.some((volume) => volume.includes("litellm-config.yaml")));
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

test("release compose pulls workspace image and disables dev auth bridge", () => {
  const imageService = releaseCompose.services["workspace-next-image"];
  assert.ok(imageService, "release compose must include a workspace image pull/cache service");
  assert.match(
    imageService.image,
    /\/evcp-workspace-next:\$\{EVCP_VERSION:\?EVCP_VERSION is required\}/
  );
  assert.deepEqual(imageService.command, ["sh", "-lc", "echo workspace-next image available"]);

  const api = releaseCompose.services["platform-api"];
  assert.equal(api.depends_on["workspace-next-image"].condition, "service_completed_successfully");
  const joined = environmentEntries(api).join("\n");
  assert.match(joined, /EVCP_WORKSPACE_IMAGE=.*evcp-workspace-next/);
  assert.match(joined, /EVCP_ALLOW_SIMULATE_LOGIN=0/);
});

test("release compose initializes the litellm database before litellm starts", () => {
  const init = releaseCompose.services["litellm-db-init"];
  assert.ok(init, "release compose must create the litellm database on fresh volumes");
  assert.equal(init.depends_on.postgres.condition, "service_healthy");
  assert.match(init.image, /^postgres:/);
  assert.match(init.command.join(" "), /CREATE DATABASE litellm/);

  const litellm = releaseCompose.services.litellm;
  assert.equal(litellm.depends_on["litellm-db-init"].condition, "service_completed_successfully");
  assert.ok(litellm.healthcheck, "release litellm must expose a readiness healthcheck");
  const joined = environmentEntries(litellm).join("\n");
  assert.match(joined, /DATABASE_URL=\$\{LITELLM_DATABASE_URL:\?/);
  assert.match(joined, /LITELLM_DATABASE_URL=\$\{LITELLM_DATABASE_URL:\?/);
  assert.doesNotMatch(
    joined,
    /POSTGRES_PASSWORD.*@postgres:5432\/litellm/,
    "release compose must not synthesize a database URL from a raw password"
  );

  const api = releaseCompose.services["platform-api"];
  assert.equal(
    api.depends_on.litellm.condition,
    "service_healthy",
    "platform-api must not generate workspace LLM keys until litellm is ready"
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

test("litellm config file routes at least one provider via env-referenced key", () => {
  const config = parse(
    readFileSync(new URL("../../docker/litellm-config.yaml", import.meta.url), "utf8")
  );
  assert.ok(Array.isArray(config.model_list) && config.model_list.length >= 1);
  const first = config.model_list[0];
  assert.match(
    String(first.litellm_params.api_key),
    /^os\.environ\//,
    "keys must come from env, not literals"
  );
});
