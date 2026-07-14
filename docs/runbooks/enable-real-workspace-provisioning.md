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

## 3. Verify end-to-end (live)

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

## Rollback (disable real mode)

Set `EVCP_WORKSPACE_REAL_ADAPTERS: "0"` in `docker/docker-compose.yml` and recreate `platform-api`. The orchestrator falls back to the in-memory adapter path.

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

Verify the full vibe-coding flow (guarded live test, runs inside the recreated container):

```
docker exec -e EVCP_VIBE_LIVE=1 -e EVCP_WORKSPACE_REAL_ADAPTERS=1 -e EVCP_TEST_SEED=$RANDOM \
  evcp-platform-api sh -lc 'cd /workspace && node --import tsx --test tests/integration/vibe-coding-e2e-live.test.mjs'
# expect: a prompt produces a real file + git commit inside the project container
```

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
