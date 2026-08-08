# Web App Access Without Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users open healthy published web apps immediately after access becomes active, without an installation journey.

**Architecture:** Access status becomes the single source of truth for Store collection membership and primary actions in both repository-backed Platform API responses and the Store UI. Legacy installation fields, persistence, and API routes remain available for compatibility but are ignored by the MVP user flow.

**Tech Stack:** TypeScript, React, Node test runner, `react-test-renderer`, pnpm, Prisma-backed repository adapters

## Global Constraints

- `available` exposes Request Access, `pending` exposes View Status, and `active` exposes Open App.
- My Apps is derived from `accessStatus === "active"`, independent of `installStatus`.
- Store UI must not display or invoke Install, Remove, Uninstall, installation status, or an installation journey.
- Open App must require active access, `health === "healthy"`, and a non-empty published runtime route.
- Existing installation APIs, response fields, persistence models, and server routes remain compatibility-only.
- No new runtime dependency or database migration.

---

### Task 1: Make Platform API Store responses access-first

**Files:**
- Modify: `tests/integration/platform-app-install-persistence-contract.test.mjs`
- Modify: `apps/platform-api/src/persistence/published-app-access.ts`
- Modify: `apps/platform-api/src/persistence/publish-store-repositories.ts`

**Interfaces:**
- Consumes: `StorefrontAppCard.accessStatus` and existing legacy `installStatus`.
- Produces: `storeActionsForCard(card)` where active access returns `open`, pending returns `view_status`, and available returns `request_access`; `listStoreApps(actor)` partitions cards by access.

- [ ] **Step 1: Write the failing repository-backed service assertions**

```js
const beforeInstall = await service.listStoreApps(endUserActor);
assert.equal(beforeInstall.myApps.some((app) => app.slug === "leave-install"), true);
assert.equal(beforeInstall.availableApps.some((app) => app.slug === "leave-install"), false);
assert.equal(beforeInstall.myApps[0].primaryAction, "open");
assert.deepEqual((await service.getStoreAppDetail(endUserActor, "leave-install")).actions,
  ["open", "submit_ticket", "send_feedback"]);
```

Keep assertions proving `installStoreApp` and `uninstallStoreApp` still persist compatibility state, then assert the app remains in My Apps after uninstall.

- [ ] **Step 2: Run the test and verify the old install-first partition fails**

Run: `node --import tsx --test tests/integration/platform-app-install-persistence-contract.test.mjs`

Expected: FAIL because an active member without an installation is returned in Available Apps.

- [ ] **Step 3: Implement access-first repository semantics**

```ts
export function storeActionsForCard(card: StorefrontAppCard): StorefrontAppDetail["actions"] {
  if (card.accessStatus === "active") return ["open", "submit_ticket", "send_feedback"];
  return card.accessStatus === "pending" ? ["view_status"] : ["request_access"];
}
```

Partition `myApps` by active access and derive `primaryAction` only from access status. Preserve installation lookups and fields without using them for collection or action decisions.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --import tsx --test tests/integration/platform-app-install-persistence-contract.test.mjs`

Expected: PASS, including compatibility installation API assertions.

- [ ] **Step 5: Commit the access-first API behavior**

```bash
git add tests/integration/platform-app-install-persistence-contract.test.mjs apps/platform-api/src/persistence/published-app-access.ts apps/platform-api/src/persistence/publish-store-repositories.ts
git commit -m "fix(store): derive app availability from access"
```

### Task 2: Replace the Store installation journey with access actions

**Files:**
- Modify: `apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs`
- Delete: `apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.fixtures.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailStates.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx`
- Modify: `tests/unit/store-app-detail-contract.test.mjs`
- Modify: `tests/integration/store-ui-routing-contract.test.mjs`

**Interfaces:**
- Consumes: `StorefrontAppDetailResponse.accessStatus`, `.health`, `.route`, and `.actions`.
- Produces: `storeAppDetailSupportsAction(...)` with install/uninstall always hidden, access-state actions, and fail-closed Open; Store detail buttons named `Open app`, `Request access`, and `View status`.

- [ ] **Step 1: Replace installation-journey tests with failing access-action tests**

```js
test("active access opens a healthy published web app without installation", async () => {
  const active = { ...detail("active", ["install"]), accessStatus: "active", installStatus: "not_installed" };
  // mount detail, then assert Open app exists and Install/Remove/App install journey do not.
});

test("pending access links to status without installation controls", async () => {
  const pending = { ...detail("pending", ["view_status"]), accessStatus: "pending" };
  // mount detail, click View status, assert /store/access-requests.
});
```

Add unhealthy and blank-route cases asserting Open app is absent. Update source-contract tests to reject `api.installStoreApp`, `api.uninstallStoreApp`, and `App install journey` in the Store detail while retaining API-client compatibility methods.

- [ ] **Step 2: Run focused UI tests and verify failures**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs tests/unit/store-app-detail-contract.test.mjs tests/integration/store-ui-routing-contract.test.mjs`

Expected: FAIL because active uninstalled apps still show Install and the installation journey.

- [ ] **Step 3: Implement the minimal access-action detail**

```ts
if (action === "install" || action === "uninstall") return false;
if (action === "open") {
  return detailCapabilitiesCurrent && accessStatus === "active" && health === "healthy" && Boolean(route.trim());
}
if (action === "view_status") return detailCapabilitiesCurrent && accessStatus === "pending";
if (action === "request_access") {
  return detailCapabilitiesCurrent && accessStatus === "available" && !accessRequestConfirmed;
}
return detailCapabilitiesCurrent && actions.includes(action);
```

Remove installation derivation, feedback, journey sections, and install/remove mutations from `StoreAppDetailPage`. Render `View status` to `/store/access-requests`; Open must assign the validated `app.route` after recording Recent.

- [ ] **Step 4: Run the focused UI tests and verify they pass**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs tests/unit/store-app-detail-contract.test.mjs tests/integration/store-ui-routing-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the web access detail flow**

```bash
git add apps/app-store-pwa/src/features/storefront tests/unit/store-app-detail-contract.test.mjs tests/integration/store-ui-routing-contract.test.mjs
git commit -m "fix(store): open web apps without installation"
```

### Task 3: Make My Apps and search access-only

**Files:**
- Modify: `apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/catalog.ts`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreSearchPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreShell.tsx`

**Interfaces:**
- Consumes: the merged `allApps` catalog and `accessStatus`.
- Produces: `selectStoreCollection` and `filterStoreApps` without installation filtering; access-oriented loading and empty-state copy.

- [ ] **Step 1: Write failing search and collection assertions**

```js
assert.equal(renderer.root.findAllByProps({ name: "installStatus" }).length, 0);
assert.doesNotMatch(text(renderer), /install/i);
```

Seed an active `not_installed` app in `availableApps` to simulate an old server partition and assert the My Apps page still renders it from merged `allApps`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs`

Expected: FAIL because the installation filter and install-first empty copy are still rendered.

- [ ] **Step 3: Remove installation filtering and derive collections from access**

```ts
if (collection === "my-apps") return apps.allApps.filter((app) => app.accessStatus === "active");
if (collection === "available") return apps.allApps.filter((app) => app.accessStatus !== "active");
```

Remove `installStatus` from `StoreCatalogFilters` and `StoreSearchPage`. Change loading and empty-state copy to describe access and available applications.

- [ ] **Step 4: Run Store storefront integration tests**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/*.integration.test.mjs`

Expected: PASS after updating obsolete install-flow expectations to the approved access-only contract.

- [ ] **Step 5: Commit Store collection and copy changes**

```bash
git add apps/app-store-pwa/src/features/storefront
git commit -m "fix(store): make My Apps access based"
```

### Task 4: Verify compatibility and regression safety

**Files:**
- Modify only if a test exposes an approved-contract mismatch.

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: verified repository state with legacy installation APIs preserved and no Store installation UI.

- [ ] **Step 1: Run targeted Store and persistence coverage**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/*.integration.test.mjs tests/integration/platform-app-install-persistence-contract.test.mjs tests/integration/store-ui-routing-contract.test.mjs tests/unit/store-app-detail-contract.test.mjs tests/e2e/store-actions-api-client-smoke.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run changed-file quality checks**

Run: `pnpm check:changed`

Expected: PASS.

- [ ] **Step 3: Run the full CI-equivalent check**

Run: `pnpm check:ci`

Expected: PASS.

- [ ] **Step 4: Inspect the final diff for installation UI leakage**

Run: `rg -n "App install journey|Install on this account|Remove this installation|Install status|No installed apps" apps/app-store-pwa/src/features/storefront`

Expected: no matches.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add <files reported by git status>
git commit -m "test(store): verify access-only web app flow"
```

Skip this commit when verification requires no additional changes.
