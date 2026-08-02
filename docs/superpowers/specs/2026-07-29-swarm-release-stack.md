# Swarm-ready Release Stack + Production Blocker Fixes — Design

**Status:** Draft for review.
**Date:** 2026-07-29
**Scope:** Part 1 of 2 (auto-deploy program). Part 2 (SSH-based auto-deploy pipeline) is a separate spec that depends on this one.

## Goal

Make the release stack deploy to a **single-node Docker Swarm** on the GCE VM via
`docker stack deploy`, and fix two production blockers found in the current
compose (Keycloak on ephemeral H2; OpenBao not composed into the release). After
this, `docker stack deploy -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml --with-registry-auth evcp`
brings up the whole platform on one swarm node with durable Keycloak state and a
working secret store.

Out of scope: the GitHub Actions deploy job, `deploy.sh`, SSH/secrets wiring,
and rollback — those are Part 2.

## Background — why the current file is not swarm-ready

`docker/docker-compose.release.yml` targets `docker compose up`. Under
`docker stack deploy`, these are **silently ignored or break**:

- `container_name`, `restart:`, `env_file:`, and every `depends_on` (including
  `condition: service_healthy` / `service_completed_successfully`) — ignored.
- One-shot init services (`litellm-db-init`, `keycloak-bootstrap`,
  `workspace-next-image`) — swarm restarts them forever.
- Bind mounts with relative paths (`./litellm-config.yaml`, `../.env`,
  `../apps/platform-api/keycloak/*`) — don't resolve on the manager.
- The `evcp-internal` bridge network — under swarm it must be an `overlay`, and
  must be `attachable` so the workspace containers that `platform-api` spawns via
  `/var/run/docker.sock` (plain `docker run`, not swarm tasks) can join it.
- Private GHCR images require `--with-registry-auth` at deploy.

The OpenBao overlay (`docker/docker-compose.openbao.yml`) is likewise compose-shaped
and, in release-only, `platform-api` gets no `VAULT_*`, so credential resolution
(which `litellm-config.yaml` and the governed executor rely on) is missing.

## Global constraints

- **Docker Engine ≥ 25.0** on the swarm node (required for `deploy.mode: replicated-job`).
- **Single-node swarm:** the node is both manager and worker; all stateful data
  and the docker socket live on it. Every service is pinned with
  `deploy.placement.constraints: ["node.role == manager"]`.
- Stack name is **`evcp`**, so the overlay network is `evcp_evcp-internal` and
  `EVCP_WORKSPACE_NETWORK` must be set to that value.
- Both stack files stay valid under `docker compose config` / `docker stack config`
  (the CI `release.yml` validation step is updated to `docker stack config`).
- No application code changes: `platform-api` keeps reading plain env vars; we
  supply them via swarm-interpolated `environment:` entries, not `env_file`.

## Components

### 1. `docker/docker-compose.release.yml` — swarm rewrite

For **every** service:
- Remove `container_name` and `restart:`; add a `deploy:` block with
  `restart_policy: { condition: any }` (long-running) and
  `placement: { constraints: ["node.role == manager"] }`.
- Remove all `depends_on`. Ordering becomes eventual: init jobs create databases;
  long-running services that need them use `restart_policy: any` and simply retry
  until their dependency converges (the swarm-native pattern).

Service-specific:
- **postgres / redis / minio / litellm / keycloak**: keep images, healthchecks,
  volumes, env; add the `deploy:` block above.
- **litellm-db-init** and **keycloak-bootstrap** and a new **keycloak-db-init**:
  convert to `deploy: { mode: replicated-job, restart_policy: { condition: on-failure }, placement: {...} }`.
  Their commands wait for postgres (`until pg_isready … ; do sleep 2; done`) then
  run the idempotent create/bootstrap. `keycloak-db-init` creates the `keycloak`
  database exactly like `litellm-db-init` creates `litellm`.
- **workspace-next-image**: keep as the image-priming trick, but as
  `deploy: { mode: replicated-job, restart_policy: { condition: none } }` with
  `command: ["true"]` — declaring a job on `${EVCP_WORKSPACE_IMAGE}` makes swarm
  pull that image onto the node so `platform-api` can `docker run` it.
- **platform-api**: drop `env_file: ../.env`; enumerate **every** required env var
  as an explicit `environment:` entry interpolated from the manager's `.env`
  (audit the full set against `.env.example` and the API's config loader so
  nothing that `env_file` used to provide is lost). Keep the
  `/var/run/docker.sock` bind mount and the manager placement constraint. Set
  `EVCP_WORKSPACE_NETWORK: evcp_evcp-internal`. Add the Keycloak-DB and `VAULT_*`
  env (see blocker fixes).
- **admin-web / creator-web / app-store-pwa**: `deploy:` block only (no other change).
- **caddy**: keep `ports: ["${EVCP_HTTP_PORT:-8080}:80", "${EVCP_HTTPS_PORT:-8443}:443"]`
  (swarm ingress mesh), move the `Caddyfile.release` bind mount to a `config`.

Config/secret conversion (top-level `configs:` / `secrets:`, `file:`-sourced from
the repo bundle on the manager):
- `configs`: `litellm-config.yaml`, `Caddyfile.release`, `evcp-realm.json`,
  `bootstrap-clients.sh` (mounted read-only at their existing target paths).
- `secrets`: the OpenBao token (see below). Other sensitive values
  (`POSTGRES_PASSWORD`, `LITELLM_MASTER_KEY`, `EVCP_WORKSPACE_SECRET_KEY`,
  Keycloak client secrets, MinIO root creds) stay interpolated from the manager
  `.env` — acceptable for a single-tenant private server; documented as such.

Network:
```yaml
networks:
  evcp-internal:
    driver: overlay
    attachable: true
```

### 2. Blocker fix — Keycloak on Postgres (durable)

On the `keycloak` service add:
- `KC_DB: postgres`
- `KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak`
- `KC_DB_USERNAME: ${POSTGRES_USER:-evcp}` / `KC_DB_PASSWORD: ${POSTGRES_PASSWORD}`
- `command: start --import-realm --http-enabled=true --http-port=8080 --proxy-headers=xforwarded`
  (proxy-headers because Keycloak sits behind Caddy which terminates TLS).

The new `keycloak-db-init` job creates the `keycloak` database. Keycloak now
persists realms, users, sessions, and client config in Postgres (already on a
durable volume), so nothing is lost on container recreate or image update. The H2
file DB and the reliance on `--import-realm` for anything beyond first-run seeding
are gone.

### 3. Blocker fix — OpenBao folded into the deploy

Rewrite `docker/docker-compose.openbao.yml` swarm-ready:
- `openbao` service: `deploy:` block (manager placement, `restart_policy: any`),
  keep `cap_add: [IPC_LOCK]` and the `openbao-data` volume; move `config.hcl` from a
  bind mount to a `config`.
- Provide the OpenBao token to `platform-api` as a `docker secret`
  (`evcp-openbao-token`, `file:`-sourced on the manager) mounted at
  `/run/secrets/evcp-openbao-token`; set `VAULT_ADDR`, `VAULT_KV_MOUNT`,
  `VAULT_TOKEN_FILE` on `platform-api`.

Production deploy always applies both files:
`docker stack deploy -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml --with-registry-auth evcp`.

## Data flow (unchanged at runtime)

Caddy (ingress mesh 80/443) → admin/creator/store web + platform-api + Keycloak on
the overlay. platform-api spawns per-project workspace containers via the docker
socket onto `evcp_evcp-internal` (now attachable overlay). Provider credentials
resolve from OpenBao; Keycloak state persists in Postgres.

## Error handling / ordering

Swarm gives no `depends_on` ordering; convergence is eventual. Init jobs
(`*-db-init`, `keycloak-bootstrap`) retry-until-ready then run idempotently.
Long-running services use `restart_policy: condition: any`, so a service that
starts before its database exists exits and is rescheduled until the database is
ready. Healthchecks stay as the readiness signal.

## Testing

- **`docker stack config`** on both files together resolves with no errors and no
  compose-only keys remaining (no `container_name`/`restart`/`env_file`/`depends_on`).
- A repo **unit/contract test** (extend the existing release-compose contract test)
  asserts: overlay network `attachable: true`; every service has a manager
  placement constraint; the three init services are `mode: replicated-job`;
  Keycloak has `KC_DB: postgres` + a `keycloak-db-init`; no `container_name` /
  `env_file` / `depends_on` anywhere; `EVCP_WORKSPACE_NETWORK == evcp_evcp-internal`;
  the five config/secret files are declared.
- **Swarm smoke (manual, documented):** on a throwaway single-node swarm,
  `docker stack deploy` both files, wait for every service to converge
  (`docker stack services evcp` all `1/1`, jobs completed), hit Caddy, then
  `docker stack rm` + redeploy and confirm a Keycloak user created before the
  restart still exists (proves Postgres persistence).
- Update the CI `release.yml` validation step from `docker compose config` to
  `docker stack config`.

## Acceptance criteria

- Both files deploy cleanly via `docker stack deploy` on a single-node swarm
  (Docker ≥25); all services converge; init jobs complete once.
- Keycloak state survives `docker stack rm` + redeploy.
- OpenBao is up and `platform-api` has working `VAULT_*` + token secret.
- Workspace containers spawned by platform-api join `evcp_evcp-internal`.
- The contract test and `docker stack config` pass; CI validation updated.

## Out of scope (YAGNI / Part 2)

- The GitHub Actions `deploy` job, `deploy.sh`, SSH secrets, image pull on the
  node, post-deploy verify, and rollback.
- Multi-node swarm, promoting all env to `docker secret`, zero-downtime rolling
  strategy tuning, resource limits (can be a later hardening pass).
