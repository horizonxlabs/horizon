# MVP Plan 2: Workspace HTTP Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Plan-1 workspace orchestrator reachable over HTTP — construct it in the platform-api service container, dispatch its provision/status/stop/wake routes, add an auth-gated preview reverse-proxy, and boot the idle sweep — so a Creator can provision a workspace and open its preview through the platform.

**Architecture:** The orchestrator (Plan 1) is added to `PlatformApiServices` using memory adapters (real Docker/Postgres/MinIO/LiteLLM deps are not installed yet — a separate follow-up swaps them in behind the same interfaces). Container routes are dispatched inside `executePlatformApiRequestAsync` (orchestrator methods are async). The preview proxy is a dep-free Node-`http` reverse proxy registered in the Express route layer, gated by `resolvePreviewTarget`.

**Tech Stack:** TypeScript, NestJS/Express route registry (`app.getHttpAdapter().getInstance()`), Node built-in `http`, existing `.mjs` + `node --import tsx --test` harness.

## Global Constraints

- Discovered path collision: `/projects/{id}/workspace` is ALREADY the Sprint-4 mock `WorkspaceService`. The orchestrator MUST use a distinct prefix: `/projects/{id}/workspace/container` (POST=provision, GET=status), `/projects/{id}/workspace/container/stop`, `/projects/{id}/workspace/container/wake`. Preview: `/preview/{slug}/*`.
- Orchestrator uses MEMORY adapters (real deps pg/dockerode/minio not installed). Construction gated so real adapters slot in later without touching call sites.
- Auth bridge: map the existing `PlatformUser` (has `.id`, `.roles`, `.projectIds`) to `WorkspaceAuthContext { userId, roles, projectIds }`. Never invent membership — use `user.projectIds`.
- Container routes are async → handle them at the TOP of `executePlatformApiRequestAsync`, before the persistence-mode fallthrough that early-returns `executePlatformApiRequest`.
- Secret values never leave the API: status route returns `secretNames` only.
- Every route emits an audit event via the existing audit service.
- Tests are `.mjs` via `node --import tsx --test`. `pnpm typecheck && pnpm verify:workspace` must pass after every task.
- git hygiene: stage only the files each task changes by explicit path; the working tree has unrelated pre-existing changes (including `docker/Caddyfile`). NEVER `git add -A/./-u`.

---

### Task 1: Orchestrator construction + auth bridge in the service container

**Files:**
- Create: `apps/platform-api/src/workspace-orchestrator/factory.ts`
- Modify: `apps/platform-api/src/platform-services.ts` (add `workspaceOrchestrator` to `PlatformApiServices` interface + construct it in `createPlatformApiServices`)
- Test: `tests/unit/workspace-service-wiring.test.mjs`

**Interfaces:**
- Consumes: `createWorkspaceOrchestrator` + memory adapter factories (Plan 1), `createProjectSecretStore`.
- Produces:
  - `createDefaultWorkspaceOrchestrator(opts?: { secretKeyHex?: string; onAudit?: (e) => void }): WorkspaceOrchestrator` — builds the orchestrator from memory adapters + a secret store (key from `opts.secretKeyHex` or `process.env.EVCP_WORKSPACE_SECRET_KEY` or a fixed 64-hex dev default).
  - `toWorkspaceAuthContext(user: { id: string; roles?: string[]; projectIds?: string[] }): WorkspaceAuthContext` (in factory.ts).
  - `services.workspaceOrchestrator` on `PlatformApiServices`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-service-wiring.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { toWorkspaceAuthContext, createDefaultWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/factory.ts"
);

test("service container exposes a workspace orchestrator", () => {
  const services = createPlatformApiServices();
  assert.ok(services.workspaceOrchestrator, "workspaceOrchestrator missing on services");
  assert.equal(typeof services.workspaceOrchestrator.provisionWorkspace, "function");
  assert.equal(typeof services.workspaceOrchestrator.getWorkspace, "function");
});

test("auth bridge maps platform user fields to workspace auth context", () => {
  const ctx = toWorkspaceAuthContext({ id: "u1", roles: ["creator"], projectIds: ["p1", "p2"] });
  assert.deepEqual(ctx, { userId: "u1", roles: ["creator"], projectIds: ["p1", "p2"] });
  const empty = toWorkspaceAuthContext({ id: "u2" });
  assert.deepEqual(empty, { userId: "u2", roles: [], projectIds: [] });
});

test("default orchestrator can provision against memory adapters", async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator();
  const record = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "demo-app" });
  assert.equal(record.state, "running");
  assert.ok(orchestrator.listSecretNames("p1").includes("DATABASE_URL"));
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/unit/workspace-service-wiring.test.mjs`
Expected: FAIL (factory module + services.workspaceOrchestrator missing).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/factory.ts`**

```ts
import { createWorkspaceOrchestrator, type WorkspaceOrchestrator } from "./orchestrator";
import { createPgClientPostgresProvisioner } from "./postgres-provisioner";
import { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } from "./resource-ports";
import { createProjectSecretStore } from "./secret-store";
import { createMemoryDockerEngine } from "./docker-engine";
import type { WorkspaceAuthContext } from "./routes";

const DEV_SECRET_KEY = "0".repeat(64);

export function createDefaultWorkspaceOrchestrator(opts: {
  secretKeyHex?: string;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
} = {}): WorkspaceOrchestrator {
  const encryptionKeyHex = opts.secretKeyHex ?? process.env.EVCP_WORKSPACE_SECRET_KEY ?? DEV_SECRET_KEY;
  return createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex }),
    docker: createMemoryDockerEngine(),
    onAudit: opts.onAudit
  });
}

export function toWorkspaceAuthContext(user: {
  id: string;
  roles?: string[];
  projectIds?: string[];
}): WorkspaceAuthContext {
  return {
    userId: user.id,
    roles: user.roles ?? [],
    projectIds: user.projectIds ?? []
  };
}
```

- [ ] **Step 4: Add to `PlatformApiServices`**

In `apps/platform-api/src/platform-services.ts`: add an import near the other imports:

```ts
import { createDefaultWorkspaceOrchestrator } from "./workspace-orchestrator/factory";
import type { WorkspaceOrchestrator } from "./workspace-orchestrator/orchestrator";
```

Add `workspaceOrchestrator: WorkspaceOrchestrator;` to the `PlatformApiServices` interface (near the `workspace: WorkspaceService;` member).

In `createPlatformApiServices`, after the existing services are built and before the `return`, construct:

```ts
  const workspaceOrchestrator = createDefaultWorkspaceOrchestrator({
    onAudit: (event) =>
      audit.record({
        actorId: "system",
        action: event.action,
        resourceType: "workspace_container",
        resourceId: event.projectId,
        metadata: event.metadata
      })
  });
```

and include `workspaceOrchestrator` in the returned object literal.

NOTE: `audit.record` signature — match the existing calls in this file (search for `audit.record(` and copy the exact field names; the snippet above assumes `{ actorId, action, resourceType, resourceId, metadata }`, adjust if the real signature differs).

- [ ] **Step 5: Run tests + typecheck**

Run: `node --import tsx --test tests/unit/workspace-service-wiring.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/factory.ts apps/platform-api/src/platform-services.ts tests/unit/workspace-service-wiring.test.mjs
git commit -m "feat(workspace): construct orchestrator in service container with auth bridge"
```

---

### Task 2: Dispatch container routes in executePlatformApiRequestAsync

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts` (path union + async dispatch)
- Test: `tests/integration/workspace-container-dispatch.test.mjs`

**Interfaces:**
- Consumes: `services.workspaceOrchestrator` (Task 1), `toWorkspaceAuthContext` (Task 1), `createWorkspaceRoutes` (Plan 1 routes.ts), existing `resolvePersistenceAuth`/`services.auth.resolveCurrentUser`.
- Produces: HTTP-dispatchable routes:
  - `POST /projects/:projectId/workspace/container` → 201 `{ workspace }`
  - `GET /projects/:projectId/workspace/container` → 200 `{ workspace, secretNames }`
  - `POST /projects/:projectId/workspace/container/stop` → 200 `{ workspace }`
  - `POST /projects/:projectId/workspace/container/wake` → 200 `{ workspace }`
  - 403 for non-members; 404 when no workspace.

- [ ] **Step 1: Write the failing integration test**

```js
// tests/integration/workspace-container-dispatch.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequestAsync } = await import("../../apps/platform-api/src/app-factory.ts");

function creatorHeaders(services) {
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  return { creator, headers: { "x-mock-user-email": "creator@company.com" } };
}

test("creator provisions a container and reads status with names-only secrets", async () => {
  const services = createPlatformApiServices();
  const { creator, headers } = creatorHeaders(services);
  const projectId = creator.projectIds?.[0];
  assert.ok(projectId, "seed creator must own a project");

  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${projectId}/workspace/container`,
    headers,
    body: { slug: "leave-tracker" }
  });
  assert.equal(created.status, 201);

  const status = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: `/projects/${projectId}/workspace/container`,
    headers
  });
  assert.equal(status.status, 200);
  const body = JSON.stringify(status.body);
  assert.ok(body.includes("DATABASE_URL"), "secret names present");
  assert.ok(!body.includes("postgresql://"), "no secret values leak");
});

test("non-member is forbidden", async () => {
  const services = createPlatformApiServices();
  // resolve a creator, then target a project id they do not own
  const headers = { "x-mock-user-email": "creator@company.com" };
  const res = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/non-existent-project/workspace/container`,
    headers,
    body: { slug: "x-y-z" }
  });
  assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/integration/workspace-container-dispatch.test.mjs`
Expected: FAIL (routes not dispatched → likely 404/unknown route).

- [ ] **Step 3: Add path literals to the `PlatformRequest` path union**

In `apps/platform-api/src/app-factory.ts`, in the union that currently has `` `/projects/${string}/workspace/preview/refresh` ``, add:

```ts
    | `/projects/${string}/workspace/container`
    | `/projects/${string}/workspace/container/stop`
    | `/projects/${string}/workspace/container/wake`
```

- [ ] **Step 4: Dispatch at the TOP of `executePlatformApiRequestAsync`**

Immediately after the `try {` inside `executePlatformApiRequestAsync` (BEFORE the persistence-mode branches), add a self-contained block that handles the container routes regardless of persistence mode. Use the existing auth resolver used elsewhere in the async fn (`resolvePersistenceAuth(services, request.headers ?? {})` when `corePersistence` is present, else `services.auth.resolveCurrentUser(request.headers ?? {})`). Import `toWorkspaceAuthContext` from `./workspace-orchestrator/factory` and `createWorkspaceRoutes` from `./workspace-orchestrator/routes` at the top of the file.

```ts
    const containerMatch = request.path.match(
      /^\/projects\/([^/]+)\/workspace\/container(?:\/(stop|wake))?$/
    );
    if (containerMatch) {
      const projectId = containerMatch[1];
      const action = containerMatch[2];
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const auth = toWorkspaceAuthContext(user);
      const routes = createWorkspaceRoutes({ orchestrator: services.workspaceOrchestrator });
      let result;
      if (request.method === "POST" && !action) {
        result = await routes.provision(auth, { projectId, slug: String(request.body?.slug ?? projectId) });
      } else if (request.method === "GET" && !action) {
        result = await routes.get(auth, { projectId });
      } else if (request.method === "POST" && action === "stop") {
        result = await routes.stop(auth, { projectId });
      } else if (request.method === "POST" && action === "wake") {
        result = await routes.wake(auth, { projectId });
      } else {
        return { status: HttpStatus.METHOD_NOT_ALLOWED, body: failure("method not allowed") };
      }
      return { status: result.status, body: result.status < 400 ? success(result.body) : failure(result.body.error ?? "error") };
    }
```

NOTE: match `success`/`failure` usage to how other handlers in this file wrap bodies (search existing `body: success(` calls). If the route already returns the final body shape you want, wrap consistently with siblings.

- [ ] **Step 5: Run tests + typecheck + full workspace gate**

Run: `node --import tsx --test tests/integration/workspace-container-dispatch.test.mjs && pnpm typecheck && pnpm verify:workspace`
Expected: PASS. If the seed creator has no `projectIds`, adjust the test to first create a project via the existing `POST /projects` route and use its id.

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/app-factory.ts tests/integration/workspace-container-dispatch.test.mjs
git commit -m "feat(workspace): dispatch container provision/status/stop/wake routes"
```

---

### Task 3: Express route registration + dep-free preview reverse proxy

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts` (`registerPlatformRoutes` + a proxy helper)
- Test: `tests/unit/workspace-preview-proxy.test.mjs`

**Interfaces:**
- Consumes: `resolvePreviewTarget` (Plan 1 routes.ts), `toWorkspaceAuthContext`, `services.workspaceOrchestrator`, `services.auth`.
- Produces:
  - Express routes registered: `routes.post/get("/projects/:projectId/workspace/container"...)`, `.../stop`, `.../wake` (delegating to `executePlatformApiRequestAsync`, mirroring existing registrations).
  - `routes.all("/preview/:slug/*", previewProxyHandler)` and `routes.all("/preview/:slug", ...)`.
  - `resolvePreviewProxyDecision(services, headers, slug): Promise<{ status: number } | { upstream: string; forwardPath: string }>` — a testable pure-ish resolver that runs auth + `resolvePreviewTarget` and returns either an error status or the upstream + path to forward. (The actual socket piping is thin and verified by the http smoke test, not unit-tested.)

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-preview-proxy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { resolvePreviewProxyDecision } = await import("../../apps/platform-api/src/app-factory.ts");

test("preview decision returns 401 without auth, 404 for unknown slug, upstream for member", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const projectId = creator.projectIds?.[0];
  assert.ok(projectId);

  // provision a container so a slug exists for this member
  await services.workspaceOrchestrator.provisionWorkspace({ projectId, slug: "leave-tracker" });

  const unauth = await resolvePreviewProxyDecision(services, {}, "leave-tracker");
  assert.equal(unauth.status, 401);

  const memberHeaders = { "x-mock-user-email": "creator@company.com" };
  const unknown = await resolvePreviewProxyDecision(services, memberHeaders, "no-such-slug");
  assert.equal(unknown.status, 404);

  const ok = await resolvePreviewProxyDecision(services, memberHeaders, "leave-tracker");
  assert.equal(ok.upstream, "http://evcp-ws-leave-tracker:3000");
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/unit/workspace-preview-proxy.test.mjs`
Expected: FAIL (`resolvePreviewProxyDecision` not exported).

- [ ] **Step 3: Implement `resolvePreviewProxyDecision` + proxy handler + register routes**

In `app-factory.ts`, import `resolvePreviewTarget` from `./workspace-orchestrator/routes` and Node `http` (`import * as nodeHttp from "node:http"`).

```ts
export async function resolvePreviewProxyDecision(
  services: PersistenceAwarePlatformApiServices,
  headers: HeaderBag,
  slug: string
): Promise<{ status: number } | { upstream: string; forwardPath: string }> {
  let auth = null;
  try {
    const user = services.auth.resolveCurrentUser(headers ?? {});
    auth = toWorkspaceAuthContext(user);
  } catch {
    auth = null;
  }
  const resolution = await resolvePreviewTarget(services.workspaceOrchestrator, auth, slug);
  if (!resolution.ok) {
    return { status: resolution.status };
  }
  return { upstream: resolution.upstream, forwardPath: "/" };
}
```

Register in `registerPlatformRoutes` (mirror the existing `routes.post/get(...)` style for the container JSON routes; for preview use a raw handler that pipes via `nodeHttp.request`):

```ts
  routes.post("/projects/:projectId/workspace/container", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${request.params.projectId}/workspace/container`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/workspace/container", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/projects/${request.params.projectId}/workspace/container`,
        headers: request.headers
      })
    )
  );
  for (const action of ["stop", "wake"]) {
    routes.post(`/projects/:projectId/workspace/container/${action}`, (request, response) =>
      sendPlatformResponseAsync(
        response,
        executePlatformApiRequestAsync(services, {
          method: "POST",
          path: `/projects/${request.params.projectId}/workspace/container/${action}`,
          headers: request.headers
        })
      )
    );
  }

  const previewHandler = async (request, response) => {
    const slug = request.params.slug;
    const decision = await resolvePreviewProxyDecision(services, request.headers, slug);
    if ("status" in decision) {
      response.status(decision.status).json({ error: "preview_unavailable" });
      return;
    }
    const target = new URL(decision.upstream);
    const proxyReq = nodeHttp.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        method: request.method,
        path: request.originalUrl.replace(new RegExp(`^/preview/${slug}`), "") || "/",
        headers: { ...request.headers, host: target.host }
      },
      (proxyRes) => {
        response.status(proxyRes.statusCode ?? 502);
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value !== undefined) response.setHeader(key, value);
        }
        proxyRes.pipe(response);
      }
    );
    proxyReq.on("error", () => {
      if (!response.headersSent) response.status(502).json({ error: "preview_upstream_unreachable" });
    });
    if (request.body && Object.keys(request.body).length > 0) {
      proxyReq.write(JSON.stringify(request.body));
    }
    proxyReq.end();
  };
  routes.all("/preview/:slug", previewHandler);
  routes.all("/preview/:slug/*", previewHandler);
```

NOTE: confirm `request.params`, `request.originalUrl`, and `response.status().json()` exist on the `RouteRegistry` request/response types used elsewhere in this file. If the registry uses a different request/response shape, adapt (the existing `routes.get/post` handlers show the exact shape).

- [ ] **Step 4: Run tests + typecheck + gate**

Run: `node --import tsx --test tests/unit/workspace-preview-proxy.test.mjs && pnpm typecheck && pnpm verify:workspace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/app-factory.ts tests/unit/workspace-preview-proxy.test.mjs
git commit -m "feat(workspace): register container routes and dep-free preview reverse proxy"
```

---

### Task 4: Boot the idle sweep + Caddyfile preview route

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts` (start sweep inside `createPlatformApiApp`)
- Modify: `docker/Caddyfile` (add `/preview/*` upstream) — SEE the git-hygiene note below
- Test: `tests/unit/workspace-app-sweep-boot.test.mjs`

**Interfaces:**
- Consumes: `startIdleSweep` (Plan 1), `services.workspaceOrchestrator`.
- Produces: `startWorkspaceIdleSweep(services): { stop(): void }` exported from app-factory; called in `createPlatformApiApp`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-app-sweep-boot.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { startWorkspaceIdleSweep } = await import("../../apps/platform-api/src/app-factory.ts");

test("startWorkspaceIdleSweep returns a stoppable handle bound to the services orchestrator", () => {
  const services = createPlatformApiServices();
  const handle = startWorkspaceIdleSweep(services, { intervalMs: 60_000 });
  assert.equal(typeof handle.stop, "function");
  handle.stop();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/unit/workspace-app-sweep-boot.test.mjs`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement + call in createPlatformApiApp**

In `app-factory.ts`, import `startIdleSweep` from `./workspace-orchestrator/orchestrator`, then:

```ts
export function startWorkspaceIdleSweep(
  services: PersistenceAwarePlatformApiServices,
  opts: { intervalMs?: number } = {}
): { stop(): void } {
  return startIdleSweep(services.workspaceOrchestrator, opts);
}
```

In `createPlatformApiApp`, after `registerPlatformRoutes(app, services);`:

```ts
  startWorkspaceIdleSweep(services);
```

- [ ] **Step 4: Run test + typecheck + gate**

Run: `node --import tsx --test tests/unit/workspace-app-sweep-boot.test.mjs && pnpm typecheck && pnpm verify:workspace`
Expected: PASS.

- [ ] **Step 5: Caddyfile — add preview upstream**

Add to `docker/Caddyfile` inside the `:80 { ... }` block, BEFORE the final `handle { reverse_proxy admin-web:4100 }`:

```caddyfile
	handle /preview/* {
		reverse_proxy platform-api:3100
	}
```

GIT-HYGIENE WARNING: `docker/Caddyfile` already has unrelated pre-existing working-tree changes (UI-redesign routing). Staging the whole file would sweep those in. Commit the app-factory + test changes SEPARATELY first (Step 6). For the Caddyfile, if `git add -p` interactive staging is unavailable, DO NOT stage the whole file — instead report the exact Caddyfile hunk in your report and leave it unstaged for the controller to apply on the branch that owns the Caddyfile changes. Note that platform-api listens on `:3100` and there is already an `/apps/*` route.

- [ ] **Step 6: Commit (app-factory + test only)**

```bash
git add apps/platform-api/src/app-factory.ts tests/unit/workspace-app-sweep-boot.test.mjs
git commit -m "feat(workspace): boot idle sweep with the platform app"
```

Report the Caddyfile hunk separately (do not stage the contaminated file).

---

## Deferred to later (do NOT build here)

- Real adapters: `createDockerodeEngine`, real `pg`-client Postgres runner, real MinIO provisioner, real LiteLLM key admin wired through `createDefaultWorkspaceOrchestrator` behind an env flag (`EVCP_WORKSPACE_REAL_ADAPTERS`). Requires adding deps (dockerode, pg, minio) — its own task.
- WebSocket/HMR upgrade proxying for `next dev` live reload (the current proxy handles HTTP request/response; `upgrade` events are a refinement).
- Integration tests against the real compose stack (schema isolation, real container start).
- `deleteWorkspace` cleanup path (tracked follow-up #12).

## Self-review notes

- Path collision with Sprint-4 `/projects/{id}/workspace` resolved via `/workspace/container` prefix (Global Constraints).
- Orchestrator async → dispatched in `executePlatformApiRequestAsync` top block (Task 2), reachable regardless of persistence mode.
- Memory adapters only (deps absent) — real adapters explicitly deferred; call sites unchanged when swapped.
- Preview proxy is dep-free Node `http`; auth-gated by `resolvePreviewProxyDecision` (Task 3).
- Caddyfile contamination handled by separate-commit + report-hunk instruction (Task 4).
