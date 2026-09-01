# Publish Subdomain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Creator select a unique platform-managed subdomain during App Store publishing, display it in Store, and securely launch the published app at that host while preserving the existing path URL.

**Architecture:** Add one shared subdomain contract, persist the normalized label on the App Store registry, and perform an authoritative availability preflight before the container build. Caddy rewrites platform-owned wildcard hosts to an internal Platform API route; Platform API resolves the host to a healthy published deployment and proxies it through the existing runtime path. Store-to-subdomain authentication uses a Redis-backed, host-bound, single-use launch grant so bearer tokens never enter URLs.

**Tech Stack:** TypeScript 7, React 19, Nest/Express HTTP adapter, Prisma 6 with PostgreSQL, Redis, Caddy, pnpm, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-27-publish-subdomain-design.md`

## Global Constraints

- Keep `/apps/<resource-key>` operational for existing registry rows, direct access, rollback, and Store fallback.
- Accept only a label, never a scheme, port, path, wildcard, or full URL, from Creator clients.
- Derive `subdomainUrl` on Platform API from trusted configuration; web clients must not compose production hostnames.
- Use `EVCP_APP_SUBDOMAIN_BASE_DOMAIN`; default to `.localhost` in local development and require platform-owned wildcard DNS/TLS outside local development.
- Keep custom-domain/DNS controls visible but disabled. Do not add DNS mutation or verification endpoints.
- Run validation and friendly uniqueness preflight before Docker build; retain the database unique index for concurrent-publish races.
- Do not update the registry label until the runtime is healthy and registry publishing succeeds. A failed republish must retain the previous label and deployment.
- Launch grants must be opaque, cryptographically random, expire after 60 seconds, be consumed atomically, and be bound to both app and host.
- Never log launch grant IDs or bearer tokens. Continue stripping `authorization` and `cookie` before forwarding requests to generated app containers.
- Preserve unrelated dirty-worktree changes in `apps/platform-api/src/publish/factory.ts`, `tests/unit/publish-workspace-recovery.test.mjs`, and `docs/superpowers/plans/2026-08-24-creator-enterprise-ux-refresh.md`.
- Use the `frontend-design` skill when implementing the Creator and Store UI tasks.

---

### Task 1: Shared Subdomain Contract and API Client Types

**Files:**

- Create: `packages/api-client/src/publish-subdomain.ts`
- Modify: `packages/api-client/src/deployment-types.ts`
- Modify: `packages/api-client/src/storefront-types.ts`
- Modify: `packages/api-client/src/index.ts`
- Create: `tests/unit/publish-subdomain.test.mjs`

**Interfaces:**

- Produces `RESERVED_SUBDOMAINS`, `normalizeSubdomainSuggestion`, `validateSubdomainLabel`, `subdomainFromHostname`, and `buildSubdomainUrl`.
- Adds `AppStorePublishInput = { subdomain: string }`.
- Adds `PublishAccessUrlConfigDto = { baseDomain: string; secure: boolean; port?: number }` to `PublishReviewResponse`; the API populates it from trusted runtime configuration for the pre-publish preview.
- Adds optional `subdomain` and `subdomainUrl` to App Store registry, publish-result, card, and detail DTOs.
- Changes the app-store overload to `publishProject(projectId, input)` while preserving the staging/production overload.
- Changes Store launch response to `{ authorized: true; launchUrl: string }`.

- [ ] **Step 1: Write failing normalization, validation, hostname, and URL tests**

Create `tests/unit/publish-subdomain.test.mjs` with table-driven coverage:

```js
import test from "node:test";
import assert from "node:assert/strict";

const {
  buildSubdomainUrl,
  normalizeSubdomainSuggestion,
  subdomainFromHostname,
  validateSubdomainLabel
} = await import("../../packages/api-client/src/publish-subdomain.ts");

test("normalizes a project name and falls back to the resource key", () => {
  assert.equal(normalizeSubdomainSuggestion("Sales KPI Board", "prj-42"), "sales-kpi-board");
  assert.equal(normalizeSubdomainSuggestion("สวัสดี", "prj-42"), "prj-42");
  assert.equal(normalizeSubdomainSuggestion("A---B", "prj-42"), "a-b");
});

test("rejects malformed and reserved labels", () => {
  for (const label of ["ab", "Admin", "admin", "-sales", "sales-", "sales--ops", "sales.ops"])
    assert.equal(validateSubdomainLabel(label).ok, false, label);
  assert.deepEqual(validateSubdomainLabel("sales-2026"), { ok: true, value: "sales-2026" });
});

test("extracts only a direct child of the configured base domain", () => {
  assert.equal(subdomainFromHostname("sales.localhost", "localhost"), "sales");
  assert.equal(subdomainFromHostname("sales.apps.example.com", "apps.example.com"), "sales");
  assert.equal(subdomainFromHostname("deep.sales.localhost", "localhost"), null);
  assert.equal(subdomainFromHostname("localhost", "localhost"), null);
});

test("builds server-owned local and TLS URLs", () => {
  assert.equal(
    buildSubdomainUrl("sales", { baseDomain: "localhost", port: 9800 }),
    "http://sales.localhost:9800"
  );
  assert.equal(
    buildSubdomainUrl("sales", { baseDomain: "apps.example.com", secure: true }),
    "https://sales.apps.example.com"
  );
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/publish-subdomain.test.mjs
```

Expected: FAIL because `publish-subdomain.ts` does not exist.

- [ ] **Step 3: Implement the shared pure functions**

Use an anchored label expression and a discriminated result:

```ts
export const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "api",
  "auth",
  "creator",
  "store",
  "storage",
  "www"
]);

export type SubdomainValidation =
  { ok: true; value: string } | { ok: false; code: "SUBDOMAIN_INVALID"; message: string };

const LABEL = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,61}[a-z0-9]$/;
```

Normalization must lowercase, replace each non-ASCII-alphanumeric run with one hyphen, trim hyphens, fall back when empty, trim to 63 characters, and trim a trailing hyphen after truncation. `subdomainFromHostname` must lowercase and remove a numeric port before matching exactly one label plus the configured suffix.

- [ ] **Step 4: Extend DTOs and client overloads**

Export `AppStorePublishInput`, `PublishAccessUrlConfigDto`, and the helpers from `packages/api-client/src/index.ts`. Extend `PublishReviewResponse` with required `accessUrlConfig: PublishAccessUrlConfigDto`; its values always come from Platform API configuration, never from a frontend environment variable. The app-store overload must send the label:

```ts
publishProject(projectId: string, input: AppStorePublishInput): Promise<PublishResultResponse>;

authorizeStoreAppLaunch(
  appSlug: string,
  routePath: string
): Promise<{ authorized: true; launchUrl: string }>;
```

Do not change the existing `publishProject(projectId, environment, slug?)` request body.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/publish-subdomain.test.mjs
pnpm --filter @evcp/api-client typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the shared contract**

```bash
git add packages/api-client/src/publish-subdomain.ts packages/api-client/src/deployment-types.ts packages/api-client/src/storefront-types.ts packages/api-client/src/index.ts tests/unit/publish-subdomain.test.mjs
git commit -m "feat: add publish subdomain contract"
```

---

### Task 2: Persist Unique Registry Subdomains

**Files:**

- Modify: `apps/platform-api/prisma/schema.prisma`
- Create: `apps/platform-api/prisma/migrations/20260827010000_app_store_registry_subdomain/migration.sql`
- Modify: `apps/platform-api/src/persistence/publish-store-persistence-types.ts`
- Modify: `apps/platform-api/src/persistence/memory-publish-store-persistence-client.ts`
- Modify: `apps/platform-api/src/persistence/publish-store-repositories.ts`
- Modify: `apps/platform-api/src/platform-services.ts`
- Modify: `tests/unit/platform-app-publish-services.test.mjs`
- Create: `tests/integration/publish-subdomain-persistence.test.mjs`

**Interfaces:**

- Adds nullable unique `subdomain` to `AppStoreRegistryEntry`.
- Repository lookup accepts `subdomain` and exposes `assertSubdomainAvailable(actor, projectId, label)`.
- Registry mappings and Store cards include server-derived `subdomainUrl` when a label exists.

- [ ] **Step 1: Write failing service and persistence tests**

Add cases proving:

1. The same project may republish its current label.
2. Another project receives a typed `SUBDOMAIN_TAKEN` conflict.
3. Existing rows with `subdomain: null` still map to the path route.
4. Registry output includes the label and a configured URL.
5. The SQL migration creates a nullable column and unique index.

Run:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/platform-app-publish-services.test.mjs tests/integration/publish-subdomain-persistence.test.mjs
```

Expected: FAIL on the missing field and lookup behavior.

- [ ] **Step 2: Add the database field and migration**

Update the Prisma model:

```prisma
subdomain String? @unique
```

Use explicit SQL compatible with existing rows:

```sql
ALTER TABLE "AppStoreRegistryEntry" ADD COLUMN "subdomain" TEXT;
CREATE UNIQUE INDEX "AppStoreRegistryEntry_subdomain_key"
  ON "AppStoreRegistryEntry"("subdomain");
```

- [ ] **Step 3: Extend persistence ports and both adapters**

Add `subdomain: string | null` to `AppStoreRegistryEntryRecord`, accept `subdomain?: string` in registry `findFirst`, and include the field in upsert create/update input. Update the memory adapter before repository service code so tests exercise the same uniqueness behavior without Prisma.

Define a domain error with stable API fields:

```ts
export class SubdomainConflictError extends Error {
  readonly code = "SUBDOMAIN_TAKEN";
  readonly status = 409;
}
```

`assertSubdomainAvailable` must return the normalized label when no row exists or the row belongs to the same project; otherwise throw `SubdomainConflictError`.

- [ ] **Step 4: Map the field through registry, publish, and Store outputs**

Centralize URL derivation in the service constructor/config instead of web clients. Preserve `route` as the existing path URL and add optional `subdomain`/`subdomainUrl`. Mirror compatibility changes in the in-memory service in `platform-services.ts`.

- [ ] **Step 5: Generate Prisma client and run focused verification**

```bash
pnpm --filter @evcp/platform-api prisma:generate
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/platform-app-publish-services.test.mjs tests/integration/publish-subdomain-persistence.test.mjs
pnpm --filter @evcp/platform-api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add apps/platform-api/prisma/schema.prisma apps/platform-api/prisma/migrations/20260827010000_app_store_registry_subdomain/migration.sql apps/platform-api/src/persistence/publish-store-persistence-types.ts apps/platform-api/src/persistence/memory-publish-store-persistence-client.ts apps/platform-api/src/persistence/publish-store-repositories.ts apps/platform-api/src/platform-services.ts tests/unit/platform-app-publish-services.test.mjs tests/integration/publish-subdomain-persistence.test.mjs
git commit -m "feat: persist app store subdomains"
```

---

### Task 3: Validate Before Build and Publish Atomically

**Files:**

- Modify: `apps/platform-api/src/publish/http-routes.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `apps/platform-api/src/persistence/publish-store-repositories.ts`
- Modify: `tests/unit/publish-routes.test.mjs`
- Modify: `tests/unit/platform-app-publish-services.test.mjs`
- Create: `tests/integration/publish-subdomain-api.test.mjs`

**Interfaces:**

- `registerPublishHttpRoutes` gains `preflightPublishedSubdomain`.
- Publish review returns the trusted access URL configuration used by Creator preview.
- `persistPublishedDeployment` receives the normalized `subdomain`.
- `POST /projects/:projectId/publish` with no explicit environment requires `{ subdomain }` for App Store publishing.
- Invalid/taken responses are `400 SUBDOMAIN_INVALID` and `409 SUBDOMAIN_TAKEN` before publish service invocation.

- [ ] **Step 1: Write failing route-order and compensation tests**

Cover these observable calls in order:

```text
resolve auth -> validate label -> preflight availability -> build/publish -> persist registry
```

Assert the publish spy has zero calls after invalid/taken preflight. Simulate a persistence unique-race after a healthy build and assert the new deployment is deactivated while the previous registry row and subdomain remain unchanged.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/publish-routes.test.mjs tests/unit/platform-app-publish-services.test.mjs tests/integration/publish-subdomain-api.test.mjs
```

- [ ] **Step 3: Thread the normalized label through raw publish routes**

Extend the raw-route options:

```ts
preflightPublishedSubdomain?: (input: {
  headers: HeaderBag;
  projectId: string;
  subdomain: string;
}) => Promise<{ subdomain: string }>;

persistPublishedDeployment?: (input: {
  headers: HeaderBag;
  projectId: string;
  deployment: WorkspaceDeployment;
  subdomain?: string;
}) => Promise<{ status: number; body: unknown }>;
```

Only the App Store request shape—identified by missing `environment`—requires and preflights the subdomain. Staging, production, rollback, and promote retain current behavior; when they persist an existing deployment they do not silently replace a registry label.

- [ ] **Step 4: Wire app-factory to the repository service**

Resolve the authenticated actor/project exactly as current app-store publish does, call `validateSubdomainLabel`, and map domain errors to the stable failure envelope. Pass `{ runtimeDeployment, subdomain }` to the internal persisted publish request only after the container is healthy.

Populate `PublishReviewResponse.accessUrlConfig` through the same server configuration used by `buildSubdomainUrl`. Local configuration is `{ baseDomain: "localhost", secure: false, port: 9800 }`; configured deployments derive secure/domain/port values server-side. Update existing publish-review fixtures in touched tests rather than making Creator infer defaults.

The repository publish transaction must write the label together with registry data. Catch Prisma unique code `P2002` for `subdomain` and map it to `SUBDOMAIN_TAKEN`; do not expose database messages.

- [ ] **Step 5: Verify API behavior**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/publish-routes.test.mjs tests/unit/platform-app-publish-services.test.mjs tests/integration/publish-subdomain-api.test.mjs
pnpm --filter @evcp/platform-api typecheck
```

Expected: PASS, including zero-build assertions.

- [ ] **Step 6: Commit API publishing**

Stage only task files, preserving the existing unrelated hunks in `publish/factory.ts`:

```bash
git add apps/platform-api/src/publish/http-routes.ts apps/platform-api/src/app-factory.ts apps/platform-api/src/persistence/publish-store-repositories.ts tests/unit/publish-routes.test.mjs tests/unit/platform-app-publish-services.test.mjs tests/integration/publish-subdomain-api.test.mjs
git commit -m "feat: publish apps with unique subdomains"
```

---

### Task 4: Add Single-Use Launch Grants

**Files:**

- Create: `apps/platform-api/src/publish/launch-grant-store.ts`
- Modify: `apps/platform-api/src/publish/app-launch-session-route.ts`
- Modify: `apps/platform-api/src/publish/http-routes.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `apps/platform-api/src/main.ts`
- Modify: `apps/platform-api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/unit/app-launch-session-route.test.mjs`
- Create: `tests/unit/launch-grant-store.test.mjs`

**Interfaces:**

```ts
export type LaunchGrant = {
  appSlug: string;
  projectId: string;
  routePath: string;
  subdomain: string;
  bearerToken: string;
};

export interface LaunchGrantStore {
  create(grant: LaunchGrant, ttlSeconds: number): Promise<string>;
  consume(id: string): Promise<LaunchGrant | null>;
}
```

- [ ] **Step 1: Write failing grant lifecycle and launch-session tests**

Test 32-byte base64url opaque IDs, 60-second expiry with an injected clock, single consumption, and no grant content in the identifier. Update the launch-session route test to expect a returned `launchUrl` for a registry entry with a subdomain and current scoped-cookie behavior for a legacy entry.

- [ ] **Step 2: Run and confirm failure**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/launch-grant-store.test.mjs tests/unit/app-launch-session-route.test.mjs
```

- [ ] **Step 3: Implement memory and Redis grant stores**

Add `redis` to Platform API. Redis keys must use a fixed namespace such as `evcp:launch-grant:<id>`, write serialized grants with `SET ... EX 60`, and consume with atomic `GETDEL`. The memory implementation accepts an injected clock and random-ID function for deterministic tests.

Do not include grant IDs or serialized values in errors/log output. Redis connection errors must make subdomain launch unavailable without weakening to a non-atomic process-local grant in multi-replica production.

- [ ] **Step 4: Return a trusted launch URL**

Change authorization to return registry routing information:

```ts
authorize(...): Promise<{
  appSlug: string;
  projectId: string;
  routePath: string;
  subdomain?: string;
  subdomainUrl?: string;
}>;
```

When `subdomainUrl` exists, create a 60-second grant and return `${subdomainUrl}/__launch/${grantId}`. For legacy rows, retain the existing path-scoped cookie and return the path route as `launchUrl`.

- [ ] **Step 5: Wire lifecycle and verify**

Create one Redis client from `REDIS_URL` during API startup, inject the grant store into publish routes, and close the client during shutdown using the existing application lifecycle. Tests and memory app factory use `MemoryLaunchGrantStore`.

```bash
pnpm install --lockfile-only
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/launch-grant-store.test.mjs tests/unit/app-launch-session-route.test.mjs
pnpm --filter @evcp/platform-api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit launch grants**

```bash
git add apps/platform-api/src/publish/launch-grant-store.ts apps/platform-api/src/publish/app-launch-session-route.ts apps/platform-api/src/publish/http-routes.ts apps/platform-api/src/app-factory.ts apps/platform-api/src/main.ts apps/platform-api/package.json pnpm-lock.yaml tests/unit/app-launch-session-route.test.mjs tests/unit/launch-grant-store.test.mjs
git commit -m "feat: add secure subdomain launch grants"
```

---

### Task 5: Exchange Grants and Proxy Platform Subdomains

**Files:**

- Create: `apps/platform-api/src/publish/subdomain-http-routes.ts`
- Modify: `apps/platform-api/src/publish/http-routes.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `docker/Caddyfile`
- Modify: `docker/Caddyfile.release`
- Modify: `docker/docker-compose.yml`
- Modify: `docker/docker-compose.release.yml`
- Modify: `.env.example`
- Create: `tests/unit/publish-subdomain-http-routes.test.mjs`
- Create: `tests/integration/publish-subdomain-proxy.test.mjs`
- Modify: `tests/integration/publish-apps-proxy-auth.test.mjs`

**Interfaces:**

- Caddy sends a matched app host to Platform API with internal prefix `/__subdomain` while preserving the original `Host` header.
- `GET /__subdomain/__launch/:grant` consumes and verifies a grant, sets a host-only cookie, and redirects to `/`.
- `ALL /__subdomain/*` resolves host → registry → healthy deployment, enforces membership, and proxies through the deployment target.

- [ ] **Step 1: Write failing exchange, host-resolution, and proxy tests**

Cover:

- unknown label → 404;
- known label without healthy production deployment → 503;
- missing/invalid app token → existing 401/403 policy;
- expired, reused, or wrong-host grant → generic 403 with no app detail;
- valid grant → `302 Location: /` and `evcp_app_token` with `Path=/; HttpOnly; SameSite=Lax; Max-Age=900`;
- a root request proxies upstream as `/apps/<resource-key>/`;
- `/apps/<resource-key>/_next/...` stays compatible with the generated app base path;
- forwarded headers exclude incoming `authorization` and `cookie`.

- [ ] **Step 2: Run and confirm failure**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/publish-subdomain-http-routes.test.mjs tests/integration/publish-subdomain-proxy.test.mjs tests/integration/publish-apps-proxy-auth.test.mjs
```

- [ ] **Step 3: Implement focused raw HTTP handlers**

`subdomain-http-routes.ts` must:

1. Parse the original host with `subdomainFromHostname` and configured base domain.
2. Resolve only persisted published registry entries.
3. Confirm the production deployment is healthy.
4. On exchange, atomically consume before comparing `grant.subdomain`, `grant.appSlug`, and resolved project.
5. On proxy, reconstruct authorization from the host-only cookie and reuse `canAccessPublishedDeployment`.
6. Prefix the fallback registry route when the browser path does not already start with it.
7. Reuse `resolveAppsTarget`/Node proxy behavior rather than duplicating container addressing.

- [ ] **Step 4: Put wildcard host routing before the catch-all Caddy route**

For local development, match only a single label under localhost and rewrite internally:

```caddyfile
@published_subdomain host_regexp published ^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?\.localhost$
handle @published_subdomain {
  rewrite * /__subdomain{uri}
  reverse_proxy platform-api:3000
}
```

Use the configured platform suffix in release config. Keep platform `/creator`, `/store`, `/api`, `/auth`, `/apps`, and admin handling unchanged. Add `EVCP_APP_SUBDOMAIN_BASE_DOMAIN=localhost` to `.env.example`; ensure release Platform API receives both base-domain and `REDIS_URL` configuration.

- [ ] **Step 5: Verify host and path routes together**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/publish-subdomain-http-routes.test.mjs tests/integration/publish-subdomain-proxy.test.mjs tests/integration/publish-apps-proxy-auth.test.mjs tests/integration/publish-apps-proxy.test.mjs
pnpm --filter @evcp/platform-api typecheck
docker compose -f docker/docker-compose.yml config >/dev/null
docker compose -f docker/docker-compose.release.yml config >/dev/null
```

Expected: PASS.

- [ ] **Step 6: Commit host routing**

```bash
git add apps/platform-api/src/publish/subdomain-http-routes.ts apps/platform-api/src/publish/http-routes.ts apps/platform-api/src/app-factory.ts docker/Caddyfile docker/Caddyfile.release docker/docker-compose.yml docker/docker-compose.release.yml .env.example tests/unit/publish-subdomain-http-routes.test.mjs tests/integration/publish-subdomain-proxy.test.mjs tests/integration/publish-apps-proxy-auth.test.mjs
git commit -m "feat: route published app subdomains"
```

---

### Task 6: Build the Creator Access URL Experience

**Required skill:** `frontend-design`

**Files:**

- Create: `apps/creator-web/src/features/publish/PublishAccessUrlCard.tsx`
- Modify: `apps/creator-web/src/features/publish/PublishPage.tsx`
- Modify: `apps/creator-web/src/features/publish/use-publish-access.ts`
- Modify: `packages/ui/styles.css`
- Create: `tests/unit/creator-publish-subdomain.test.mjs`
- Modify: `tests/unit/creator-publish-render.test.mjs`
- Modify: `tests/unit/creator-publish-readiness-regressions.test.mjs`

**UX contract:**

- Platform subdomain option enabled and selected.
- Editable label plus read-only trusted URL preview.
- Custom domain/DNS option visible, disabled, and marked `Coming soon`.
- Publish disabled for invalid labels; conflict retains input and focuses the field.
- Latest deployment shows primary subdomain URL and fallback path URL.

- [ ] **Step 1: Write failing static and interaction tests**

Test generated initial label, project-change reset, accessible inline errors, reserved/short labels, disabled custom DNS controls, publish disabled state, request body, 409 conflict focus, and both post-publish URLs. Use the existing render/hook test style instead of adding a second frontend test framework.

- [ ] **Step 2: Run and confirm failure**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-publish-subdomain.test.mjs tests/unit/creator-publish-render.test.mjs tests/unit/creator-publish-readiness-regressions.test.mjs
```

- [ ] **Step 3: Implement `PublishAccessUrlCard`**

The component owns no network calls. Its controlled props are:

```ts
type PublishAccessUrlCardProps = {
  value: string;
  previewUrl: string;
  error?: string;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange(value: string): void;
};
```

Use a radio-card visual hierarchy, a real label, `aria-describedby`, `aria-invalid`, and a disabled fieldset for custom DNS. Keep all copy English. The DNS panel may explain wildcard/custom domains but must expose no active verification action.

- [ ] **Step 4: Integrate state and publish errors**

Initialize from `normalizeSubdomainSuggestion(selectedProject.name, selectedProject.id.replaceAll("_", "-"))`, which exactly mirrors the server's immutable resource-key derivation. Generate the preview with `buildSubdomainUrl(label, publishReview.accessUrlConfig)` so the frontend never owns the production base domain. Reset only when project ID changes, not after a request failure. Change the hook action to `handlePublishProject({ subdomain })` and map `SUBDOMAIN_INVALID`/`SUBDOMAIN_TAKEN` to field errors; preserve generic publish status handling for other failures.

The primary button is disabled when readiness is blocked, publish is in progress, or validation is not `ok`.

- [ ] **Step 5: Style and verify Creator UI**

Add scoped classes for desktop/mobile field layout, URL preview wrapping, disabled option contrast, and focus/error states. Keep minimum 44px touch targets and existing Creator typography tokens.

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-publish-subdomain.test.mjs tests/unit/creator-publish-render.test.mjs tests/unit/creator-publish-readiness-regressions.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm check:design-system
```

Expected: PASS.

- [ ] **Step 6: Commit Creator UI**

```bash
git add apps/creator-web/src/features/publish/PublishAccessUrlCard.tsx apps/creator-web/src/features/publish/PublishPage.tsx apps/creator-web/src/features/publish/use-publish-access.ts packages/ui/styles.css tests/unit/creator-publish-subdomain.test.mjs tests/unit/creator-publish-render.test.mjs tests/unit/creator-publish-readiness-regressions.test.mjs
git commit -m "feat: add creator publish subdomain controls"
```

---

### Task 7: Display and Launch Subdomains from Store

**Required skill:** `frontend-design`

**Files:**

- Modify: `apps/app-store-pwa/src/features/storefront/bootstrap.ts`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreProvider.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreAppCard.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreAppLaunch.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs`
- Modify: `packages/ui/styles.css`

**Behavior:** Store renders the server-provided URL, calls launch-session, and navigates to its returned `launchUrl`; it never builds a hostname from `subdomain`.

- [ ] **Step 1: Update tests first**

Add cases for card/detail URL display, successful subdomain launch, legacy path fallback, launch error without navigation, and unchanged pending/available access rules.

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreAppLaunch.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs
```

Expected: FAIL because Store still navigates to `app.route`.

- [ ] **Step 2: Map optional fields into Store view models**

Retain `route` and add optional `subdomain`/`subdomainUrl`. Render the primary access URL with ellipsis plus a full accessible title/copy action only if the existing design system already provides one; do not add clipboard behavior solely for this feature.

- [ ] **Step 3: Navigate only to the authorized response URL**

Both card and detail open handlers must use:

```ts
const session = await api.authorizeStoreAppLaunch(app.slug, app.route);
window.location.assign(session.launchUrl);
```

Keep the existing loading/error state and access gating. Never fall back client-side after a failed grant request; the API chooses the path fallback for legacy entries.

- [ ] **Step 4: Verify Store UI**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreAppLaunch.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs
pnpm --filter @evcp/app-store-pwa typecheck
pnpm check:design-system
```

Expected: PASS.

- [ ] **Step 5: Commit Store UI**

```bash
git add apps/app-store-pwa/src/features/storefront/bootstrap.ts apps/app-store-pwa/src/features/storefront/StoreProvider.tsx apps/app-store-pwa/src/features/storefront/StoreAppCard.tsx apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx apps/app-store-pwa/src/features/storefront/StoreAppLaunch.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs packages/ui/styles.css
git commit -m "feat: launch store apps on subdomains"
```

---

### Task 8: Regression Suite and Live Publish Verification

**Files:**

- Modify if failures expose contract gaps: files already listed in Tasks 1–7 only
- Create: `tests/live/publish-subdomain-smoke.test.mjs`
- Modify: `docs/superpowers/specs/2026-08-27-publish-subdomain-design.md` only if implementation reveals an approved factual correction

- [ ] **Step 1: Add an opt-in live smoke test**

Gate the test on explicit environment variables so normal CI skips it:

```text
EVCP_LIVE_BASE_URL
EVCP_LIVE_CREATOR_TOKEN
EVCP_LIVE_PROJECT_ID
EVCP_LIVE_SUBDOMAIN
```

The smoke test publishes, verifies registry output, creates a Store launch session, follows the opaque grant without logging it, confirms the host cookie/redirect, fetches `/`, and confirms the fallback `/apps/<resource-key>` remains reachable.

- [ ] **Step 2: Run focused cross-surface regressions**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json EVCP_ALLOW_SIMULATE_LOGIN=1 node --import tsx --test \
  tests/unit/publish-subdomain.test.mjs \
  tests/unit/platform-app-publish-services.test.mjs \
  tests/unit/publish-routes.test.mjs \
  tests/unit/app-launch-session-route.test.mjs \
  tests/unit/launch-grant-store.test.mjs \
  tests/unit/publish-subdomain-http-routes.test.mjs \
  tests/unit/creator-publish-subdomain.test.mjs \
  tests/integration/publish-subdomain-persistence.test.mjs \
  tests/integration/publish-subdomain-api.test.mjs \
  tests/integration/publish-subdomain-proxy.test.mjs \
  tests/integration/publish-apps-proxy.test.mjs \
  tests/integration/publish-apps-proxy-auth.test.mjs \
  apps/app-store-pwa/src/features/storefront/StoreAppLaunch.integration.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run repository quality gates**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Expected: PASS. If a pre-existing unrelated failure occurs, record its exact command/output and verify all subdomain-focused commands still pass; do not silently weaken tests.

- [ ] **Step 4: Run the live workflow with the local stack**

```bash
pnpm dev
```

In a second terminal, provide the four live variables and run:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/live/publish-subdomain-smoke.test.mjs
```

Then verify manually in the browser:

1. Open Creator Publish for the target project.
2. Edit the suggestion and publish successfully.
3. Confirm Latest deployment shows the subdomain and fallback path.
4. Open `/store`, confirm card/detail show the subdomain, and click `Open app`.
5. Confirm landing at `http://<label>.localhost:9800/` and exercise API-backed app data.
6. Confirm an unassigned user receives 403.
7. Republish the same project with the same label.
8. Attempt the label from another project and confirm 409 without affecting the first app.

- [ ] **Step 5: Review security invariants**

Search for accidental secret logging and client-side host construction:

```bash
rg -n "launchGrant|grantId|bearerToken|subdomainUrl" apps packages tests
rg -n "https?://.*subdomain|window\.location.*subdomain" apps/creator-web apps/app-store-pwa
```

Confirm grants/tokens appear only in storage, cookie construction, or redacted test fixtures; Store navigation must use `launchUrl`.

- [ ] **Step 6: Commit live verification and final fixes**

```bash
git add tests/live/publish-subdomain-smoke.test.mjs
git commit -m "test: verify live subdomain publishing"
git status --short
```

Expected: only the user's pre-existing unrelated changes remain unstaged.
