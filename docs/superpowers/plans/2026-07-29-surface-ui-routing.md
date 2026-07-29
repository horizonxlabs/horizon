# Admin, Creator, and Store UI Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Admin, Creator, and Store complete, directly addressable UI routes and expose every action supported by the current Platform API without adding backend endpoints or database changes.

**Architecture:** Keep the existing browser-history routing style and add typed pure route resolvers plus a shared pathname hook. Split each surface into focused route pages, retain the current auth/setup guards, and keep server-backed and device-local state explicitly separated.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Node test runner with `tsx`, `@evcp/ui`, `@evcp/api-client`, browser History API, browser `localStorage`.

## Global Constraints

- Do not add Platform API routes, Prisma schema changes, migrations, or third-party routing dependencies.
- Preserve the existing Horizon design language and reuse `@evcp/ui` primitives.
- Never replace unavailable API data with demo success data.
- Device-local Store data must be labelled as device-local.
- Unsupported ticket comments, attachments, replies, and status mutations remain disabled with `Platform API support required`.
- Write and run a failing test before every production behavior change.
- Stage and commit only files belonging to the current task; preserve `.serena/project.yml` and all unrelated user changes.

---

## File Structure

### Shared UI

- Create `packages/ui/src/browser-navigation.ts`: browser pathname hook and client navigation helper.
- Modify `packages/ui/src/index.tsx`: export browser-navigation utilities.
- Modify `packages/ui/src/app-shell.tsx`: accept a reactive `currentPath` prop and expose `aria-current`.

### Admin

- Create `apps/admin-web/src/features/admin-console/admin-routes.ts`: typed Admin route resolver.
- Create `apps/admin-web/src/features/auth-sso/AuthSettingsPage.tsx`: Auth/SSO readiness.
- Create `apps/admin-web/src/features/domain-management/DomainReadinessPage.tsx`: domain readiness.
- Create `apps/admin-web/src/features/domain-management/index.ts`: feature barrel.
- Create `apps/admin-web/src/features/publish-governance/PublishGovernancePage.tsx`: publish readiness.
- Modify `apps/admin-web/src/features/admin-console/AdminConsole.tsx`: reactive route composition.
- Modify feature barrels and `packages/config/src/index.ts`: complete Admin navigation.

### Creator

- Modify `apps/creator-web/src/app/routes.ts`: typed route parsing and complete project navigation.
- Modify `apps/creator-web/src/routes/CreatorRoutes.tsx`: route composition.
- Create `apps/creator-web/src/features/database/DatabasePage.tsx` and `index.ts`.
- Create `apps/creator-web/src/features/versions/VersionsPage.tsx`, `use-frontend-versions.ts`, and `index.ts`.
- Create `apps/creator-web/src/features/deployments/DeploymentsPage.tsx`, `use-deployments.ts`, and `index.ts`.
- Modify `apps/creator-web/src/features/users/UsersPage.tsx` and `features/publish/use-publish-access.ts`: row-specific decisions.
- Create `apps/creator-web/src/features/tickets/TicketDetailPage.tsx`.
- Modify `apps/creator-web/src/features/tickets/TicketsPage.tsx`, `use-creator-ticket-inbox.ts`, and `index.ts`.
- Modify `packages/api-client/src/index.ts`: frontend-version and ticket-to-PRD client DTOs/methods for already-existing endpoints.

### Store

- Create `apps/app-store-pwa/src/routes/store-route.ts`: typed Store route resolver.
- Create `apps/app-store-pwa/src/features/storefront/catalog.ts`: search/filter derivations.
- Create `apps/app-store-pwa/src/features/storefront/device-state.ts`: versioned local persistence.
- Create `apps/app-store-pwa/src/features/storefront/StoreProvider.tsx`: API-backed and device-local Store state owner.
- Create `apps/app-store-pwa/src/features/storefront/StoreShell.tsx`: responsive navigation/session shell.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreSearchPage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreAccessRequestsPage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreProfilePage.tsx`.
- Create `apps/app-store-pwa/src/features/storefront/pages/StoreNotFoundPage.tsx`.
- Modify `StorefrontApp.tsx`, `StorefrontSummary.tsx`, `bootstrap.ts`, `index.ts`, `StoreRoutes.tsx`, `packages/config/src/index.ts`, and `packages/ui/styles.css`.

---

## Coverage Map

| Design requirement | Implemented by |
|---|---|
| Reactive direct/back/forward navigation and current-page accessibility | Task 1 |
| Complete Admin routes and readiness pages | Task 2 |
| Complete Creator lifecycle routes and API-backed focused pages | Task 3 |
| Specific access-request approval/rejection | Task 4 |
| Creator ticket detail and ticket-to-PRD conversion | Task 5 |
| Store route parsing, search/filter logic, and device-local state | Task 6 |
| Store shell and distinct collection/search pages | Task 7 |
| Store app detail and supported API actions | Task 8 |
| Store access receipts, ticket history/detail, and profile | Task 9 |
| Lint, typecheck, build, full tests, and acceptance audit | Task 10 |

The design has no uncovered requirement. Unsupported server mutations are intentionally represented as disabled UI in Tasks 5 and 9.

### Task 1: Shared Reactive Browser Navigation

**Files:**
- Create: `packages/ui/src/browser-navigation.ts`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Create: `tests/unit/browser-navigation.test.mjs`
- Modify: `tests/unit/app-shell-accessibility-contract.test.mjs`

**Interfaces:**
- Produces: `useBrowserPath(): string`
- Produces: `navigateBrowserPath(path: string, options?: { replace?: boolean }): void`
- Produces: `usePageHeadingFocus(pathname: string): void`
- Updates: `AppShell` accepts `currentPath?: string`

- [ ] **Step 1: Write failing navigation and accessibility tests**

```js
test("navigateBrowserPath updates history and emits a reactive navigation event", async () => {
  const originalWindow = globalThis.window;
  const target = new EventTarget();
  target.location = { pathname: "/admin" };
  target.history = {
    pushState(_state, _title, path) {
      target.location.pathname = path;
    },
    replaceState(_state, _title, path) {
      target.location.pathname = path;
    }
  };
  globalThis.window = target;
  const { navigateBrowserPath, EVCP_NAVIGATION_EVENT } =
    await import("../../packages/ui/src/browser-navigation.ts");
  let emitted = 0;
  target.addEventListener(EVCP_NAVIGATION_EVENT, () => emitted++);
  navigateBrowserPath("/admin/domains");
  assert.equal(target.location.pathname, "/admin/domains");
  assert.equal(emitted, 1);
  globalThis.window = originalWindow;
});
```

Add an assertion to `app-shell-accessibility-contract.test.mjs` that the source contains `aria-current={isActive ? "page" : undefined}`.
Add a source assertion that `usePageHeadingFocus` queries `main h1` and calls `focus()`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --import tsx --test tests/unit/browser-navigation.test.mjs tests/unit/app-shell-accessibility-contract.test.mjs
```

Expected: FAIL because `browser-navigation.ts` and the `aria-current` behavior do not exist.

- [ ] **Step 3: Implement the browser navigation contract**

```ts
import { useEffect, useState } from "react";

export const EVCP_NAVIGATION_EVENT = "evcp:navigate";

export function navigateBrowserPath(path: string, options: { replace?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new Event(EVCP_NAVIGATION_EVENT));
}

export function useBrowserPath(): string {
  const [pathname, setPathname] = useState(
    () => (typeof window === "undefined" ? "/" : window.location.pathname)
  );
  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    window.addEventListener(EVCP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(EVCP_NAVIGATION_EVENT, sync);
    };
  }, []);
  return pathname;
}

export function usePageHeadingFocus(pathname: string): void {
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [pathname]);
}
```

Export all three functions from `@evcp/ui`. Add `currentPath = window.location.pathname` fallback to `AppShell`, use that value for active-route resolution, and add:

```tsx
aria-current={isActive ? "page" : undefined}
```

- [ ] **Step 4: Run tests and workspace typecheck**

```bash
node --import tsx --test tests/unit/browser-navigation.test.mjs tests/unit/app-shell-accessibility-contract.test.mjs
pnpm --filter @evcp/ui typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser-navigation.ts packages/ui/src/index.tsx packages/ui/src/app-shell.tsx tests/unit/browser-navigation.test.mjs tests/unit/app-shell-accessibility-contract.test.mjs
git commit -m "feat(ui): add reactive browser navigation"
```

### Task 2: Complete Admin Routes and Readiness Pages

**Files:**
- Create: `apps/admin-web/src/features/admin-console/admin-routes.ts`
- Create: `apps/admin-web/src/features/auth-sso/AuthSettingsPage.tsx`
- Create: `apps/admin-web/src/features/domain-management/DomainReadinessPage.tsx`
- Create: `apps/admin-web/src/features/domain-management/index.ts`
- Create: `apps/admin-web/src/features/publish-governance/PublishGovernancePage.tsx`
- Modify: `apps/admin-web/src/features/auth-sso/index.ts`
- Modify: `apps/admin-web/src/features/publish-governance/index.ts`
- Modify: `apps/admin-web/src/features/admin-console/AdminConsole.tsx`
- Modify: `packages/config/src/index.ts`
- Create: `tests/unit/admin-web-routing.test.mjs`
- Modify: `tests/unit/navigation-config.test.mjs`

**Interfaces:**
- Produces: `type AdminPage`
- Produces: `adminPageFromPath(pathname: string): AdminPage`
- Consumes: `useBrowserPath()` and existing Auth/Domain/Publish evidence exports.

- [ ] **Step 1: Write failing Admin route tests**

```js
const { adminPageFromPath } =
  await import("../../apps/admin-web/src/features/admin-console/admin-routes.ts");

test("Admin route resolver recognizes every configured page", () => {
  assert.equal(adminPageFromPath("/admin"), "dashboard");
  assert.equal(adminPageFromPath("/admin/services"), "services");
  assert.equal(adminPageFromPath("/admin/ai-providers"), "ai-providers");
  assert.equal(adminPageFromPath("/admin/guardrails"), "guardrails");
  assert.equal(adminPageFromPath("/admin/knowledge"), "knowledge");
  assert.equal(adminPageFromPath("/admin/audit-logs"), "audit-logs");
  assert.equal(adminPageFromPath("/admin/users"), "users");
  assert.equal(adminPageFromPath("/admin/auth"), "auth");
  assert.equal(adminPageFromPath("/admin/domains"), "domains");
  assert.equal(adminPageFromPath("/admin/publishing"), "publishing");
  assert.equal(adminPageFromPath("/admin/unknown"), "not-found");
});
```

Extend `navigation-config.test.mjs` to require `Auth & SSO`, `Domains`, and `Publishing`.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/admin-web-routing.test.mjs tests/unit/navigation-config.test.mjs
```

Expected: FAIL because the resolver and navigation items are absent.

- [ ] **Step 3: Implement typed route resolution and pages**

```ts
export type AdminPage =
  | "dashboard"
  | "services"
  | "ai-providers"
  | "guardrails"
  | "knowledge"
  | "audit-logs"
  | "users"
  | "auth"
  | "domains"
  | "publishing"
  | "not-found";

const ADMIN_PATHS: Record<string, AdminPage> = {
  "/admin": "dashboard",
  "/admin/services": "services",
  "/admin/ai-providers": "ai-providers",
  "/admin/guardrails": "guardrails",
  "/admin/knowledge": "knowledge",
  "/admin/audit-logs": "audit-logs",
  "/admin/users": "users",
  "/admin/auth": "auth",
  "/admin/domains": "domains",
  "/admin/publishing": "publishing"
};

export function adminPageFromPath(pathname: string): AdminPage {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return ADMIN_PATHS[normalized] ?? "not-found";
}
```

Build the three readiness pages with `PageHeader`, `SectionCard`, `DataTable`, and `DecisionPanel`. Label static exports as `Readiness evidence`, not live settings. In `AdminConsole`, replace the private substring resolver with:

```tsx
const pathname = useBrowserPath();
usePageHeadingFocus(pathname);
const page = adminPageFromPath(pathname);
```

Pass `currentPath={pathname}` to `AppShell`. Render a specific not-found `DecisionPanel` for `not-found`.

- [ ] **Step 4: Run Admin tests, typecheck, and build**

```bash
node --import tsx --test tests/unit/admin-web-routing.test.mjs tests/unit/navigation-config.test.mjs tests/unit/admin-app-ownership.test.mjs tests/unit/admin-web-render-smoke.test.mjs
pnpm --filter @evcp/admin-web typecheck
pnpm --filter @evcp/admin-web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/features/admin-console apps/admin-web/src/features/auth-sso apps/admin-web/src/features/domain-management apps/admin-web/src/features/publish-governance packages/config/src/index.ts tests/unit/admin-web-routing.test.mjs tests/unit/navigation-config.test.mjs
git commit -m "feat(admin): complete readiness routes"
```

### Task 3: Complete Creator Routing, Navigation, Database, Versions, and Deployments

**Files:**
- Modify: `apps/creator-web/src/app/routes.ts`
- Modify: `apps/creator-web/src/app/use-creator-app.tsx`
- Modify: `apps/creator-web/src/routes/CreatorRoutes.tsx`
- Create: `apps/creator-web/src/features/database/DatabasePage.tsx`
- Create: `apps/creator-web/src/features/database/index.ts`
- Create: `apps/creator-web/src/features/versions/VersionsPage.tsx`
- Create: `apps/creator-web/src/features/versions/use-frontend-versions.ts`
- Create: `apps/creator-web/src/features/versions/index.ts`
- Create: `apps/creator-web/src/features/deployments/DeploymentsPage.tsx`
- Create: `apps/creator-web/src/features/deployments/use-deployments.ts`
- Create: `apps/creator-web/src/features/deployments/index.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `tests/unit/creator-web-routing.test.mjs`
- Modify: `tests/unit/navigation-config.test.mjs`
- Create: `tests/unit/api-client-creator-lifecycle.test.mjs`

**Interfaces:**
- Produces: `CreatorRoute` with `page`, optional `projectId`, and optional `ticketId`.
- Produces API-client methods:
  - `getFrontendCheckpoints(projectId): Promise<FrontendCheckpointTimelineDto>`
  - `restoreFrontendCheckpoint(projectId, checkpointId): Promise<FrontendRestoreResultDto>`
- Reuses: `WorkspaceDatabasePanel` and `listDeployments(projectId)`.

- [ ] **Step 1: Replace old Soon expectations with failing complete-route tests**

```js
test("creatorRouteFromPath resolves project lifecycle pages", () => {
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/database"), {
    page: "database",
    projectId: "proj_1"
  });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/versions"), {
    page: "versions",
    projectId: "proj_1"
  });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/deployments"), {
    page: "deployments",
    projectId: "proj_1"
  });
});

test("creator navigation enables every lifecycle entry for the selected project", () => {
  const nav = createCreatorNavigation({ id: "proj_1" });
  assert.equal(nav.some((item) => item.disabled), false);
  assert.equal(nav.some((item) => item.label.includes("(Soon)")), false);
  assert.ok(nav.some((item) => item.route === "/creator/projects/proj_1/database"));
  assert.ok(nav.some((item) => item.route === "/creator/projects/proj_1/versions"));
  assert.ok(nav.some((item) => item.route === "/creator/projects/proj_1/deployments"));
});
```

Add API-client assertions for the exact existing frontend checkpoint and restore URLs.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/creator-web-routing.test.mjs tests/unit/navigation-config.test.mjs tests/unit/api-client-creator-lifecycle.test.mjs
```

Expected: FAIL on missing route pages, disabled navigation, and absent API-client methods.

- [ ] **Step 3: Implement route parsing, client methods, and focused pages**

```ts
export type CreatorPage =
  | "projects"
  | "workspace"
  | "prd"
  | "database"
  | "versions"
  | "users"
  | "publish"
  | "deployments"
  | "tickets"
  | "ticket-detail"
  | "not-found";

export type CreatorRoute = {
  page: CreatorPage;
  projectId?: string;
  ticketId?: string;
};

export function creatorRouteFromPath(pathname: string): CreatorRoute {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "creator") return { page: "projects" };
  if (segments[0] !== "creator" || segments[1] !== "projects" || !segments[2])
    return { page: "not-found" };
  const projectId = decodeURIComponent(segments[2]);
  if (segments.length === 3) return { page: "workspace", projectId };
  const suffix = segments[3];
  if (suffix === "tickets" && segments[4])
    return { page: "ticket-detail", projectId, ticketId: decodeURIComponent(segments[4]) };
  const pageBySuffix = {
    prd: "prd",
    database: "database",
    versions: "versions",
    users: "users",
    publish: "publish",
    deployments: "deployments",
    tickets: "tickets"
  } as const;
  return pageBySuffix[suffix as keyof typeof pageBySuffix]
    ? { page: pageBySuffix[suffix as keyof typeof pageBySuffix], projectId }
    : { page: "not-found", projectId };
}
```

Add exact DTOs mirroring the existing API:

```ts
export type FrontendCheckpointDto = {
  id: string;
  projectId: string;
  version: string;
  sourcePreviewVersion: string;
  sourceTaskId?: string;
  status: "current" | "previous" | "restored";
  checksum: string;
  fileManifest: string[];
  routeSnapshot: string[];
  changeSummary: string;
  changedAreas: string[];
  createdByUserId: string;
  restoreSourceCheckpointId?: string;
  createdAt: string;
};

export type FrontendCheckpointTimelineDto = {
  project: PlatformProjectDto;
  activeCheckpoint: FrontendCheckpointDto;
  checkpoints: FrontendCheckpointDto[];
};

export type FrontendRestoreResultDto = {
  checkpoint: FrontendCheckpointDto;
  restoredFrom: FrontendCheckpointDto;
  boundary: {
    frontendChanged: true;
    unchanged: Array<
      "backend" | "database" | "auth" | "app_roles" | "membership" | "domain" | "prd_baseline"
    >;
  };
  auditEventId: string;
};

getFrontendCheckpoints(projectId: string) {
  return this.request<FrontendCheckpointTimelineDto>(
    `/projects/${encodeURIComponent(projectId)}/frontend/checkpoints`
  );
}

restoreFrontendCheckpoint(projectId: string, checkpointId: string) {
  return this.request<FrontendRestoreResultDto>(
    `/projects/${encodeURIComponent(projectId)}/frontend/restore`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkpointId })
    }
  );
}
```

`DatabasePage` wraps the existing lazy database panel. `VersionsPage` loads checkpoints, displays status/change summary, restores one selected checkpoint, and refreshes. `DeploymentsPage` loads `listDeployments(projectId)` and shows environment, commit, health, and timestamp.

In `useCreatorApp`, derive the route from the reactive pathname and focus the new page heading:

```ts
const pathname = useBrowserPath();
usePageHeadingFocus(pathname);
const creatorRoute = creatorRouteFromPath(pathname);
const creatorPage = creatorRoute.page;
```

Replace the old total `Record<CreatorPage, string>` with a route builder that accepts only selectable lifecycle pages:

```ts
export type CreatorSelectablePage = Exclude<CreatorPage, "ticket-detail" | "not-found">;

export function creatorPathForPage(projectId: string, page: CreatorSelectablePage): string {
  if (page === "projects") return "/creator/";
  const base = `/creator/projects/${encodeURIComponent(projectId)}`;
  const suffix: Partial<Record<CreatorSelectablePage, string>> = {
    prd: "prd",
    database: "database",
    versions: "versions",
    users: "users",
    publish: "publish",
    deployments: "deployments",
    tickets: "tickets"
  };
  return page === "workspace" ? base : `${base}/${suffix[page]}`;
}
```

- [ ] **Step 4: Run Creator route tests, typecheck, and build**

```bash
node --import tsx --test tests/unit/creator-web-routing.test.mjs tests/unit/navigation-config.test.mjs tests/unit/api-client-creator-lifecycle.test.mjs tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/api-client typecheck
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/creator-web/src/app apps/creator-web/src/routes apps/creator-web/src/features/database apps/creator-web/src/features/versions apps/creator-web/src/features/deployments packages/api-client/src/index.ts packages/config/src/index.ts tests/unit/creator-web-routing.test.mjs tests/unit/navigation-config.test.mjs tests/unit/api-client-creator-lifecycle.test.mjs
git commit -m "feat(creator): complete lifecycle routes"
```

### Task 4: Add Row-Specific Creator Access Decisions

**Files:**
- Modify: `apps/creator-web/src/features/publish/use-publish-access.ts`
- Modify: `apps/creator-web/src/features/users/UsersPage.tsx`
- Create: `tests/unit/creator-access-actions.test.mjs`
- Modify: `tests/e2e/sprint6-users-publish-smoke.test.mjs`

**Interfaces:**
- Replaces: `handleApproveAccessRequest()`
- Produces: `handleAccessRequestDecision(requestId, decision): Promise<void>`
- Produces: `decidingAccessRequestId?: string`

- [ ] **Step 1: Write a failing source and API-flow contract**

```js
test("Creator access actions target the selected request and expose both decisions", () => {
  const hook = readFileSync(
    "apps/creator-web/src/features/publish/use-publish-access.ts",
    "utf8"
  );
  const page = readFileSync("apps/creator-web/src/features/users/UsersPage.tsx", "utf8");
  assert.match(hook, /handleAccessRequestDecision\(requestId.*decision/);
  assert.match(hook, /decidingAccessRequestId/);
  assert.match(page, />Approve</);
  assert.match(page, />Reject</);
  assert.doesNotMatch(hook, /find\\(\\s*\\(request\\) => request\\.status === "pending"/);
});
```

Extend the Sprint 6 flow with a rejection of a second request and assert only that request becomes rejected.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/creator-access-actions.test.mjs tests/e2e/sprint6-users-publish-smoke.test.mjs
```

Expected: FAIL because the hook still chooses the first pending request and the page has no decision buttons.

- [ ] **Step 3: Implement exact-request decisions**

```ts
const [decidingAccessRequestId, setDecidingAccessRequestId] = useState<string>();

async function handleAccessRequestDecision(
  requestId: string,
  decision: "approved" | "rejected"
) {
  setDecidingAccessRequestId(requestId);
  try {
    await createCreatorPlatformClient().decideAppAccessRequest(selectedProject.id, {
      requestId,
      decision
    });
    await refreshCreatorPublishState(selectedProject.id);
    setPublishMessage(`Access request ${decision} through Platform API.`);
  } catch (error) {
    setPublishMessage(
      error instanceof Error ? `Access decision failed: ${error.message}` : "Access decision failed."
    );
  } finally {
    setDecidingAccessRequestId(undefined);
  }
}
```

Render access requests as rows/cards with Approve and Reject controls. Disable only when `decidingAccessRequestId === request.id` or the request is no longer pending.

- [ ] **Step 4: Run focused tests and Creator verification**

```bash
node --import tsx --test tests/unit/creator-access-actions.test.mjs tests/e2e/sprint6-users-publish-smoke.test.mjs tests/unit/platform-app-publish-services.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/creator-web/src/features/publish/use-publish-access.ts apps/creator-web/src/features/users/UsersPage.tsx tests/unit/creator-access-actions.test.mjs tests/e2e/sprint6-users-publish-smoke.test.mjs
git commit -m "feat(creator): add access request decisions"
```

### Task 5: Add Creator Ticket Detail and Ticket-to-PRD Action

**Files:**
- Modify: `packages/api-client/src/index.ts`
- Modify: `apps/creator-web/src/features/tickets/use-creator-ticket-inbox.ts`
- Modify: `apps/creator-web/src/features/tickets/TicketsPage.tsx`
- Create: `apps/creator-web/src/features/tickets/TicketDetailPage.tsx`
- Modify: `apps/creator-web/src/features/tickets/index.ts`
- Modify: `apps/creator-web/src/routes/CreatorRoutes.tsx`
- Create: `tests/unit/creator-ticket-actions.test.mjs`
- Modify: `tests/e2e/sprint8-mvp-hardening-smoke.test.mjs`

**Interfaces:**
- Produces API client:
  - `convertTicketToPrdChange(projectId, input): Promise<PrdChangeRequestDto>`
- Extends: `CreatorTicketInboxItem` with returned ticket detail fields and `actions`.
- Produces: inbox `refresh(): Promise<void>`.

- [ ] **Step 1: Write failing API-client and UI contracts**

```js
test("ticket detail exposes API-backed conversion and disabled unsupported actions", () => {
  const page = readFileSync(
    "apps/creator-web/src/features/tickets/TicketDetailPage.tsx",
    "utf8"
  );
  assert.match(page, /Convert to PRD Change/);
  assert.match(page, /Platform API support required/);
  assert.match(page, /convertTicketToPrdChange/);
});
```

Add a runtime API-client test that records:

```js
await client.convertTicketToPrdChange("proj_1", {
  ticketId: "ticket_1",
  title: "Address Store feedback",
  proposedRequirement: "Resolve the reported Store issue.",
  affectedSections: ["functional_requirements"],
  acceptanceCriteria: ["The reported workflow succeeds."],
  riskLevel: "medium"
});
assert.equal(requests[0].url, "/creator/projects/proj_1/prd/changes/from-ticket");
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/creator-ticket-actions.test.mjs tests/e2e/sprint8-mvp-hardening-smoke.test.mjs
```

Expected: FAIL because the client method and detail page do not exist.

- [ ] **Step 3: Implement ticket navigation and conversion**

```ts
export type ConvertTicketToPrdChangeInput = {
  ticketId: string;
  title: string;
  proposedRequirement: string;
  affectedSections: string[];
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
};

export type PrdChangeRequestDto = {
  id: string;
  projectId: string;
  sourceType: "ticket" | "prompt" | "manual";
  sourceTicketId?: string;
  title: string;
  proposedRequirement: string;
  affectedSections: string[];
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "draft" | "pending_approval" | "approved" | "rejected" | "changes_requested";
  requestedByUserId: string;
  approvedPrdVersionId?: string;
  createdAt: string;
  updatedAt: string;
};

convertTicketToPrdChange(projectId: string, input: ConvertTicketToPrdChangeInput) {
  return this.request<PrdChangeRequestDto>(
    `/creator/projects/${encodeURIComponent(projectId)}/prd/changes/from-ticket`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}
```

Make inbox rows navigate to:

```ts
navigateBrowserPath(
  `/creator/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(ticket.id)}`
);
```

On the detail page, select the ticket by route ID after inbox load. Convert with explicit input derived from the ticket:

```ts
await client.convertTicketToPrdChange(projectId, {
  ticketId: ticket.id,
  title: `Address ${ticket.ticketNumber}: ${ticket.title}`,
  proposedRequirement: ticket.description || ticket.title,
  affectedSections: ["functional_requirements"],
  acceptanceCriteria: [`Resolve ${ticket.ticketNumber} and preserve existing access behavior.`],
  riskLevel: ticket.priority === "high" ? "high" : "medium"
});
```

After success call both `refresh()` and `app.refreshPrdState(projectId)`. Reply, Resolve, and Convert to AI Prompt remain disabled with the required explanation.

- [ ] **Step 4: Run ticket tests, typecheck, and build**

```bash
node --import tsx --test tests/unit/creator-ticket-actions.test.mjs tests/e2e/sprint7-store-ticket-smoke.test.mjs tests/e2e/sprint8-mvp-hardening-smoke.test.mjs
pnpm --filter @evcp/api-client typecheck
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/index.ts apps/creator-web/src/features/tickets apps/creator-web/src/routes/CreatorRoutes.tsx tests/unit/creator-ticket-actions.test.mjs tests/e2e/sprint8-mvp-hardening-smoke.test.mjs
git commit -m "feat(creator): add ticket detail workflow"
```

### Task 6: Add Pure Store Routes, Catalog Derivations, and Device State

**Files:**
- Create: `apps/app-store-pwa/src/routes/store-route.ts`
- Create: `apps/app-store-pwa/src/features/storefront/catalog.ts`
- Create: `apps/app-store-pwa/src/features/storefront/device-state.ts`
- Create: `tests/unit/store-routing.test.mjs`
- Create: `tests/unit/store-catalog.test.mjs`
- Create: `tests/unit/store-device-state.test.mjs`

**Interfaces:**
- Produces: `StoreRoute`
- Produces: `storeRouteFromPath(pathname: string): StoreRoute`
- Produces: `filterStoreApps(apps, query, filters)`
- Produces: `createStoreDeviceState(storage)` repository.

- [ ] **Step 1: Write failing pure unit tests**

```js
test("Store route resolver supports collection and parameter routes", () => {
  assert.deepEqual(storeRouteFromPath("/store"), { page: "my-apps" });
  assert.deepEqual(storeRouteFromPath("/store/apps/leave-management"), {
    page: "app-detail",
    appSlug: "leave-management"
  });
  assert.deepEqual(storeRouteFromPath("/store/tickets/ticket_1"), {
    page: "ticket-detail",
    ticketId: "ticket_1"
  });
  assert.deepEqual(storeRouteFromPath("/store/missing"), { page: "not-found" });
});

test("catalog search matches name description owner and role", () => {
  assert.deepEqual(
    filterStoreApps(apps, "manager", { collection: "all" }).map((app) => app.slug),
    ["leave-management"]
  );
});

test("device state recovers from invalid JSON and orders recent apps newest first", () => {
  const storage = memoryStorage({ "evcp-store-device-v1": "invalid" });
  const repository = createStoreDeviceState(storage);
  assert.deepEqual(repository.read().favorites, []);
  repository.recordRecent("leave");
  repository.recordRecent("assets");
  repository.recordRecent("leave");
  assert.deepEqual(repository.read().recent, ["leave", "assets"]);
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/store-routing.test.mjs tests/unit/store-catalog.test.mjs tests/unit/store-device-state.test.mjs
```

Expected: FAIL because all three modules are absent.

- [ ] **Step 3: Implement pure Store modules**

```ts
export type StoreRoute =
  | { page: "my-apps" | "available" | "search" | "favorites" | "recent" | "access-requests" | "tickets" | "profile" }
  | { page: "app-detail"; appSlug: string }
  | { page: "ticket-detail"; ticketId: string }
  | { page: "not-found" };
```

Implement exact path matching, decoding dynamic segments only after validating segment counts.

```ts
export type StoreDeviceSnapshot = {
  version: 1;
  favorites: string[];
  recent: string[];
  ticketIds: string[];
  accessReceipts: StoreAccessRequestResponse[];
};

const EMPTY_STORE_DEVICE_SNAPSHOT: StoreDeviceSnapshot = {
  version: 1,
  favorites: [],
  recent: [],
  ticketIds: [],
  accessReceipts: []
};
```

Deduplicate all slug/ID lists, cap `recent` at 20 and ticket IDs at 50, and return a cloned empty snapshot when parsing or validation fails.

- [ ] **Step 4: Run pure tests and Store typecheck**

```bash
node --import tsx --test tests/unit/store-routing.test.mjs tests/unit/store-catalog.test.mjs tests/unit/store-device-state.test.mjs
pnpm --filter @evcp/app-store-pwa typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app-store-pwa/src/routes/store-route.ts apps/app-store-pwa/src/features/storefront/catalog.ts apps/app-store-pwa/src/features/storefront/device-state.ts tests/unit/store-routing.test.mjs tests/unit/store-catalog.test.mjs tests/unit/store-device-state.test.mjs
git commit -m "feat(store): add routes and device state"
```

### Task 7: Split Store into Provider, Shell, and Collection Pages

**Files:**
- Create: `apps/app-store-pwa/src/features/storefront/StoreProvider.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/StoreShell.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreSearchPage.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreNotFoundPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StorefrontSummary.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/index.ts`
- Modify: `apps/app-store-pwa/src/routes/StoreRoutes.tsx`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/app-store-pwa-render-smoke.test.mjs`
- Create: `tests/unit/store-page-contract.test.mjs`

**Interfaces:**
- Produces: `StoreProvider` and `useStorefront()`.
- Consumes: `loadStoreBootstrap`, Store route resolver, device-state repository.
- Produces pages for My Apps, Available, Search, Favorites, Recent, and Not Found.

- [ ] **Step 1: Write failing Store page and navigation contracts**

```js
test("Store navigation points to distinct implemented pages", () => {
  const source = readAllSourceFiles("apps/app-store-pwa/src");
  for (const route of [
    "/store/",
    "/store/available",
    "/store/search",
    "/store/favorites",
    "/store/recent",
    "/store/access-requests",
    "/store/tickets",
    "/store/profile"
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(source, /StoreProvider/);
  assert.match(source, /StoreCollectionPage/);
  assert.match(source, /StoreSearchPage/);
});
```

Replace the old smoke expectation that `StoreRoutes` directly renders one `StorefrontApp` for every Store URL with expectations for typed route composition.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/app-store-pwa-render-smoke.test.mjs tests/unit/store-page-contract.test.mjs tests/unit/navigation-config.test.mjs
```

Expected: FAIL because the Store remains a single-page component and navigation lacks Search/Favorites/Recent.

- [ ] **Step 3: Implement provider, shell, and collection routing**

The provider exposes this stable contract:

```ts
export type StorefrontContextValue = {
  bootstrap: StoreBootstrapState;
  allApps: AppStoreItem[];
  device: StoreDeviceSnapshot;
  refreshHome(): Promise<void>;
  toggleFavorite(appSlug: string): void;
  recordRecent(appSlug: string): void;
  rememberTicket(ticketId: string): void;
  rememberAccessReceipt(receipt: StoreAccessRequestResponse): void;
  clearDevicePreferences(): void;
  logout(): Promise<void>;
};
```

`StorefrontApp` becomes:

```tsx
export function StorefrontApp({ route }: { route: StoreRoute }) {
  return (
    <StoreProvider>
      <StoreShell route={route}>
        <StorePage route={route} />
      </StoreShell>
    </StoreProvider>
  );
}
```

`StoreRoutes` uses `useBrowserPath`, preserves the generated-app branch, resolves the Store route, and passes it into `StorefrontApp`. Collection cards navigate to detail via `navigateBrowserPath`, not to the generated app route.
It also calls `usePageHeadingFocus(pathname)` so client navigation moves focus to the new page heading.

- [ ] **Step 4: Run Store tests, typecheck, and build**

```bash
node --import tsx --test tests/unit/app-store-pwa-render-smoke.test.mjs tests/unit/store-page-contract.test.mjs tests/unit/navigation-config.test.mjs tests/e2e/sprint7-store-ticket-smoke.test.mjs
pnpm --filter @evcp/app-store-pwa typecheck
pnpm --filter @evcp/app-store-pwa build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app-store-pwa/src/features/storefront apps/app-store-pwa/src/routes/StoreRoutes.tsx packages/config/src/index.ts packages/ui/styles.css tests/unit/app-store-pwa-render-smoke.test.mjs tests/unit/store-page-contract.test.mjs tests/unit/navigation-config.test.mjs
git commit -m "feat(store): split storefront pages"
```

### Task 8: Implement Store App Detail and Supported Actions

**Files:**
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreProvider.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx`
- Modify: `packages/ui/src/index.tsx`
- Create: `tests/unit/store-app-detail-contract.test.mjs`
- Modify: `tests/e2e/store-actions-api-client-smoke.test.mjs`

**Interfaces:**
- Consumes existing API methods: `getStoreAppDetail`, `installStoreApp`, `uninstallStoreApp`, `requestStoreAccess`, `submitStoreTicket`.
- Produces provider action-state keyed by action and app slug.
- Updates `AppCard` to accept `detailRoute?: string`.

- [ ] **Step 1: Write failing app-detail behavior tests**

```js
test("Store app cards link to Store detail before generated runtime", () => {
  const source = readFileSync("packages/ui/src/index.tsx", "utf8");
  assert.match(source, /detailRoute/);
  assert.match(source, /href={detailRoute}/);
});

test("Store app detail owns open install remove access and ticket actions", () => {
  const source = readFileSync(
    "apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx",
    "utf8"
  );
  for (const action of [
    "getStoreAppDetail",
    "installStoreApp",
    "uninstallStoreApp",
    "requestStoreAccess",
    "submitStoreTicket",
    "recordRecent"
  ]) assert.match(source, new RegExp(action));
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/store-app-detail-contract.test.mjs tests/e2e/store-actions-api-client-smoke.test.mjs
```

Expected: FAIL because the detail component and detail-route card contract do not exist.

- [ ] **Step 3: Move supported actions into the detail page**

Load app detail when `appSlug` changes, guard stale async responses, and expose separate loading/error states. Use explicit ticket fields:

```ts
await client.submitStoreTicket(app.slug, {
  type: ticketType,
  priority: ticketPriority,
  title: ticketTitle.trim(),
  description: ticketDescription.trim(),
  deviceInfo: ticketDevice.trim()
});
```

On Open:

```ts
recordRecent(app.slug);
window.location.assign(app.route || `/apps/${app.slug}`);
```

On access or ticket success, persist only the returned receipt/ID and refresh Store-home data. `AppCard` always uses:

```tsx
<a className="button-link" href={detailRoute ?? `/store/apps/${app.slug}`}>
  View Details
</a>
```

- [ ] **Step 4: Run detail tests and Store verification**

```bash
node --import tsx --test tests/unit/store-app-detail-contract.test.mjs tests/e2e/store-actions-api-client-smoke.test.mjs tests/unit/platform-store-ticket-services.test.mjs
pnpm --filter @evcp/ui typecheck
pnpm --filter @evcp/app-store-pwa typecheck
pnpm --filter @evcp/app-store-pwa build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app-store-pwa/src/features/storefront packages/ui/src/index.tsx tests/unit/store-app-detail-contract.test.mjs tests/e2e/store-actions-api-client-smoke.test.mjs
git commit -m "feat(store): add app detail actions"
```

### Task 9: Implement Store Access Requests, Tickets, Ticket Detail, and Profile

**Files:**
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreAccessRequestsPage.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/pages/StoreProfilePage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreProvider.tsx`
- Modify: `packages/ui/styles.css`
- Create: `tests/unit/store-device-history-pages.test.mjs`
- Modify: `tests/e2e/sprint7-store-ticket-smoke.test.mjs`

**Interfaces:**
- Consumes: device access receipts and ticket IDs.
- Consumes: `getStoreTicket(ticketId)`.
- Produces: per-ticket success/unavailable results without dropping valid tickets.
- Produces: profile action `clearDevicePreferences()`.

- [ ] **Step 1: Write failing device-history page contracts**

```js
test("Store history pages disclose device-local scope and unsupported actions", () => {
  const source = readAllSourceFiles(
    "apps/app-store-pwa/src/features/storefront/pages"
  );
  assert.match(source, /Stored on this device/);
  assert.match(source, /Platform API support required/);
  assert.match(source, /clearDevicePreferences/);
  assert.match(source, /getStoreTicket/);
  assert.match(source, /aria-disabled/);
});
```

Extend Sprint 7 UI text checks with `Access Requests`, `Ticket History`, and `Device preferences`.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --import tsx --test tests/unit/store-device-history-pages.test.mjs tests/e2e/sprint7-store-ticket-smoke.test.mjs
```

Expected: FAIL because the pages do not exist.

- [ ] **Step 3: Implement honest device-local history pages**

For ticket history, preserve valid and invalid results independently:

```ts
const results = await Promise.all(
  device.ticketIds.map(async (ticketId) => {
    try {
      return { ticketId, status: "ready" as const, ticket: await client.getStoreTicket(ticketId) };
    } catch (error) {
      return {
        ticketId,
        status: "unavailable" as const,
        message: error instanceof Error ? error.message : "Ticket unavailable"
      };
    }
  })
);
```

Ticket detail fetches one current ticket and renders its timeline. Comments and attachments render disabled controls with explanatory text. Access Requests joins local receipts to current app cards by slug and clearly labels receipts as device-local. Profile clears only Store device preferences and keeps the auth session.

- [ ] **Step 4: Run Store ticket tests, typecheck, and build**

```bash
node --import tsx --test tests/unit/store-device-history-pages.test.mjs tests/e2e/sprint7-store-ticket-smoke.test.mjs tests/e2e/platform-publish-store-persistence-flow.test.mjs
pnpm --filter @evcp/app-store-pwa typecheck
pnpm --filter @evcp/app-store-pwa build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app-store-pwa/src/features/storefront packages/ui/styles.css tests/unit/store-device-history-pages.test.mjs tests/e2e/sprint7-store-ticket-smoke.test.mjs
git commit -m "feat(store): add device history pages"
```

### Task 10: Full Acceptance and Regression Verification

**Files:**
- Modify only when a failing verification identifies an in-scope regression.
- Review: `docs/superpowers/specs/2026-07-29-surface-ui-routing-design.md`

**Interfaces:**
- Consumes all prior task outputs.
- Produces fresh verification evidence and a requirement-by-requirement checklist.

- [ ] **Step 1: Run changed-file quality checks**

```bash
pnpm check:changed
```

Expected: PASS with no conflict markers, formatting failures, architecture violations, or focused test failures.

- [ ] **Step 2: Run full lint and typecheck**

```bash
pnpm lint
pnpm typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the production build**

```bash
pnpm build
```

Expected: all packages and apps build successfully.

- [ ] **Step 4: Run the full automated test suite**

```bash
pnpm test
```

Expected: unit, integration, and end-to-end suites report zero failures.

- [ ] **Step 5: Check every design acceptance criterion against code and tests**

Run:

```bash
rg -n "Soon|disabledReason" apps/creator-web/src packages/config/src/index.ts
rg -n "store/(available|search|favorites|recent|access-requests|tickets|profile)" apps/app-store-pwa/src packages/config/src/index.ts
rg -n "demo|mock success|Platform API support required|Stored on this device" apps/admin-web/src apps/creator-web/src apps/app-store-pwa/src
git diff --check HEAD~9..HEAD
git status --short
```

Expected:

- No Creator lifecycle navigation contains `(Soon)`.
- Every Store route is present in the resolver and page composition.
- Unsupported actions contain the API-support disclosure.
- No newly introduced demo-success fallback exists.
- Diff check returns no whitespace errors.
- Only known unrelated user changes remain unstaged.

If Step 1–5 identifies an in-scope regression, return to the task that owns the failing file, repeat that task's RED-GREEN cycle, and use its exact Step 5 file list for the correction commit. Do not create an empty verification commit.
