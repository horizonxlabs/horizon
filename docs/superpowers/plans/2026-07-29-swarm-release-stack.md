# Swarm-ready Release Stack + Blocker Fixes — Implementation Plan (Part 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docker/docker-compose.release.yml` + `docker/docker-compose.openbao.yml` deploy to a single-node Docker Swarm via `docker stack deploy`, with Keycloak persisted in Postgres and OpenBao folded into the deploy.

**Architecture:** Rewrite both compose files to swarm semantics (`deploy:` blocks, `replicated-job` init, `configs`/`secrets`, attachable overlay, manager placement), fix the two production blockers (Keycloak→Postgres, OpenBao wiring), lock the shape with a contract test + `docker stack config`, and prove it on a real single-node swarm.

**Tech Stack:** Docker Swarm (Engine ≥ 25), Compose spec `deploy` keys, Keycloak 26 (`KC_DB=postgres`), OpenBao, Node built-in test runner via `node --import tsx --test`, `yaml` parser (already a dep, used by existing contract tests).

## Global Constraints

- Deploy target is a **single-node swarm**; stack name is **`evcp`**; overlay network resolves to **`evcp_evcp-internal`** and `EVCP_WORKSPACE_NETWORK` must equal that string.
- **Docker Engine ≥ 25.0** required (for `deploy.mode: replicated-job`).
- Production deploy command is exactly:
  `docker stack deploy -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml --with-registry-auth evcp`.
- No application code changes. `platform-api` receives env via swarm-interpolated `environment:` entries (never `env_file`). Its full env set is the reference block in Task 2, Step 3.
- Under `docker stack deploy`, these keys are ignored and MUST NOT appear in the final files: `container_name`, `restart:`, `env_file:`, `depends_on:`.
- Every service gets `deploy.placement.constraints: ["node.role == manager"]`.
- `VAULT_KV_MOUNT` is **`platform`** (matches `apps/platform-api/src/app-factory.ts:107` default and `docs/operations/ai-secret-store.md`). The dev compose's `secret` is a dev-only divergence — do not copy it.
- Files stay valid under `docker stack config`. The CI validation step in `.github/workflows/release.yml` moves from `docker compose config` to `docker stack config`.
- Branch: `codex/swarm-release-stack` (already created, holds the design spec commit).

---

### Task 1: Contract test asserting swarm-readiness (write it first, red)

**Files:**
- Create: `tests/integration/swarm-stack-contract.test.mjs`

**Interfaces:**
- Consumes: `docker/docker-compose.release.yml`, `docker/docker-compose.openbao.yml` (parsed via `yaml`).
- Produces: a test suite that fails now (files are compose-shaped) and passes after Tasks 2–3.

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run it, confirm red**

Run: `node --import tsx --test tests/integration/swarm-stack-contract.test.mjs`
Expected: FAIL — current files still have `container_name`/`restart`/`depends_on`, bridge network, no `deploy` blocks.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/integration/swarm-stack-contract.test.mjs
git commit -m "test: swarm-readiness contract for the release stack (red)"
```

---

### Task 2: Rewrite `docker-compose.release.yml` for swarm + Keycloak→Postgres

**Files:**
- Modify: `docker/docker-compose.release.yml` (full rewrite)
- Test: `tests/integration/swarm-stack-contract.test.mjs` (the release-side assertions go green)

**Interfaces:**
- Consumes: config files `docker/litellm-config.yaml`, `docker/Caddyfile.release`, `apps/platform-api/keycloak/evcp-realm.json`, `apps/platform-api/keycloak/bootstrap-clients.sh` (now referenced via top-level `configs:` with `file:`).
- Produces: a swarm stack file where the release-side contract assertions pass and `docker stack config` renders it.

- [ ] **Step 1: Rewrite the file** applying, for every service, this transform (example on `postgres`; repeat the `deploy` block for all):

```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-evcp}
      POSTGRES_USER: ${POSTGRES_USER:-evcp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    volumes:
      - evcp_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-evcp} -d ${POSTGRES_DB:-evcp}"]
      interval: 5s
      timeout: 5s
      retries: 20
    networks:
      - evcp-internal
    deploy:
      placement:
        constraints: ["node.role == manager"]
      restart_policy:
        condition: any
```

Apply across the file:
- Remove every `container_name:`, `restart:`, `env_file:`, `depends_on:`.
- Long-running services (`postgres`, `redis`, `minio`, `keycloak`, `litellm`, `platform-api`, `admin-web`, `creator-web`, `app-store-pwa`, `caddy`): add the `deploy` block above (`restart_policy.condition: any` + manager placement).
- Init jobs — `litellm-db-init`, `keycloak-bootstrap`, and new `keycloak-db-init`:
  ```yaml
    deploy:
      mode: replicated-job
      restart_policy:
        condition: on-failure
      placement:
        constraints: ["node.role == manager"]
  ```
  Give `litellm-db-init` and `keycloak-db-init` a wait-then-create command, e.g. `keycloak-db-init`:
  ```yaml
    command:
      - sh
      - -lc
      - 'until pg_isready -h postgres -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"; do sleep 2; done; psql -h postgres -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" -tc "SELECT 1 FROM pg_database WHERE datname = ''keycloak''" | grep -q 1 || psql -h postgres -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" -c ''CREATE DATABASE keycloak'''
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-evcp}
      POSTGRES_DB: ${POSTGRES_DB:-evcp}
      PGPASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}
  ```
  (mirror the existing `litellm-db-init` for the `litellm` DB, adding the `until pg_isready` wait since `depends_on` is gone).
- `workspace-next-image`:
  ```yaml
    image: ${EVCP_IMAGE_REPOSITORY:?EVCP_IMAGE_REPOSITORY required}/evcp-workspace-next:${EVCP_VERSION:?EVCP_VERSION required}
    command: ["true"]
    networks: [evcp-internal]
    deploy:
      mode: replicated-job
      restart_policy:
        condition: none
      placement:
        constraints: ["node.role == manager"]
  ```
- **Keycloak** (blocker fix):
  ```yaml
    command: start --import-realm --http-enabled=true --http-port=8080 --proxy-headers=xforwarded
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: ${KEYCLOAK_ADMIN:-admin}
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required}
      KC_HEALTH_ENABLED: "true"
      KC_HTTP_RELATIVE_PATH: /auth
      KC_HOSTNAME: ${KEYCLOAK_PUBLIC_URL:?KEYCLOAK_PUBLIC_URL required}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER:-evcp}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}
    configs:
      - source: keycloak-realm
        target: /opt/keycloak/data/import/evcp-realm.json
  ```
- **caddy**: keep `ports`, replace the `Caddyfile.release` bind mount with `configs: [{ source: caddyfile-release, target: /etc/caddy/Caddyfile }]`; keep `evcp_caddy_data`/`evcp_caddy_config` volumes; add the `deploy` block.
- Add top-level `configs:` (leave `platform-api` env to Task 2b below):
  ```yaml
  configs:
    litellm-config:
      file: ./litellm-config.yaml
    caddyfile-release:
      file: ./Caddyfile.release
    keycloak-realm:
      file: ../apps/platform-api/keycloak/evcp-realm.json
    keycloak-bootstrap-script:
      file: ../apps/platform-api/keycloak/bootstrap-clients.sh
  ```
  and point `litellm` (`/etc/litellm/litellm-config.yaml`) and `keycloak-bootstrap` (`/opt/keycloak/bootstrap/bootstrap-clients.sh`) at their configs instead of bind mounts.
- Network:
  ```yaml
  networks:
    evcp-internal:
      driver: overlay
      attachable: true
  ```

- [ ] **Step 2: `platform-api` env enumeration (drop `env_file`)** — set `environment:` to this exact reference set (the dev compose superset minus dev-only bits, plus Keycloak-DB is not needed here; VAULT_* comes from the OpenBao overlay in Task 3). Keep the `/var/run/docker.sock` volume and manager placement:

```yaml
    environment:
      EVCP_LITELLM_BASE_URL: http://litellm:4000
      EVCP_LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY:?LITELLM_MASTER_KEY required}
      EVCP_WORKSPACE_SECRET_KEY: ${EVCP_WORKSPACE_SECRET_KEY:?EVCP_WORKSPACE_SECRET_KEY required}
      EVCP_WORKSPACE_IMAGE: ${EVCP_IMAGE_REPOSITORY:?EVCP_IMAGE_REPOSITORY required}/evcp-workspace-next:${EVCP_VERSION:?EVCP_VERSION required}
      EVCP_TEMPLATE_DIR: /workspace/templates/nextjs-base
      EVCP_WORKSPACE_NETWORK: evcp_evcp-internal
      EVCP_WORKSPACE_REAL_ADAPTERS: "1"
      EVCP_PG_HOST: postgres
      EVCP_PG_PORT: "5432"
      POSTGRES_USER: ${POSTGRES_USER:-evcp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}
      POSTGRES_DB: ${POSTGRES_DB:-evcp}
      EVCP_S3_HOST: minio
      EVCP_S3_PORT: "9000"
      EVCP_S3_SSL: "false"
      EVCP_S3_PUBLIC_URL: ${EVCP_S3_PUBLIC_URL:?EVCP_S3_PUBLIC_URL required}
      EVCP_AI_JOB_ENCRYPTION_KEY: ${EVCP_AI_JOB_ENCRYPTION_KEY:-}
      EVCP_AI_COMPLETION_TIMEOUT_MS: ${EVCP_AI_COMPLETION_TIMEOUT_MS:-300000}
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:?MINIO_ROOT_USER required}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD required}
      EVCP_ALLOW_SIMULATE_LOGIN: "0"
      KEYCLOAK_ISSUER_URL: ${KEYCLOAK_ISSUER_URL:?KEYCLOAK_ISSUER_URL required}
      KEYCLOAK_INTERNAL_ISSUER_URL: ${KEYCLOAK_INTERNAL_ISSUER_URL:-http://keycloak:8080/auth/realms/${KEYCLOAK_REALM}}
      KEYCLOAK_REALM: ${KEYCLOAK_REALM:?KEYCLOAK_REALM required}
      KEYCLOAK_PLATFORM_CLIENT_ID: ${KEYCLOAK_PLATFORM_CLIENT_ID:?KEYCLOAK_PLATFORM_CLIENT_ID required}
      KEYCLOAK_PLATFORM_CLIENT_SECRET: ${KEYCLOAK_PLATFORM_CLIENT_SECRET:?KEYCLOAK_PLATFORM_CLIENT_SECRET required}
      KEYCLOAK_ADMIN_CLIENT_ID: ${KEYCLOAK_ADMIN_CLIENT_ID:?KEYCLOAK_ADMIN_CLIENT_ID required}
      KEYCLOAK_ADMIN_CLIENT_SECRET: ${KEYCLOAK_ADMIN_CLIENT_SECRET:?KEYCLOAK_ADMIN_CLIENT_SECRET required}
      EVCP_PUBLIC_API_URL: ${EVCP_PUBLIC_API_URL:?EVCP_PUBLIC_API_URL required}
```

- [ ] **Step 3: Validate config renders**

Run: `cd docker && docker compose --env-file ../.env.example -f docker-compose.release.yml config --quiet && echo OK`
Expected: `OK` (interpolates and parses).

- [ ] **Step 4: Run the contract test — release assertions green**

Run: `node --import tsx --test tests/integration/swarm-stack-contract.test.mjs`
Expected: all release-side tests PASS; the single openbao test still FAILS (fixed in Task 3).

- [ ] **Step 5: Commit**

```bash
git add docker/docker-compose.release.yml
git commit -m "feat(deploy): swarm-ready release stack + Keycloak on Postgres"
```

---

### Task 3: Swarm-ready `docker-compose.openbao.yml` + VAULT wiring

**Files:**
- Modify: `docker/docker-compose.openbao.yml`
- Test: `tests/integration/swarm-stack-contract.test.mjs` (openbao assertion goes green)

**Interfaces:**
- Consumes: `docker/openbao/config.hcl` (now a `config`), a manager-side OpenBao token file (a `secret`).
- Produces: an overlay that, combined with the release file, gives `platform-api` `VAULT_ADDR`/`VAULT_KV_MOUNT`/`VAULT_TOKEN_FILE` and a mounted token secret.

- [ ] **Step 1: Rewrite the overlay**

```yaml
services:
  openbao:
    image: openbao/openbao:2.3.1
    command: server -config=/openbao/config/config.hcl
    cap_add:
      - IPC_LOCK
    volumes:
      - openbao-data:/openbao/file
    configs:
      - source: openbao-config
        target: /openbao/config/config.hcl
    networks:
      - evcp-internal
    deploy:
      placement:
        constraints: ["node.role == manager"]
      restart_policy:
        condition: any

  platform-api:
    environment:
      VAULT_ADDR: ${VAULT_ADDR:-http://openbao:8200}
      VAULT_KV_MOUNT: ${VAULT_KV_MOUNT:-platform}
      VAULT_TOKEN_FILE: /run/secrets/evcp-openbao-token
    secrets:
      - evcp-openbao-token

configs:
  openbao-config:
    file: ./openbao/config.hcl

secrets:
  evcp-openbao-token:
    file: ${OPENBAO_TOKEN_FILE_HOST:?OPENBAO_TOKEN_FILE_HOST is required}

volumes:
  openbao-data:

networks:
  evcp-internal:
    external: true
    name: evcp_evcp-internal
```

(The overlay references the release stack's overlay by its stack-qualified name; `external: true` avoids redefining it.)

- [ ] **Step 2: Validate the combined stack config**

Run: `cd docker && OPENBAO_TOKEN_FILE_HOST=/tmp/tok docker compose --env-file ../.env.example -f docker-compose.release.yml -f docker-compose.openbao.yml config --quiet && echo OK`
Expected: `OK`.

- [ ] **Step 3: Run the contract test — all green**

Run: `node --import tsx --test tests/integration/swarm-stack-contract.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 4: Commit**

```bash
git add docker/docker-compose.openbao.yml
git commit -m "feat(deploy): swarm-ready OpenBao overlay with token secret"
```

---

### Task 4: Reconcile existing contract tests + move CI validation to `docker stack config`

**Files:**
- Modify: `.github/workflows/release.yml` (the "Validate release compose image coordinates" step)
- Modify (only if assertions broke): `tests/integration/release-workflow-contract.test.mjs`, `tests/integration/workspace-compose-contract.test.mjs`

**Interfaces:**
- Consumes: the rewritten release file.
- Produces: green existing contract tests and a CI step that validates the swarm stack.

- [ ] **Step 1: Run the existing contract tests against the rewritten files**

Run: `node --import tsx --test tests/integration/release-workflow-contract.test.mjs tests/integration/workspace-compose-contract.test.mjs`
Expected: identify any assertion that depended on a removed key (`container_name`, `restart`, `depends_on`) or the bridge network.

- [ ] **Step 2: Fix only the broken assertions** to match swarm shape (e.g., an assertion reading `service.restart` becomes `service.deploy.restart_policy.condition`; a `container_name` check is removed). Do not weaken image-coordinate or network-isolation assertions.

- [ ] **Step 3: Update the CI validation step** in `.github/workflows/release.yml` — change the step body from `docker compose -f docker/docker-compose.release.yml config` to:

```yaml
          docker stack config -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml >/dev/null
```
Keep the existing `grep` image-coordinate checks (run them against `docker stack config` output). Provide `OPENBAO_TOKEN_FILE_HOST` and required env in that step's `env:` (dummy values are fine for a config render).

- [ ] **Step 4: Run the full integration + unit gate**

Run: `node --import tsx --test tests/integration/swarm-stack-contract.test.mjs tests/integration/release-workflow-contract.test.mjs tests/integration/workspace-compose-contract.test.mjs && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml tests/integration/release-workflow-contract.test.mjs tests/integration/workspace-compose-contract.test.mjs
git commit -m "ci: validate release via docker stack config; reconcile contract tests"
```

---

### Task 5: Real single-node swarm smoke (this host has Docker 29 + swarm active)

**Files:**
- Create: `docs/operations/swarm-deploy.md` (the documented smoke + the canonical deploy command)

**Interfaces:**
- Consumes: both rewritten files.
- Produces: evidence that the stack converges and Keycloak state survives redeploy; a runbook.

- [ ] **Step 1: Prepare a throwaway env + token on this host**

```bash
cp .env.example /tmp/swarm.env
printf 'root-token' > /tmp/openbao-token
# set OPENBAO_TOKEN_FILE_HOST and any required non-placeholder secrets in /tmp/swarm.env
```

- [ ] **Step 2: Deploy the stack**

```bash
set -a; . /tmp/swarm.env; OPENBAO_TOKEN_FILE_HOST=/tmp/openbao-token; set +a
docker stack deploy -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml evcp
```
Expected: no error; `docker stack services evcp` lists all services.

- [ ] **Step 3: Wait for convergence**

Run: `docker stack services evcp` (repeat) — every long-running service `REPLICAS 1/1`; the four jobs show completion; no service stuck at `0/1`.

- [ ] **Step 4: Prove Keycloak persistence across redeploy**

Create a test user in Keycloak (admin console at `/auth` or `kcadm`), then:
```bash
docker stack rm evcp
# wait for teardown, then redeploy (Step 2 again)
```
Confirm the test user still exists after redeploy (Postgres-backed, not H2).

- [ ] **Step 5: Write the runbook** `docs/operations/swarm-deploy.md` capturing the deploy command, the convergence check, and the persistence result. Tear down: `docker stack rm evcp`.

- [ ] **Step 6: Commit**

```bash
git add docs/operations/swarm-deploy.md
git commit -m "docs: single-node swarm deploy runbook + persistence smoke"
```

---

## Self-review notes

- **Spec coverage:** swarm rewrite (T2), Keycloak→Postgres (T2), OpenBao fold-in (T3), attachable overlay + placement + replicated-jobs + configs/secrets (T1 asserts, T2/T3 implement), env enumeration (T2 S2), CI validation move (T4), contract test + swarm smoke (T1/T5). All spec sections mapped.
- **`replicated-job` availability:** this host is Docker 29 (verified) and the target VM is constrained to ≥25 — supported.
- **VAULT_KV_MOUNT:** `platform` everywhere (T3), matching the API default and `ai-secret-store.md`.
- **Ordering:** no `depends_on`; init jobs `until pg_isready` then create idempotently; long-running services `restart_policy: any` retry until dependencies converge.
