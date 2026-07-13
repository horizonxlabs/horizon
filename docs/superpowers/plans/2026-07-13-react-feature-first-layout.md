# React Feature-First Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Admin, Creator, and App Store React source with the `app → routes → features → shared` layout without changing any UI, routing, session, fixture, or Platform API behaviour.

**Architecture:** Keep each Vite `src/main.tsx` as a minimal style-and-mount entrypoint. Root composition moves to `app`, URL/state-to-screen selection moves to `routes`, business UI/state/API adapters move to capability-owned `features`, and only generic app-local platform/session helpers move to `shared`; `index.ts` is each feature's deliberate cross-feature API.

**Tech Stack:** React 19, TypeScript, Vite 8, pnpm workspace, Node test runner with `tsx`.

## Global Constraints

- Preserve existing route paths, conditional page selection, login/setup guards, API methods/payloads, and deterministic fallback values.
- Do not add React Router, TanStack Query, Zustand/Redux, or a dependency solely for this structural migration.
- Do not create empty folders: create a target directory only when it owns source code.
- `shared` must not import `app`, `routes`, or `features`; a cross-feature consumer imports only `@/features/<name>`.
- Keep tests in the repository's existing `tests/unit`, `tests/integration`, and `tests/e2e` roots.
- Preserve workspace packages as the only cross-application shared layer.
- Extend PR #141 and link the delivery to GitHub issue #143; do not create a second PR.

---

### Task 1: Make the target layout enforceable and documented

**Files:**
- Modify: `docs/architecture/ADR-012-frontend-feature-first-governance.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `scripts/quality/check-frontend-architecture.mjs`
- Modify: `tests/unit/frontend-architecture-governance.test.mjs`

**Interfaces:**
- Produces: ADR-012 and the frontend architecture guide define the same target roots, public feature API, and four state-placement categories for all three React applications.

- [ ] **Step 1: Write a failing architecture-governance test**

```js
assert.match(adr, /Component state.*URL state.*Server state.*Global client state/s);
```

- [ ] **Step 2: Run the test to verify it fails for the missing policy coverage**

Run: `node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs`

- [ ] **Step 3: Add the policy without changing runtime code**

```md
## State placement

Use component state for local interaction, URL state for bookmarkable navigation,
server state close to its API consumer, and global client state only when it is
truly application-wide.
```

- [ ] **Step 4: Verify the policy and documentation**

Run: `node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs && pnpm check:frontend-architecture`

### Task 2: Migrate Creator root composition and capability ownership

**Files:**
- Create: `apps/creator-web/src/app/CreatorApp.tsx`
- Create: `apps/creator-web/src/routes/CreatorRoutes.tsx`
- Create: `apps/creator-web/src/features/authentication/index.ts`
- Create: `apps/creator-web/src/features/projects/index.ts`
- Create: `apps/creator-web/src/features/workspace/index.ts`
- Create: `apps/creator-web/src/features/prd/index.ts`
- Create: `apps/creator-web/src/features/publish/index.ts`
- Create: `apps/creator-web/src/features/users/index.ts`
- Create: `apps/creator-web/src/features/tickets/index.ts`
- Create: `apps/creator-web/src/features/default-dashboard/index.ts`
- Create: `apps/creator-web/src/shared/session.ts`
- Modify: `apps/creator-web/src/main.tsx`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`

**Interfaces:**
- `CreatorApp` owns the existing authentication gate and receives no new behaviour props.
- `CreatorRoutes({ app })` selects existing feature screen exports for each current `CreatorPage` value.

- [ ] **Step 1: Write the failing composition test**

```js
assert.match(main, /@\/app\/CreatorApp/);
assert.match(routes, /@\/features\/projects/);
assert.doesNotMatch(main, /function CreatorAuthGate/);
```

- [ ] **Step 2: Run the focused test and observe the legacy-entry failure**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`

- [ ] **Step 3: Move ownership without semantic edits**

```tsx
export function CreatorApp() {
  return <CreatorAuthGate />;
}
```

```tsx
export function CreatorRoutes({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  if (app.creatorPage === "projects") return <ProjectsPage app={app} />;
  return <DefaultPage app={app} />;
}
```

- [ ] **Step 4: Verify Creator smoke, typecheck, and build**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs && pnpm --filter @evcp/creator-web typecheck && pnpm --filter @evcp/creator-web build`

### Task 3: Migrate App Store root, storefront flows, and generated-app route

**Files:**
- Create: `apps/app-store-pwa/src/app/StoreApp.tsx`
- Create: `apps/app-store-pwa/src/routes/StoreRoutes.tsx`
- Create: `apps/app-store-pwa/src/shared/platform-client.ts`
- Create: `apps/app-store-pwa/src/features/storefront/index.ts`
- Create: `apps/app-store-pwa/src/features/access-requests/index.ts`
- Create: `apps/app-store-pwa/src/features/installations/index.ts`
- Create: `apps/app-store-pwa/src/features/support-tickets/index.ts`
- Create: `apps/app-store-pwa/src/features/generated-leave-management/index.ts`
- Modify: `apps/app-store-pwa/src/main.tsx`
- Create: `tests/unit/app-store-pwa-render-smoke.test.mjs`

**Interfaces:**
- `StoreRoutes` keeps the current `/apps/leave-management` predicate and selects only public feature exports.
- `shared/platform-client.ts` exposes generic base-URL/session/client helpers; fallback domain data remains feature-owned.

- [ ] **Step 1: Write the failing root and route ownership test**

```js
assert.match(main, /@\/app\/StoreApp/);
assert.match(routes, /@\/features\/generated-leave-management/);
assert.doesNotMatch(main, /function GeneratedLeaveManagementApp/);
```

- [ ] **Step 2: Run it before extraction**

Run: `node --import tsx --test tests/unit/app-store-pwa-render-smoke.test.mjs`

- [ ] **Step 3: Compose the existing screens through public features**

```tsx
export function StoreRoutes() {
  return window.location.pathname.startsWith("/apps/leave-management")
    ? <GeneratedLeaveManagementApp />
    : <StorefrontApp />;
}
```

- [ ] **Step 4: Verify fallback/API and production output**

Run: `node --import tsx --test tests/unit/app-store-pwa-render-smoke.test.mjs && pnpm --filter @evcp/app-store-pwa typecheck && pnpm --filter @evcp/app-store-pwa build`

### Task 4: Complete Admin root composition migration around existing capabilities

**Files:**
- Create: `apps/admin-web/src/app/AdminApp.tsx`
- Create: `apps/admin-web/src/routes/AdminRoutes.tsx`
- Create: `apps/admin-web/src/shared/platform-client.ts`
- Modify: `apps/admin-web/src/features/auth-sso/index.ts`
- Modify: `apps/admin-web/src/features/installer-operations/index.ts`
- Modify: `apps/admin-web/src/main.tsx`
- Create: `tests/unit/admin-web-render-smoke.test.mjs`

**Interfaces:**
- `AdminApp` retains existing root state and handlers while `AdminRoutes` only selects existing capability screen exports.
- Existing `features/*/index.ts` exports from PR #141 remain valid compatibility APIs.

- [ ] **Step 1: Write the failing entrypoint ownership test**

```js
assert.match(main, /@\/app\/AdminApp/);
assert.match(routes, /@\/features\/auth-sso/);
assert.doesNotMatch(main, /function AdminApp/);
```

- [ ] **Step 2: Run the root smoke test before moving the composition**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs`

- [ ] **Step 3: Move composition while preserving feature public APIs**

```tsx
export function AdminApp() {
  return <AdminRoutes />;
}
```

- [ ] **Step 4: Verify Admin auth/setup and production output**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs && pnpm --filter @evcp/admin-web typecheck && pnpm --filter @evcp/admin-web build`

### Task 5: Remove migrated legacy-baseline entries and deliver one reviewed PR

**Files:**
- Modify: `scripts/quality/frontend-legacy-path-baseline.json`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CHANGELOG.md`
- Test: `tests/unit/frontend-architecture-governance.test.mjs`

- [ ] **Step 1: Write failing assertions for each newly migrated root**

```js
assert.deepEqual(checkFrontendArchitecture(["apps/creator-web/src/app/CreatorApp.tsx"]), []);
assert.deepEqual(checkFrontendArchitecture(["apps/app-store-pwa/src/routes/StoreRoutes.tsx"]), []);
```

- [ ] **Step 2: Run the architecture test before updating the baseline**

Run: `node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs`

- [ ] **Step 3: Remove only source paths that were actually moved or deleted**

```json
[]
```

- [ ] **Step 4: Run complete verification and update PR #141**

Run: `pnpm check && pnpm build && pnpm test && git diff --check`

- [ ] **Step 5: Commit and push the reviewed refactor**

```bash
git add apps scripts tests docs CHANGELOG.md
git commit -m "refactor(frontend): align apps to feature-first layout"
git push
```
