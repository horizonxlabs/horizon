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

### Updating to a new version — from the Admin Console

Once a new release tag's images are in the registry, an admin can roll the whole
app tier from **Admin Console → System**: it shows the current version and each
app service's tag, takes a target tag, and updates the 5 `evcp-*` app services
(`platform-api`, `admin-web`, `creator-web`, `app-store-pwa`, `workspace-next`) to
that tag via the Docker Engine API — updating `platform-api` last (it restarts, and
the page polls through the restart until every service reports the new tag). DB
migrations run automatically as the new `platform-api` boots (`prisma migrate
deploy`). Infra services (postgres/keycloak/…) are pinned and left untouched.

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
