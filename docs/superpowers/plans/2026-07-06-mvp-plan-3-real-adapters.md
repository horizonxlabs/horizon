# MVP Plan 3: Real Workspace Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the memory adapters behind the workspace orchestrator with real ones so provisioning and preview act on real infrastructure — starting with a dependency-free Docker Engine adapter (the linchpin for real containers) and env-gated adapter assembly.

**Architecture:** A dep-free `createDockerSocketEngine` talks to the Docker Engine HTTP API over the unix socket via Node `http` (`socketPath`), injectable with a fake transport for unit tests (same pattern as the LiteLLM client's fake `fetch`). The factory gains an env-gated real-mode assembly: when `EVCP_WORKSPACE_REAL_ADAPTERS=1`, it wires the Docker socket engine + the existing real LiteLLM admin; Postgres/MinIO real runners are scaffolded behind clearly-typed injection points that need deps + live infra (integration-gated, not unit-tested here).

**Tech Stack:** TypeScript, Node 22 `node:http` (socketPath), existing workspace-orchestrator ports (`DockerEngine`, `DevContainerSpec`), `.mjs` + `node --import tsx --test`.

## Global Constraints

- Dependency-free: no dockerode/pg/minio npm deps in this plan. Docker uses `node:http` over `/var/run/docker.sock`.
- `createDockerSocketEngine` must implement the existing `DockerEngine` interface (`createContainer/startContainer/stopContainer/removeContainer`) from `docker-engine.ts` — do NOT change that interface.
- Injectable transport: the engine takes an optional `request` function so tests inject a fake; default uses `node:http` with `socketPath`.
- Container create must map `DevContainerSpec` to the Docker API `POST /containers/create` body: `Image`, `Env`, `HostConfig` (`NanoCpus`, `Memory`, `NetworkMode`, `Binds`), `Labels`, and must NOT set `HostConfig.PortBindings` (no host port publishing — the security invariant). `name` passed as `?name=` query.
- Non-2xx Docker responses throw `docker engine <op> failed (<status>)`.
- Real-mode factory must not break the default memory mode (existing tests keep passing).
- Tests `.mjs`; `pnpm typecheck && pnpm verify:workspace` pass after every task.
- git hygiene: stage only each task's explicit files. `apps/platform-api/src/app-factory.ts` and `docker/Caddyfile` carry unrelated pre-existing working-tree changes — do NOT stage them. NEVER `git add -A/./-u`.

---

### Task 1: Dependency-free Docker socket engine

**Files:**
- Create: `apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts`
- Test: `tests/unit/workspace-docker-socket-engine.test.mjs`

**Interfaces:**
- Consumes: `DockerEngine`, `DevContainerSpec` (from `./docker-engine`).
- Produces: `createDockerSocketEngine(opts?: { socketPath?: string; request?: DockerRequestFn }): DockerEngine`, where `DockerRequestFn = (input: { method: string; path: string; body?: unknown }) => Promise<{ status: number; json: () => Promise<any> }>`. Also export `buildCreateContainerBody(spec: DevContainerSpec): Record<string, unknown>` (pure).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-docker-socket-engine.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { createDockerSocketEngine, buildCreateContainerBody } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts"
);
const { buildDevContainerSpec } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

const spec = buildDevContainerSpec({
  slug: "leave-tracker",
  image: "evcp/workspace-next:1",
  env: { DATABASE_URL: "postgresql://x", S3_BUCKET: "proj-leave-tracker" },
  cpuCores: 1,
  memoryMb: 2048,
  network: "evcp-internal",
  workspaceVolume: "evcp-ws-leave-tracker-data"
});

test("buildCreateContainerBody maps the spec to Docker API shape without port publishing", () => {
  const body = buildCreateContainerBody(spec);
  assert.equal(body.Image, "evcp/workspace-next:1");
  assert.ok(Array.isArray(body.Env) && body.Env.includes("DATABASE_URL=postgresql://x"));
  assert.equal(body.HostConfig.NanoCpus, 1_000_000_000);
  assert.equal(body.HostConfig.Memory, 2048 * 1024 * 1024);
  assert.equal(body.HostConfig.NetworkMode, "evcp-internal");
  assert.deepEqual(body.HostConfig.Binds, ["evcp-ws-leave-tracker-data:/workspace"]);
  assert.equal(body.Labels["evcp.project-slug"], "leave-tracker");
  assert.ok(!("PortBindings" in body.HostConfig), "must never publish host ports");
});

test("createContainer POSTs to /containers/create with ?name and returns id", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path, body }) => {
      calls.push({ method, path, body });
      if (path.startsWith("/containers/create")) {
        return { status: 201, json: async () => ({ Id: "abc123" }) };
      }
      return { status: 204, json: async () => ({}) };
    }
  });
  const { containerId } = await engine.createContainer(spec);
  assert.equal(containerId, "abc123");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/containers\/create\?name=evcp-ws-leave-tracker$/);
  assert.equal(calls[0].body.Image, "evcp/workspace-next:1");
});

test("start/stop/remove hit the right endpoints", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path }) => {
      calls.push(`${method} ${path}`);
      return { status: 204, json: async () => ({}) };
    }
  });
  await engine.startContainer("abc123");
  await engine.stopContainer("abc123");
  await engine.removeContainer("abc123");
  assert.deepEqual(calls, [
    "POST /containers/abc123/start",
    "POST /containers/abc123/stop",
    "DELETE /containers/abc123?force=true"
  ]);
});

test("non-2xx throws a descriptive error", async () => {
  const engine = createDockerSocketEngine({
    request: async () => ({ status: 500, json: async () => ({ message: "boom" }) })
  });
  await assert.rejects(() => engine.startContainer("abc123"), /docker engine start failed \(500\)/);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/unit/workspace-docker-socket-engine.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts`**

```ts
import * as nodeHttp from "node:http";
import type { DockerEngine, DevContainerSpec } from "./docker-engine";

export interface DockerRequestResult {
  status: number;
  json: () => Promise<any>;
}

export type DockerRequestFn = (input: {
  method: string;
  path: string;
  body?: unknown;
}) => Promise<DockerRequestResult>;

export function buildCreateContainerBody(spec: DevContainerSpec): Record<string, unknown> {
  return {
    Image: spec.image,
    Env: spec.env,
    Labels: spec.labels,
    ExposedPorts: { "3000/tcp": {} },
    HostConfig: {
      NanoCpus: spec.hostConfig.NanoCpus,
      Memory: spec.hostConfig.Memory,
      NetworkMode: spec.hostConfig.NetworkMode,
      Binds: spec.hostConfig.Binds
      // intentionally NO PortBindings — containers never publish host ports
    }
  };
}

function nodeSocketRequest(socketPath: string): DockerRequestFn {
  return ({ method, path, body }) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = nodeHttp.request(
        {
          socketPath,
          method,
          path,
          headers: payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
              status: res.statusCode ?? 0,
              json: async () => (text ? JSON.parse(text) : {})
            });
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
}

export function createDockerSocketEngine(opts: {
  socketPath?: string;
  request?: DockerRequestFn;
} = {}): DockerEngine {
  const request = opts.request ?? nodeSocketRequest(opts.socketPath ?? "/var/run/docker.sock");

  const expect = async (op: string, result: DockerRequestResult, okStatuses: number[]) => {
    if (!okStatuses.includes(result.status)) {
      throw new Error(`docker engine ${op} failed (${result.status})`);
    }
  };

  return {
    async createContainer(spec) {
      const result = await request({
        method: "POST",
        path: `/containers/create?name=${spec.name}`,
        body: buildCreateContainerBody(spec)
      });
      await expect("create", result, [201]);
      const payload = await result.json();
      return { containerId: String(payload.Id) };
    },
    async startContainer(containerId) {
      const result = await request({ method: "POST", path: `/containers/${containerId}/start` });
      await expect("start", result, [204, 304]);
    },
    async stopContainer(containerId) {
      const result = await request({ method: "POST", path: `/containers/${containerId}/stop` });
      await expect("stop", result, [204, 304]);
    },
    async removeContainer(containerId) {
      const result = await request({ method: "DELETE", path: `/containers/${containerId}?force=true` });
      await expect("remove", result, [204]);
    }
  };
}
```

- [ ] **Step 4: Run tests + typecheck + gate**

Run: `node --import tsx --test tests/unit/workspace-docker-socket-engine.test.mjs && pnpm typecheck && pnpm verify:workspace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts tests/unit/workspace-docker-socket-engine.test.mjs
git commit -m "feat(workspace): add dependency-free Docker socket engine adapter"
```

---

### Task 2: Env-gated real adapter assembly in the factory

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/factory.ts`
- Test: `tests/unit/workspace-real-adapter-factory.test.mjs`

**Interfaces:**
- Consumes: `createDockerSocketEngine` (Task 1), `createLiteLlmGatewayAdmin` (Plan 1 resource-ports), memory adapters (Plan 1), `createWorkspaceOrchestrator`, `createProjectSecretStore`, `createPgClientPostgresProvisioner`.
- Produces: `resolveWorkspaceAdapterMode(env): "memory" | "real"` and an extended `createDefaultWorkspaceOrchestrator` that, in `"real"` mode, wires the Docker socket engine + real LiteLLM admin (`EVCP_LITELLM_BASE_URL`/`EVCP_LITELLM_MASTER_KEY`), while Postgres/MinIO real runners remain injectable (default to memory/no-op with a one-time console.warn that they are not yet real) — clearly marked TODO for the deps-required follow-up.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-real-adapter-factory.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { resolveWorkspaceAdapterMode, createDefaultWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/factory.ts"
);

test("adapter mode defaults to memory and flips to real via env", () => {
  assert.equal(resolveWorkspaceAdapterMode({}), "memory");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "1" }), "real");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "0" }), "memory");
});

test("memory mode still provisions against fakes (no infra)", async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator();
  const record = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "demo-app" });
  assert.equal(record.state, "running");
});

test("real mode builds an orchestrator without throwing at construction", () => {
  const orchestrator = createDefaultWorkspaceOrchestrator({
    env: {
      EVCP_WORKSPACE_REAL_ADAPTERS: "1",
      EVCP_LITELLM_BASE_URL: "http://litellm:4000",
      EVCP_LITELLM_MASTER_KEY: "sk-master",
      EVCP_WORKSPACE_SECRET_KEY: "0".repeat(64)
    }
  });
  assert.equal(typeof orchestrator.provisionWorkspace, "function");
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/unit/workspace-real-adapter-factory.test.mjs`
Expected: FAIL (`resolveWorkspaceAdapterMode` not exported / `env` option unsupported).

- [ ] **Step 3: Extend `factory.ts`**

Add `resolveWorkspaceAdapterMode` and extend `createDefaultWorkspaceOrchestrator` to accept an `env` option and branch on mode. In real mode use `createDockerSocketEngine()` and `createLiteLlmGatewayAdmin({ baseUrl: env.EVCP_LITELLM_BASE_URL, masterKey: env.EVCP_LITELLM_MASTER_KEY })`; keep memory Postgres runSql/MinIO with a one-time `console.warn("[workspace] real Postgres/MinIO adapters not configured; using in-memory stand-ins")`. Imports: `createDockerSocketEngine` from `./docker-socket-engine`, `createLiteLlmGatewayAdmin` from `./resource-ports`.

```ts
export function resolveWorkspaceAdapterMode(env: Record<string, string | undefined> = process.env): "memory" | "real" {
  return env.EVCP_WORKSPACE_REAL_ADAPTERS === "1" ? "real" : "memory";
}
```

`createDefaultWorkspaceOrchestrator` gains `opts.env` (defaults to `process.env`); when mode is `"real"` and the LiteLLM env is present, substitute the Docker socket engine and real LiteLLM admin into the `createWorkspaceOrchestrator` deps; otherwise keep the memory adapters. Postgres/MinIO stay as the memory stand-ins with the warning (documented TODO: real pg/MinIO need deps + live infra — Plan 4).

- [ ] **Step 4: Run tests + typecheck + gate**

Run: `node --import tsx --test tests/unit/workspace-real-adapter-factory.test.mjs && pnpm typecheck && pnpm verify:workspace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/factory.ts tests/unit/workspace-real-adapter-factory.test.mjs
git commit -m "feat(workspace): env-gated real adapter assembly (Docker socket + LiteLLM)"
```

---

## Deferred to later (needs deps + live infra)

- Real Postgres runSql via a `pg` client (`createPgRunSql(connectionString)`) — add `pg` dep; integration-test against the compose Postgres for real schema isolation.
- Real MinIO provisioner: bucket create + scoped access key/policy via MinIO admin API — add `minio`/`@aws-sdk/client-s3`; integration-test against compose MinIO.
- Integration test suite that runs against `docker compose up` (real Docker socket, real containers, real schema isolation, real preview upstream).
- WebSocket/HMR upgrade proxying for `next dev` live reload.
- `deleteWorkspace` cleanup (follow-up #12).

## Self-review notes

- Docker engine is dep-free (node:http socketPath), unit-tested via injected transport, preserves the no-host-ports invariant (no PortBindings).
- Factory real-mode wires the two dep-free real adapters (Docker socket + LiteLLM); pg/MinIO remain memory stand-ins with an explicit warning until their deps land.
- No changes to app-factory.ts/Caddyfile (which carry unrelated pre-existing changes).
