import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const release = parse(readFileSync(new URL("../../docker/docker-compose.release.yml", import.meta.url), "utf8"));
const openbao = parse(readFileSync(new URL("../../docker/docker-compose.openbao.yml", import.meta.url), "utf8"));

const COMPOSE_ONLY_KEYS = ["container_name", "restart", "env_file", "depends_on"];
const LONG_RUNNING = ["postgres", "redis", "minio", "keycloak", "litellm", "platform-api", "admin-web", "creator-web", "app-store-pwa", "caddy"];
const INIT_JOBS = ["litellm-db-init", "keycloak-db-init", "keycloak-bootstrap", "workspace-next-image"];

test("release stack carries no compose-only keys that swarm ignores", () => {
  for (const [name, svc] of Object.entries(release.services)) {
    for (const key of COMPOSE_ONLY_KEYS) {
      assert.ok(!(key in svc), `service ${name} still declares ${key}`);
    }
  }
});

test("every release service is pinned to the manager node", () => {
  for (const [name, svc] of Object.entries(release.services)) {
    const constraints = svc.deploy?.placement?.constraints ?? [];
    assert.ok(constraints.includes("node.role == manager"), `service ${name} missing manager placement`);
  }
});

test("init services are swarm replicated-jobs", () => {
  for (const name of INIT_JOBS) {
    assert.equal(release.services[name]?.deploy?.mode, "replicated-job", `${name} is not a replicated-job`);
  }
});

test("long-running services use deploy.restart_policy", () => {
  for (const name of LONG_RUNNING) {
    assert.ok(release.services[name]?.deploy?.restart_policy?.condition, `${name} missing restart_policy`);
  }
});

test("internal network is an attachable overlay", () => {
  assert.equal(release.networks["evcp-internal"].driver, "overlay");
  assert.equal(release.networks["evcp-internal"].attachable, true);
});

test("platform-api targets the swarm overlay network name and keeps the docker socket", () => {
  const env = release.services["platform-api"].environment;
  assert.equal(env.EVCP_WORKSPACE_NETWORK, "evcp_evcp-internal");
  assert.ok(release.services["platform-api"].volumes.some((v) => String(v).includes("/var/run/docker.sock")));
});

test("keycloak persists in postgres, sits behind a proxy, and has a db-init job", () => {
  const kc = release.services.keycloak;
  assert.equal(kc.environment.KC_DB, "postgres");
  assert.match(String(kc.environment.KC_DB_URL), /jdbc:postgresql:\/\/postgres:5432\/keycloak/);
  assert.match(kc.command.join ? kc.command.join(" ") : String(kc.command), /--proxy-headers=xforwarded/);
  assert.equal(release.services["keycloak-db-init"].deploy.mode, "replicated-job");
});

test("release declares the config/secret files instead of bind mounting them", () => {
  for (const cfg of ["litellm-config", "caddyfile-release", "keycloak-realm", "keycloak-bootstrap-script"]) {
    assert.ok(release.configs?.[cfg], `missing config ${cfg}`);
  }
});

test("openbao overlay is swarm-ready and wires VAULT_* + token secret into platform-api", () => {
  assert.ok(!("restart" in openbao.services.openbao), "openbao still has compose restart");
  assert.equal(openbao.services.openbao.deploy.placement.constraints[0], "node.role == manager");
  const env = openbao.services["platform-api"].environment;
  assert.equal(env.VAULT_ADDR, "http://openbao:8200");
  assert.equal(env.VAULT_KV_MOUNT, "platform");
  assert.equal(env.VAULT_TOKEN_FILE, "/run/secrets/evcp-openbao-token");
  assert.ok(openbao.secrets?.["evcp-openbao-token"], "openbao token secret not declared");
});
