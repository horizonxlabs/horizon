# Runbook: Enable Real Workspace Provisioning

Turns on real workspace provisioning. A cold allocation creates a Postgres schema and role,
MinIO bucket and scoped identity, LiteLLM key, and workspace container. A warm allocation reuses
prepared physical resources, including the same running container. Its container and preview URL
use the runtime's physical `resourceKey`; authorization always checks the owning logical project ID.

## Prerequisites

- Running compose stack: healthy PostgreSQL, Redis, MinIO, and LiteLLM services.
- The deployment environment provides `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EVCP_WORKSPACE_SECRET_KEY`, `EVCP_LITELLM_BASE_URL`, and `EVCP_LITELLM_MASTER_KEY`.
- `docker/docker-compose.yml` `platform-api` service now sets `EVCP_WORKSPACE_REAL_ADAPTERS: "1"` plus `EVCP_PG_*` / `EVCP_S3_*` and mounts `/var/run/docker.sock`.
- Apply all checked-in Prisma migrations through the deployment pipeline before starting the
  updated API, including `20260905050000_workspace_warm_preparation_intents`.

## 1. Build the workspace dev image

The image `evcp/workspace-next:1` must exist on the same Docker daemon `platform-api` talks to (the host daemon, via the mounted socket).

```bash
./docker/build-workspace-image.sh
docker images | grep workspace-next   # expect evcp/workspace-next   1
```

## 2. Recreate platform-api so it picks up the socket mount + real-adapter env

Recreate `platform-api` after changing its adapter configuration or Docker socket mount so those
settings take effect. This briefly interrupts the API.

```bash
docker compose -f docker/docker-compose.yml up -d --force-recreate platform-api
```

Confirm real mode is active:

```bash
docker logs evcp-platform-api 2>&1 | grep "real-adapter mode"
# expect: [workspace] real-adapter mode: Docker=real, Postgres=real (postgres), MinIO=real (minio), LiteLLM=real.
```

Real mode requires `EVCP_LITELLM_BASE_URL` and `EVCP_LITELLM_MASTER_KEY`, alongside the
PostgreSQL, MinIO, and workspace encryption configuration. It does not substitute a gateway stub.

## 3. Configure and observe the workspace warm pool

Real-adapter deployments keep `EVCP_WORKSPACE_WARM_POOL_SIZE=3` prepared slots by default. A
slot includes its own schema, bucket, gateway key, initialized volume, and running workspace
process, so project creation can claim it without waiting for those resources to be created.

- Set a whole number from `0` through `20`. `3` is the default and `20` is the hard safety limit.
- Set `EVCP_WORKSPACE_WARM_POOL_SIZE=0` to disable warm claims on the next API start; every new
  project then uses the existing cold-provisioning path. Startup reconciliation drains unclaimed
  ready and recoverable slots through the normal cleanup fences, releasing their warm resources.
  A slot with live preparation/cleanup ownership waits for its lease to expire before a safe drain
  retry on the periodic warm-pool sweep. Assigned project runtimes are never deleted. This is the
  operational rollback switch for the pool.
- Budget for every configured warm process in addition to active project workspaces. With the
  example `EVCP_WORKSPACE_CPU=2` and `EVCP_WORKSPACE_MEM_MB=2048`, the default pool reserves up
  to 6 CPU cores and 6144 MiB while all three slots are running. Size the host and Docker limits
  accordingly before increasing the value.

Change the value in the deployment environment (or `.env` for local Compose), then recreate the
API so startup reads it:

```bash
docker compose -f docker/docker-compose.yml up -d --force-recreate platform-api
```

Observe durable slot state without reading encrypted credential payloads:

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT state, count(*) FROM workspace_warm_slots GROUP BY state ORDER BY state;"'

docker ps -a --filter 'label=evcp.kind=workspace-warm' \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Label "evcp.warm-slot-id"}}'
docker volume ls --filter 'label=evcp.kind=workspace-warm'
```

For a successful warm claim, audit storage records `workspace.pool_claimed`; when no ready slot is
available, it records `workspace.pool_cold_fallback` and provision continues immediately on the
cold path. Confirm that behavior with aggregate audit data only:

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT action, count(*) FROM audit_logs WHERE action IN (\$warm\$workspace.pool_claimed\$warm\$, \$warm\$workspace.pool_cold_fallback\$warm\$) GROUP BY action ORDER BY action;"'
```

Neither command should query or print `secret_payload`; credentials remain encrypted at rest and
must not be copied into Docker labels, logs, or audit metadata.

Startup and periodic reconciliation decide recovery or cleanup while holding the same project
provisioning lease. A healthy final container whose credentials match its claiming slot is recovered
and persisted before the claim is retired. Existing durable runtimes retain their Docker-hydrated
state; redundant claims never turn a stopped workspace back into a cached running workspace.
Recovery publishes only if the project's local runtime cache has not changed since recovery began,
so a delayed successful database response cannot overwrite a later reattach, stop, or deletion.
Deletion invalidates pending cache publications even when no runtime is cached, and loads any
durable runtime to remove its physical resources and gateway key before the project metadata cascade.
A contended project remains protected for a later sweep. Missing, unhealthy, or mismatched handoffs
are cleaned only after their abandoned final container is removed, so it cannot pin the warm volume.
Failed cleanup retries also acquire the project lease. Generic orphan deletion acquires that lease
and refreshes runtime/claim ownership immediately before deleting a project container or volume.
Secret/runtime persistence failures stop startup before cleanup; restore the dependency and retry,
without deleting the claiming row. Recovery also runs with a zero target to preserve completed handoffs.

Preparation records its physical key and slot operation token in `workspace_warm_preparations`
before dispatching external creates. Late responses are compensated using their original resource
identifiers; retry generations use fresh keys. Retirement sweeps use the exact container/volume,
schema, bucket, and gateway alias, and never clean a current slot or assigned runtime this way.
The gateway must support `/key/delete` with `key_aliases` (the same `proj-<resourceKey>` alias sent
when creating the key). Verify that capability against the deployed LiteLLM version during the
live smoke; the local adapter contract alone is not evidence of live gateway compatibility.
Alias cleanup accepts only LiteLLM's exact confirmed `No keys found` 404 envelope as successful
absence; authentication, malformed responses, transport errors, and unrelated 404s remain failures.

A crash or lost create response leaves `settled=false`. These non-secret intents are deliberately
retained and retried, even after a successful cleanup, because a remote operation could commit
later. Inspect aggregate counts with `SELECT settled, count(*) FROM workspace_warm_preparations
GROUP BY settled;`. Persistent growth requires investigating failed adapters; do not bulk-delete
these rows, which would discard cleanup ownership. Automatic garbage collection of ambiguous
intents requires a provider-confirmed completion boundary and is not implemented.

## 4. Verify end-to-end (live)

The real Docker cold and warm smoke tests are opt-in. Without opt-in each real case reports one
skip and performs no external provisioning or database connections. The warm file also executes
a local contract case against the real orchestrator, pool, and authorization resolver with memory adapters:

```bash
node --import tsx --test tests/integration/provision-full-live.test.mjs
node --import tsx --test tests/integration/workspace-warm-pool-live.test.mjs
```

For an actual run, use a checkout with dependencies installed, the Docker socket mounted at
`/var/run/docker.sock`, and access to PostgreSQL, MinIO, and LiteLLM. The configured workspace
image must exist on that daemon, and the workspace network must reach the service hostnames.

Export a dedicated live-test environment before running the commands below:

- `EVCP_WORKSPACE_LIVE_DATABASE_URL`: admin connection URL for a disposable database, separate
  from the running platform. Use its `public` schema; no API or other live test may use this
  database during the test. The fixture refuses pre-existing warm slots, workspace runtimes, or
  preparation intents from an earlier run.
- `POSTGRES_DB`: that same disposable database name. `EVCP_PG_HOST` and `EVCP_PG_PORT` must
  identify this PostgreSQL service from inside workspace containers.
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EVCP_S3_HOST`, `EVCP_S3_PORT`, optional
  `EVCP_S3_ADMIN_HOST`/`EVCP_S3_SSL`, and `EVCP_MINIO_CONTAINER_NAME` configure real scoped
  bucket provisioning. The MinIO container needs `mc` for identity administration.
- `EVCP_LITELLM_BASE_URL`, `EVCP_LITELLM_MASTER_KEY`, and the 64-hex-character
  `EVCP_WORKSPACE_SECRET_KEY` are required. Load credentials from the deployment's secret
  handling mechanism; never include their values in test reports.
- `EVCP_WORKSPACE_IMAGE` and `EVCP_WORKSPACE_NETWORK` select the existing image/network
  (defaults: `evcp/workspace-next:1` and `evcp-internal`).

Apply the checked-in migrations only to that disposable database, then run the two tests
separately. The cold smoke explicitly uses target zero; the warm smoke uses target three regardless
of the deployment's configured pool size.

```bash
DATABASE_URL="$EVCP_WORKSPACE_LIVE_DATABASE_URL" \
  pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma

EVCP_PROVISION_LIVE=1 EVCP_WORKSPACE_REAL_ADAPTERS=1 \
  node --import tsx --test tests/integration/provision-full-live.test.mjs

EVCP_WARM_POOL_LIVE=1 EVCP_WORKSPACE_REAL_ADAPTERS=1 \
  node --import tsx --test tests/integration/workspace-warm-pool-live.test.mjs
```

The warm smoke requires three ready containers using `EVCP_WORKSPACE_IMAGE`. It measures from
the provision call through project-membership authorization and a successful `/api/health`
request at `/preview/<runtime.resourceKey>`, with a strict elapsed budget below 3000 ms. Docker
adapter create/start/stop/remove deltas must all be zero, as must schema/bucket/key creation.
The container ID must already belong to a ready slot. It holds asynchronous refill at the fixture
boundary until those assertions finish, then releases and awaits the orchestrator's scheduled
refill back to three matching-image slots. A claimed allocation is never recycled into the pool.

The case passes the logical project ID and a Creator actor to the production generation service.
A deterministic model-round fixture requests the real `write_workspace_file`, `edit_workspace_file`,
and allowlisted `run_workspace_command` (`npm run build`) tools. Production container resolution,
path/command policies, action runner, snapshot/validation/commit lifecycle, and Docker execution
remain active. The build uses the production disposable validation tree. Observed Docker targets
must all equal the claimed physical container ID. The production file browser reads the marker
using the logical project ID before and after stop/wake, and preview must remain healthy.
After deletion it verifies container, volume, schema, database role, bucket, successful scoped
MinIO user/policy removal and LiteLLM key revocation, and cleared runtime/secret persistence before
fixture teardown. The live route resolver receives a test authenticated membership context; this
does not measure a browser session, public ingress, OIDC, or an upstream model provider. Verify those separately in Creator below.
It uses real Prisma repositories and encrypted PostgreSQL secret persistence.

An `after()` hook is registered before fixture setup. It joins provisioning and waits for the
pool's idle boundary, including refills scheduled internally after claim failure, before deleting
the project workspace and every remaining anonymous resource created by this run. It verifies schema/bucket/
container/volume absence and successful key revocation, retires the fixture rows, and disconnects
Prisma. Cleanup failures fail the test. The disposable database itself is retained. Record the
actual pass/failure output and cleanup diagnostic; a skipped test is not live deployment evidence.
Cleanup also exercises exact-alias gateway revocation. Ambiguous preparation intents fail cleanup
verification and remain in the disposable database for subsequent operator-controlled sweeps.
Container-absence failures report only the container name and a boolean; Docker environment
objects must never be included in assertion output.

To exercise deployed ingress and session cookies, create a disposable project in Creator and open
Workspace. Read its `resourceKey` from the workspace response (or the explicit runtime query
below); do not derive it from the project ID. Use Creator's authenticated preview-session request
and confirm the response's `previewKey` agrees. The cookie must be HttpOnly, SameSite=Strict,
Secure on HTTPS, and scoped to `/preview/<resourceKey>`.

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT project_id, resource_key, container_id, state FROM workspace_runtime_records;"'
docker ps --filter label=evcp.managed=true \
  --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}}'
```

## 5. Post-deploy smoke checks

Run the live provisioning checks above, then use a disposable project in Creator to confirm the
full lifecycle:

1. Confirm three ready matching-image slots. Record their container IDs and start times before
   creating the project. Create it and open Workspace; the authorized preview must be usable in
   less than three seconds. The claimed container ID and start time must match the prior snapshot;
   no create/start/stop/remove may occur for that allocation during claim. Background refill may
   create a different anonymous container. Confirm the pool returns to three ready slots.
2. Submit a small governed generation request; verify the generated file/diff and refreshed
   preview.
3. Publish the project and open the resulting application URL.
4. Delete the disposable project; verify its project workspace container, volume, schema, and
   bucket are removed, while any remaining warm-slot counts stay at the configured target.

A cold fallback remains supported, but it does not pass hot-handoff acceptance. Inspect the
aggregate state and audit queries above, restore three healthy matching-image slots, and repeat.
For Swarm release alignment, safe configuration inspection, and rollback commands, see
[Swarm deployment](../operations/swarm-deploy.md#verify-hot-workspace-handoff).

## Rollback (disable real mode or the warm pool)

Set `EVCP_WORKSPACE_REAL_ADAPTERS: "0"` in `docker/docker-compose.yml` and recreate `platform-api`. The orchestrator falls back to the in-memory adapter path.

To retain real workspaces but stop prewarming, instead set
`EVCP_WORKSPACE_WARM_POOL_SIZE=0` in the deployment environment and recreate `platform-api`.
New projects take the cold path immediately after that startup. During its startup reconciliation,
the API drains unclaimed ready or recoverable warm slots; slots protected by an active operation
lease are drained only after that lease safely expires and a later periodic sweep can take cleanup
ownership. Existing project workspaces continue to run and are not part of the drain until the
value is raised again.

## Notes

- Secrets (DB/S3 creds) are stored only in the encrypted `ProjectSecretStore` and never surfaced to the Creator — only env var NAMES appear in the UI.
- Workspace containers run non-root, on the internal network, and never publish host ports.
- LiteLLM keys are provisioned per workspace and their credentials are stored only through the encrypted project secret store.

## Enable governed AI generation

LiteLLM remains the internal workspace gateway and needs only its own master key. Upstream
provider credentials must be entered in Admin and stored in OpenBao; never add Anthropic or
OpenAI keys to `.env` or the LiteLLM container.

```
LITELLM_MASTER_KEY=sk-<choose-a-strong-random-master-key>
LITELLM_DATABASE_URL=postgresql://evcp:<POSTGRES_PASSWORD>@postgres:5432/evcp
VAULT_ADDR=http://openbao:8200
VAULT_TOKEN_FILE=/run/secrets/evcp-vault-token
```

Start LiteLLM/OpenBao, recreate Platform API, then register provider, key and scenario routes from
Admin before testing Creator:

```
docker compose -f docker/docker-compose.yml up -d litellm
docker compose -f docker/docker-compose.yml up -d --force-recreate platform-api
docker logs evcp-litellm 2>&1 | tail -20      # expect it to bind and load coding-default
```

Verify the Pi-only Creator flow from the repository checkout with an authenticated Creator token:

```
EVCP_PI_LIVE_TEST=1 \
EVCP_PI_BASE_URL=http://localhost:9801 \
EVCP_PI_CREATOR_TOKEN='<creator bearer token>' \
  node --import tsx --test tests/live/pi-agent-e2e.test.mjs
# expect: Todo create/update and Sales Pipeline + migration commit, then preview-ready
```

See [Pi agent verification](./pi-agent-verification.md) for evidence queries, timeout controls, and cleanup.

**MVP note:** chat authenticates server-side and never exposes a LiteLLM credential to Creator.
Chat messages, durable governed jobs, applied migrations, runtime records, and immutable Git code
checkpoints are persisted in PostgreSQL. The active SSE connection itself is transient and clients
must reconnect/reload state after a Platform API restart.

## Recover a workspace preview with corrupted Next.js artifacts

If a workspace preview returns a Next.js module/manifest error after an older deploy flow (for
example `Cannot find module './873.js'`), clear only the generated `.next` directory and restart
that workspace container. This preserves project source, `node_modules`, volumes, database data,
and its healthy staging/production deployment.

For the currently affected project `prj_8be8ec6b27724896b749e10541fd6e63`:

```bash
docker exec evcp-ws-prj-8be8ec6b27724896b749e10541fd6e63 \
  sh -lc 'rm -rf /workspace/.next'
docker restart evcp-ws-prj-8be8ec6b27724896b749e10541fd6e63
```

Wait for `next dev` to start, then refresh the Creator workspace preview. Do not run `npm run
build` inside a live workspace; deploy builds now run from the isolated publish build context.
