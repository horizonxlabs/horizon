# AI Providers Management Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/ai-providers` as a state-first management console and split guardrails onto `/admin/guardrails`, backed by real Platform API reads/writes.

**Architecture:** Add two read endpoints (`GET /ai/routes`, `GET /ai/quotas`) through both the in-memory and persistence service paths so the UI can render live routing/quota state. Add a reusable `Drawer` primitive to `@evcp/ui`. Replace the monolithic `AiGovernancePanel` with focused components (provider cards, routing matrix, quota panel, test tool, drawers) driven by an extended `useAiGovernance` snapshot, and give the two pages distinct headers and content.

**Tech Stack:** React 18 + Tailwind v4 (dallas branch), `@evcp/ui` primitives, `@evcp/api-client`, NestJS-style route handlers in `app-factory.ts`, Node built-in test runner via `tsx` (`node --import tsx --test`).

## Global Constraints

- Design-system compliance: all styling via `@evcp/ui` primitives + Tailwind tokens; **no app-local CSS, no inline visual styles, no hardcoded colors** (`pnpm check:design-system`).
- File size cap: **400 lines** per file (`scripts/quality/check-changed.mjs`). New files over 400 are blocked.
- No mock/demo fallbacks: unavailable API state must surface as unavailable, never as fake success.
- Persistence parity: every new GET handler must read from the **same store** the matching POST handler writes to (persistence path via `aiGovernancePersistence`, in-memory path via `services.aiGovernance`).
- Scenarios (order): `prd_generation`, `requirement_analysis`, `frontend_coding`, `backend_coding`, `review`, `documentation`.
- Quota scopes (order): `organization`, `creator`, `project`, `app`.
- Tests run with: `node --import tsx --test tests/<suite>/<file>.test.mjs`.
- All work happens in the dallas worktree on branch `main-v1`.

---

### Task 1: In-memory service — `listRoutes()` / `listQuotas()`

**Files:**
- Modify: `apps/platform-api/src/platform-services.ts` (class `AiGovernanceService`, after `resolveRoute` ~line 3267 and after `configureQuota`/`checkQuota` ~line 3285)
- Test: `tests/unit/ai-governance-service-reads.test.mjs` (create)

**Interfaces:**
- Produces: `AiGovernanceService.listRoutes(): AiScenarioRoute[]`, `AiGovernanceService.listQuotas(): AiQuota[]`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/ai-governance-service-reads.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

test("AiGovernanceService exposes stored routes and quotas", async () => {
  const { AiGovernanceService } = await import("../../apps/platform-api/src/platform-services.ts");
  const audit = { record() {} };
  const auth = { requireRole() {}, resolveCurrentUser: () => admin };
  const admin = { id: "admin-1", platformRoles: ["admin"], email: "a@b.c", name: "A", groups: [] };
  const svc = new AiGovernanceService(auth, audit);

  svc.createProvider(admin, { name: "OpenAI", adapter: "openai", baseUrl: "https://x/v1", models: ["gpt-4.1"] });
  const providerId = svc.listProviders()[0].id;
  svc.configureRoute(admin, { scenario: "frontend_coding", primaryProviderId: providerId, primaryModel: "gpt-4.1" });
  svc.configureQuota(admin, { scope: "organization", dailyLimit: 100, monthlyLimit: 1000, warningThreshold: 80, hardStop: true, usedToday: 0 });

  assert.equal(svc.listRoutes().length, 1);
  assert.equal(svc.listRoutes()[0].scenario, "frontend_coding");
  assert.equal(svc.listQuotas().length, 1);
  assert.equal(svc.listQuotas()[0].scope, "organization");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/ai-governance-service-reads.test.mjs`
Expected: FAIL — `svc.listRoutes is not a function`.

- [ ] **Step 3: Add the methods**

In `AiGovernanceService`, immediately after `resolveRoute(...)`:

```ts
  listRoutes(): AiScenarioRoute[] {
    return [...this.routes];
  }
```

And immediately after `configureQuota(...)` (before `checkQuota`):

```ts
  listQuotas(): AiQuota[] {
    return [...this.quotas];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/ai-governance-service-reads.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/platform-services.ts tests/unit/ai-governance-service-reads.test.mjs
git commit -m "feat(api): expose AiGovernanceService listRoutes/listQuotas"
```

---

### Task 2: Persistence service — `listRoutes()` / `listQuotas()`

**Files:**
- Modify: `apps/platform-api/src/persistence/ai-governance-repositories.ts` (class `AiGovernanceRepositoryBackedService`, after `listApiKeys` ~line 198)
- Test: `tests/unit/ai-governance-persistence-reads.test.mjs` (create)

**Interfaces:**
- Consumes: `AiGovernancePersistenceClient.aiScenarioRoute.findMany`, `.aiQuota.findMany`; mappers `mapRoute`, `mapQuota` (already in this file).
- Produces: `AiGovernanceRepositoryBackedService.listRoutes(actor): Promise<AiScenarioRoute[]>`, `.listQuotas(actor): Promise<AiQuota[]>`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/ai-governance-persistence-reads.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

test("repository service reads back routes and quotas", async () => {
  const mod = await import("../../apps/platform-api/src/persistence/ai-governance-repositories.ts");
  const service = mod.createAiGovernanceRepositoryBackedService();
  const admin = { id: "admin-1", platformRoles: ["admin"], email: "a@b.c", name: "A", groups: [] };

  await service.createProvider(admin, { name: "OpenAI", adapter: "openai", baseUrl: "https://x/v1", models: ["gpt-4.1"] });
  const providerId = (await service.listProviders(admin))[0].id;
  await service.configureRoute(admin, { scenario: "frontend_coding", primaryProviderId: providerId, primaryModel: "gpt-4.1" });
  await service.configureQuota(admin, { scope: "organization", dailyLimit: 100, monthlyLimit: 1000, warningThreshold: 80, hardStop: true, usedToday: 0 });

  const routes = await service.listRoutes(admin);
  const quotas = await service.listQuotas(admin);
  assert.equal(routes[0].scenario, "frontend_coding");
  assert.equal(quotas[0].scope, "organization");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/ai-governance-persistence-reads.test.mjs`
Expected: FAIL — `service.listRoutes is not a function`.

- [ ] **Step 3: Add the methods** (after `listApiKeys`, mirroring `listProviders`)

```ts
  async listRoutes(actor: PlatformUser): Promise<AiScenarioRoute[]> {
    requireAdmin(actor);
    const records = await this.client.aiScenarioRoute.findMany({ orderBy: { scenario: "asc" } });
    return records.map(mapRoute);
  }

  async listQuotas(actor: PlatformUser): Promise<AiQuota[]> {
    requireAdmin(actor);
    const records = await this.client.aiQuota.findMany({ orderBy: { scope: "asc" } });
    return records.map(mapQuota);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/ai-governance-persistence-reads.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/persistence/ai-governance-repositories.ts tests/unit/ai-governance-persistence-reads.test.mjs
git commit -m "feat(api): repository service listRoutes/listQuotas"
```

---

### Task 3: HTTP endpoints `GET /ai/routes` and `GET /ai/quotas`

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts`
  - persistence block: after the `GET /ai/api-keys` handler (~line 813)
  - in-memory block: after the `GET /ai/api-keys` handler (~line 2389)
  - route registry array `aiGovernanceRoutes` (~line 3746)
- Test: `tests/integration/platform-ai-governance-reads-contract.test.mjs` (create)

**Interfaces:**
- Consumes: `services.aiGovernance.listRoutes/listQuotas` (Task 1), `aiGovernancePersistence.listRoutes/listQuotas` (Task 2).
- Produces: `GET /ai/routes` → `success(AiScenarioRoute[])`, `GET /ai/quotas` → `success(AiQuota[])`, admin-guarded.

Note: the path union (`app-factory.ts:145-152`) and `isAiGovernancePath` (line 511) already include `/ai/routes` and `/ai/quotas`, so no changes there.

- [ ] **Step 1: Write the failing test** (mirror `platform-ai-governance-persistence-contract.test.mjs`)

```js
// tests/integration/platform-ai-governance-reads-contract.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformRequest, createPersistenceAwareServices } from "../../apps/platform-api/src/app-factory.ts";

const adminHeaders = { "x-evcp-user": "admin@company.com" };

test("GET /ai/routes and /ai/quotas return configured governance state", async () => {
  const services = await createPersistenceAwareServices();
  const provider = await handlePlatformRequest(services, {
    method: "POST", path: "/ai/providers", headers: adminHeaders,
    body: { name: "OpenAI", adapter: "openai", baseUrl: "https://x/v1", models: ["gpt-4.1"] }
  });
  const providerId = provider.body.data.id;
  await handlePlatformRequest(services, {
    method: "POST", path: "/ai/routes", headers: adminHeaders,
    body: { scenario: "frontend_coding", primaryProviderId: providerId, primaryModel: "gpt-4.1" }
  });
  await handlePlatformRequest(services, {
    method: "POST", path: "/ai/quotas", headers: adminHeaders,
    body: { scope: "organization", dailyLimit: 100, monthlyLimit: 1000, warningThreshold: 80, hardStop: true, usedToday: 0 }
  });

  const routes = await handlePlatformRequest(services, { method: "GET", path: "/ai/routes", headers: adminHeaders });
  const quotas = await handlePlatformRequest(services, { method: "GET", path: "/ai/quotas", headers: adminHeaders });
  assert.equal(routes.status, 200);
  assert.equal(routes.body.data[0].scenario, "frontend_coding");
  assert.equal(quotas.body.data[0].scope, "organization");
});
```

> If `createPersistenceAwareServices` / `handlePlatformRequest` names differ, copy the exact imports and bootstrap used at the top of `tests/integration/platform-ai-governance-persistence-contract.test.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/integration/platform-ai-governance-reads-contract.test.mjs`
Expected: FAIL — routes/quotas GET returns 404 "Unknown platform API route".

- [ ] **Step 3a: Add persistence-path handlers** (after the `GET /ai/api-keys` persistence handler, ~line 813)

```ts
    if (aiGovernancePersistence && request.method === "GET" && request.path === "/ai/routes") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await aiGovernancePersistence.listRoutes(user)) };
    }

    if (aiGovernancePersistence && request.method === "GET" && request.path === "/ai/quotas") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await aiGovernancePersistence.listQuotas(user)) };
    }
```

- [ ] **Step 3b: Add in-memory-path handlers** (after the `GET /ai/api-keys` in-memory handler, ~line 2389)

```ts
    if (request.method === "GET" && request.path === "/ai/routes") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listRoutes()) };
    }

    if (request.method === "GET" && request.path === "/ai/quotas") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listQuotas()) };
    }
```

- [ ] **Step 3c: Register both GET routes** in the `aiGovernanceRoutes` array (~line 3746)

```ts
    { method: "GET", path: "/ai/routes" },
    { method: "GET", path: "/ai/quotas" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/integration/platform-ai-governance-reads-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/app-factory.ts tests/integration/platform-ai-governance-reads-contract.test.mjs
git commit -m "feat(api): GET /ai/routes and /ai/quotas endpoints"
```

---

### Task 4: api-client — `listAiScenarioRoutes()` / `listAiQuotas()`

**Files:**
- Modify: `packages/api-client/src/index.ts` (after `configureAiQuota` ~line 1108)
- Test: `tests/unit/api-client-ai-reads.test.mjs` (create)

**Interfaces:**
- Produces: `PlatformApiClient.listAiScenarioRoutes(): Promise<AiScenarioRouteDto[]>` (GET `/ai/routes`), `PlatformApiClient.listAiQuotas(): Promise<AiQuotaDto[]>` (GET `/ai/quotas`)

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/api-client-ai-reads.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformApiClient } from "../../packages/api-client/src/index.ts";

test("client requests GET /ai/routes and /ai/quotas", async () => {
  const calls = [];
  const client = createPlatformApiClient({
    baseUrl: "/api",
    fetcher: async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }); }
  });
  await client.listAiScenarioRoutes();
  await client.listAiQuotas();
  assert.ok(calls.some((u) => u.endsWith("/ai/routes")));
  assert.ok(calls.some((u) => u.endsWith("/ai/quotas")));
});
```

> Match the exact `createPlatformApiClient` options shape used in `tests/unit/api-client-runtime.test.mjs`; adapt the fetcher signature if that suite differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/api-client-ai-reads.test.mjs`
Expected: FAIL — `client.listAiScenarioRoutes is not a function`.

- [ ] **Step 3: Add the methods** (after `configureAiQuota`)

```ts
  listAiScenarioRoutes(): Promise<AiScenarioRouteDto[]> {
    return this.request<AiScenarioRouteDto[]>("/ai/routes");
  }

  listAiQuotas(): Promise<AiQuotaDto[]> {
    return this.request<AiQuotaDto[]>("/ai/quotas");
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/api-client-ai-reads.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/index.ts tests/unit/api-client-ai-reads.test.mjs
git commit -m "feat(api-client): listAiScenarioRoutes/listAiQuotas"
```

---

### Task 5: Extend `useAiGovernance` snapshot with `routes` + `quotas`

**Files:**
- Modify: `apps/admin-web/src/features/ai-governance/use-ai-governance.ts`
- Test: `tests/unit/admin-ai-governance-hook-contract.test.mjs` (extend)

**Interfaces:**
- Consumes: `client.listAiScenarioRoutes()`, `client.listAiQuotas()` (Task 4).
- Produces: hook return now includes `routes: AiScenarioRouteDto[]` and `quotas: AiQuotaDto[]`; `configureRoute`/`configureQuota` upsert into the snapshot by `scenario`/`scope`.

- [ ] **Step 1: Add a failing expectation** to `admin-ai-governance-hook-contract.test.mjs`

```js
test("hook snapshot includes routes and quotas", async () => {
  const { useAiGovernance } = await import("../../apps/admin-web/src/features/ai-governance/use-ai-governance.ts");
  // Contract-level assertion: the hook's snapshot keys include routes and quotas.
  assert.ok(useAiGovernance.length >= 1);
  const src = await (await import("node:fs/promises")).readFile(
    new URL("../../apps/admin-web/src/features/ai-governance/use-ai-governance.ts", import.meta.url), "utf8");
  assert.match(src, /routes:\s*AiScenarioRouteDto\[\]/);
  assert.match(src, /quotas:\s*AiQuotaDto\[\]/);
  assert.match(src, /client\.listAiScenarioRoutes\(\)/);
  assert.match(src, /client\.listAiQuotas\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-ai-governance-hook-contract.test.mjs`
Expected: FAIL — snapshot has no `routes`/`quotas`.

- [ ] **Step 3: Update the hook**

Add DTO imports: `AiScenarioRouteDto`, `AiQuotaDto` to the type import block.

Change the snapshot type + empty value:

```ts
type AiGovernanceSnapshot = {
  providers: AiProviderDto[];
  apiKeys: AiApiKeyDto[];
  routes: AiScenarioRouteDto[];
  quotas: AiQuotaDto[];
  guardrailEvents: GuardrailEventDto[];
};
const emptySnapshot: AiGovernanceSnapshot = { providers: [], apiKeys: [], routes: [], quotas: [], guardrailEvents: [] };
```

In `reload`, extend the `Promise.all` and `setSnapshot`:

```ts
      const [providers, apiKeys, routes, quotas, guardrailEvents] = await Promise.all([
        client.listAiProviders(),
        client.listAiApiKeys(),
        client.listAiScenarioRoutes(),
        client.listAiQuotas(),
        client.listGuardrailEvents()
      ]);
      if (generationRef.current !== requestGeneration || activeClientRef.current !== client) return;
      setSnapshot({ providers, apiKeys, routes, quotas, guardrailEvents });
```

Upsert on write — in `configureRoute`, before `return route;`:

```ts
    setSnapshot((current) => ({
      ...current,
      routes: [route, ...current.routes.filter((item) => item.scenario !== route.scenario)]
    }));
```

In `configureQuota`, before `return quota;`:

```ts
    setSnapshot((current) => ({
      ...current,
      quotas: [quota, ...current.quotas.filter((item) => item.scope !== quota.scope)]
    }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-ai-governance-hook-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/use-ai-governance.ts tests/unit/admin-ai-governance-hook-contract.test.mjs
git commit -m "feat(admin): load AI routes and quotas into governance snapshot"
```

---

### Task 6: `Drawer` primitive in `@evcp/ui`

**Files:**
- Create: `packages/ui/src/primitives/drawer.tsx`
- Modify: `packages/ui/src/index.tsx` (add export)
- Test: `tests/unit/ui-drawer.test.mjs` (create)

**Interfaces:**
- Produces: `Drawer` — `{ open: boolean; onClose: () => void; title: string; description?: ReactNode; footer?: ReactNode; children: ReactNode }`. Renders nothing when `open` is false; when open, renders a fixed backdrop + right panel with `role="dialog"`, `aria-modal="true"`, Esc-to-close, backdrop-click-to-close, body scroll-lock, initial focus on the close button.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/ui-drawer.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Drawer renders nothing when closed and a dialog when open", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  const closed = renderToStaticMarkup(
    React.createElement(Drawer, { open: false, onClose() {}, title: "Add provider" }, "body"));
  assert.equal(closed, "");
  const open = renderToStaticMarkup(
    React.createElement(Drawer, { open: true, onClose() {}, title: "Add provider" }, "body"));
  assert.match(open, /role="dialog"/);
  assert.match(open, /aria-modal="true"/);
  assert.match(open, /Add provider/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/ui-drawer.test.mjs`
Expected: FAIL — cannot find `drawer.tsx`.

- [ ] **Step 3: Implement the primitive**

```tsx
// packages/ui/src/primitives/drawer.tsx
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../cn";

export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `drawer-title-${useId().replace(/:/g, "")}`;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-[rgba(15,23,42,0.4)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-xl",
          "animate-in slide-in-from-right"
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-base font-semibold text-body">
              {title}
            </h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            ref={closeRef}
            aria-label="Close panel"
            className="rounded-control px-2 py-1 text-lg leading-none text-muted hover:bg-surface-muted"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-border px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
```

> `animate-in slide-in-from-right` is optional polish; if those utilities are not present in this Tailwind config, drop that line — behavior is unaffected.

- [ ] **Step 4: Export it** — add to `packages/ui/src/index.tsx`, next to the other primitive exports:

```ts
export { Drawer } from "./primitives/drawer";
```

- [ ] **Step 5: Run tests + typecheck**

Run: `node --import tsx --test tests/unit/ui-drawer.test.mjs`
Expected: PASS.
Run: `pnpm --filter @evcp/ui typecheck` (or repo `pnpm typecheck`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/drawer.tsx packages/ui/src/index.tsx tests/unit/ui-drawer.test.mjs
git commit -m "feat(ui): accessible Drawer primitive"
```

---

### Task 7: Pure derivation helpers

**Files:**
- Create: `apps/admin-web/src/features/ai-governance/lib/derivations.ts`
- Test: `tests/unit/ai-governance-derivations.test.mjs` (create)

**Interfaces:**
- Produces:
  - `SCENARIOS: readonly AiScenarioDto[]` (the 6 scenarios, in order)
  - `QUOTA_SCOPES: readonly AiQuotaDto["scope"][]` (the 4 scopes, in order)
  - `routedScenariosByProvider(routes: AiScenarioRouteDto[]): Record<string, AiScenarioDto[]>` — providerId → scenarios where it is primary
  - `routingMatrixRows(routes: AiScenarioRouteDto[], providers: AiProviderDto[]): Array<{ scenario: AiScenarioDto; primary?: { name: string; model: string }; fallback?: { name: string; model: string } }>`
  - `quotaRows(quotas: AiQuotaDto[]): Array<{ scope: AiQuotaDto["scope"]; quota?: AiQuotaDto }>`
  - `summaryCounts(providers, apiKeys, routes): { providers: number; activeCredentials: number; routed: number }`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/ai-governance-derivations.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const load = () => import("../../apps/admin-web/src/features/ai-governance/lib/derivations.ts");

test("routing matrix has a row per scenario with provider names resolved", async () => {
  const { routingMatrixRows, SCENARIOS } = await load();
  const providers = [{ id: "aip_openai", name: "OpenAI", adapter: "openai", baseUrl: "", models: ["gpt-4.1"], status: "active" }];
  const routes = [{ scenario: "frontend_coding", primary: { providerId: "aip_openai", model: "gpt-4.1" } }];
  const rows = routingMatrixRows(routes, providers);
  assert.equal(rows.length, SCENARIOS.length);
  const fe = rows.find((r) => r.scenario === "frontend_coding");
  assert.equal(fe.primary.name, "OpenAI");
  assert.equal(fe.primary.model, "gpt-4.1");
  const review = rows.find((r) => r.scenario === "review");
  assert.equal(review.primary, undefined);
});

test("summaryCounts counts active credentials and routed scenarios", async () => {
  const { summaryCounts } = await load();
  const counts = summaryCounts(
    [{ id: "aip_openai" }],
    [{ status: "active" }, { status: "disabled" }],
    [{ scenario: "frontend_coding", primary: { providerId: "aip_openai", model: "gpt-4.1" } }]
  );
  assert.deepEqual(counts, { providers: 1, activeCredentials: 1, routed: 1 });
});

test("quotaRows yields one row per scope, filling known quotas", async () => {
  const { quotaRows, QUOTA_SCOPES } = await load();
  const rows = quotaRows([{ scope: "organization", dailyLimit: 100, monthlyLimit: 1000, warningThreshold: 80, hardStop: true, usedToday: 0 }]);
  assert.equal(rows.length, QUOTA_SCOPES.length);
  assert.equal(rows.find((r) => r.scope === "organization").quota.dailyLimit, 100);
  assert.equal(rows.find((r) => r.scope === "app").quota, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/ai-governance-derivations.test.mjs`
Expected: FAIL — cannot find `derivations.ts`.

- [ ] **Step 3: Implement**

```ts
// apps/admin-web/src/features/ai-governance/lib/derivations.ts
import type { AiProviderDto, AiQuotaDto, AiScenarioDto, AiScenarioRouteDto, AiApiKeyDto } from "@evcp/api-client";

export const SCENARIOS: readonly AiScenarioDto[] = [
  "prd_generation",
  "requirement_analysis",
  "frontend_coding",
  "backend_coding",
  "review",
  "documentation"
] as const;

export const QUOTA_SCOPES: readonly AiQuotaDto["scope"][] = [
  "organization",
  "creator",
  "project",
  "app"
] as const;

export function routedScenariosByProvider(routes: AiScenarioRouteDto[]): Record<string, AiScenarioDto[]> {
  const map: Record<string, AiScenarioDto[]> = {};
  for (const route of routes) {
    const id = route.primary.providerId;
    (map[id] ??= []).push(route.scenario);
  }
  return map;
}

export function routingMatrixRows(
  routes: AiScenarioRouteDto[],
  providers: AiProviderDto[]
): Array<{ scenario: AiScenarioDto; primary?: { name: string; model: string }; fallback?: { name: string; model: string } }> {
  const nameFor = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  return SCENARIOS.map((scenario) => {
    const route = routes.find((r) => r.scenario === scenario);
    return {
      scenario,
      primary: route ? { name: nameFor(route.primary.providerId), model: route.primary.model } : undefined,
      fallback: route?.fallback ? { name: nameFor(route.fallback.providerId), model: route.fallback.model } : undefined
    };
  });
}

export function quotaRows(quotas: AiQuotaDto[]): Array<{ scope: AiQuotaDto["scope"]; quota?: AiQuotaDto }> {
  return QUOTA_SCOPES.map((scope) => ({ scope, quota: quotas.find((q) => q.scope === scope) }));
}

export function summaryCounts(
  providers: Pick<AiProviderDto, "id">[],
  apiKeys: Pick<AiApiKeyDto, "status">[],
  routes: AiScenarioRouteDto[]
): { providers: number; activeCredentials: number; routed: number } {
  return {
    providers: providers.length,
    activeCredentials: apiKeys.filter((key) => key.status === "active").length,
    routed: new Set(routes.map((r) => r.scenario)).size
  };
}
```

> If `AiScenarioDto` is not exported from `@evcp/api-client`, add `export type AiScenarioDto = "prd_generation" | "requirement_analysis" | "frontend_coding" | "backend_coding" | "review" | "documentation";` — check the existing type first (it is referenced by `AiScenarioRouteDto`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/ai-governance-derivations.test.mjs`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/lib/derivations.ts tests/unit/ai-governance-derivations.test.mjs
git commit -m "feat(admin): pure derivations for AI providers console"
```

---

### Task 8: Drawer form components

**Files:**
- Create: `apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx`
- Create: `apps/admin-web/src/features/ai-governance/drawers/CredentialDrawer.tsx`
- Create: `apps/admin-web/src/features/ai-governance/drawers/RouteDrawer.tsx`
- Create: `apps/admin-web/src/features/ai-governance/drawers/QuotaDrawer.tsx`

**Interfaces:**
- Consumes: `Drawer`, `Field`, `Input`, `Select`, `Button` from `@evcp/ui`; hook methods `createProvider`, `saveApiKey`, `configureRoute`, `configureQuota`.
- Produces (props for each): `{ open: boolean; onClose: () => void; ai: UseAiGovernance; onDone?: (msg: string) => void }` plus context props noted below.

Where `UseAiGovernance = ReturnType<typeof useAiGovernance>`.

- [ ] **Step 1: ProviderDrawer** (fields: name, adapter, base URL, models)

```tsx
// apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; onDone?: (msg: string) => void };

export function ProviderDrawer({ open, onClose, ai, onDone }: Props) {
  const [name, setName] = useState("");
  const [adapter, setAdapter] = useState<"openai" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const provider = await ai.createProvider({
        name: name.trim(), adapter, baseUrl: baseUrl.trim(),
        models: models.split(",").map((m) => m.trim()).filter(Boolean)
      });
      onDone?.(`Provider ${provider.name} saved.`);
      setName(""); setBaseUrl(""); setModels("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add provider" description="Register an approved AI endpoint.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Adapter">
          <Select value={adapter} onChange={(e) => setAdapter(e.target.value as typeof adapter)}>
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic native</option>
          </Select>
        </Field>
        <Field label="Provider base URL">
          <Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={adapter === "anthropic" ? "https://api.anthropic.com/v1" : "https://gateway.example/v1"} required />
        </Field>
        <Field label="Models (comma-separated)" hint="e.g. gpt-4.1, gpt-4.1-mini">
          <Input value={models} onChange={(e) => setModels(e.target.value)}
            placeholder={adapter === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1"} required />
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save provider</Button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 2: CredentialDrawer** (props add `providerId?: string` to preselect from a card; fields: provider, credential name, secret)

```tsx
// apps/admin-web/src/features/ai-governance/drawers/CredentialDrawer.tsx
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; providerId?: string; onDone?: (msg: string) => void };

export function CredentialDrawer({ open, onClose, ai, providerId, onDone }: Props) {
  const [selectedProvider, setSelectedProvider] = useState(providerId ?? "");
  const [name, setName] = useState("production");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => { if (open) setSelectedProvider(providerId ?? ""); }, [open, providerId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const key = await ai.saveApiKey(
        { providerId: selectedProvider, name: name.trim(), usageMode: "production", quotaTokens: 0, fallbackPriority: 0 },
        secret
      );
      onDone?.(`Credential saved as ${key.maskedValue}.`);
      setSecret("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Credential could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add credential" description="Stored via the OpenBao-compatible secret store; the plaintext key never leaves this form.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Provider">
          <Select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} required>
            <option value="">Select provider</option>
            {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Credential name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Provider credential">
          <Input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Store credential</Button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 3: RouteDrawer** (props add `scenario?: AiScenarioDto`; fields: scenario, primary provider+model, fallback provider+model)

```tsx
// apps/admin-web/src/features/ai-governance/drawers/RouteDrawer.tsx
import { Button, Drawer, Field, Select } from "@evcp/ui";
import type { AiScenarioDto } from "@evcp/api-client";
import { useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { SCENARIOS } from "../lib/derivations";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; scenario?: AiScenarioDto; onDone?: (msg: string) => void };

export function RouteDrawer({ open, onClose, ai, scenario, onDone }: Props) {
  const [selectedScenario, setSelectedScenario] = useState<AiScenarioDto>(scenario ?? "frontend_coding");
  const [primaryProvider, setPrimaryProvider] = useState("");
  const [primaryModel, setPrimaryModel] = useState("");
  const [fallbackProvider, setFallbackProvider] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => { if (open && scenario) setSelectedScenario(scenario); }, [open, scenario]);

  const primary = ai.providers.find((p) => p.id === primaryProvider);
  const fallback = ai.providers.find((p) => p.id === fallbackProvider);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await ai.configureRoute({
        scenario: selectedScenario,
        primaryProviderId: primaryProvider,
        primaryModel,
        ...(fallbackProvider ? { fallbackProviderId: fallbackProvider, ...(fallbackModel ? { fallbackModel } : {}) } : {})
      });
      onDone?.(`${selectedScenario} now routes to the selected provider.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Configure scenario route" description="Choose the governed provider for this generation scenario.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Scenario">
          <Select value={selectedScenario} onChange={(e) => setSelectedScenario(e.target.value as AiScenarioDto)}>
            {SCENARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Primary provider">
          <Select value={primaryProvider} onChange={(e) => { setPrimaryProvider(e.target.value); setPrimaryModel(ai.providers.find((p) => p.id === e.target.value)?.models[0] ?? ""); }} required>
            <option value="">Select provider</option>
            {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Primary model">
          <Select value={primaryModel} onChange={(e) => setPrimaryModel(e.target.value)} required>
            <option value="">Select model</option>
            {primary?.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Fallback provider">
          <Select value={fallbackProvider} onChange={(e) => { setFallbackProvider(e.target.value); setFallbackModel(ai.providers.find((p) => p.id === e.target.value)?.models[0] ?? ""); }}>
            <option value="">No fallback</option>
            {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Fallback model">
          <Select value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} disabled={!fallbackProvider}>
            <option value="">Use primary model</option>
            {fallback?.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save route</Button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 4: QuotaDrawer** (props add `scope?: AiQuotaDto["scope"]`; fields: scope, daily, monthly)

```tsx
// apps/admin-web/src/features/ai-governance/drawers/QuotaDrawer.tsx
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import type { AiQuotaDto } from "@evcp/api-client";
import { useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { QUOTA_SCOPES } from "../lib/derivations";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; scope?: AiQuotaDto["scope"]; onDone?: (msg: string) => void };

export function QuotaDrawer({ open, onClose, ai, scope, onDone }: Props) {
  const [selectedScope, setSelectedScope] = useState<AiQuotaDto["scope"]>(scope ?? "organization");
  const [daily, setDaily] = useState("100000");
  const [monthly, setMonthly] = useState("2000000");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const target = scope ?? "organization";
    setSelectedScope(target);
    const existing = ai.quotas.find((q) => q.scope === target);
    if (existing) { setDaily(String(existing.dailyLimit)); setMonthly(String(existing.monthlyLimit)); }
  }, [open, scope, ai.quotas]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await ai.configureQuota({
        scope: selectedScope, dailyLimit: Number(daily), monthlyLimit: Number(monthly),
        warningThreshold: Math.floor(Number(daily) * 0.8), hardStop: true, usedToday: 0
      });
      onDone?.(`${selectedScope} quota saved with a hard stop.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quota could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Edit quota" description="Hard-stop budgets block requests once the daily limit is reached.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Scope">
          <Select value={selectedScope} onChange={(e) => setSelectedScope(e.target.value as AiQuotaDto["scope"])}>
            {QUOTA_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Daily tokens"><Input type="number" min="1" value={daily} onChange={(e) => setDaily(e.target.value)} required /></Field>
        <Field label="Monthly tokens"><Input type="number" min="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} required /></Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save quota</Button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @evcp/admin-web typecheck` (or repo `pnpm typecheck`)
Expected: no errors. (Confirm `AiScenarioDto`, `AiQuotaDto` are exported from `@evcp/api-client`; if `AiScenarioDto` is missing, it was added in Task 7's note.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/drawers
git commit -m "feat(admin): provider/credential/route/quota drawers"
```

---

### Task 9: Presentational sections — ProviderCard, RoutingMatrix, QuotaPanel, ProviderTestPanel

**Files:**
- Create: `apps/admin-web/src/features/ai-governance/ProviderCard.tsx`
- Create: `apps/admin-web/src/features/ai-governance/RoutingMatrix.tsx`
- Create: `apps/admin-web/src/features/ai-governance/QuotaPanel.tsx`
- Create: `apps/admin-web/src/features/ai-governance/ProviderTestPanel.tsx`

**Interfaces:**
- Consumes: `@evcp/ui` (`SectionCard`, `Badge`, `StatusPill`, `Button`, `DataTable`, `Field`, `Input`, `Select`), `derivations` helpers, hook methods.
- Produces: presentational components that receive data + callbacks (no data fetching inside).

- [ ] **Step 1: ProviderCard**

```tsx
// apps/admin-web/src/features/ai-governance/ProviderCard.tsx
import { Badge, Button } from "@evcp/ui";
import type { AiApiKeyDto, AiProviderDto, AiScenarioDto } from "@evcp/api-client";

export function ProviderCard({
  provider, credentials, routedScenarios, onAddCredential
}: {
  provider: AiProviderDto;
  credentials: AiApiKeyDto[];
  routedScenarios: AiScenarioDto[];
  onAddCredential: (providerId: string) => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <strong className="text-sm font-semibold text-body">{provider.name}</strong>
          <span className="truncate text-xs text-muted">{provider.baseUrl}</span>
        </div>
        <Badge>{provider.adapter}</Badge>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {provider.models.map((model) => (
          <span key={model} className="rounded-control bg-surface-muted px-2 py-0.5 text-xs text-body">{model}</span>
        ))}
      </div>
      <p className="text-xs text-muted">
        {credentials.length
          ? `🔑 ${credentials.length} credential${credentials.length > 1 ? "s" : ""} · ${credentials[0].maskedValue}`
          : "No credential — add one to activate this provider."}
      </p>
      <p className="text-xs text-muted">
        {routedScenarios.length ? `Routed: ${routedScenarios.join(", ")}` : "Not routed to any scenario."}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => onAddCredential(provider.id)}>Add credential</Button>
      </div>
    </article>
  );
}
```

> Confirm the token class names `rounded-card`, `bg-surface`, `bg-surface-muted`, `border-border`, `text-body`, `text-muted` exist (they are used by the primitives in `packages/ui/src/primitives/*`). If a name differs, use the exact class the `Card` primitive uses.

- [ ] **Step 2: RoutingMatrix**

```tsx
// apps/admin-web/src/features/ai-governance/RoutingMatrix.tsx
import { Button, SectionCard, Table, THead, TRow, TCell } from "@evcp/ui";
import type { AiProviderDto, AiScenarioDto, AiScenarioRouteDto } from "@evcp/api-client";
import { routingMatrixRows } from "./lib/derivations";

export function RoutingMatrix({
  routes, providers, disabled, onConfigure
}: {
  routes: AiScenarioRouteDto[];
  providers: AiProviderDto[];
  disabled: boolean;
  onConfigure: (scenario: AiScenarioDto) => void;
}) {
  const rows = routingMatrixRows(routes, providers);
  return (
    <SectionCard eyebrow="Routing" title="Scenario routing">
      <Table>
        <THead>
          <TRow><TCell>Scenario</TCell><TCell>Primary</TCell><TCell>Fallback</TCell><TCell></TCell></TRow>
        </THead>
        <tbody>
          {rows.map((row) => (
            <TRow key={row.scenario}>
              <TCell>{row.scenario}</TCell>
              <TCell>{row.primary ? `${row.primary.name} · ${row.primary.model}` : "Not configured"}</TCell>
              <TCell>{row.fallback ? `${row.fallback.name} · ${row.fallback.model}` : "—"}</TCell>
              <TCell>
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onConfigure(row.scenario)}>Configure</Button>
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
```

> Verify the `Table`/`THead`/`TRow`/`TCell` composition API against `packages/ui/src/primitives/table.tsx`. If the primitives expect a different structure (e.g. `THead` renders its own `<tr>`), follow that file's exact usage — mirror how `DataTable` (in `index.tsx`) composes them.

- [ ] **Step 3: QuotaPanel**

```tsx
// apps/admin-web/src/features/ai-governance/QuotaPanel.tsx
import { Button, SectionCard, Table, THead, TRow, TCell } from "@evcp/ui";
import type { AiQuotaDto } from "@evcp/api-client";
import { quotaRows } from "./lib/derivations";

export function QuotaPanel({
  quotas, disabled, onEdit
}: {
  quotas: AiQuotaDto[];
  disabled: boolean;
  onEdit: (scope: AiQuotaDto["scope"]) => void;
}) {
  const rows = quotaRows(quotas);
  return (
    <SectionCard eyebrow="Budgets" title="Usage quotas">
      <Table>
        <THead>
          <TRow><TCell>Scope</TCell><TCell>Daily</TCell><TCell>Monthly</TCell><TCell>Hard stop</TCell><TCell></TCell></TRow>
        </THead>
        <tbody>
          {rows.map((row) => (
            <TRow key={row.scope}>
              <TCell>{row.scope}</TCell>
              <TCell>{row.quota ? row.quota.dailyLimit.toLocaleString() : "No limit set"}</TCell>
              <TCell>{row.quota ? row.quota.monthlyLimit.toLocaleString() : "—"}</TCell>
              <TCell>{row.quota?.hardStop ? "On" : "—"}</TCell>
              <TCell><Button size="sm" variant="ghost" disabled={disabled} onClick={() => onEdit(row.scope)}>Edit</Button></TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
```

- [ ] **Step 4: ProviderTestPanel**

```tsx
// apps/admin-web/src/features/ai-governance/ProviderTestPanel.tsx
import { Button, Field, Input, SectionCard, Select } from "@evcp/ui";
import type { AiScenarioDto } from "@evcp/api-client";
import { useState } from "react";
import type { useAiGovernance } from "./use-ai-governance";
import { SCENARIOS } from "./lib/derivations";

export function ProviderTestPanel({
  ai, disabled, onResult
}: {
  ai: ReturnType<typeof useAiGovernance>;
  disabled: boolean;
  onResult?: (summary: string) => void;
}) {
  const [scenario, setScenario] = useState<AiScenarioDto>("frontend_coding");
  const [prompt, setPrompt] = useState("Return one short readiness sentence.");
  const [result, setResult] = useState<string>();

  async function run() {
    try {
      const r = await ai.testProvider({ scenario, prompt });
      const summary = `${r.status} · ${r.providerName} · ${r.model} · ${r.tokensUsed} tokens · ${r.latencyMs} ms`;
      setResult(summary);
      onResult?.(summary);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Provider test failed.");
    }
  }

  return (
    <SectionCard eyebrow="Verify" title="Live governed test">
      <div className="flex flex-col gap-4">
        <Field label="Scenario">
          <Select value={scenario} onChange={(e) => setScenario(e.target.value as AiScenarioDto)} disabled={disabled}>
            {SCENARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Prompt"><Input value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={disabled} /></Field>
        <p className="text-sm text-muted">{result ?? "Records provider, model, status, latency, tokens and audit evidence; never returns the credential."}</p>
        <div><Button onClick={() => void run()} disabled={disabled || !prompt.trim()}>Run test call</Button></div>
      </div>
    </SectionCard>
  );
}
```

- [ ] **Step 5: Typecheck + line count**

Run: `pnpm typecheck`
Expected: no errors.
Run: `for f in apps/admin-web/src/features/ai-governance/*.tsx apps/admin-web/src/features/ai-governance/drawers/*.tsx; do echo "$(wc -l < "$f") $f"; done`
Expected: every file < 400.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/ProviderCard.tsx apps/admin-web/src/features/ai-governance/RoutingMatrix.tsx apps/admin-web/src/features/ai-governance/QuotaPanel.tsx apps/admin-web/src/features/ai-governance/ProviderTestPanel.tsx
git commit -m "feat(admin): provider card, routing matrix, quota panel, test panel"
```

---

### Task 10: `AiProvidersConsole` composition

**Files:**
- Create: `apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx`

**Interfaces:**
- Consumes: everything from Tasks 7–9, `PageHeader`, `MetricCard`, `DecisionPanel`, `SectionCard`, `DataTable`, `Button` from `@evcp/ui`, `canMutateAiGovernance`.
- Produces: `AiProvidersConsole({ ai }: { ai: ReturnType<typeof useAiGovernance> })`.

- [ ] **Step 1: Implement the console**

```tsx
// apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx
import { Button, DataTable, DecisionPanel, MetricCard, PageHeader, SectionCard } from "@evcp/ui";
import type { AiQuotaDto, AiScenarioDto } from "@evcp/api-client";
import { useState } from "react";
import type { useAiGovernance } from "./use-ai-governance";
import { canMutateAiGovernance } from "./status";
import { routedScenariosByProvider, summaryCounts } from "./lib/derivations";
import { ProviderCard } from "./ProviderCard";
import { RoutingMatrix } from "./RoutingMatrix";
import { QuotaPanel } from "./QuotaPanel";
import { ProviderTestPanel } from "./ProviderTestPanel";
import { ProviderDrawer } from "./drawers/ProviderDrawer";
import { CredentialDrawer } from "./drawers/CredentialDrawer";
import { RouteDrawer } from "./drawers/RouteDrawer";
import { QuotaDrawer } from "./drawers/QuotaDrawer";

export function AiProvidersConsole({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  const [message, setMessage] = useState<string>();
  const [lastTest, setLastTest] = useState<string>();
  const [providerOpen, setProviderOpen] = useState(false);
  const [credentialProvider, setCredentialProvider] = useState<string | undefined>();
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [routeScenario, setRouteScenario] = useState<AiScenarioDto | undefined>();
  const [routeOpen, setRouteOpen] = useState(false);
  const [quotaScope, setQuotaScope] = useState<AiQuotaDto["scope"] | undefined>();
  const [quotaOpen, setQuotaOpen] = useState(false);

  const routedByProvider = routedScenariosByProvider(ai.routes);
  const counts = summaryCounts(ai.providers, ai.apiKeys, ai.routes);
  const done = (msg: string) => setMessage(msg);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="AI Governance"
        title="AI Providers"
        description="Govern which models power generation and how each scenario is routed."
      />
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => setProviderOpen(true)}>+ Add provider</Button>
      </div>

      <DecisionPanel
        tone={disabled ? "warning" : "success"}
        badge={ai.availability}
        title={message ?? ai.message}
        lines={["Provider secrets are sent only to Platform API and stored by the configured OpenBao-compatible secret store."]}
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Providers" value={String(counts.providers)} detail="registered endpoints" tone="success" />
        <MetricCard label="Active credentials" value={String(counts.activeCredentials)} detail="masked values only" tone="success" />
        <MetricCard label="Scenarios routed" value={`${counts.routed} / 6`} detail="of 6 generation scenarios" tone="success" />
        <MetricCard label="Last test" value={lastTest ? "ok" : "—"} detail={lastTest ?? "no test this session"} tone="success" />
      </section>

      <SectionCard eyebrow="Providers" title="Approved endpoints">
        {ai.providers.length === 0 ? (
          <p className="text-sm text-muted">No providers yet — add your first approved endpoint.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ai.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                credentials={ai.apiKeys.filter((k) => k.providerId === provider.id)}
                routedScenarios={routedByProvider[provider.id] ?? []}
                onAddCredential={(id) => { setCredentialProvider(id); setCredentialOpen(true); }}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <RoutingMatrix routes={ai.routes} providers={ai.providers} disabled={disabled}
        onConfigure={(scenario) => { setRouteScenario(scenario); setRouteOpen(true); }} />

      <QuotaPanel quotas={ai.quotas} disabled={disabled}
        onEdit={(scope) => { setQuotaScope(scope); setQuotaOpen(true); }} />

      <ProviderTestPanel ai={ai} disabled={disabled} onResult={setLastTest} />

      <SectionCard eyebrow="Records" title="Stored credentials">
        <DataTable
          columns={[{ key: "name", label: "Credential" }, { key: "providerId", label: "Provider" }, { key: "maskedValue", label: "Masked value" }, { key: "status", label: "Status" }]}
          rows={ai.apiKeys}
        />
      </SectionCard>

      <ProviderDrawer open={providerOpen} onClose={() => setProviderOpen(false)} ai={ai} onDone={done} />
      <CredentialDrawer open={credentialOpen} onClose={() => setCredentialOpen(false)} ai={ai} providerId={credentialProvider} onDone={done} />
      <RouteDrawer open={routeOpen} onClose={() => setRouteOpen(false)} ai={ai} scenario={routeScenario} onDone={done} />
      <QuotaDrawer open={quotaOpen} onClose={() => setQuotaOpen(false)} ai={ai} scope={quotaScope} onDone={done} />
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + line count**

Run: `pnpm typecheck`
Run: `wc -l apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx`
Expected: no errors; file < 400 lines.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx
git commit -m "feat(admin): AI Providers management console composition"
```

---

### Task 11: `GuardrailsConsole` + AdminConsole routing split

**Files:**
- Create: `apps/admin-web/src/features/guardrails/GuardrailsConsole.tsx`
- Create: `apps/admin-web/src/features/guardrails/index.ts`
- Create: `apps/admin-web/src/features/guardrails/GuardrailRuleDrawer.tsx`
- Modify: `apps/admin-web/src/features/ai-governance/index.ts` (export `AiProvidersConsole`, drop `AiGovernancePanel`)
- Modify: `apps/admin-web/src/features/admin-console/AdminConsole.tsx` (route split + header suppression)
- Test: `tests/unit/admin-web-render-smoke.test.mjs` (extend)

**Interfaces:**
- Consumes: hook `createGuardrailRule`, `guardrailEvents`; `PageHeader`, `SectionCard`, `DataTable`, `Button`, `Drawer`, `Field`, `Input`, `Select`.
- Produces: `GuardrailsConsole({ ai })`, `GuardrailRuleDrawer`.

- [ ] **Step 1: GuardrailRuleDrawer**

```tsx
// apps/admin-web/src/features/guardrails/GuardrailRuleDrawer.tsx
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "@/features/ai-governance/use-ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; onDone?: (msg: string) => void };

export function GuardrailRuleDrawer({ open, onClose, ai, onDone }: Props) {
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "high" | "critical">("high");
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await ai.createGuardrailRule({ name: name.trim(), type: "keyword", pattern: pattern.trim(), severity, action: "block", scope: "organization" });
      onDone?.(`Guardrail active: ${name.trim()}`);
      setName(""); setPattern("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guardrail could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add blocking rule" description="Matching prompts are rejected before any provider call.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Rule name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Blocked keyword"><Input value={pattern} onChange={(e) => setPattern(e.target.value)} required /></Field>
        <Field label="Severity">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
            <option value="info">info</option><option value="warning">warning</option>
            <option value="high">high</option><option value="critical">critical</option>
          </Select>
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save rule</Button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 2: GuardrailsConsole**

```tsx
// apps/admin-web/src/features/guardrails/GuardrailsConsole.tsx
import { Button, DataTable, DecisionPanel, PageHeader, SectionCard } from "@evcp/ui";
import { useState } from "react";
import type { useAiGovernance } from "@/features/ai-governance/use-ai-governance";
import { canMutateAiGovernance } from "@/features/ai-governance";
import { GuardrailRuleDrawer } from "./GuardrailRuleDrawer";

export function GuardrailsConsole({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader eyebrow="AI Governance" title="Guardrails" description="Block unsafe prompts before they reach any provider, and review guardrail decisions." />
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => setOpen(true)}>+ Add rule</Button>
      </div>
      <DecisionPanel tone={disabled ? "warning" : "success"} badge={ai.availability} title={message ?? ai.message}
        lines={["Guardrail rules are evaluated on every governed provider call."]} />
      <SectionCard eyebrow="Evidence" title="Recent guardrail events">
        <DataTable
          columns={[{ key: "id", label: "Event" }, { key: "decision", label: "Decision" }, { key: "scenario", label: "Scenario" }, { key: "occurredAt", label: "Time" }]}
          rows={ai.guardrailEvents}
        />
      </SectionCard>
      <GuardrailRuleDrawer open={open} onClose={() => setOpen(false)} ai={ai} onDone={setMessage} />
    </section>
  );
}
```

- [ ] **Step 3: guardrails index**

```ts
// apps/admin-web/src/features/guardrails/index.ts
export { GuardrailsConsole } from "./GuardrailsConsole";
```

- [ ] **Step 4: Update ai-governance index** — replace `AiGovernancePanel` export

```ts
// apps/admin-web/src/features/ai-governance/index.ts
export { canMutateAiGovernance } from "./status";
export { useAiGovernance } from "./use-ai-governance";
export { AiProvidersConsole } from "./AiProvidersConsole";
```

- [ ] **Step 5: Wire AdminConsole** — in `AdminConsole.tsx`:

Update the import (line 6):

```ts
import { AiProvidersConsole, useAiGovernance } from "@/features/ai-governance";
import { GuardrailsConsole } from "@/features/guardrails";
```

Update the `content` expression (line 41) — replace the `ai-providers || guardrails` branch:

```ts
  const content = page === "audit-logs" && client ? <AuditEvidenceSection client={client} />
    : page === "users" && client ? <KeycloakUserManagement client={client} />
    : page === "ai-providers" ? <AiProvidersConsole ai={ai} />
    : page === "guardrails" ? <GuardrailsConsole ai={ai} />
    : <OperationsDashboard client={client} ai={ai} page={page} />;
```

Suppress the shared generic header for the two self-headed pages (line 42) — replace the `<PageHeader .../>` with:

```tsx
{page === "ai-providers" || page === "guardrails" ? null : (
  <PageHeader eyebrow="Administration" title="Platform control center" description="Private server operations, governance and evidence." />
)}
```

- [ ] **Step 6: Extend render-smoke** — add to `tests/unit/admin-web-render-smoke.test.mjs` a probe that imports and renders both consoles with a stub hook. Follow the existing probe pattern in that file (it uses `renderToStaticMarkup` inside an `execFileSync` tsx eval). Stub value:

```js
const stubAi = {
  availability: "ready", message: "ok", providers: [], apiKeys: [], routes: [], quotas: [], guardrailEvents: [],
  reload() {}, createProvider() {}, saveApiKey() {}, configureRoute() {}, configureQuota() {}, createGuardrailRule() {}, testProvider() {}
};
```

Render `AiProvidersConsole` and `GuardrailsConsole` with `{ ai: stubAi }` and assert the HTML contains `"AI Providers"` and `"Guardrails"` respectively.

- [ ] **Step 7: Run render-smoke + typecheck**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs`
Expected: PASS.
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/admin-web/src/features/guardrails apps/admin-web/src/features/ai-governance/index.ts apps/admin-web/src/features/admin-console/AdminConsole.tsx tests/unit/admin-web-render-smoke.test.mjs
git commit -m "feat(admin): split guardrails console and route AI Providers console"
```

---

### Task 12: Remove old panel, retire its test, full verification

**Files:**
- Delete: `apps/admin-web/src/features/ai-governance/AiGovernancePanel.tsx`
- Delete or rewrite: `tests/unit/admin-ai-governance-panel.test.mjs`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "AiGovernancePanel" apps tests packages` (expected: no matches after the index.ts change).
If any remain, update them to `AiProvidersConsole` / `GuardrailsConsole` first.

- [ ] **Step 2: Delete the old panel and its test**

```bash
git rm apps/admin-web/src/features/ai-governance/AiGovernancePanel.tsx
git rm tests/unit/admin-ai-governance-panel.test.mjs
```

> If `admin-ai-governance-panel.test.mjs` covered behavior not otherwise tested (e.g. asserting the six workflows submit), re-create the equivalent assertions against `AiProvidersConsole`/`GuardrailsConsole` instead of deleting outright.

- [ ] **Step 3: Run the full quality gate**

Run: `pnpm check`
Expected: PASS (repo hygiene, design-system check, oxlint, typecheck, unit tests). Fix any design-system violations (a hardcoded color or app-local style means a token/class must replace it).

- [ ] **Step 4: Manual verification in the live app** (dallas dev server on `http://localhost:4100`)

Log in, open `/admin/ai-providers`, then drive with Playwright (or manually):
  1. **+ Add provider** → fill name/adapter/URL/models → Save → provider card appears.
  2. Card **Add credential** → enter secret → Save → card shows masked value.
  3. Routing matrix **Configure** on a scenario → pick provider/model → Save → row shows the mapping.
  4. Quota **Edit** → set daily/monthly → Save → row shows the numbers.
  5. **Run test call** → result badges populate; "Last test" metric updates.
  6. Open `/admin/guardrails` → confirm it is now the guardrails page (rules + events), not a duplicate.

Confirm no console errors other than expected ones, and that a forced API failure shows the unavailable banner (not fake success).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(admin): remove legacy AiGovernancePanel"
```

---

## Self-Review Notes

- **Spec coverage:** backend reads (Tasks 1–3), api-client (4), hook (5), Drawer (6), derivations (7), drawers (8), sections (9), console (10), guardrails split + routing + header suppression (11), cleanup + verify (12). Summary strip, routing matrix, quota panel, test tool, credentials records, empty state — all present in Tasks 9–10.
- **"Last test" is session-only** per the spec; implemented as `lastTest` state in Task 10, never read from the server.
- **Persistence parity:** Task 3 adds handlers to both the `aiGovernancePersistence` block and the in-memory block.
- **Type consistency:** hook returns `routes`/`quotas` (Task 5) consumed by the console (Task 10) and matrix/panel (Task 9); drawer prop shape `{ open, onClose, ai, onDone }` consistent across Tasks 8 and 11.
- **Verification-dependent class names / primitive APIs** (`Table`/`THead`/`TRow`/`TCell`, token class names, `AiScenarioDto` export) are flagged inline at their first use with instructions to match the actual `packages/ui` / `api-client` source.
