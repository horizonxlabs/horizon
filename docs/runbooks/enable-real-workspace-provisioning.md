# Runbook: Enable Real Workspace Provisioning

Turns on real per-project provisioning — `provisionWorkspace` creates a real Postgres schema+role, a real MinIO bucket, and boots a real dev container (`evcp-ws-<slug>`) from the `evcp/workspace-next:1` image. Delivered by Plan 6.

## Prerequisites (already in place)

- Running compose stack: `evcp-postgres`, `evcp-redis`, `evcp-minio` (healthy).
- `docker/.env` provides `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EVCP_WORKSPACE_SECRET_KEY`.
- `docker/docker-compose.yml` `platform-api` service now sets `EVCP_WORKSPACE_REAL_ADAPTERS: "1"` plus `EVCP_PG_*` / `EVCP_S3_*` and mounts `/var/run/docker.sock`.

## 1. Build the workspace dev image

The image `evcp/workspace-next:1` must exist on the same Docker daemon `platform-api` talks to (the host daemon, via the mounted socket).

```bash
./docker/build-workspace-image.sh
docker images | grep workspace-next   # expect evcp/workspace-next   1
```

## 2. Recreate platform-api so it picks up the socket mount + real-adapter env

> The currently-running `evcp-platform-api` container predates the docker-socket mount and the new env, so it must be **recreated** (not just restarted). This briefly interrupts the API.

```bash
docker compose -f docker/docker-compose.yml up -d --force-recreate platform-api
```

Confirm real mode is active:

```bash
docker logs evcp-platform-api 2>&1 | grep "real-adapter mode"
# expect: [workspace] real-adapter mode: Docker=real, Postgres=real (postgres), MinIO=real (minio), LiteLLM=memory-stub ...
```

(LiteLLM stays a memory stub until Plan 7 starts the litellm service — provisioning is not blocked by it.)

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

## 4. Verify end-to-end (live)

Run the full-provision integration test inside the recreated container (it has the socket, env, and network):

```bash
docker exec -e EVCP_PROVISION_LIVE=1 -e EVCP_TEST_SEED=$RANDOM evcp-platform-api \
  sh -lc 'cd /workspace && node --import tsx --test tests/integration/provision-full-live.test.mjs'
# expect: a real schema + bucket + evcp-ws-<slug> container created, then cleaned up
```

Or exercise the real API path (member-gated — needs a valid session header):

```bash
curl -sS -X POST http://localhost:3100/projects/<projectId>/workspace/provision \
  -H "authorization: <valid session>" -H "content-type: application/json" \
  -d '{"projectId":"<projectId>","slug":"<slug>"}'
docker ps --format '{{.Names}}' | grep evcp-ws-<slug>          # container running
curl -sS -H "authorization: <valid session>" \
  http://localhost:3100/preview/<slug>/ -o /dev/null -w "%{http_code}\n"   # 200/3xx (502 = dev server still booting; retry)
```

## 5. Post-deploy smoke checks

Run the live provisioning check below, then use a disposable project in Creator to confirm the
full lifecycle:

1. Create the project and open Workspace; verify that provision completes and the preview serves.
2. Submit a small governed generation request; verify the generated file/diff and refreshed
   preview.
3. Publish the project and open the resulting application URL.
4. Delete the disposable project; verify its project workspace container, volume, schema, and
   bucket are removed, while any remaining warm-slot counts stay at the configured target.

If a claim falls back cold during the smoke, it is safe to continue; inspect the aggregate state
and audit queries above to distinguish temporary refill from a persistent preparation failure.

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
