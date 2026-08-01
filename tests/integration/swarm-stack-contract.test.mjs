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
  assert.equal(env.VAULT_TOKEN_FILE, "/run/secrets/evcp_openbao_token");
  assert.ok(openbao.secrets?.["evcp_openbao_token"]?.external, "evcp_openbao_token external secret not declared");
  assert.ok(
    openbao.services["platform-api"].secrets?.includes("evcp_openbao_token"),
    "platform-api must mount the evcp_openbao_token secret"
  );
});

const RELEASE_SECRET_NAMES = [
  "evcp_postgres_password",
  "evcp_minio_root_user",
  "evcp_minio_root_password",
  "evcp_litellm_master_key",
  "evcp_litellm_database_url",
  "evcp_workspace_secret_key",
  "evcp_ai_job_encryption_key",
  "evcp_keycloak_admin_password",
  "evcp_keycloak_platform_client_secret",
  "evcp_keycloak_admin_client_secret",
  "evcp_session_secret"
];

test("release declares an external Docker secret for every sensitive value in the Global Constraints list", () => {
  for (const name of RELEASE_SECRET_NAMES) {
    assert.ok(release.secrets?.[name]?.external, `release secrets: block missing external ${name}`);
  }
});

// Every service in the release stack — including init jobs like keycloak-bootstrap — must
// deliver these sensitive values as *_FILE (Docker secrets), never as a plaintext env key.
const PLAINTEXT_SECRET_KEYS = [
  "POSTGRES_PASSWORD",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "LITELLM_MASTER_KEY",
  "EVCP_LITELLM_MASTER_KEY",
  "LITELLM_DATABASE_URL",
  "DATABASE_URL",
  "EVCP_WORKSPACE_SECRET_KEY",
  "EVCP_AI_JOB_ENCRYPTION_KEY",
  "KEYCLOAK_ADMIN_PASSWORD",
  "KC_BOOTSTRAP_ADMIN_PASSWORD",
  "KC_DB_PASSWORD",
  "KEYCLOAK_PLATFORM_CLIENT_SECRET",
  "KEYCLOAK_ADMIN_CLIENT_SECRET",
  "SESSION_SECRET"
];

test("no release service carries any sensitive value as a plaintext env key", () => {
  for (const [name, svc] of Object.entries(release.services)) {
    const env = svc.environment ?? {};
    for (const key of PLAINTEXT_SECRET_KEYS) {
      assert.ok(!(key in env), `service ${name} still carries plaintext secret ${key} (use ${key}_FILE)`);
    }
  }
});

test("postgres, minio, keycloak, and litellm consume their secrets via *_FILE, never plaintext", () => {
  const postgres = release.services.postgres.environment;
  assert.equal(postgres.POSTGRES_PASSWORD_FILE, "/run/secrets/evcp_postgres_password");
  assert.ok(!("POSTGRES_PASSWORD" in postgres), "postgres still carries a plaintext POSTGRES_PASSWORD");

  const minio = release.services.minio.environment;
  assert.equal(minio.MINIO_ROOT_USER_FILE, "/run/secrets/evcp_minio_root_user");
  assert.equal(minio.MINIO_ROOT_PASSWORD_FILE, "/run/secrets/evcp_minio_root_password");
  assert.ok(!("MINIO_ROOT_USER" in minio) && !("MINIO_ROOT_PASSWORD" in minio), "minio still carries plaintext root creds");

  const kc = release.services.keycloak.environment;
  assert.equal(kc.KC_DB_PASSWORD_FILE, "/run/secrets/evcp_postgres_password");
  assert.equal(kc.KC_BOOTSTRAP_ADMIN_PASSWORD_FILE, "/run/secrets/evcp_keycloak_admin_password");
  assert.ok(
    !("KC_DB_PASSWORD" in kc) && !("KC_BOOTSTRAP_ADMIN_PASSWORD" in kc),
    "keycloak still carries a plaintext password"
  );

  const litellm = release.services.litellm.environment;
  assert.equal(litellm.LITELLM_MASTER_KEY_FILE, "/run/secrets/evcp_litellm_master_key");
  assert.equal(litellm.DATABASE_URL_FILE, "/run/secrets/evcp_litellm_database_url");
  assert.equal(litellm.LITELLM_DATABASE_URL_FILE, "/run/secrets/evcp_litellm_database_url");
  assert.ok(
    !("LITELLM_MASTER_KEY" in litellm) && !("DATABASE_URL" in litellm) && !("LITELLM_DATABASE_URL" in litellm),
    "litellm still carries a plaintext secret"
  );
});

test("platform-api consumes every secret it needs via *_FILE, never plaintext", () => {
  const api = release.services["platform-api"].environment;
  const fileBacked = {
    POSTGRES_PASSWORD_FILE: "evcp_postgres_password",
    MINIO_ROOT_USER_FILE: "evcp_minio_root_user",
    MINIO_ROOT_PASSWORD_FILE: "evcp_minio_root_password",
    EVCP_LITELLM_MASTER_KEY_FILE: "evcp_litellm_master_key",
    EVCP_WORKSPACE_SECRET_KEY_FILE: "evcp_workspace_secret_key",
    EVCP_AI_JOB_ENCRYPTION_KEY_FILE: "evcp_ai_job_encryption_key",
    KEYCLOAK_PLATFORM_CLIENT_SECRET_FILE: "evcp_keycloak_platform_client_secret",
    KEYCLOAK_ADMIN_CLIENT_SECRET_FILE: "evcp_keycloak_admin_client_secret",
    SESSION_SECRET_FILE: "evcp_session_secret"
  };
  for (const [envVar, secretName] of Object.entries(fileBacked)) {
    assert.equal(api[envVar], `/run/secrets/${secretName}`, `platform-api.${envVar}`);
    assert.ok(release.services["platform-api"].secrets?.includes(secretName), `platform-api missing secret mount ${secretName}`);
  }
  for (const plaintext of [
    "POSTGRES_PASSWORD",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "EVCP_LITELLM_MASTER_KEY",
    "EVCP_WORKSPACE_SECRET_KEY",
    "EVCP_AI_JOB_ENCRYPTION_KEY",
    "KEYCLOAK_PLATFORM_CLIENT_SECRET",
    "KEYCLOAK_ADMIN_CLIENT_SECRET",
    "SESSION_SECRET"
  ]) {
    assert.ok(!(plaintext in api), `platform-api still carries plaintext ${plaintext}`);
  }
});

test("keycloak-db-init and litellm-db-init read PGPASSWORD from the mounted postgres secret, not plaintext env", () => {
  for (const name of ["keycloak-db-init", "litellm-db-init"]) {
    const svc = release.services[name];
    assert.ok(!("PGPASSWORD" in (svc.environment ?? {})), `${name} still carries a plaintext PGPASSWORD env var`);
    assert.ok(svc.secrets?.includes("evcp_postgres_password"), `${name} missing evcp_postgres_password secret mount`);
    const cmd = Array.isArray(svc.command) ? svc.command.join(" ") : String(svc.command);
    assert.match(
      cmd,
      /PGPASSWORD=.*\/run\/secrets\/evcp_postgres_password/,
      `${name} must export PGPASSWORD from the mounted secret file`
    );
  }
});

test("keycloak and litellm exec through the secrets-entrypoint shim so their *_FILE env reaches non-native config", () => {
  for (const name of ["keycloak", "litellm"]) {
    const svc = release.services[name];
    assert.deepEqual(svc.entrypoint, ["/bin/sh", "/etc/evcp/secrets-entrypoint.sh"], `${name} must exec via the shim`);
    assert.ok(
      svc.configs?.some((c) => c.source === "secrets-entrypoint" && c.target === "/etc/evcp/secrets-entrypoint.sh"),
      `${name} must mount the secrets-entrypoint config`
    );
  }
  assert.ok(release.configs?.["secrets-entrypoint"], "top-level secrets-entrypoint config not declared");
});

test("Caddyfile.release keeps its site address env-driven for the IP-first :80 default", () => {
  const caddyfile = readFileSync(new URL("../../docker/Caddyfile.release", import.meta.url), "utf8");
  assert.match(
    caddyfile,
    /\{\$EVCP_CADDY_ADDRESS:localhost\}/,
    "Caddy site address must stay {$EVCP_CADDY_ADDRESS:localhost} so bootstrap-swarm.sh can default EVCP_CADDY_ADDRESS to :80 (IP-first HTTP) via stack.env with no compose change"
  );
});
