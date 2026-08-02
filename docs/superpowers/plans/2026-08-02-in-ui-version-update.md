# In-UI Version Update (B-sys + B3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An admin types a target tag in the Admin Console and clicks Update; platform-api bumps the 5 `evcp-*` app services to that tag via the Docker Engine API (updating itself last, fire-and-forget), and the UI polls until convergence.

**Architecture:** A generic `SwarmServiceEngine` (Docker API over the existing socket client) + a `system-update-service` that maps the app-service allowlist and orchestrates the roll + admin routes + an Admin System page that polls through the self-restart.

**Tech Stack:** Node/TypeScript, the existing `workspace-orchestrator/docker-socket-engine.ts` socket client, `@evcp/api-client`, `@evcp/ui`, Node test runner.

## Global Constraints

- Mechanism is the **Docker Engine API over the socket** (extend the existing `DockerRequestFn` client) — **no `docker` CLI added to any image**.
- Only these 5 app services are version-bumped (fixed allowlist); infra services are never touched:
  `evcp_platform-api→evcp-platform-api`, `evcp_admin-web→evcp-admin-web`, `evcp_creator-web→evcp-creator-web`, `evcp_app-store-pwa→evcp-app-store-pwa`, `evcp_workspace-next-image→evcp-workspace-next`.
- New image ref = `${EVCP_IMAGE_REPOSITORY}/<image-name>:<targetTag>`.
- `evcp_platform-api` is updated **last and not awaited** (it restarts). The endpoint returns `202` before the self-restart.
- Update status is **derived** (poll `GET /admin/system/version`), never stored in memory.
- `/admin/system/*` routes require the `admin` role (`auth.requireRole(actor, ["admin"])`, like other `/admin/*` routes).
- Target tag must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- Branch: `codex/in-ui-version-update` (off `codex/one-command-install`).

---

### Task 1: `SwarmServiceEngine` (Docker API over the socket)

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts` (export `nodeSocketRequest` so the new engine reuses the real transport)
- Create: `apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts`
- Test: `tests/unit/swarm-service-engine.test.mjs`

**Interfaces:**
- Consumes: `DockerRequestFn` (already exported from `docker-socket-engine.ts`) + `nodeSocketRequest` (newly exported).
- Produces: `createSwarmServiceEngine({ socketPath?, request? }) => SwarmServiceEngine` with `listStackServices(stack)` and `updateServiceImage(serviceName, image)`.

- [ ] **Step 1: Export the transport** — in `docker-socket-engine.ts` change `function nodeSocketRequest(` to `export function nodeSocketRequest(` (no other change).

- [ ] **Step 2: Write the failing test** `tests/unit/swarm-service-engine.test.mjs`

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { createSwarmServiceEngine } from "../../apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts";

function stub(routes) {
  const calls = [];
  const request = async ({ method, path, body }) => {
    calls.push({ method, path, body });
    const r = routes(method, path);
    return { status: r.status ?? 200, json: async () => r.json };
  };
  return { request, calls };
}

test("listStackServices filters by stack namespace and maps id/name/image", async () => {
  const { request, calls } = stub(() => ({
    json: [{ ID: "abc", Spec: { Name: "evcp_admin-web", TaskTemplate: { ContainerSpec: { Image: "repo/evcp-admin-web:v1" } } } }]
  }));
  const engine = createSwarmServiceEngine({ request });
  const services = await engine.listStackServices("evcp");
  assert.match(decodeURIComponent(calls[0].path), /com\.docker\.stack\.namespace=evcp/);
  assert.deepEqual(services, [{ id: "abc", name: "evcp_admin-web", image: "repo/evcp-admin-web:v1" }]);
});

test("updateServiceImage reads version+spec then POSTs the modified spec at ?version=N", async () => {
  const { request, calls } = stub((method, path) => {
    if (method === "GET") return { json: { Version: { Index: 42 }, Spec: { Name: "evcp_admin-web", TaskTemplate: { ContainerSpec: { Image: "old" } } } } };
    return { json: {} };
  });
  const engine = createSwarmServiceEngine({ request });
  await engine.updateServiceImage("evcp_admin-web", "repo/evcp-admin-web:v2");
  const post = calls.find((c) => c.method === "POST");
  assert.match(post.path, /\/services\/evcp_admin-web\/update\?version=42/);
  assert.equal(typeof post.body, "object");
  assert.equal(post.body.TaskTemplate.ContainerSpec.Image, "repo/evcp-admin-web:v2");
  assert.equal(post.body.TaskTemplate.ForceUpdate, 1);
});

test("updateServiceImage throws on a Docker error status", async () => {
  const { request } = stub(() => ({ status: 500, json: {} }));
  const engine = createSwarmServiceEngine({ request });
  await assert.rejects(() => engine.updateServiceImage("evcp_admin-web", "x"));
});
```

- [ ] **Step 3: Run, verify red** — `node --import tsx --test tests/unit/swarm-service-engine.test.mjs`.

- [ ] **Step 4: Implement `swarm-service-engine.ts`**

```ts
import { type DockerRequestFn, nodeSocketRequest } from "./docker-socket-engine";

export interface StackService {
  id: string;
  name: string;
  image: string;
}

export interface SwarmServiceEngine {
  listStackServices(stack: string): Promise<StackService[]>;
  updateServiceImage(serviceName: string, image: string): Promise<void>;
}

export function createSwarmServiceEngine(
  opts: { socketPath?: string; request?: DockerRequestFn } = {}
): SwarmServiceEngine {
  const request = opts.request ?? nodeSocketRequest(opts.socketPath ?? "/var/run/docker.sock");
  return {
    async listStackServices(stack) {
      const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.stack.namespace=${stack}`] }));
      const res = await request({ method: "GET", path: `/services?filters=${filters}` });
      if (res.status >= 400) throw new Error(`docker service list failed: ${res.status}`);
      const list = (await res.json()) as Array<Record<string, any>>;
      return list.map((s) => ({
        id: String(s.ID ?? ""),
        name: String(s.Spec?.Name ?? ""),
        image: String(s.Spec?.TaskTemplate?.ContainerSpec?.Image ?? "")
      }));
    },
    async updateServiceImage(serviceName, image) {
      const name = encodeURIComponent(serviceName);
      const res = await request({ method: "GET", path: `/services/${name}` });
      if (res.status >= 400) throw new Error(`docker service inspect ${serviceName} failed: ${res.status}`);
      const svc = (await res.json()) as Record<string, any>;
      const version = svc.Version?.Index;
      const spec = svc.Spec;
      spec.TaskTemplate.ContainerSpec.Image = image;
      spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate ?? 0) + 1;
      const upd = await request({
        method: "POST",
        path: `/services/${name}/update?version=${version}`,
        body: spec,
        contentType: "application/json"
      });
      if (upd.status >= 400) throw new Error(`docker service update ${serviceName} failed: ${upd.status}`);
    }
  };
}
```

- [ ] **Step 5: Green + typecheck** — test passes; `pnpm --filter @evcp/platform-api typecheck`.
- [ ] **Step 6: Commit** — `feat(platform-api): SwarmServiceEngine (docker service list/update via socket API)`

---

### Task 2: system-update-service + admin routes

**Files:**
- Create: `apps/platform-api/src/system/system-update-service.ts`
- Create: `apps/platform-api/src/system/system-routes.ts` (mirrors `setup-routes.ts` registration)
- Modify: `apps/platform-api/src/app-factory.ts` (wire the service + register routes; construct `createSwarmServiceEngine()`), and add `getSystemVersion`/`updateToVersion` to the `@evcp/api-client` client + `/admin/system/*` to `platform-http-types.ts`
- Test: `tests/unit/system-update-service.test.mjs`

**Interfaces:**
- Consumes: `SwarmServiceEngine` (Task 1), `auth.requireRole`.
- Produces: `createSystemUpdateService({ engine, env? })` with `getSystemVersion()` → `{ currentVersion, imageRepository, appServices: [{name,image,tag}] }` and `updateToVersion(tag)` → `{ accepted: true, targetVersion }`; routes `GET /admin/system/version`, `POST /admin/system/update`.

- [ ] **Step 1: Write the failing test** `tests/unit/system-update-service.test.mjs`

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { createSystemUpdateService } from "../../apps/platform-api/src/system/system-update-service.ts";

function fakeEngine() {
  const updates = [];
  return {
    updates,
    async listStackServices() {
      return [
        { id: "1", name: "evcp_platform-api", image: "repo/evcp-platform-api:v1" },
        { id: "2", name: "evcp_admin-web", image: "repo/evcp-admin-web:v1" },
        { id: "3", name: "evcp_postgres", image: "postgres:16-alpine" }
      ];
    },
    async updateServiceImage(name, image) { updates.push({ name, image }); }
  };
}

test("getSystemVersion returns EVCP_VERSION + only the app services", async () => {
  const svc = createSystemUpdateService({ engine: fakeEngine(), env: { EVCP_VERSION: "v1", EVCP_IMAGE_REPOSITORY: "repo" } });
  const v = await svc.getSystemVersion();
  assert.equal(v.currentVersion, "v1");
  assert.deepEqual(v.appServices.map((s) => s.name).sort(), ["evcp_admin-web", "evcp_platform-api"]);
  assert.equal(v.appServices.find((s) => s.name === "evcp_admin-web").tag, "v1");
});

test("updateToVersion rejects a bad tag", async () => {
  const svc = createSystemUpdateService({ engine: fakeEngine(), env: { EVCP_IMAGE_REPOSITORY: "repo" } });
  await assert.rejects(() => svc.updateToVersion("bad tag!"), /invalid/i);
});

test("updateToVersion bumps every app service and does platform-api LAST", async () => {
  const engine = fakeEngine();
  const svc = createSystemUpdateService({ engine, env: { EVCP_IMAGE_REPOSITORY: "repo" } });
  const r = await svc.updateToVersion("v2");
  assert.deepEqual(r, { accepted: true, targetVersion: "v2" });
  // platform-api is fire-and-forget; give the microtask a tick
  await new Promise((res) => setTimeout(res, 10));
  const names = engine.updates.map((u) => u.name);
  assert.ok(!names.slice(0, -1).includes("evcp_platform-api"), "platform-api must not be updated before the others");
  assert.equal(names[names.length - 1], "evcp_platform-api");
  assert.ok(engine.updates.every((u) => u.image.endsWith(":v2")));
  assert.ok(engine.updates.some((u) => u.image === "repo/evcp-workspace-next:v2"));
});
```

- [ ] **Step 2: Run, verify red.**

- [ ] **Step 3: Implement `system-update-service.ts`**

```ts
import type { SwarmServiceEngine } from "../workspace-orchestrator/swarm-service-engine";

// service name -> image name. The 5 app services bumped on version update; infra is never touched.
const APP_SERVICES: Record<string, string> = {
  "evcp_platform-api": "evcp-platform-api",
  "evcp_admin-web": "evcp-admin-web",
  "evcp_creator-web": "evcp-creator-web",
  "evcp_app-store-pwa": "evcp-app-store-pwa",
  "evcp_workspace-next-image": "evcp-workspace-next"
};
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class InvalidVersionTag extends Error {}

export function createSystemUpdateService(deps: { engine: SwarmServiceEngine; env?: NodeJS.ProcessEnv }) {
  const env = deps.env ?? process.env;
  const stack = "evcp";
  return {
    async getSystemVersion() {
      const services = await deps.engine.listStackServices(stack);
      const appServices = services
        .filter((s) => s.name in APP_SERVICES)
        .map((s) => ({ name: s.name, image: s.image, tag: s.image.split(":").pop() ?? "" }));
      return { currentVersion: env.EVCP_VERSION ?? "", imageRepository: env.EVCP_IMAGE_REPOSITORY ?? "", appServices };
    },
    async updateToVersion(targetTag: string) {
      if (!TAG_RE.test(targetTag)) throw new InvalidVersionTag("invalid version tag");
      const repo = env.EVCP_IMAGE_REPOSITORY;
      if (!repo) throw new Error("EVCP_IMAGE_REPOSITORY is not set");
      const ref = (svc: string) => `${repo}/${APP_SERVICES[svc]}:${targetTag}`;
      for (const svc of Object.keys(APP_SERVICES)) {
        if (svc === "evcp_platform-api") continue;
        await deps.engine.updateServiceImage(svc, ref(svc));
      }
      // Self last, fire-and-forget: this restarts platform-api, so do not await; the UI polls.
      void deps.engine.updateServiceImage("evcp_platform-api", ref("evcp_platform-api")).catch(() => {});
      return { accepted: true, targetVersion: targetTag };
    }
  };
}
```

- [ ] **Step 4: `system-routes.ts`** — mirror `setup-routes.ts`: register `GET /admin/system/version` and `POST /admin/system/update`; both call `auth.requireRole(actor, ["admin"])` first; map `InvalidVersionTag` → 400, success → 200/`202`. Wire in `app-factory.ts` (build `createSwarmServiceEngine()` + `createSystemUpdateService`, then `registerSystemRoutes(routes, …)`). Add the two paths to `platform-http-types.ts` and the two methods to the `@evcp/api-client` `PlatformApiClient` (`getSystemVersion()`, `updateSystemVersion(version)`), with DTO types in a `system-types.ts` sibling.

- [ ] **Step 5: Green + `pnpm check`** — unit tests pass; typecheck + lint clean.
- [ ] **Step 6: Commit** — `feat(platform-api): /admin/system version + update endpoints`

---

### Task 3: Admin Console System / Version page

**Files:**
- Create: `apps/admin-web/src/features/platform-operations/use-system-update.ts` (hook), a `SystemUpdatePanel` component/page, and wire it into the admin routes/nav (follow the existing feature → hook → page layout and `@evcp/ui` primitives).
- Test: extend the admin render-smoke harness (`tests/unit/admin-web-render-smoke.test.mjs`).

**Interfaces:**
- Consumes: `client.getSystemVersion()`, `client.updateSystemVersion(version)`.
- Produces: an admin-only page showing `currentVersion` + each app service's tag, a target-tag input, and an **Update** button (with a confirm dialog) that, on submit, enters an "Updating…" state and **polls `getSystemVersion()`** (retrying through the platform-api restart / network errors) until every app service reports the target tag, then shows "Updated to `<tag>`".

- [ ] **Step 1:** Add `use-system-update.ts`: `load()` (fetch version), `update(tag)` (POST then start polling), and polling state (`idle | updating | done | error`) with retry-through-error. Pure logic in `lib`, stateful glue in the hook (per the frontend conventions).
- [ ] **Step 2:** Build the page/panel from `@evcp/ui` primitives (Card/Field/Input/Button/Badge/Table) — no app-local styles.
- [ ] **Step 3:** Extend `tests/unit/admin-web-render-smoke.test.mjs` so the panel renders without throwing.
- [ ] **Step 4:** `pnpm check` (typecheck + design-system + render-smoke) green.
- [ ] **Step 5: Commit** — `feat(admin-web): System page — view version + one-click update`

---

### Task 4: Live update smoke (controller-run, gated)

**Files:** none (verification) — optionally add notes to `docs/operations/swarm-deploy.md`.

- [ ] **Step 1:** On the local swarm running `evcp-local/*:test`, build the 5 images again tagged `:test2` (`docker build … -t evcp-local/evcp-*:test2`).
- [ ] **Step 2:** As admin, `POST /admin/system/update {"version":"test2"}` (or via the UI). Assert 202.
- [ ] **Step 3:** Poll `docker service ls` + `GET /admin/system/version` until all 5 app services report `:test2`, including `evcp_platform-api` after its restart. Confirm `/api/setup/status` still 200 (migrations ran, DB intact).
- [ ] **Step 4:** Confirm infra services were NOT changed (still their pinned images).
- [ ] **Step 5:** Document the version-update flow (+ the "structural compose changes still need install.sh" caveat) in the runbook; commit.

---

## Self-review notes

- **Coverage:** engine (T1), service+routes+client (T2), UI (T3), live (T4). Matches spec components.
- **Allowlist consistency:** the 5 service→image names are identical in the spec Global Constraints, the service `APP_SERVICES` map, and the T4 smoke.
- **Self-update last & not awaited:** enforced by the T2 test (`platform-api` is the last update and fire-and-forget).
- **No CLI:** T1 uses only the socket `DockerRequestFn`; no image/Dockerfile change.
