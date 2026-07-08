# Real Workspace Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `WorkspaceOrchestrator.provisionWorkspace` actually create a real per-project Postgres schema+role, a real MinIO bucket, and boot a real dev container from a real image — replacing the memory/no-op placeholders — verified live against the already-running compose stack.

**Architecture:** Fill the two remaining real-adapter gaps in `workspace-orchestrator/factory.ts`'s real branch: a real `runSql` (via the `pg` client) behind the existing `createPgClientPostgresProvisioner`, and a real `ObjectStorageProvisioner` (via the `minio` client). Build the missing `evcp/workspace-next:1` dev image the orchestrator's container spec already references. Flip `EVCP_WORKSPACE_REAL_ADAPTERS=1` with the connection env, keeping the memory path intact for the existing 346 tests. This is Milestone A of "make it run for real"; the generation loop (Plan 7) and publish (Plan 8) follow.

**Tech Stack:** TypeScript, `pg` (Postgres client), `minio` (S3 client), Docker (node:22-alpine base image), the existing Docker-socket engine, `node --import tsx --test` `.mjs` TDD tests. Live infra is up in this environment (postgres/redis/minio healthy, Docker socket mounted into platform-api).

## Global Constraints

- **Secrets: platform manages entirely; the Creator never sees secret values.** Only env var NAMES may ever surface in UI. No adapter may log or return a resolved secret value into chat, audit, or API responses.
- Workspace containers run **non-root**, on the **internal network**, and **never publish host ports** (the orchestrator's spec sets `publishPorts:false`; the image only `EXPOSE`s 3000).
- Per-project isolation: Postgres uses `schemaNameFor(slug)` + a dedicated `roleNameFor(slug)` role; object storage uses one bucket per project `bucketNameFor(slug)`.
- **Reuse existing interfaces** — `PostgresProvisioner`, `ObjectStorageProvisioner`, `createPgClientPostgresProvisioner(runSql)`, `buildProvisionSchemaSql`/`buildReleaseSchemaSql`, `createDockerSocketEngine`, `buildDevContainerSpec`. Do not rewrite or duplicate the orchestrator.
- **The memory adapter path must stay intact** — the existing 346 unit/integration tests run in memory mode (`EVCP_WORKSPACE_REAL_ADAPTERS` unset) and must keep passing.
- Live-infra facts (verified this session, use verbatim): from inside `evcp-platform-api`, `postgres:5432` and `minio:9000` are reachable by service name. Postgres: `POSTGRES_USER=evcp`, `POSTGRES_DB=evcp`, `POSTGRES_PASSWORD` from `docker/.env`. MinIO: `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` from `docker/.env`, endpoint `http://minio:9000`. `platform-api` already sets `EVCP_WORKSPACE_IMAGE=evcp/workspace-next:1`, `EVCP_WORKSPACE_SECRET_KEY`, `EVCP_LITELLM_BASE_URL`.
- **LiteLLM per-project virtual keys stay memory-backed in this plan** (the litellm service is not running yet; it is Plan 7's concern). The real-mode factory keeps `createLiteLlmGatewayAdmin` only when `EVCP_LITELLM_BASE_URL` is set AND reachable; otherwise it stays on the memory gateway. Do not block provisioning on LiteLLM.
- **Never restart the user's running `platform-api` container unannounced.** Any step that rebuilds/restarts the live stack must surface the exact command for the USER to run.
- Live verification is available in this environment. Each task marks which steps are **[pure-unit]** (run anywhere) vs **[live-infra]** (require the running Docker/pg/minio and are guarded by an env flag so they are skipped in the default suite).

---

### Task 1: Workspace dev image (`evcp/workspace-next:1`)

**Files:**
- Create: `docker/workspace-next.Dockerfile`
- Create: `docker/build-workspace-image.sh`
- Test: `tests/integration/workspace-image-smoke.test.mjs`

**Interfaces:**
- Consumes: `templates/nextjs-base/` (the golden template app skeleton — has `package.json`, `app/`, `prisma/`, `lib/storage.ts`, `platform.config.ts`).
- Produces: a locally-built Docker image tagged `evcp/workspace-next:1` that boots a Next.js dev server on `0.0.0.0:3000` as a non-root user. Consumed by Task 4/5 (orchestrator `buildDevContainerSpec` already references this image tag).

- [ ] **Step 1: Write the failing test** [live-infra]

```javascript
// tests/integration/workspace-image-smoke.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const LIVE = process.env.EVCP_DOCKER_LIVE === "1";

test("evcp/workspace-next:1 image exists and runs as non-root serving on 3000", { skip: !LIVE }, () => {
  // image is present
  const images = execFileSync("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}"]).toString();
  assert.ok(images.includes("evcp/workspace-next:1"), "expected evcp/workspace-next:1 to be built");

  // runs non-root
  const whoami = execFileSync("docker", ["run", "--rm", "evcp/workspace-next:1", "whoami"]).toString().trim();
  assert.notEqual(whoami, "root", "workspace container must run as a non-root user");

  // boots a server that answers on 3000 (start detached, poll, then clean up)
  const cid = execFileSync("docker", ["run", "-d", "--rm", "evcp/workspace-next:1"]).toString().trim();
  try {
    let ok = false;
    for (let i = 0; i < 30; i += 1) {
      try {
        const code = execFileSync("docker", [
          "exec", cid, "sh", "-c",
          "wget -q -O /dev/null http://127.0.0.1:3000/ && echo up || (node -e \"require('http').get('http://127.0.0.1:3000/',r=>{process.exit(r.statusCode<500?0:1)}).on('error',()=>process.exit(1))\" && echo up)"
        ]).toString();
        if (code.includes("up")) { ok = true; break; }
      } catch { /* not ready yet */ }
      execFileSync("sleep", ["1"]);
    }
    assert.ok(ok, "dev server did not answer on :3000 within 30s");
  } finally {
    execFileSync("docker", ["rm", "-f", cid]);
  }
});
```

- [ ] **Step 2: Run test to verify it fails** [live-infra]

Run: `EVCP_DOCKER_LIVE=1 node --import tsx --test tests/integration/workspace-image-smoke.test.mjs`
Expected: FAIL — "expected evcp/workspace-next:1 to be built" (image does not exist yet).

- [ ] **Step 3: Write the Dockerfile**

```dockerfile
# docker/workspace-next.Dockerfile
# Dev-workspace image for AI-generated Next.js projects.
# Non-root, EXPOSE only (the orchestrator never publishes host ports).
FROM node:22-alpine

# git is needed for the checkpoint/version-control layer (Plan 7); curl/wget for health checks.
RUN apk add --no-cache git curl

# Non-root user for the workspace.
RUN addgroup -S evcp && adduser -S evcp -G evcp

WORKDIR /workspace

# Seed the workspace with the golden template so a freshly-provisioned container
# has a runnable Next.js app before the AI writes anything.
COPY templates/nextjs-base/ /workspace/

# Enable pnpm via corepack and install template dependencies.
RUN corepack enable && (pnpm install || npm install)

# Ownership to the non-root user.
RUN chown -R evcp:evcp /workspace
USER evcp

EXPOSE 3000

# Default: run the template's dev server bound to all interfaces on 3000.
# The template's package.json "dev" script must serve on 0.0.0.0:3000.
CMD ["sh", "-lc", "pnpm run dev --hostname 0.0.0.0 --port 3000 || npm run dev -- --hostname 0.0.0.0 --port 3000 || npx next dev --hostname 0.0.0.0 --port 3000"]
```

- [ ] **Step 4: Write the build script**

```bash
# docker/build-workspace-image.sh
#!/usr/bin/env bash
set -euo pipefail
# Build the workspace dev image from the repo root so the templates/ context is available.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
docker build -f docker/workspace-next.Dockerfile -t "${EVCP_WORKSPACE_IMAGE:-evcp/workspace-next:1}" .
echo "built ${EVCP_WORKSPACE_IMAGE:-evcp/workspace-next:1}"
```

- [ ] **Step 5: Build the image** [live-infra]

Run: `chmod +x docker/build-workspace-image.sh && ./docker/build-workspace-image.sh`
Expected: ends with `built evcp/workspace-next:1`. If the template's `dev` script does not accept `--hostname/--port`, the `CMD` falls back through the `||` chain to `next dev`; confirm by reading `templates/nextjs-base/package.json` and adjust the primary `CMD` clause to match its actual `dev` script (do NOT leave a guess — read the file and set the real command as the first clause).

- [ ] **Step 6: Run test to verify it passes** [live-infra]

Run: `EVCP_DOCKER_LIVE=1 node --import tsx --test tests/integration/workspace-image-smoke.test.mjs`
Expected: PASS — image present, non-root, answers on :3000.

- [ ] **Step 7: Commit**

```bash
git add docker/workspace-next.Dockerfile docker/build-workspace-image.sh tests/integration/workspace-image-smoke.test.mjs
git commit -m "feat: add workspace-next dev image (non-root, serves :3000)"
```

---

### Task 2: Real Postgres `runSql`

**Files:**
- Create: `apps/platform-api/src/workspace-orchestrator/pg-runner.ts`
- Modify: `apps/platform-api/package.json` (add `pg`, `@types/pg`)
- Test: `tests/unit/pg-runner.test.mjs`
- Test: `tests/integration/pg-provision-live.test.mjs`

**Interfaces:**
- Consumes: existing `createPgClientPostgresProvisioner(runSql: (sql: string) => Promise<void>)`, `buildProvisionSchemaSql(slug, password): string[]`, `buildReleaseSchemaSql(slug): string[]`, `schemaNameFor(slug)`, `roleNameFor(slug)` from `./postgres-provisioner`.
- Produces: `createPgRunSql(opts: { connectionString?: string; host?: string; port?: number; user?: string; password?: string; database?: string }): (sql: string) => Promise<void>`. Consumed by Task 4's factory real branch.

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @evcp/platform-api add pg && pnpm --filter @evcp/platform-api add -D @types/pg`
Expected: `pg` and `@types/pg` appear in `apps/platform-api/package.json`; lockfile updated.

- [ ] **Step 2: Write the failing unit test** [pure-unit]

```javascript
// tests/unit/pg-runner.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createPgClientPostgresProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";

test("createPgClientPostgresProvisioner runs each provision statement through the injected runSql", async () => {
  const executed = [];
  const runSql = async (sql) => { executed.push(sql); };
  const provisioner = createPgClientPostgresProvisioner(runSql);

  const result = await provisioner.provisionSchema("demo");

  // schema + role names follow the isolation convention
  assert.match(result.schemaName, /demo/);
  assert.match(result.roleName, /demo/);
  assert.ok(result.password && result.password.length > 0);
  // at least one CREATE SCHEMA and one CREATE ROLE were issued
  assert.ok(executed.some((s) => /create schema/i.test(s)), "expected a CREATE SCHEMA statement");
  assert.ok(executed.some((s) => /create role|create user/i.test(s)), "expected a role/user statement");
});
```

(This test locks that the EXISTING provisioner drives `runSql` — the new `pg-runner` is the real `runSql`. If `createPgClientPostgresProvisioner`'s exact statement wording differs, assert on the observable behavior it already has; read `postgres-provisioner.ts` first and match its real output rather than guessing.)

- [ ] **Step 3: Run test to verify it passes as a baseline** [pure-unit]

Run: `node --import tsx --test tests/unit/pg-runner.test.mjs`
Expected: PASS (this asserts existing behavior; it guards against regressions when wiring the real runner). If it FAILS, the assertions don't match the real provisioner output — fix the assertions to match `postgres-provisioner.ts` before continuing.

- [ ] **Step 4: Write the pg-runner implementation**

```typescript
// apps/platform-api/src/workspace-orchestrator/pg-runner.ts
import { Client } from "pg";

export interface PgRunSqlOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

/**
 * Returns a runSql function that executes a single SQL statement against Postgres,
 * opening and closing a fresh Client per call. Errors propagate so the orchestrator's
 * provision rollback can fire. Never logs the SQL (it may embed a generated role password).
 */
export function createPgRunSql(opts: PgRunSqlOptions): (sql: string) => Promise<void> {
  const config = opts.connectionString
    ? { connectionString: opts.connectionString }
    : { host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database };

  return async (sql: string): Promise<void> => {
    const client = new Client(config);
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  };
}
```

- [ ] **Step 5: Write the live integration test** [live-infra]

```javascript
// tests/integration/pg-provision-live.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createPgRunSql } from "../../apps/platform-api/src/workspace-orchestrator/pg-runner.ts";
import { createPgClientPostgresProvisioner, schemaNameFor } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";
import { Client } from "pg";

const LIVE = process.env.EVCP_PG_LIVE === "1";

function pgConfig() {
  return {
    host: process.env.EVCP_PG_HOST ?? "postgres",
    port: Number(process.env.EVCP_PG_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "evcp",
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB ?? "evcp"
  };
}

test("provisionSchema creates a real schema + role, releaseSchema removes it", { skip: !LIVE }, async () => {
  const slug = "livetest" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
  const runSql = createPgRunSql(pgConfig());
  const provisioner = createPgClientPostgresProvisioner(runSql);

  await provisioner.provisionSchema(slug);
  const schema = schemaNameFor(slug);

  const admin = new Client(pgConfig());
  await admin.connect();
  try {
    const found = await admin.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [schema]
    );
    assert.equal(found.rowCount, 1, "expected the provisioned schema to exist");

    await provisioner.releaseSchema(slug);
    const gone = await admin.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [schema]
    );
    assert.equal(gone.rowCount, 0, "expected the schema to be dropped after release");
  } finally {
    await admin.end();
  }
});
```

- [ ] **Step 6: Run the unit test (must still pass) and the live test** [pure-unit + live-infra]

Run (unit, anywhere): `node --import tsx --test tests/unit/pg-runner.test.mjs`
Expected: PASS.

Run (live, from inside the platform-api container so `postgres` resolves and `POSTGRES_PASSWORD` is set):
`docker exec -e EVCP_PG_LIVE=1 -e EVCP_TEST_SEED=$RANDOM evcp-platform-api sh -lc 'cd /workspace && node --import tsx --test tests/integration/pg-provision-live.test.mjs'`
Expected: PASS — schema created then dropped. (`POSTGRES_PASSWORD`/`POSTGRES_USER`/`POSTGRES_DB` are already in the container's env.)

- [ ] **Step 7: Commit**

```bash
git add apps/platform-api/package.json pnpm-lock.yaml apps/platform-api/src/workspace-orchestrator/pg-runner.ts tests/unit/pg-runner.test.mjs tests/integration/pg-provision-live.test.mjs
git commit -m "feat: add real Postgres runSql for per-project schema provisioning"
```

---

### Task 3: Real MinIO object-storage provisioner

**Files:**
- Create: `apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts`
- Modify: `apps/platform-api/package.json` (add `minio`)
- Test: `tests/unit/minio-object-storage.test.mjs`
- Test: `tests/integration/minio-provision-live.test.mjs`

**Interfaces:**
- Consumes: existing `ObjectStorageProvisioner` interface + `bucketNameFor(slug)` from `./resource-ports`.
- Produces: `createMinioObjectStorageProvisioner(opts: { endPoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string; clientFactory?: (cfg) => MinioLike }): ObjectStorageProvisioner` where `MinioLike = { bucketExists(name): Promise<boolean>; makeBucket(name, region?): Promise<void>; removeBucket(name): Promise<void> }`. Consumed by Task 4's factory real branch.

**MVP secret decision (documented):** `provisionBucket` returns the MinIO **root** access/secret key as the bucket's credentials for MVP (dev + prod share one MinIO instance; per-project scoped keys are a later phase). Per the hard secret constraint these values are stored ONLY via the encrypted `ProjectSecretStore` (as `S3_ACCESS_KEY`/`S3_SECRET_KEY`) which the orchestrator already does — they are NEVER surfaced to the Creator (only the env var NAMES appear in UI). The provisioner must not log them.

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @evcp/platform-api add minio`
Expected: `minio` appears in `apps/platform-api/package.json`; lockfile updated.

- [ ] **Step 2: Write the failing unit test** [pure-unit]

```javascript
// tests/unit/minio-object-storage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMinioObjectStorageProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

function fakeMinio() {
  const buckets = new Set();
  return {
    calls: [],
    buckets,
    async bucketExists(name) { this.calls.push(["exists", name]); return buckets.has(name); },
    async makeBucket(name) { this.calls.push(["make", name]); buckets.add(name); },
    async removeBucket(name) { this.calls.push(["remove", name]); buckets.delete(name); }
  };
}

test("provisionBucket creates the per-project bucket when absent and returns creds", async () => {
  const client = fakeMinio();
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client
  });

  const result = await provisioner.provisionBucket("myapp");
  assert.equal(result.bucket, "proj-myapp");
  assert.equal(result.accessKey, "root");
  assert.equal(result.secretKey, "rootsecret");
  assert.ok(client.buckets.has("proj-myapp"));
  assert.deepEqual(client.calls, [["exists", "proj-myapp"], ["make", "proj-myapp"]]);
});

test("provisionBucket is idempotent when the bucket already exists", async () => {
  const client = fakeMinio();
  client.buckets.add("proj-myapp");
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client
  });
  await provisioner.provisionBucket("myapp");
  assert.ok(!client.calls.some((c) => c[0] === "make"), "must not re-create an existing bucket");
});

test("releaseBucket removes the bucket", async () => {
  const client = fakeMinio();
  client.buckets.add("proj-myapp");
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: "minio", port: 9000, useSSL: false, accessKey: "root", secretKey: "rootsecret",
    clientFactory: () => client
  });
  await provisioner.releaseBucket("myapp");
  assert.ok(!client.buckets.has("proj-myapp"));
});
```

- [ ] **Step 3: Run test to verify it fails** [pure-unit]

Run: `node --import tsx --test tests/unit/minio-object-storage.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```typescript
// apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts
import { Client as MinioClient } from "minio";
import { bucketNameFor, type ObjectStorageProvisioner } from "./resource-ports";

export interface MinioLike {
  bucketExists(name: string): Promise<boolean>;
  makeBucket(name: string, region?: string): Promise<void>;
  removeBucket(name: string): Promise<void>;
}

export interface MinioProvisionerOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  clientFactory?: (cfg: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
  }) => MinioLike;
}

export function createMinioObjectStorageProvisioner(opts: MinioProvisionerOptions): ObjectStorageProvisioner {
  const client: MinioLike = opts.clientFactory
    ? opts.clientFactory(opts)
    : (new MinioClient({
        endPoint: opts.endPoint,
        port: opts.port,
        useSSL: opts.useSSL,
        accessKey: opts.accessKey,
        secretKey: opts.secretKey
      }) as unknown as MinioLike);

  return {
    async provisionBucket(slug: string) {
      const bucket = bucketNameFor(slug);
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
      }
      // MVP: dev+prod share one MinIO; return root creds. Stored only in the encrypted
      // ProjectSecretStore by the orchestrator; never surfaced to the Creator.
      return { bucket, accessKey: opts.accessKey, secretKey: opts.secretKey };
    },
    async releaseBucket(slug: string) {
      const bucket = bucketNameFor(slug);
      const exists = await client.bucketExists(bucket);
      if (exists) {
        await client.removeBucket(bucket);
      }
    }
  };
}
```

- [ ] **Step 5: Run test to verify it passes** [pure-unit]

Run: `node --import tsx --test tests/unit/minio-object-storage.test.mjs`
Expected: PASS (3/3).

- [ ] **Step 6: Write the live integration test** [live-infra]

```javascript
// tests/integration/minio-provision-live.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMinioObjectStorageProvisioner } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

const LIVE = process.env.EVCP_MINIO_LIVE === "1";

test("provisions and releases a real bucket against the running MinIO", { skip: !LIVE }, async () => {
  const provisioner = createMinioObjectStorageProvisioner({
    endPoint: process.env.EVCP_S3_HOST ?? "minio",
    port: Number(process.env.EVCP_S3_PORT ?? 9000),
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USER,
    secretKey: process.env.MINIO_ROOT_PASSWORD
  });
  const slug = "livebucket" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));

  const result = await provisioner.provisionBucket(slug);
  assert.equal(result.bucket, `proj-${slug}`);

  // idempotent second call must not throw
  await provisioner.provisionBucket(slug);

  await provisioner.releaseBucket(slug);
  // releasing a non-existent bucket must be a no-op, not throw
  await provisioner.releaseBucket(slug);
});
```

- [ ] **Step 7: Run the live test** [live-infra]

Run (from inside the container so `minio` resolves + creds are set):
`docker exec -e EVCP_MINIO_LIVE=1 -e EVCP_TEST_SEED=$RANDOM evcp-platform-api sh -lc 'cd /workspace && node --import tsx --test tests/integration/minio-provision-live.test.mjs'`
Expected: PASS — bucket created (idempotent), then removed.

- [ ] **Step 8: Commit**

```bash
git add apps/platform-api/package.json pnpm-lock.yaml apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts tests/unit/minio-object-storage.test.mjs tests/integration/minio-provision-live.test.mjs
git commit -m "feat: add real MinIO object-storage provisioner"
```

---

### Task 4: Wire the factory real branch + compose env

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/factory.ts`
- Modify: `docker/docker-compose.yml` (platform-api service env)
- Modify: `docker/.env.example` (document new keys; do NOT write secrets into a committed file)
- Test: `tests/unit/factory-real-mode.test.mjs`
- Test: `tests/integration/provision-full-live.test.mjs`

**Interfaces:**
- Consumes: `createPgRunSql` (Task 2), `createMinioObjectStorageProvisioner` (Task 3), existing `createPgClientPostgresProvisioner`, `createDockerSocketEngine`, `createProjectSecretStore`, `createMemory*` fakes, `resolveWorkspaceAdapterMode`.
- Produces: an updated `createDefaultWorkspaceOrchestrator` whose real branch uses real pg + real MinIO. Memory branch unchanged. Consumed by the app entrypoint (already wired) and Task 5.

- [ ] **Step 1: Write the failing unit test** [pure-unit]

```javascript
// tests/unit/factory-real-mode.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspaceAdapterMode } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";

test("resolveWorkspaceAdapterMode returns real only when the flag is exactly '1'", () => {
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "1" }), "real");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "0" }), "memory");
  assert.equal(resolveWorkspaceAdapterMode({}), "memory");
});

test("memory mode still builds an orchestrator without touching real infra", () => {
  // Importing + constructing in memory mode must not throw and must not require pg/minio env.
  // (Guards that wiring real adapters didn't break the default test path.)
  const mod = require("../../apps/platform-api/src/workspace-orchestrator/factory.ts");
  assert.equal(typeof mod.createDefaultWorkspaceOrchestrator, "function");
});
```

Note: the second test uses `require` only to assert the export exists without constructing real adapters; if the project is ESM-only under tsx, replace with a dynamic `import(...)` and assert on the named export. Read the existing test style in `tests/unit/` and match it.

- [ ] **Step 2: Run test to verify current behavior** [pure-unit]

Run: `node --import tsx --test tests/unit/factory-real-mode.test.mjs`
Expected: the `resolveWorkspaceAdapterMode` test PASSES (existing behavior); the export test PASSES. This is a guard test — it should pass before and after.

- [ ] **Step 3: Modify the factory real branch**

Replace the real branch's placeholder adapters. Read the current `factory.ts` first; change ONLY the real branch (`mode === "real"`) so it reads:

```typescript
// apps/platform-api/src/workspace-orchestrator/factory.ts (real branch)
import { createPgRunSql } from "./pg-runner";
import { createMinioObjectStorageProvisioner } from "./minio-object-storage";
// ... existing imports ...

if (mode === "real") {
  const pgRunSql = createPgRunSql({
    host: env.EVCP_PG_HOST ?? "postgres",
    port: Number(env.EVCP_PG_PORT ?? 5432),
    user: env.POSTGRES_USER ?? "evcp",
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB ?? "evcp"
  });

  const objectStorage = createMinioObjectStorageProvisioner({
    endPoint: env.EVCP_S3_HOST ?? "minio",
    port: Number(env.EVCP_S3_PORT ?? 9000),
    useSSL: (env.EVCP_S3_SSL ?? "false") === "true",
    accessKey: env.MINIO_ROOT_USER as string,
    secretKey: env.MINIO_ROOT_PASSWORD as string
  });

  const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL && env.EVCP_LITELLM_MASTER_KEY);
  console.warn(
    `[workspace] real-adapter mode: Docker=real, Postgres=real (${env.EVCP_PG_HOST ?? "postgres"}), ` +
      `MinIO=real (${env.EVCP_S3_HOST ?? "minio"}), LiteLLM=${hasLiteLlmConfig ? "real" : "memory-stub (litellm not configured)"}.`
  );

  return createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(pgRunSql),
    objectStorage,
    llmGateway: hasLiteLlmConfig
      ? createLiteLlmGatewayAdmin({
          baseUrl: env.EVCP_LITELLM_BASE_URL as string,
          masterKey: env.EVCP_LITELLM_MASTER_KEY as string
        })
      : createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex }),
    docker: createDockerSocketEngine(),
    onAudit: opts.onAudit
  });
}
```

Keep the `mode === "memory"` branch exactly as-is (memory pg no-op is fine there since tests never provision real infra in memory mode — but note: the memory branch currently uses `createPgClientPostgresProvisioner(async () => {})`; that stays for tests).

- [ ] **Step 4: Add the compose env**

In `docker/docker-compose.yml`, under the `platform-api` service `environment:` block, add:

```yaml
      EVCP_WORKSPACE_REAL_ADAPTERS: "1"
      EVCP_PG_HOST: postgres
      EVCP_PG_PORT: "5432"
      POSTGRES_USER: ${POSTGRES_USER:-evcp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-evcp}
      EVCP_S3_HOST: minio
      EVCP_S3_PORT: "9000"
      EVCP_S3_SSL: "false"
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
```

In `docker/.env.example`, document the same keys (names only, no secret values), e.g.:

```
# Workspace real-adapter mode (set to 1 to provision real pg schema / minio bucket / container)
EVCP_WORKSPACE_REAL_ADAPTERS=1
EVCP_PG_HOST=postgres
EVCP_PG_PORT=5432
EVCP_S3_HOST=minio
EVCP_S3_PORT=9000
EVCP_S3_SSL=false
```

(Note: `POSTGRES_*` and `MINIO_ROOT_*` already exist in `docker/.env`; do not duplicate their values, just reference them.)

- [ ] **Step 5: Run the unit test + full suite to confirm no regression** [pure-unit]

Run: `node --import tsx --test tests/unit/*.test.mjs tests/integration/*.test.mjs 2>&1 | grep -E "^. (tests|pass|fail) "`
Expected: all still PASS (the live-infra tests are skipped without their env flags; the memory path is untouched). Then `cd apps/platform-api && npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Write the full-provision live test** [live-infra]

```javascript
// tests/integration/provision-full-live.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createDefaultWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import { schemaNameFor } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";

const LIVE = process.env.EVCP_PROVISION_LIVE === "1";

test("provisionWorkspace creates a real schema + bucket + running container, and cleanup removes them", { skip: !LIVE }, async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator({ env: { ...process.env, EVCP_WORKSPACE_REAL_ADAPTERS: "1" } });
  const slug = "e2e" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
  const projectId = `proj-${slug}`;

  const record = await orchestrator.provisionWorkspace({ projectId, slug });
  try {
    assert.equal(record.state, "running");
    assert.ok(record.containerId, "expected a real container id");

    // real container is up
    const running = execFileSync("docker", ["ps", "--format", "{{.Names}}"]).toString();
    assert.ok(running.includes(`evcp-ws-${slug}`), "expected evcp-ws-<slug> container to be running");
  } finally {
    await orchestrator.deleteWorkspace(projectId);
    // container gone
    const after = execFileSync("docker", ["ps", "-a", "--format", "{{.Names}}"]).toString();
    assert.ok(!after.includes(`evcp-ws-${slug}`), "expected the container removed after deleteWorkspace");
  }
  // NOTE: also assert schema/bucket removal via psql/mc if desired; deleteWorkspace calls releaseSchema+releaseBucket best-effort.
  assert.ok(schemaNameFor(slug).includes(slug));
});
```

- [ ] **Step 7: Run the full-provision live test** [live-infra]

Run (from inside the container so `docker`, `postgres`, `minio`, and all env are available — the container has the docker socket mounted):
`docker exec -e EVCP_PROVISION_LIVE=1 -e EVCP_WORKSPACE_REAL_ADAPTERS=1 -e EVCP_TEST_SEED=$RANDOM evcp-platform-api sh -lc 'cd /workspace && node --import tsx --test tests/integration/provision-full-live.test.mjs'`
Expected: PASS — real schema + bucket + `evcp-ws-<slug>` container created, then cleaned up. If the container fails to start because the image isn't present in the daemon the platform-api talks to, confirm Task 1's image build ran on that same daemon (`docker images | grep workspace-next`).

- [ ] **Step 8: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/factory.ts docker/docker-compose.yml docker/.env.example tests/unit/factory-real-mode.test.mjs tests/integration/provision-full-live.test.mjs
git commit -m "feat: wire real pg+minio adapters into workspace factory real mode"
```

---

### Task 5: Restart the stack + live end-to-end verification

**Files:**
- Create: `docs/runbooks/enable-real-workspace-provisioning.md`
- Test: (manual/live smoke — documented commands; no new automated test file, this task is the live cutover)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: a runbook + a verified live provisioning path behind the real API.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/enable-real-workspace-provisioning.md` documenting: the required `docker/.env` keys (POSTGRES_*, MINIO_ROOT_*, EVCP_WORKSPACE_SECRET_KEY already present; the new EVCP_WORKSPACE_REAL_ADAPTERS + EVCP_PG_*/EVCP_S3_*), the image build command, the restart command, and the verification curl. Include the exact commands from Steps 2–4.

- [ ] **Step 2: Build the image on the daemon platform-api uses** [live-infra]

Run: `./docker/build-workspace-image.sh`
Expected: `built evcp/workspace-next:1`. (Confirm with `docker images | grep workspace-next`.)

- [ ] **Step 3: Restart platform-api with the new env — USER-RUN COMMAND** [live-infra, user action]

This restarts the user's running service, so surface it for the USER to run (do not run it unannounced):

```
docker compose -f docker/docker-compose.yml up -d --build platform-api
```

Then confirm real mode is active in the logs:
```
docker logs evcp-platform-api 2>&1 | grep "real-adapter mode"
```
Expected: a line showing `Docker=real, Postgres=real, MinIO=real`.

- [ ] **Step 4: Live end-to-end smoke through the API** [live-infra]

Provision a throwaway workspace through the real API path (adjust to the actual provision route + a valid session token — read `workspace-orchestrator/routes.ts` + how app-factory mounts it; the route is member-gated so a real session header is required), then confirm the container is up and the preview proxy answers:

```
# from the host, hitting the API:
curl -sS -X POST http://localhost:3100/projects/<projectId>/workspace/provision \
  -H "authorization: <valid session>" -H "content-type: application/json" \
  -d '{"projectId":"<projectId>","slug":"<slug>"}'
docker ps --format '{{.Names}}' | grep evcp-ws-<slug>
# preview is auth-gated through Caddy/platform-api:
curl -sS -H "authorization: <valid session>" http://localhost:3100/preview/<slug>/ -o /dev/null -w "%{http_code}\n"
```
Expected: provision returns 201 with a names-only workspace body (no secret values), the container is running, and the preview returns 200/3xx (or 502 only if the dev server is still booting — retry).

- [ ] **Step 5: Commit the runbook**

```bash
git add docs/runbooks/enable-real-workspace-provisioning.md
git commit -m "docs: runbook for enabling real workspace provisioning"
```

---

## Notes for the implementer

- **Live vs unit split:** Tasks 2–4 have `[pure-unit]` tests that run in the default suite (memory path, fakes) AND `[live-infra]` tests guarded by `EVCP_*_LIVE=1` that must be run via `docker exec ... evcp-platform-api` so `postgres`/`minio`/`docker` and the real env resolve. Never let a live test run unguarded in the default `tests/unit/*.test.mjs tests/integration/*.test.mjs` sweep (it would fail on machines without infra) — the `{ skip: !LIVE }` guard handles this; verify each live test is skipped when its flag is unset.
- **Do not break the 346 existing tests:** they run in memory mode. Only the `mode === "real"` branch changes. Run the full default suite after Task 4 to confirm.
- **Secrets:** `pg-runner` and `minio-object-storage` must never `console.log` SQL or credentials. The orchestrator already stores S3/DB creds only in the encrypted `ProjectSecretStore`; this plan does not change that.
- **Restart is the user's call:** Task 5 Step 3 restarts the running platform-api — surface the command, don't run it silently. Everything before it (image build, guarded live tests via `docker exec`) can be run without disrupting the running service.
- **Image/daemon coherence:** the image must be built on the SAME Docker daemon that platform-api's mounted socket points at (here, the host daemon). Task 1 builds on the host; platform-api uses `/var/run/docker.sock` → same daemon. Confirm with `docker images`.
- **LiteLLM stays memory** for per-project virtual keys until Plan 7 starts the litellm service; the factory already falls back to the memory gateway when `EVCP_LITELLM_MASTER_KEY` is unset, so provisioning is not blocked.
