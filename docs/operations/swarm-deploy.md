# Single-node Docker Swarm deploy (release stack)

The production release stack deploys to a **single-node Docker Swarm** via
`docker stack deploy` (not `docker compose up`). This runbook covers the manual
deploy; the automated release-triggered deploy is Part 2 (SSH-based).

## One-command bootstrap (recommended)

`scripts/install/bootstrap-swarm.sh` does the whole first-boot with **no secret
input**: it inits the swarm, auto-generates every secret as a Docker secret,
writes an IP-first (no domain/TLS) `stack.env`, deploys the stack, and
initializes + unseals OpenBao (minting the workload token). On a fresh VM:

```bash
cd /opt/evcp            # repo / release bundle checked out here
export EVCP_IMAGE_REPOSITORY=ghcr.io/your-org/evcp   # required
export EVCP_VERSION=vX.Y.Z                            # the release tag
export EVCP_GHCR_USER=... EVCP_GHCR_TOKEN=...         # optional, to pull private images
sudo -E sh scripts/install/bootstrap-swarm.sh
# → "EVCP is starting at http://<server-ip>:80" — open it to finish setup in the Admin Console
```

Preview what it would do without touching anything: append `--dry-run`.
Other subcommands: `... unseal` (re-unseal OpenBao after a reboot — see the note
at the bottom), `... update` (redeploy a new `EVCP_VERSION`, no secret regen).

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
