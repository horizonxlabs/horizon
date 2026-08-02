# In-UI Domain + TLS "Go Live" (B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From the Admin Console, an admin sets a domain; caddy/keycloak/platform-api switch to `https://<domain>` (Caddy auto-TLS), Keycloak redirect URIs are reconciled, and the change is durable across redeploys via a `domain.env` override.

**Architecture:** Extend `SwarmServiceEngine` with `updateServiceEnv`; a `domain-service` persists the domain (Postgres + `domain.env`), reconciles Keycloak, and rolls the services (platform-api last); `bootstrap-swarm.sh` sources `domain.env`; an Admin Domain page drives it.

**Tech Stack:** Node/TS, the socket `SwarmServiceEngine` (B-sys), `KeycloakAdminClient`, `BusinessSettingsRepositoryBackedService`, `@evcp/api-client`, `@evcp/ui`, POSIX sh (bootstrap).

## Global Constraints

- Reuse `SwarmServiceEngine` (Docker API over the socket) — no docker CLI.
- Domain vars: caddy `EVCP_CADDY_ADDRESS=<domain>` + `EVCP_STORAGE_CADDY_ADDRESS=storage.<domain>`; keycloak `KC_HOSTNAME=https://<domain>/auth`; platform-api `EVCP_PUBLIC_API_URL=https://<domain>/api`, `EVCP_ADMIN_WEB_URL`/`EVCP_CREATOR_WEB_URL`/`EVCP_STORE_WEB_URL=https://<domain>`, `EVCP_S3_PUBLIC_URL=https://storage.<domain>`, `KEYCLOAK_PUBLIC_URL=https://<domain>/auth`, `KEYCLOAK_ISSUER_URL=https://<domain>/auth/realms/<realm>`.
- Keycloak `evcp-platform-api` client `redirectUris` reconciled to `https://<domain>/api/auth/keycloak/callback` via `KeycloakAdminClient`.
- Durable: `domain.env` in `${STACK_ENV_DIR:-/opt/evcp}` (bind-mounted into platform-api at `/etc/evcp/host`, `EVCP_STACK_ENV_DIR=/etc/evcp/host`); `bootstrap-swarm.sh deploy_stack` sources it after `stack.env`.
- `platform-api` rolled **last, fire-and-forget** (same as B3). Admin-only routes. Domain validated `^([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$` (lowercased).
- Branch: `codex/in-ui-domain` (off `codex/in-ui-version-update`).

---

### Task 1: `updateServiceEnv` (engine env merge)

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts`
- Test: `tests/unit/swarm-service-engine.test.mjs` (extend)

**Interfaces:**
- Produces: `SwarmServiceEngine.updateServiceEnv(serviceName, envPatch: Record<string,string>): Promise<void>`.

- [ ] **Step 1: Add failing tests** to `swarm-service-engine.test.mjs`:

```javascript
test("updateServiceEnv merges the patch into the Env array (replace + append) and posts the raw object", async () => {
  const { request, calls } = stub((method) => {
    if (method === "GET") return { json: { Version: { Index: 7 }, Spec: { Name: "evcp_caddy", TaskTemplate: { ContainerSpec: { Image: "caddy", Env: ["EVCP_CADDY_ADDRESS=:80", "OTHER=x"] } } } } };
    return { json: {} };
  });
  const engine = createSwarmServiceEngine({ request });
  await engine.updateServiceEnv("evcp_caddy", { EVCP_CADDY_ADDRESS: "app.example.com", NEW: "1" });
  const post = calls.find((c) => c.method === "POST");
  assert.match(post.path, /\/services\/evcp_caddy\/update\?version=7/);
  assert.equal(typeof post.body, "object");
  const env = post.body.TaskTemplate.ContainerSpec.Env;
  assert.ok(env.includes("EVCP_CADDY_ADDRESS=app.example.com"));   // replaced
  assert.ok(env.includes("OTHER=x"));                               // preserved
  assert.ok(env.includes("NEW=1"));                                 // appended
  assert.ok(!env.includes("EVCP_CADDY_ADDRESS=:80"));               // old removed
  assert.equal(post.body.TaskTemplate.ForceUpdate, 1);
});
```

- [ ] **Step 2: Run, verify red.**
- [ ] **Step 3: Implement** `updateServiceEnv` in the engine (mirror `updateServiceImage`'s read-modify-write):

```ts
async updateServiceEnv(serviceName, envPatch) {
  const name = encodeURIComponent(serviceName);
  const res = await request({ method: "GET", path: `/services/${name}` });
  if (res.status >= 400) throw new Error(`docker service inspect ${serviceName} failed: ${res.status}`);
  const svc = (await res.json()) as Record<string, any>;
  const version = svc.Version?.Index;
  const spec = svc.Spec;
  const cs = spec.TaskTemplate.ContainerSpec;
  const env: string[] = Array.isArray(cs.Env) ? [...cs.Env] : [];
  for (const [k, v] of Object.entries(envPatch)) {
    const i = env.findIndex((e) => e.startsWith(`${k}=`));
    if (i >= 0) env[i] = `${k}=${v}`;
    else env.push(`${k}=${v}`);
  }
  cs.Env = env;
  spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate ?? 0) + 1;
  const upd = await request({ method: "POST", path: `/services/${name}/update?version=${version}`, body: spec, contentType: "application/json" });
  if (upd.status >= 400) throw new Error(`docker service update ${serviceName} failed: ${upd.status}`);
}
```
Add `updateServiceEnv` to the `SwarmServiceEngine` interface.

- [ ] **Step 4: Green + typecheck.** **Step 5: Commit** — `feat(platform-api): SwarmServiceEngine.updateServiceEnv`

---

### Task 2: Durability plumbing — bootstrap `domain.env` + compose bind mount

**Files:**
- Modify: `scripts/install/bootstrap-swarm.sh` (source `domain.env` in `deploy_stack`)
- Modify: `docker/docker-compose.release.yml` (platform-api bind mount + `EVCP_STACK_ENV_DIR`)
- Test: `tests/integration/swarm-stack-contract.test.mjs` (assert the bind mount + env) and `tests/unit/bootstrap-swarm.test.mjs` (assert `domain.env` is sourced when present)

- [ ] **Step 1: bootstrap `deploy_stack`** — after the `. "$STACK_ENV_PATH"` line (inside the `set -a` block), add:
  ```sh
  [ -f "${STACK_ENV_DIR}/domain.env" ] && . "${STACK_ENV_DIR}/domain.env"
  ```
- [ ] **Step 2: compose** — add to `platform-api`:
  ```yaml
      environment:
        EVCP_STACK_ENV_DIR: /etc/evcp/host
      volumes:
        - /var/run/docker.sock:/var/run/docker.sock
        - type: bind
          source: ${EVCP_STACK_ENV_DIR:-/opt/evcp}
          target: /etc/evcp/host
  ```
  (merge with the existing docker.sock volume; keep the entrypoint/command/secrets as-is).
- [ ] **Step 3: contract test** — assert platform-api bind-mounts the host config dir at `/etc/evcp/host` and sets `EVCP_STACK_ENV_DIR`; assert bootstrap sources `domain.env` (grep the script or a dry-run that reports it).
- [ ] **Step 4: `docker stack config` renders** (add `EVCP_STACK_ENV_DIR` to the CI validate step env if it becomes required). **Step 5:** `pnpm check` green. **Step 6: Commit** — `feat(deploy): durable domain.env override sourced by bootstrap + platform-api config bind mount`

---

### Task 3: `domain-service` + business-settings domain + admin routes

**Files:**
- Modify: `apps/platform-api/src/persistence/business-settings-repositories.ts` (add optional `domain` to record/input/upsert; both memory + prisma clients)
- Create: `apps/platform-api/src/system/domain-service.ts`, `apps/platform-api/src/system/domain-routes.ts` (mirror system-routes)
- Modify: `app-factory.ts` (wire domain-service with the engine + business-settings + a KeycloakAdminClient + an fs writer), `platform-http-types.ts`, `@evcp/api-client` (`getDomainStatus`, `setDomain` + DTOs)
- Test: `tests/unit/domain-service.test.mjs`

**Interfaces:**
- Consumes: `SwarmServiceEngine.updateServiceEnv`, `BusinessSettingsRepositoryBackedService`, `KeycloakAdminClient`, a `writeFile`-like fn (injectable for tests).
- Produces: `createDomainService({ engine, settings, keycloak?, writeDomainEnv, env? })` with `getDomainStatus()` and `setDomain(domain)`; routes `GET/POST /admin/system/domain` (admin-only).

- [ ] **Step 1: Failing test** `tests/unit/domain-service.test.mjs` — stub engine (record `updateServiceEnv` calls), settings (record domain), keycloak (record redirect reconcile), and `writeDomainEnv` (capture content). Assert `setDomain("app.example.com")`:
  - rejects a bad domain (`"not a domain"`, `"http://x"`) with a validation error;
  - persists `domain` to settings;
  - writes a `domain.env` containing `EVCP_CADDY_ADDRESS=app.example.com`, `EVCP_PUBLIC_API_URL=https://app.example.com/api`, `EVCP_S3_PUBLIC_URL=https://storage.app.example.com`, `KEYCLOAK_ISSUER_URL=https://app.example.com/auth/realms/evcp`, etc. (no secret values);
  - reconciles the Keycloak redirect URI to `https://app.example.com/api/auth/keycloak/callback`;
  - rolls `evcp_caddy`, `evcp_keycloak`, then `evcp_platform-api` **last and not awaited**;
  - returns `{ accepted: true, domain: "app.example.com" }`.

- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement `domain-service.ts`** per the spec Component 2 (validate → compute URL set → persist settings → write `domain.env` → reconcile Keycloak client `redirectUris`/`webOrigins` via `KeycloakAdminClient` (GET `/clients?clientId=evcp-platform-api` → PUT `/clients/<id>`) → `updateServiceEnv` caddy/keycloak/platform-api with platform-api `void ....catch()` last). Keep the KeycloakAdminClient optional (skip reconcile if not configured, log a warning).
- [ ] **Step 4: `domain-routes.ts`** mirroring `system-routes.ts` (admin guard, validation error → 400, 200/202). Wire in `app-factory.ts` (build a `KeycloakAdminClient` from `readKeycloakConfig(env)` when `KEYCLOAK_ISSUER_URL` set; `writeDomainEnv` = `fs.writeFileSync(${EVCP_STACK_ENV_DIR}/domain.env, …, {mode:0o600})`). Add paths + client methods + DTOs.
- [ ] **Step 5: Green + `pnpm check`.** **Step 6: Commit** — `feat(platform-api): /admin/system/domain go-live (reconfigure + durable domain.env + keycloak reconcile)`

---

### Task 4: Admin Domain page

**Files:**
- Create: `apps/admin-web/src/features/platform-operations/{DomainPanel.tsx, use-domain.ts, lib/domain.ts}` + wire into nav/routes.
- Test: extend `tests/unit/admin-web-render-smoke.test.mjs`.

- [ ] **Step 1:** `lib/domain.ts` pure helper (e.g. `isValidDomain(str)` + `derivePublicUrls(domain)` for display). `use-domain.ts` hook: `load()` (getDomainStatus), `goLive(domain)` (POST then poll the site/status until `https://<domain>` answers, retrying through the caddy/platform-api restart), states `idle|applying|live|error`.
- [ ] **Step 2:** `DomainPanel.tsx` presentational — current domain/URL, a domain input, a **Go live** button with a confirm dialog that clearly warns *"point `<domain>` + `storage.<domain>` DNS at this server first"*, and the applying/live/error state. `@evcp/ui` only.
- [ ] **Step 3:** wire into admin nav/routes; extend render-smoke.
- [ ] **Step 4:** `pnpm check` green. **Step 5: Commit** — `feat(admin-web): Domain page — set domain + TLS go-live`

---

### Task 5: Live smoke (controller-run, gated)

- [ ] **Step 1:** On the local swarm, `setDomain("app.localhost")` (via the service/route). Assert: `evcp_caddy`/`evcp_keycloak`/`evcp_platform-api` env rolled to the domain (`docker service inspect … Env`); `domain.env` written on the host with the expected values; Keycloak `evcp-platform-api` `redirectUris` updated (query Keycloak); platform-api rolled last.
- [ ] **Step 2:** Prove durability: `docker stack deploy` (or `bootstrap-swarm.sh` re-run) → confirm the services keep the domain env (sourced from `domain.env`), not the IP-first values.
- [ ] **Step 3:** Note that a real public Let's Encrypt cert needs a public domain/DNS (out of the local test's reach); document the go-live + DNS precondition in `docs/operations/swarm-deploy.md`. **Commit.**

---

## Self-review notes

- **Coverage:** engine env-update (T1), durability plumbing (T2), domain-service+routes+persistence (T3), UI (T4), live (T5). Matches spec components.
- **Consistency:** the domain var set is identical in Global Constraints, `domain-service`, and the T5 assertions; platform-api rolled last in both T1-consuming service and the test.
- **Durability:** `domain.env` write (T3) + bootstrap source (T2) + Postgres source-of-truth (T3) — all three present.
- **No CLI / raw-object body:** T1 mirrors the B3 engine fix.
