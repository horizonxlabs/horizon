import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const compose = parse(readFileSync(new URL("../../docker/docker-compose.yml", import.meta.url), "utf8"));

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
  const env = api.environment ?? {};
  const envEntries = Array.isArray(env) ? env : Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const joined = envEntries.join("\n");
  assert.match(joined, /EVCP_LITELLM_BASE_URL/);
  assert.match(joined, /EVCP_LITELLM_MASTER_KEY/);
  assert.match(joined, /EVCP_WORKSPACE_SECRET_KEY/);
  assert.match(joined, /EVCP_WORKSPACE_IMAGE/);
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
  const config = parse(readFileSync(new URL("../../docker/litellm-config.yaml", import.meta.url), "utf8"));
  assert.ok(Array.isArray(config.model_list) && config.model_list.length >= 1);
  const first = config.model_list[0];
  assert.match(String(first.litellm_params.api_key), /^os\.environ\//, "keys must come from env, not literals");
});
