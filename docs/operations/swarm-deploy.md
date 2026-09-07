# Single-node Docker Swarm deploy (release stack)

The production release stack deploys to a **single-node Docker Swarm** via
`docker stack deploy` (not `docker compose up`). This runbook covers the manual
deploy; the automated release-triggered deploy is Part 2 (SSH-based).

## One-command install (recommended)

Clone the repo on a fresh VM and run one script — it inits the swarm, auto-generates
every secret as a Docker secret, writes an IP-first (no domain/TLS) `stack.env`,
deploys the stack, and initializes + unseals OpenBao (minting the workload token),
with **no secret input**:

```bash
git clone <repo> /opt/evcp && cd /opt/evcp
sudo ./install.sh
# prompts for: image repository (default ghcr.io/<org>), version (default latest tag),
# and — if the images are private — a GHCR login. Then: "EVCP is starting at
# http://<server-ip>:80" — open it to finish setup in the Admin Console.
```

`install.sh` is a thin front door over `scripts/install/bootstrap-swarm.sh`; it never
prompts for, prints, or stores a secret. Non-interactive (automation): supply the
inputs and pass `--yes`:

```bash
sudo EVCP_IMAGE_REPOSITORY=ghcr.io/your-org EVCP_VERSION=vX.Y.Z \
     EVCP_GHCR_USER=... EVCP_GHCR_TOKEN=... ./install.sh --yes
```

Preview without touching anything: `./install.sh --dry-run --yes`.

### Going live with a domain + TLS — from the Admin Console

The bootstrap brings the platform up IP-first (`http://<ip>`, no TLS). To move to a
real `https://<domain>`, in **Admin Console → Domain**: type the domain and click
**Go live**. platform-api then, via the Docker Engine API, switches Caddy's site to
the domain (Caddy requests a Let's Encrypt cert on 80/443), sets Keycloak's
`KC_HOSTNAME` and platform-api's public URLs to `https://<domain>`, reconciles the
Keycloak OIDC client redirect URIs, and rolls platform-api last. The domain is
persisted to `domain.env` on the host so it survives future `docker stack deploy` /
`install.sh update` (the bootstrap sources `domain.env` after `stack.env`).

**Precondition (the UI warns about it):** point `A`/`AAAA` DNS for `<domain>` **and**
`storage.<domain>` at this server, and make 80/443 reachable, _before_ clicking Go
live — otherwise Caddy's ACME challenge fails and the console keeps polling until DNS
is correct.

### Updating to a new version — from the Admin Console

Once a new release tag's images are in the registry, an admin can roll the whole
app tier from **Admin Console → System**: it shows the current version and each
app service's tag, takes a target tag, and updates the 5 `evcp-*` app services
(`platform-api`, `admin-web`, `creator-web`, `app-store-pwa`, `workspace-next`) to
that tag via the Docker Engine API — updating `platform-api` last (it restarts, and
the page polls through the restart until every service reports the new tag). DB
migrations run automatically as the new `platform-api` boots (`prisma migrate
deploy`). Infra services (postgres/keycloak/…) are pinned and left untouched.

The platform API service update atomically aligns its image, `EVCP_VERSION`, and
`EVCP_WORKSPACE_IMAGE` to the selected release. Changing only the API image is incomplete:
new warm allocations could otherwise run an older workspace image. The release Compose file
also derives the workspace image-cache job from that same version. Existing claimed runtimes
retain their allocations; reconciliation drains mismatched unclaimed slots and prepares replacements.

This is an **image-tag bump**. A release that changes the compose structure (new
services or env) still needs `./install.sh` / `bootstrap-swarm.sh update <version>`
re-run on the host after checking out the new tag.

### Advanced / reference — `bootstrap-swarm.sh` directly

`install.sh` just collects inputs and hands off. You can also run the bootstrap
script directly (this is what `install.sh` execs):

```bash
export EVCP_IMAGE_REPOSITORY=ghcr.io/your-org EVCP_VERSION=vX.Y.Z
sudo -E sh scripts/install/bootstrap-swarm.sh
```

Subcommands: `... unseal` (re-unseal OpenBao after a reboot — see the note at the
bottom), `... update <version>` (redeploy a new `EVCP_VERSION`, no secret regen).

**Save the recovery secrets.** On first run the script prints a one-time warning:
move the `evcp_openbao_unseal` and `evcp_openbao_root` Docker secrets to your
organization's secure store — they are the only way to unseal OpenBao or recover
root access.

The rest of this document is the equivalent manual flow and reference.

## Prerequisites (one-time, on the manager node / GCE VM)

- **Docker Engine ≥ 25.0** (required for `deploy.mode: replicated-job`).
- The node is a swarm manager:
  ```bash
  docker info --format '{{.Swarm.ControlAvailable}}'   # must print: true
  # if not a manager (or in a broken/orphaned swarm state):
  docker swarm leave --force 2>/dev/null || true
  docker swarm init
  ```
- A production **`.env`** on the manager (e.g. `/opt/evcp/.env`) with every
  required secret filled in (see `.env.example`; every `${VAR:?...}` in the
  stack files must be set). Notably: `POSTGRES_PASSWORD`, `MINIO_ROOT_*`,
  `LITELLM_MASTER_KEY`, `LITELLM_DATABASE_URL`, `EVCP_WORKSPACE_SECRET_KEY`,
  `EVCP_IMAGE_REPOSITORY`, `EVCP_VERSION`, `EVCP_S3_PUBLIC_URL`, `KEYCLOAK_*`,
  `EVCP_PUBLIC_API_URL`, and the `EVCP_*_WEB_URL` set.
- An **OpenBao token file** on the manager; export its path:
  ```bash
  export OPENBAO_TOKEN_FILE_HOST=/opt/evcp/openbao-token
  ```
- **GHCR login** so the node can pull the private app images:
  ```bash
  echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin
  ```
- The workspace image must be present locally for platform-api to spawn
  workspaces (the `workspace-next-image` job pulls it during deploy).

## Deploy

```bash
cd /opt/evcp   # or the repo/release-bundle root containing docker/
set -a; . ./.env; set +a
docker stack deploy \
  -c docker/docker-compose.release.yml \
  -c docker/docker-compose.openbao.yml \
  --with-registry-auth \
  evcp
```

`--with-registry-auth` forwards the GHCR credentials to the node so private
images pull. The stack name is `evcp`, which makes the overlay network
`evcp_evcp-internal` (matching `EVCP_WORKSPACE_NETWORK`, so platform-api-spawned
workspace containers attach to it).

## Verify convergence

```bash
docker stack services evcp   # every long-running service REPLICAS 1/1;
                             # the *-db-init / keycloak-bootstrap / workspace-next-image
                             # jobs show "1/1 completed"
docker service ps evcp_keycloak --no-trunc   # Running (a single early Failed/retry is
                                             # normal: no depends_on, so services retry
                                             # until their DB/deps converge)
```

## Verify hot workspace handoff

Inspect only these explicitly safe configuration values. Never use a broad
`EVCP_WORKSPACE_` filter: it would also expose `EVCP_WORKSPACE_SECRET_KEY`.
Do not print complete service/container environment objects, secret payloads, or credentials.

```bash
docker service inspect evcp_platform-api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
docker service inspect evcp_platform-api --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}' \
  | jq -r '.[] | select(test("^(EVCP_VERSION|EVCP_WORKSPACE_IMAGE|EVCP_WORKSPACE_NETWORK|EVCP_WORKSPACE_REAL_ADAPTERS|EVCP_WORKSPACE_WARM_POOL_SIZE|EVCP_WORKSPACE_CPU|EVCP_WORKSPACE_MEM_MB)="))'
docker service inspect evcp_workspace-next-image --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
docker ps --filter label=evcp.managed=true \
  --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}}'

# On the manager, identify only the running PostgreSQL task.
evcp_pg_container=$(docker ps --filter label=com.docker.swarm.service.name=evcp_postgres --format '{{.ID}}')
docker exec "$evcp_pg_container" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT state, count(*) FROM workspace_warm_slots GROUP BY state ORDER BY state;
   SELECT resource_key, container_id FROM workspace_warm_slots WHERE state = '\''ready'\'';
   SELECT project_id, resource_key, container_id, state FROM workspace_runtime_records;"'
```

Require three ready slots on the selected workspace image before creating a disposable project.
Record the ready container IDs, then inspect each exact container with this restricted format:

```bash
docker inspect <ready-container-id> \
  --format '{{.Id}} {{.Config.Image}} {{.State.Running}} {{.State.StartedAt}} {{.RestartCount}}'
```

Create the project in Creator and measure submit to authorized usable preview: it must be below
three seconds. Its workspace `resourceKey` locates `/preview/<resourceKey>/api/health` and its
container; the logical project ID controls membership authorization. Confirm the preview-session
response supplies that physical key and its secure cookie is scoped to the corresponding path.
The claimed container ID must appear in the pre-create ready snapshot, with unchanged start time
and restart count. No foreground container create/start/stop/remove is allowed. Refill may create
a different anonymous allocation asynchronously; repeat the SQL query until ready capacity is three.

Edit a file, run a workspace command, refresh preview, and stop/wake the disposable workspace.
Its container ID and physical key must stay the same until deletion. Delete the project and verify
its container, volume, schema/role, bucket/scoped identity, gateway key and durable credentials are
removed, while the pool remains at three. The isolated automated acceptance command and complete
cleanup criteria are in [the provisioning runbook](../runbooks/enable-real-workspace-provisioning.md#4-verify-end-to-end-live).
A skipped Docker test or a cold fallback is not evidence that hot handoff passed.

To roll back prewarming, persist `EVCP_WORKSPACE_WARM_POOL_SIZE=0` in the deployment's
configuration source (for bootstrap installs, `/opt/evcp/stack.env`, or the configured
`EVCP_STACK_ENV_DIR`), then redeploy through the
normal update procedure. For an immediate service update after persisting that value:

```bash
docker service update --env-add EVCP_WORKSPACE_WARM_POOL_SIZE=0 evcp_platform-api
```

New projects use cold provisioning after the API restart. Reconciliation safely drains unclaimed
allocations; live operation leases can delay draining until a later sweep. Claimed project runtimes
are preserved. Restore `3` in the same configuration source and service update to re-enable the pool,
then wait for three matching-image ready slots before repeating acceptance.

## Ordering model (no `depends_on` in swarm)

Swarm ignores `depends_on`. Startup ordering is **eventual**: the `*-db-init`
jobs wait for Postgres (`until pg_isready …`) then create the `litellm` and
`keycloak` databases idempotently; long-running services use
`restart_policy: condition: any`, so a service that starts before its database
exists exits and is rescheduled until it succeeds. This is expected — a single
early `Failed` in `docker service ps` before the DB is ready is normal.

## Config validation (CI / pre-deploy)

```bash
docker stack config \
  -c docker/docker-compose.release.yml \
  -c docker/docker-compose.openbao.yml >/dev/null
```

(No top-level `name:` is allowed — the stack name comes from the CLI arg.)

## Keycloak persistence — verified

Keycloak runs on **Postgres** (`KC_DB=postgres`, DB `keycloak` created by the
`keycloak-db-init` job), not the ephemeral H2 file DB. A single-node persistence
smoke confirmed this: a realm created in Keycloak survived
`docker stack rm` + redeploy (the named Postgres volume outlives `stack rm`).

Reproduce (minimal, public images only, isolated stack name, no host ports):

```bash
docker stack deploy -c <smoke.yml> evcp-smoke      # postgres + keycloak(KC_DB=postgres) + keycloak-db-init
# create a realm via kcadm inside the keycloak task:
docker exec <kc> /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password <pw>
docker exec <kc> /opt/keycloak/bin/kcadm.sh create realms -s realm=smoketest -s enabled=true
docker stack rm evcp-smoke                          # volume survives
docker stack deploy -c <smoke.yml> evcp-smoke       # redeploy against the same volume
docker exec <kc> /opt/keycloak/bin/kcadm.sh get realms/smoketest   # still present
docker stack rm evcp-smoke && docker volume rm evcp-smoke_smoke_pg  # teardown
```

## Teardown

```bash
docker stack rm evcp
# named volumes (postgres/minio/caddy/openbao data) survive stack rm by design;
# remove them explicitly only when you intend to destroy the data.
```
