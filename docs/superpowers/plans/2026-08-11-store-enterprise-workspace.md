# Horizon Store Enterprise Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow Horizon Store PWA layout with a responsive enterprise workspace across every Store route while preserving all Platform API and device-local workflows.

**Architecture:** Keep `StoreProvider` as the single source of Store data and mutations, and place a responsive workspace shell around the existing route pages. Introduce pure navigation/query/action-decision helpers plus focused shell, state, header, and app-card components; route pages compose those components without duplicating provider state.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Lucide React, Node test runner with `tsx`, React Test Renderer, shared `@evcp/ui` CSS.

## Global Constraints

- Preserve every existing Store URL and the Platform API contracts; `/store/search` additionally accepts `?q=<encoded query>`.
- Keep `StoreProvider` authoritative for bootstrap, merged catalog, device preferences, mutation states, refresh, and logout.
- Keep all user-facing Store copy in English and retain LINE Seed Sans TH as the shared product typeface.
- Active web applications open directly; do not expose install or uninstall as the primary web-app flow.
- Do not fabricate catalog records, access states, tickets, receipts, or success responses.
- Desktop is a 240px sidebar plus sticky top bar and a fluid 1440–1600px content canvas; tablet uses an icon rail and two-column grids; mobile uses a drawer and one-column content below 760px.
- Preserve favorites, recent history, access receipts, and remembered ticket IDs as device-local data.
- Preserve access-request and ticket deduplication, validation, mutation feedback, capability refresh, and ready-content-on-refresh-failure behavior.
- Use semantic landmarks, `aria-current`, native controls, visible focus, 44px mobile targets, live status/error regions, Escape/backdrop drawer close, and reduced-motion support.
- Limit CSS changes to Store selectors in `packages/ui/styles.css`; stage Store hunks only because that file contains unrelated user work.
- Preserve the existing Horizon mark in `StorefrontSummary.tsx` and do not overwrite unrelated logo, admin, or preview changes already in the working tree.

---

## File Map

- Create `apps/app-store-pwa/src/features/storefront/store-navigation.ts`: route groups, route context, active-route resolution, search URL construction, and query parsing.
- Create `apps/app-store-pwa/src/features/storefront/store-navigation.test.mjs`: pure navigation/query contract tests.
- Create `apps/app-store-pwa/src/features/storefront/StoreSidebar.tsx`: grouped desktop rail and mobile drawer navigation.
- Create `apps/app-store-pwa/src/features/storefront/StoreTopbar.tsx`: contextual title, global search, API state, refresh, account, and drawer trigger.
- Create `apps/app-store-pwa/src/features/storefront/StorePageHeader.tsx`: shared page title/count/device label.
- Create `apps/app-store-pwa/src/features/storefront/StoreStatePanel.tsx`: shared loading, empty, error, and recovery presentation.
- Create `apps/app-store-pwa/src/features/storefront/StoreAppCard.tsx`: deterministic app identity and capability-aware primary action.
- Create `apps/app-store-pwa/src/features/storefront/store-app-card.ts`: pure card-action decision helper.
- Create `apps/app-store-pwa/src/features/storefront/store-app-card.test.mjs`: card-action decision tests.
- Modify `apps/app-store-pwa/src/features/storefront/StoreShell.tsx`: bootstrap-safe responsive frame and shell alert ownership.
- Modify `apps/app-store-pwa/src/features/storefront/StorefrontSummary.tsx`: compose the shell chrome while retaining the Horizon logo markup.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx`: responsive shared grids and actionable empty states.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreSearchPage.tsx`: query-preserving search, filter rail, result count, and clear action.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreAccessRequestsPage.tsx`: responsive receipt/status list.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx`: responsive ticket/status list with preserved reload semantics.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreProfilePage.tsx`: two-column identity and device-data workspace.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx`: two-column information/action layout without installation ceremony.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailStates.tsx`: shared state panels for detail loading/errors/capability refresh.
- Modify `apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx`: shared header/state styling and responsive detail timeline.
- Modify Store integration and route behavior tests beside the affected components.
- Modify `tests/unit/app-store-pwa-render-smoke.test.mjs`, `tests/unit/store-page-contract.test.mjs`, and `tests/integration/store-ui-routing-contract.test.mjs`: route/state/source contracts.
- Modify Store-only selectors in `packages/ui/styles.css`: enterprise frame, grids, lists, detail layout, focus, breakpoints, drawer, and reduced motion.

---

### Task 1: Navigation and Search URL Model

**Files:**

- Create: `apps/app-store-pwa/src/features/storefront/store-navigation.ts`
- Create: `apps/app-store-pwa/src/features/storefront/store-navigation.test.mjs`

**Interfaces:**

- Consumes: `StoreRoute` from `@/routes/store-route`.
- Produces: `StoreNavigationGroup`, `StoreNavigationItem`, `StorePageContext`, `STORE_NAVIGATION_GROUPS`, `storeCurrentPath(route): string`, `storePageContext(route): StorePageContext`, `isStoreRouteActive(currentPath, itemRoute): boolean`, `parseStoreSearchQuery(search): string`, and `storeSearchHref(query): string`.

- [ ] **Step 1: Write the failing pure-model tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  STORE_NAVIGATION_GROUPS,
  isStoreRouteActive,
  parseStoreSearchQuery,
  storeCurrentPath,
  storePageContext,
  storeSearchHref
} from "./store-navigation.ts";

test("navigation is grouped by Workspace, Service, and Account", () => {
  assert.deepEqual(
    STORE_NAVIGATION_GROUPS.map((group) => group.label),
    ["Workspace", "Service", "Account"]
  );
  assert.deepEqual(
    STORE_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.route)),
    [
      "/store/",
      "/store/available",
      "/store/search",
      "/store/favorites",
      "/store/recent",
      "/store/access-requests",
      "/store/tickets",
      "/store/profile"
    ]
  );
});

test("detail routes keep their parent navigation and contextual page copy", () => {
  assert.equal(storeCurrentPath({ page: "app-detail", appSlug: "payroll" }), "/store/available");
  assert.equal(storeCurrentPath({ page: "ticket-detail", ticketId: "T-1" }), "/store/tickets");
  assert.equal(storePageContext({ page: "search" }).title, "Search");
  assert.equal(isStoreRouteActive("/store/tickets/T-1", "/store/tickets"), true);
});

test("search helpers trim, encode, and parse q without throwing", () => {
  assert.equal(storeSearchHref(" payroll & leave "), "/store/search?q=payroll%20%26%20leave");
  assert.equal(storeSearchHref("   "), "/store/search");
  assert.equal(parseStoreSearchQuery("?q=payroll%20%26%20leave"), "payroll & leave");
  assert.equal(parseStoreSearchQuery("?collection=all"), "");
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/store-navigation.test.mjs`

Expected: FAIL with `Cannot find module './store-navigation.ts'`.

- [ ] **Step 3: Implement the typed route model**

```ts
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Clock3,
  Compass,
  Heart,
  LayoutGrid,
  Search,
  ShieldCheck,
  Ticket,
  UserRound
} from "lucide-react";
import type { StoreRoute } from "@/routes/store-route";

export type StoreNavigationItem = {
  label: string;
  route: string;
  icon: ComponentType<LucideProps>;
};
export type StoreNavigationGroup = {
  label: "Workspace" | "Service" | "Account";
  items: StoreNavigationItem[];
};
export type StorePageContext = { eyebrow: string; title: string; description: string };

export const STORE_NAVIGATION_GROUPS: StoreNavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "My Apps", route: "/store/", icon: LayoutGrid },
      { label: "Discover", route: "/store/available", icon: Compass },
      { label: "Search", route: "/store/search", icon: Search },
      { label: "Favorites", route: "/store/favorites", icon: Heart },
      { label: "Recent", route: "/store/recent", icon: Clock3 }
    ]
  },
  {
    label: "Service",
    items: [
      { label: "Access Requests", route: "/store/access-requests", icon: ShieldCheck },
      { label: "Tickets", route: "/store/tickets", icon: Ticket }
    ]
  },
  { label: "Account", items: [{ label: "Profile", route: "/store/profile", icon: UserRound }] }
];

const PAGE_CONTEXT: Record<
  Exclude<StoreRoute["page"], "app-detail" | "ticket-detail" | "not-found">,
  StorePageContext
> = {
  "my-apps": {
    eyebrow: "Workspace",
    title: "My Apps",
    description: "Launch applications assigned to your account."
  },
  available: {
    eyebrow: "Catalog",
    title: "Discover",
    description: "Explore governed applications available to your organization."
  },
  search: {
    eyebrow: "Catalog",
    title: "Search",
    description: "Find applications by name, owner, team, or role."
  },
  favorites: {
    eyebrow: "This device",
    title: "Favorites",
    description: "Return to applications saved on this device."
  },
  recent: {
    eyebrow: "This device",
    title: "Recent",
    description: "Continue from applications opened on this device."
  },
  "access-requests": {
    eyebrow: "Service",
    title: "Access Requests",
    description: "Review request receipts remembered on this device."
  },
  tickets: {
    eyebrow: "Service",
    title: "Tickets",
    description: "Track support tickets remembered on this device."
  },
  profile: {
    eyebrow: "Account",
    title: "Profile",
    description: "Review identity and device-local Store data."
  }
};

export function storeCurrentPath(route: StoreRoute): string {
  if (route.page === "my-apps") return "/store/";
  if (route.page === "app-detail") return "/store/available";
  if (route.page === "ticket-detail") return "/store/tickets";
  if (route.page === "not-found") return "";
  return `/store/${route.page}`;
}

export function storePageContext(route: StoreRoute): StorePageContext {
  if (route.page === "app-detail")
    return {
      eyebrow: "Application",
      title: "App Details",
      description: "Review access and support options."
    };
  if (route.page === "ticket-detail")
    return {
      eyebrow: "Support",
      title: "Ticket Details",
      description: "Review current Platform API ticket evidence."
    };
  if (route.page === "not-found")
    return {
      eyebrow: "Horizon Store",
      title: "Page Not Found",
      description: "Return to your application workspace."
    };
  return PAGE_CONTEXT[route.page];
}

function normalizePath(value: string): string {
  return value.replace(/\/+$/, "") || "/";
}
export function isStoreRouteActive(currentPath: string, itemRoute: string): boolean {
  const current = normalizePath(currentPath);
  const item = normalizePath(itemRoute);
  return current === item || (item !== "/store" && current.startsWith(`${item}/`));
}
export function parseStoreSearchQuery(search: string): string {
  return new URLSearchParams(search).get("q")?.trim() ?? "";
}
export function storeSearchHref(query: string): string {
  const normalized = query.trim();
  return normalized ? `/store/search?q=${encodeURIComponent(normalized)}` : "/store/search";
}
```

- [ ] **Step 4: Run the pure-model tests**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/store-navigation.test.mjs`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the model**

```bash
git add apps/app-store-pwa/src/features/storefront/store-navigation.ts apps/app-store-pwa/src/features/storefront/store-navigation.test.mjs
git commit -m "feat(store): add workspace navigation model"
```

---

### Task 2: Responsive Enterprise Shell

**Files:**

- Create: `apps/app-store-pwa/src/features/storefront/StoreSidebar.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/StoreTopbar.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/StorePageHeader.tsx`
- Create: `apps/app-store-pwa/src/features/storefront/StoreStatePanel.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreShell.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StorefrontSummary.tsx`
- Modify: `apps/app-store-pwa/src/routes/StoreRoutes.behavior.test.mjs`

**Interfaces:**

- Consumes: Task 1 navigation helpers; `StoreRoute`; `StorefrontContextValue` data through `useStorefront`; `navigateBrowserPath`.
- Produces: `StoreSidebar({ currentPath, mobileOpen, onNavigate, onClose, requestCount, ticketCount })`, `StoreTopbar({ route, userName, email, role, source, refreshPending, refreshError, onRefresh, onOpenNavigation, onLogout })`, `StorePageHeader`, `StoreStatePanel`, and a `StorefrontSummary` shell-chrome composer.

- [ ] **Step 1: Extend the shell behavior test with real chrome interactions**

```js
test("workspace chrome keeps grouped navigation, search, refresh, and logout recovery", () => {
  const html = renderToStaticMarkup(
    React.createElement(StorefrontSummary, {
      route: { page: "search" },
      userName: "End User",
      email: "user@example.com",
      source: "Platform API",
      role: "end_user",
      myAppsCount: 2,
      catalogCount: 5,
      requestCount: 1,
      ticketCount: 2,
      refreshPending: false,
      onRefresh() {},
      onLogout() {},
      logoutError: "network unavailable"
    })
  );
  assert.match(html, /Workspace/);
  assert.match(html, /Service/);
  assert.match(html, /Account/);
  assert.match(html, /Search applications/);
  assert.match(html, /Refresh Store/);
  assert.match(html, /Retry sign out/);
  assert.match(html, /horizon-mark\.png/);
});
```

- [ ] **Step 2: Run the focused behavior test and observe the prop/markup failure**

Run: `node --import tsx --test apps/app-store-pwa/src/routes/StoreRoutes.behavior.test.mjs`

Expected: FAIL because `StorefrontSummary` does not render grouped navigation or refresh/search controls.

- [ ] **Step 3: Build the focused shell components**

```tsx
// StoreStatePanel.tsx
import type { ReactNode } from "react";
export function StoreStatePanel({
  tone = "neutral",
  eyebrow,
  title,
  children,
  action
}: {
  tone?: "neutral" | "danger";
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={`store-state-panel store-state-panel-${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <div>{children}</div>
      {action}
    </section>
  );
}

// StorePageHeader.tsx
import type { ReactNode } from "react";
export function StorePageHeader({
  eyebrow,
  title,
  description,
  count,
  deviceLocal,
  action
}: {
  eyebrow: string;
  title: string;
  description?: string;
  count?: number;
  deviceLocal?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="store-page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <div className="store-page-title-row">
          <h1>{title}</h1>
          {count === undefined ? null : <span>{count}</span>}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="store-page-heading-actions">
        {deviceLocal ? <span className="store-device-label">This device</span> : null}
        {action}
      </div>
    </header>
  );
}
```

Implement `StoreSidebar` from `STORE_NAVIGATION_GROUPS` using semantic `<nav>`, Lucide icons, `aria-current`, evidence-backed count badges, a backdrop button, and callbacks that close the drawer after `navigateBrowserPath`. Implement `StoreTopbar` as a `<header>` with a controlled search form initialized from `parseStoreSearchQuery(window.location.search)`, synchronized in an effect when `route` changes, submitted through `navigateBrowserPath(storeSearchHref(query))`, plus Platform API status, refresh status text, drawer trigger, identity, and logout.

```tsx
// Essential StoreSidebar interaction shape
<aside
  className={`store-sidebar ${mobileOpen ? "store-sidebar-open" : ""}`}
  aria-label="Horizon Store navigation"
>
  <nav>
    {STORE_NAVIGATION_GROUPS.map((group) => (
      <section key={group.label}>
        <h2>{group.label}</h2>
        {group.items.map((item) => (
          <a
            key={item.route}
            href={item.route}
            aria-current={isStoreRouteActive(currentPath, item.route) ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateBrowserPath(item.route);
              onNavigate();
            }}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        ))}
      </section>
    ))}
  </nav>
</aside>
```

When `mobileOpen` becomes true, save `document.activeElement`, focus the first sidebar control, listen for Escape, and cycle Tab/Shift+Tab between the first and last visible sidebar controls. On close/unmount, remove the key listener and restore focus to the saved trigger. Render `<button className="store-drawer-backdrop" aria-label="Close navigation" onClick={onClose} />` next to the open drawer so background dismissal is a native control.

- [ ] **Step 4: Compose ready, loading, authentication-error, and Platform-error states in `StoreShell`**

```tsx
const [mobileOpen, setMobileOpen] = useState(false);
const [refreshPending, setRefreshPending] = useState(false);
const [refreshError, setRefreshError] = useState<string>();
async function handleRefresh() {
  setRefreshPending(true);
  setRefreshError(undefined);
  const result = await refreshHome({ preserveReadyOnFailure: true });
  if (!result.ok) setRefreshError(result.error.message);
  setRefreshPending(false);
}
```

Always render `<main className="store-workspace">` and its frame. For loading, place skeleton rows/cards inside the content canvas. For authentication failure, render `StoreStatePanel` with **Sign in with Keycloak**; for other bootstrap failure, render **Retry Store**. For ready state, render sidebar/topbar/content and announce `refreshError` in a shell-level `role="alert"`. Keep sign-in try/catch behavior and keep `logoutError` visible with **Retry sign out**.

- [ ] **Step 5: Run the shell test and Store typecheck**

Run: `node --import tsx --test apps/app-store-pwa/src/routes/StoreRoutes.behavior.test.mjs && pnpm --filter @evcp/app-store-pwa typecheck`

Expected: PASS for the behavior test and TypeScript exits 0.

- [ ] **Step 6: Commit the shell without unrelated dirty hunks**

```bash
git add apps/app-store-pwa/src/features/storefront/StoreSidebar.tsx apps/app-store-pwa/src/features/storefront/StoreTopbar.tsx apps/app-store-pwa/src/features/storefront/StorePageHeader.tsx apps/app-store-pwa/src/features/storefront/StoreStatePanel.tsx apps/app-store-pwa/src/features/storefront/StoreShell.tsx apps/app-store-pwa/src/routes/StoreRoutes.behavior.test.mjs
git add -p apps/app-store-pwa/src/features/storefront/StorefrontSummary.tsx
git commit -m "feat(store): add responsive workspace shell"
```

---

### Task 3: Shared App Card and Collection Grids

**Files:**

- Create: `apps/app-store-pwa/src/features/storefront/store-app-card.ts`
- Create: `apps/app-store-pwa/src/features/storefront/store-app-card.test.mjs`
- Create: `apps/app-store-pwa/src/features/storefront/StoreAppCard.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreProvider.integration.test.mjs`

**Interfaces:**

- Consumes: `AppStoreItem`, device favorites, `toggleFavorite`, `navigateBrowserPath`, `recordRecent`, and existing catalog selectors.
- Produces: `StoreAppCardAction = { kind: "open" | "detail" | "request" | "status"; label: string; href?: string }`, `storeAppCardAction(app): StoreAppCardAction`, `storeAppAccent(appSlug): number`, and `StoreAppCard({ app })`.

- [ ] **Step 1: Write the pure primary-action tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { storeAppAccent, storeAppCardAction } from "./store-app-card.ts";

const app = (accessStatus, route = "/apps/payroll", health = "healthy") => ({
  slug: "payroll",
  accessStatus,
  route,
  health
});
test("active healthy web apps open directly", () =>
  assert.deepEqual(storeAppCardAction(app("active")), {
    kind: "open",
    label: "Open app",
    href: "/apps/payroll"
  }));
test("pending apps link to request evidence", () =>
  assert.deepEqual(storeAppCardAction(app("pending")), {
    kind: "status",
    label: "View request",
    href: "/store/access-requests"
  }));
test("available apps expose request intent through detail", () =>
  assert.deepEqual(storeAppCardAction(app("available")), {
    kind: "request",
    label: "Request access",
    href: "/store/apps/payroll"
  }));
test("unhealthy active apps fall back to detail", () =>
  assert.equal(storeAppCardAction(app("active", "/apps/payroll", "unhealthy")).kind, "detail"));
test("accent is deterministic", () =>
  assert.equal(storeAppAccent("payroll"), storeAppAccent("payroll")));
```

- [ ] **Step 2: Run the test and verify the helper is missing**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/store-app-card.test.mjs`

Expected: FAIL with `Cannot find module './store-app-card.ts'`.

- [ ] **Step 3: Implement action selection and deterministic identity**

```ts
import type { AppStoreItem } from "@evcp/types";
export type StoreAppCardAction = {
  kind: "open" | "detail" | "request" | "status";
  label: string;
  href?: string;
};
export function storeAppCardAction(
  app: Pick<AppStoreItem, "slug" | "accessStatus" | "health"> & { route?: string }
): StoreAppCardAction {
  if (app.accessStatus === "active" && app.health === "healthy" && app.route?.trim())
    return { kind: "open", label: "Open app", href: app.route };
  if (app.accessStatus === "pending")
    return { kind: "status", label: "View request", href: "/store/access-requests" };
  if (app.accessStatus === "available")
    return {
      kind: "request",
      label: "Request access",
      href: `/store/apps/${encodeURIComponent(app.slug)}`
    };
  return {
    kind: "detail",
    label: "View details",
    href: `/store/apps/${encodeURIComponent(app.slug)}`
  };
}
export function storeAppAccent(appSlug: string): number {
  return (
    [...appSlug].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 6
  );
}
```

- [ ] **Step 4: Build `StoreAppCard` with independent native actions**

Render an `<article className="store-app-card">` containing a detail link, stable accent tile (`data-accent={storeAppAccent(app.slug)}`), name, description, owner, health/access badges, a favorite `<button aria-pressed>`, and one primary native link/button. For `kind === "open"`, call `recordRecent(app.slug)` and `window.location.assign(action.href)`; for Store URLs, prevent default and call `navigateBrowserPath(action.href)`. Do not record Recent when opening only the Store detail page.

```tsx
const action = storeAppCardAction(app);
const isFavorite = device.favorites.includes(app.slug);
const detailHref = `/store/apps/${encodeURIComponent(app.slug)}`;
function navigateToDetail(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  navigateBrowserPath(detailHref);
}
function handlePrimaryAction(event: React.MouseEvent<HTMLAnchorElement>) {
  if (!action.href) return;
  if (action.kind === "open") {
    event.preventDefault();
    recordRecent(app.slug);
    window.location.assign(action.href);
    return;
  }
  event.preventDefault();
  navigateBrowserPath(action.href);
}
<article className="store-app-card">
  <a className="store-app-detail-link" href={detailHref} onClick={navigateToDetail}>
    <span className="store-app-icon" data-accent={storeAppAccent(app.slug)} aria-hidden="true">
      {app.name.slice(0, 1).toUpperCase()}
    </span>
    <span>
      <strong>{app.name}</strong>
      <small>{app.description}</small>
      <em>{app.owner}</em>
    </span>
  </a>
  <div className="store-app-status">
    <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
      {app.accessStatus}
    </ToneBadge>
    <span>{app.health}</span>
  </div>
  <button
    type="button"
    className="store-icon-button"
    aria-pressed={isFavorite}
    aria-label={`${isFavorite ? "Remove" : "Add"} ${app.name} ${isFavorite ? "from" : "to"} favorites on this device`}
    onClick={() => toggleFavorite(app.slug)}
  >
    <Heart aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
  </button>
  <a className="store-app-primary" href={action.href} onClick={handlePrimaryAction}>
    {action.label}
  </a>
</article>;
```

- [ ] **Step 5: Replace `StoreAppList` internals and standardize collection headers/empty actions**

Keep `StoreAppList({ apps })` exported for existing consumers, but render `<div className="store-app-grid">` and `StoreAppCard`. Use `StorePageHeader` with the real collection count and `deviceLocal` for Favorites/Recent. Render `StoreStatePanel` with these real actions: My Apps without access → `/store/available`; empty Favorites → `/store/available`; empty Recent → `/store/`; empty Available → `/store/`; empty catalog plus creator/admin role → `window.location.assign("/creator/")`.

- [ ] **Step 6: Update integration expectations and run focused suites**

Update the card-selection assertions to find `.store-app-detail-link` and `.store-app-primary`; assert detail navigation does not record Recent, active primary action does record Recent, and favorite buttons retain `aria-pressed`.

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/store-app-card.test.mjs apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreProvider.integration.test.mjs`

Expected: PASS for all card, collection, search-filter, favorite, and recent tests.

- [ ] **Step 7: Commit the shared cards and collections**

```bash
git add apps/app-store-pwa/src/features/storefront/store-app-card.ts apps/app-store-pwa/src/features/storefront/store-app-card.test.mjs apps/app-store-pwa/src/features/storefront/StoreAppCard.tsx apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreProvider.integration.test.mjs
git commit -m "feat(store): add responsive application cards"
```

---

### Task 4: Query-Preserving Search Workspace

**Files:**

- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreSearchPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs`

**Interfaces:**

- Consumes: `parseStoreSearchQuery`, `storeSearchHref`, `filterStoreApps`, `StorePageHeader`, `StoreAppList`, and `StoreStatePanel`.
- Produces: Search UI initialized by `window.location.search`, local collection/access filters, visible result count, and `clearFilters()` restoring query/filters and `/store/search`.

- [ ] **Step 1: Add failing query and clear-filter integration coverage**

```js
test("search initializes from q and clear filters resets the URL and controls", async () => {
  window.location.search = "?q=Gamma";
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(), client: {} },
        React.createElement(StoreSearchPage)
      )
    );
  });
  assert.equal(renderer.root.findByProps({ name: "query" }).props.value, "Gamma");
  assert.match(text(renderer), /1 result/);
  assert.doesNotMatch(text(renderer), /Alpha App|Beta App/);
  const clear = renderer.root
    .findAllByType("button")
    .find((button) => button.children.join("") === "Clear filters");
  await act(async () => clear.props.onClick());
  assert.equal(window.location.pathname, "/store/search");
  assert.equal(renderer.root.findByProps({ name: "query" }).props.value, "");
  assert.equal(select(renderer, "collection").props.value, "all");
  assert.equal(select(renderer, "accessStatus").props.value, "all");
  await act(async () => renderer.unmount());
});
```

Extend the window stub with `location.search` and make `pushState` split pathname/search from the passed URL.

- [ ] **Step 2: Run the search suite and observe the empty initial query failure**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs`

Expected: FAIL because query currently initializes to `""` and no Clear filters action exists.

- [ ] **Step 3: Implement URL initialization, filter rail, count, and reset**

```tsx
const [query, setQuery] = useState(() => parseStoreSearchQuery(window.location.search));
const clearFilters = () => {
  setQuery(""); setCollection("all"); setAccessStatus("all");
  navigateBrowserPath("/store/search");
};
<StorePageHeader eyebrow="Catalog" title="Search" description="Find applications by name, owner, team, or role." count={apps.length} />
<label className="store-search-panel"><Search aria-hidden="true" /><span className="sr-only">Search apps</span>
  <input name="query" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps, teams or role..." />
</label>
<div className="store-search-layout">
  <aside className="store-filter-rail" aria-label="App filters">
    <label><span>Collection</span><select name="collection" value={collection} onChange={(event) => setCollection(event.target.value as StoreCatalogCollection)}>
      <option value="all">All apps</option><option value="my-apps">My Apps</option><option value="available">Available Apps</option>
    </select></label>
    <label><span>Access status</span><select name="accessStatus" value={accessStatus} onChange={(event) => setAccessStatus(event.target.value as StoreCatalogFilters["accessStatus"] | "all")}>
      <option value="all">All access statuses</option><option value="active">Active</option><option value="available">Available</option><option value="pending">Pending</option>
    </select></label>
  </aside>
  <section className="store-search-results" aria-live="polite">
    <div className="store-results-summary"><strong>{apps.length} {apps.length === 1 ? "result" : "results"}</strong>
      {(query || collection !== "all" || accessStatus !== "all") ? <button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button> : null}</div>
    {apps.length ? <StoreAppList apps={apps} /> : <StoreStatePanel eyebrow="Catalog" title="No matching apps" action={<button type="button" onClick={clearFilters}>Clear filters</button>}><p>Try a different application name, owner, team, role, or access status.</p></StoreStatePanel>}
  </section>
</div>
```

Use `name="query"`, preserve the current `filterStoreApps` call, and keep filters local. When the Search page is entered through global search, the query is already represented in the URL; do not push a URL on every keystroke.

- [ ] **Step 4: Run search and typecheck**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs && pnpm --filter @evcp/app-store-pwa typecheck`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the search workspace**

```bash
git add apps/app-store-pwa/src/features/storefront/pages/StoreSearchPage.tsx apps/app-store-pwa/src/features/storefront/StoreSearchFilters.integration.test.mjs
git commit -m "feat(store): add query-preserving catalog search"
```

---

### Task 5: Service History and Profile Workspaces

**Files:**

- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreAccessRequestsPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreProfilePage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreDeviceHistoryPages.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreReceiptAndTicketHeading.integration.test.mjs`

**Interfaces:**

- Consumes: existing device receipt/ticket evidence, Platform API ticket client, `StorePageHeader`, `StoreStatePanel`, `navigateBrowserPath`, and `clearDevicePreferences()`.
- Produces: responsive status/account page markup without changing storage, fetch, reload, or confirmation semantics.

- [ ] **Step 1: Add failing semantic and action assertions**

```js
assert.match(accessHtml, /aria-label="Access-request receipts stored on this device"/);
assert.match(accessHtml, /Requested role/);
assert.match(accessHtml, /Current access/);
assert.match(ticketsHtml, /Reload ticket history/);
assert.match(profileHtml, /Identity and SSO/);
assert.match(profileHtml, /Device-local data/);
assert.match(profileHtml, /Clear device preferences/);
```

For receipt fixtures with an app in the catalog, assert an app-detail `href`; for missing apps, assert **Unavailable in current catalog** and no fabricated detail link. Retain the existing test that reload preserves previously rendered ticket entries while `aria-busy="true"`.

- [ ] **Step 2: Run the focused history suites**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreDeviceHistoryPages.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreReceiptAndTicketHeading.integration.test.mjs`

Expected: FAIL on the new workspace copy/semantic structure assertions.

- [ ] **Step 3: Redesign Access Requests and Tickets as responsive status lists**

Use `StorePageHeader` with counts and `deviceLocal`. Access rows must show app, description/unavailable label, requested role, requester, department/reason, receipt status, current access, and timestamp. Use native links with Store client navigation only when the catalog contains the app.

Tickets keep the existing `loadTickets`, request sequence, in-flight reuse, and preserved entries. Reshape each ready item as an `<a className="store-history-card store-history-link">` to `/store/tickets/:id`; keep independent unavailable entries and the real Reload button. Use `StoreStatePanel` for empty/loading-only states.

```tsx
<div className="store-history-list" aria-label="Access-request receipts stored on this device">
  {device.accessReceipts.map((receipt) => {
    const app = appsBySlug.get(receipt.appSlug);
    const content = (
      <>
        <div>
          <strong>{app?.name ?? receipt.appSlug}</strong>
          <span>{app?.description ?? "Unavailable in current catalog"}</span>
          <small>
            Requested role: {receipt.requestedRoleKey} · {receipt.requesterEmail}
          </small>
          <small>
            {receipt.department ? `${receipt.department} · ` : ""}
            {receipt.reason}
          </small>
        </div>
        <div className="store-history-meta">
          <ToneBadge tone="warning">{receipt.status}</ToneBadge>
          {app ? (
            <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
              {app.accessStatus}
            </ToneBadge>
          ) : (
            <small>Current access unavailable</small>
          )}
          <time>{receipt.createdAt}</time>
        </div>
      </>
    );
    return app ? (
      <a
        key={receipt.id}
        className="store-history-card store-history-link"
        href={`/store/apps/${encodeURIComponent(app.slug)}`}
        onClick={(event) => {
          event.preventDefault();
          navigateBrowserPath(`/store/apps/${encodeURIComponent(app.slug)}`);
        }}
      >
        {content}
      </a>
    ) : (
      <article key={receipt.id} className="store-history-card store-history-unavailable">
        {content}
      </article>
    );
  })}
</div>
```

- [ ] **Step 4: Build the two-column Profile workspace without changing clear semantics**

```tsx
<div className="store-profile-grid">
  <section className="store-account-panel">
    <span className="eyebrow">Identity and SSO</span>
    <h2>{bootstrap.userName ?? "Current account"}</h2>
    <p>{bootstrap.email}</p>
    <dl>
      <div>
        <dt>Role</dt>
        <dd>{bootstrap.role?.replace("_", " ") ?? "Not provided"}</dd>
      </div>
      <div>
        <dt>Identity source</dt>
        <dd>{bootstrap.source}</dd>
      </div>
    </dl>
  </section>
  <section className="store-account-panel">
    <span className="eyebrow">Device-local data</span>
    <h2>What this Store remembers</h2>
    <dl className="store-profile-counts">
      <div>
        <dt>Favorites</dt>
        <dd>{device.favorites.length}</dd>
      </div>
      <div>
        <dt>Recent apps</dt>
        <dd>{device.recent.length}</dd>
      </div>
      <div>
        <dt>Ticket IDs</dt>
        <dd>{device.ticketIds.length}</dd>
      </div>
      <div>
        <dt>Access receipts</dt>
        <dd>{device.accessReceipts.length}</dd>
      </div>
    </dl>
    {clearState === "confirm" ? (
      <div className="store-clear-confirm">
        <p>Clear only device-local Store preferences? Your signed-in session will remain active.</p>
        <button type="button" onClick={confirmClear}>
          Confirm clear
        </button>
        <button type="button" className="secondary-button" onClick={() => setClearState("idle")}>
          Cancel
        </button>
      </div>
    ) : (
      <button type="button" onClick={() => setClearState("confirm")}>
        Clear device preferences
      </button>
    )}
    {clearState === "cleared" ? (
      <p role="status" className="store-action-success">
        Device preferences cleared. Your signed-in session remains active.
      </p>
    ) : null}
    {clearState === "error" ? (
      <p role="alert" className="store-action-error">
        Device storage is unavailable. Preferences were cleared for this page only; your signed-in
        session remains active.
      </p>
    ) : null}
  </section>
</div>
```

The clear confirmation must still state that the signed-in session remains active. Keep `role="status"` after success and `role="alert"` when storage persistence fails.

- [ ] **Step 5: Run history, profile, route, and type tests**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreDeviceHistoryPages.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreReceiptAndTicketHeading.integration.test.mjs tests/integration/store-ui-routing-contract.test.mjs && pnpm --filter @evcp/app-store-pwa typecheck`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 6: Commit service/account pages**

```bash
git add apps/app-store-pwa/src/features/storefront/pages/StoreAccessRequestsPage.tsx apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx apps/app-store-pwa/src/features/storefront/pages/StoreProfilePage.tsx apps/app-store-pwa/src/features/storefront/StoreDeviceHistoryPages.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreReceiptAndTicketHeading.integration.test.mjs
git commit -m "feat(store): redesign service and profile workspaces"
```

---

### Task 6: Two-Column App Detail and Real Actions

**Files:**

- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailStates.tsx`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreCapabilityFailure.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreCapabilityRefresh.integration.test.mjs`
- Modify: `apps/app-store-pwa/src/features/storefront/StoreAccessRoleSelection.integration.test.mjs`

**Interfaces:**

- Consumes: existing `storeAppDetailSupportsAction`, `StoreAppActionFeedback`, `StoreAccessRoleField`, `runAppAction`, device evidence methods, and Task 2 shared header/state components.
- Produces: `.store-app-detail-layout` with `.store-app-detail-main` and `.store-app-action-rail`, retaining exact API mutation payloads and coordinator keys.

- [ ] **Step 1: Add layout/no-install regression assertions**

```js
const output = JSON.stringify(renderer.toJSON());
assert.match(output, /store-app-detail-layout/);
assert.match(output, /store-app-detail-main/);
assert.match(output, /store-app-action-rail/);
assert.match(output, /Open app/);
assert.doesNotMatch(output, /Install app|Uninstall app|Installation/);
```

Retain and explicitly assert: required access role/reason validation; selected role payload; required ticket title/description/device validation; request/ticket deduplication; pending button copy; remembered receipt/ticket IDs only after confirmed success; capability refresh preserving ready detail; retry; Open app recording Recent before assignment.

- [ ] **Step 2: Run the detail suites and observe missing layout classes**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreCapabilityFailure.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreCapabilityRefresh.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreAccessRoleSelection.integration.test.mjs`

Expected: FAIL only on the new layout/structure assertions.

- [ ] **Step 3: Reshape ready detail into main content and action rail**

```tsx
<StorePageHeader eyebrow="Application" title={app.name} description={app.description} action={<ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>{app.accessStatus}</ToneBadge>} />
<div className="store-app-detail-layout">
  <div className="store-app-detail-main">
    <section className="store-detail-panel"><h2>About this application</h2>
      <dl><div><dt>Owner</dt><dd>{app.ownerName}</dd></div><div><dt>Department</dt><dd>{app.department}</dd></div>
        <div><dt>Health</dt><dd>{app.health}</dd></div><div><dt>Role</dt><dd>{app.myRole ?? "No assigned role"}</dd></div></dl></section>
    <section className="store-detail-panel"><h2>Release notes</h2><ul>{app.releaseNotes.map((note) => <li key={note}>{note}</li>)}</ul><p>Support: {app.supportContact}</p></section>
    {supports("submit_ticket") ? <section className="store-detail-panel"><h2>Submit a ticket</h2>
      <form data-store-action="submit-ticket" onSubmit={submitTicket} className="store-form">
        <label>Type<select name="ticketType" value={ticketType} onChange={(event) => setTicketType(event.target.value as TicketType)}><option value="bug">Bug</option><option value="feedback">Feedback</option><option value="feature_request">Feature request</option></select></label>
        <label>Priority<select name="ticketPriority" value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value as TicketPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label>Title<input name="ticketTitle" value={ticketTitle} onChange={(event) => setTicketTitle(event.target.value)} /></label>
        <label>Description<textarea name="ticketDescription" value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} /></label>
        <label>Device information<input name="ticketDevice" value={ticketDevice} onChange={(event) => setTicketDevice(event.target.value)} /></label>
        <button type="submit" disabled={pending("submit-ticket")}>{pending("submit-ticket") ? "Submitting…" : "Submit ticket"}</button>
        {feedback("submit-ticket")}
      </form></section> : null}
  </div>
  <aside className="store-app-action-rail" aria-label="Application actions">
    <section className="store-detail-panel"><h2>Current access</h2><p>{app.myRole ? `Role: ${app.myRole}` : "No assigned role"}</p>
      {supports("open") ? <button type="button" onClick={() => { recordRecent(app.slug); window.location.assign(app.route); }}>Open app</button> : null}
      {supports("view_status") ? <button type="button" onClick={() => navigateBrowserPath("/store/access-requests")}>View status</button> : null}</section>
    <StoreAppCapabilityRefreshStatus state={capabilityRefresh} onRetry={() => void loadDetail({ preserveReady: true })} />
    {supports("request_access") ? <section className="store-detail-panel"><h2>Request access</h2>
      <form data-store-action="request-access" onSubmit={submitAccess} className="store-form">
        <label>Requested role<StoreAccessRoleField availableRoles={app.availableRoles} value={requestedRoleKey} onChange={setRequestedRoleKey} /></label>
        <label>Reason<input name="accessReason" value={accessReason} onChange={(event) => setAccessReason(event.target.value)} /></label>
        <label>Department (optional)<input name="accessDepartment" value={accessDepartment} onChange={(event) => setAccessDepartment(event.target.value)} /></label>
        <button type="submit" disabled={pending("request-access")}>{pending("request-access") ? "Requesting…" : "Request access"}</button>
        {feedback("request-access")}
      </form></section> : null}
    {validationError ? <p role="alert" className="store-action-error">{validationError}</p> : null}
  </aside>
</div>
```

Move existing controls; do not rewrite mutation functions or capability logic. Keep feedback adjacent to its action. `StoreAppDetailLoadingPage` and `StoreAppDetailErrorPage` use `StorePageHeader` plus `StoreStatePanel`; capability refresh uses a compact status/alert within the action rail.

- [ ] **Step 4: Run all detail behavior suites and typecheck**

Run: `node --import tsx --test apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreCapabilityFailure.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreCapabilityRefresh.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreAccessRoleSelection.integration.test.mjs && pnpm --filter @evcp/app-store-pwa typecheck`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 5: Commit app detail**

```bash
git add apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailStates.tsx apps/app-store-pwa/src/features/storefront/StoreAppDetailPage.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreCapabilityFailure.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreCapabilityRefresh.integration.test.mjs apps/app-store-pwa/src/features/storefront/StoreAccessRoleSelection.integration.test.mjs
git commit -m "feat(store): redesign application detail workspace"
```

---

### Task 7: Enterprise Visual System and Responsive Behavior

**Files:**

- Modify: `packages/ui/styles.css` (Store selectors only)
- Modify: `tests/unit/store-page-contract.test.mjs`
- Modify: `tests/unit/app-store-pwa-render-smoke.test.mjs`

**Interfaces:**

- Consumes: all `.store-*` class names from Tasks 2–6 and shared EVCP design tokens.
- Produces: 240px desktop frame, 80px tablet rail, mobile drawer below 760px, fluid grid/container behavior, focus treatment, 44px touch controls, and reduced motion.

- [ ] **Step 1: Add source-contract tests for required responsive selectors**

```js
test("Store stylesheet defines enterprise frame and responsive navigation", async () => {
  const css = await source("packages/ui/styles.css");
  assert.match(css, /\.store-workspace\s*\{/);
  assert.match(css, /grid-template-columns:\s*240px minmax\(0, 1fr\)/);
  assert.match(css, /\.store-app-grid\s*\{/);
  assert.match(css, /repeat\(auto-fill, minmax\(240px, 1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*1199px\)/);
  assert.match(css, /@media \(max-width:\s*759px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
```

- [ ] **Step 2: Run the contract tests and observe missing selectors**

Run: `node --import tsx --test tests/unit/store-page-contract.test.mjs tests/unit/app-store-pwa-render-smoke.test.mjs`

Expected: FAIL on `.store-workspace`, `.store-app-grid`, and breakpoint/reduced-motion assertions.

- [ ] **Step 3: Replace the legacy Store-only CSS block with the enterprise frame**

```css
.store-workspace {
  background: #f5f7fb;
  color: var(--evcp-color-text);
  min-height: 100dvh;
}
.store-workspace-frame {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100dvh;
}
.store-sidebar {
  background: #0b1830;
  color: #dbe7ff;
  height: 100dvh;
  overflow-y: auto;
  position: sticky;
  top: 0;
}
.store-workspace-main {
  min-width: 0;
}
.store-topbar {
  backdrop-filter: blur(12px);
  background: rgb(255 255 255 / 92%);
  border-bottom: 1px solid var(--evcp-color-border-soft);
  position: sticky;
  top: 0;
  z-index: 20;
}
.store-content {
  margin: 0 auto;
  max-width: 1600px;
  padding: 28px 36px 48px;
}
.store-app-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
.store-search-layout {
  display: grid;
  gap: 24px;
  grid-template-columns: 240px minmax(0, 1fr);
}
.store-app-detail-layout {
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr) 340px;
}
.store-app-action-rail {
  display: grid;
  gap: 16px;
  position: sticky;
  top: 104px;
}
.store-profile-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.store-workspace :is(a, button, input, select, textarea):focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: 2px;
}
```

Complete the Store-only styles for sidebar groups/active indicator, topbar/search/account, page headers, state panels, cards/accent variants, status lists, account panels, forms, drawer backdrop, skeletons, success/error regions, truncation/wrapping, hover, and semantic tones. Keep borders thin and shadows low-elevation. Do not change generic `.app-shell`, `.sidebar`, Admin, Creator, generated-app, backup, or logo selectors.

- [ ] **Step 4: Add exact tablet, mobile, and reduced-motion rules**

```css
@media (max-width: 1199px) and (min-width: 760px) {
  .store-workspace-frame {
    grid-template-columns: 80px minmax(0, 1fr);
  }
  .store-sidebar-brand-name,
  .store-nav-group h2,
  .store-nav-label,
  .store-sidebar-account-copy {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .store-content {
    padding: 24px;
  }
  .store-app-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 759px) {
  .store-workspace-frame {
    display: block;
  }
  .store-sidebar {
    height: 100dvh;
    left: 0;
    max-width: 320px;
    position: fixed;
    top: 0;
    transform: translateX(-100%);
    width: min(88vw, 320px);
    z-index: 60;
  }
  .store-sidebar-open {
    transform: translateX(0);
  }
  .store-content {
    padding: 20px 16px 36px;
  }
  .store-app-grid,
  .store-search-layout,
  .store-app-detail-layout,
  .store-profile-grid {
    grid-template-columns: 1fr;
  }
  .store-app-action-rail {
    position: static;
  }
  .store-history-card {
    align-items: stretch;
    flex-direction: column;
  }
  .store-workspace :is(a, button, input, select, textarea) {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .store-workspace *,
  .store-workspace *::before,
  .store-workspace *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 5: Format and run CSS/source contracts**

Run: `pnpm exec prettier --write packages/ui/styles.css tests/unit/store-page-contract.test.mjs tests/unit/app-store-pwa-render-smoke.test.mjs && node --import tsx --test tests/unit/store-page-contract.test.mjs tests/unit/app-store-pwa-render-smoke.test.mjs && pnpm check:design-system`

Expected: PASS and the design-system check exits 0.

- [ ] **Step 6: Stage only Store CSS hunks and commit**

```bash
git add tests/unit/store-page-contract.test.mjs tests/unit/app-store-pwa-render-smoke.test.mjs
git add -p packages/ui/styles.css
git diff --cached --check
git commit -m "style(store): add responsive enterprise workspace"
```

---

### Task 8: Full Store Regression and Browser QA

**Files:**

- Modify: `tests/integration/store-ui-routing-contract.test.mjs`
- Modify: `tests/unit/app-store-pwa-route-behavior.test.mjs`
- Modify: `tests/e2e/sprint7-store-ticket-smoke.test.mjs`
- Modify: `tests/e2e/store-actions-api-client-smoke.test.mjs`

**Interfaces:**

- Consumes: the complete workspace implementation and existing Store routes/API client.
- Produces: automated coverage for every route/state and recorded browser QA at desktop, tablet, and mobile widths.

- [ ] **Step 1: Expand route/state regression coverage**

Add table-driven assertions for `/store/`, `/store/available`, `/store/search?q=payroll`, `/store/favorites`, `/store/recent`, `/store/access-requests`, `/store/tickets`, `/store/tickets/T-1`, `/store/profile`, `/store/apps/payroll`, and an unknown Store route. Assert the workspace shell is retained for loading, ready, empty, authentication error, Platform error, detail error, and not-found state; assert no primary copy contains **Install app** or **Uninstall app**.

```js
const navigation = source("apps/app-store-pwa/src/features/storefront/store-navigation.ts");
const composition = source("apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx");
const shell = source("apps/app-store-pwa/src/features/storefront/StoreShell.tsx");
for (const route of [
  "/store/",
  "/store/available",
  "/store/search",
  "/store/favorites",
  "/store/recent",
  "/store/access-requests",
  "/store/tickets",
  "/store/profile"
])
  assert.match(navigation, new RegExp(route.replaceAll("/", "\\/")));
for (const page of [
  "StoreCollectionPage",
  "StoreSearchPage",
  "StoreAccessRequestsPage",
  "StoreTicketsPage",
  "StoreTicketDetailPage",
  "StoreProfilePage",
  "StoreAppDetailPage",
  "StoreNotFoundPage"
])
  assert.match(composition, new RegExp(page));
assert.match(shell, /store-workspace/);
assert.match(shell, /Sign in with Keycloak/);
assert.match(shell, /Retry Store/);
assert.doesNotMatch(`${navigation}${composition}${shell}`, /Install app|Uninstall app/);
```

- [ ] **Step 2: Run all Store-focused automated tests**

Run:

```bash
node --import tsx --test \
  apps/app-store-pwa/src/features/storefront/*.test.mjs \
  apps/app-store-pwa/src/routes/StoreRoutes.behavior.test.mjs \
  tests/unit/app-store-pwa-render-smoke.test.mjs \
  tests/unit/app-store-pwa-route-behavior.test.mjs \
  tests/unit/store-page-contract.test.mjs \
  tests/unit/store-routing.test.mjs \
  tests/unit/store-catalog.test.mjs \
  tests/integration/store-ui-routing-contract.test.mjs \
  tests/e2e/sprint7-store-ticket-smoke.test.mjs \
  tests/e2e/store-actions-api-client-smoke.test.mjs
```

Expected: PASS for all Store lifecycle, route, search, action, device-state, ticket, and render tests.

- [ ] **Step 3: Run typecheck, build, changed-file checks, and diff validation**

Run:

```bash
pnpm --filter @evcp/app-store-pwa typecheck
pnpm --filter @evcp/app-store-pwa build
pnpm check:changed
git diff --check
```

Expected: all four commands exit 0. Do not use the unrelated pre-existing Admin source-format failures from the full E2E suite as justification to edit `AdminConsole.tsx`.

- [ ] **Step 4: Start the Store and API development processes for browser QA**

Run: `pnpm --parallel --filter @evcp/app-store-pwa --filter @evcp/platform-api dev`

Expected: Vite reports the Store URL on port 4102 and Platform API reports its configured local port. Keep the process running during the next step.

- [ ] **Step 5: Verify real Store behavior at three viewport classes**

At desktop 1440×900, tablet 1024×768, and mobile 390×844, verify:

- `/store/`, `/store/available`, `/store/search?q=leave`, `/store/favorites`, `/store/recent`, `/store/access-requests`, `/store/tickets`, `/store/profile`, and one real app detail.
- Desktop uses the 240px sidebar and at least three app columns when enough records exist; tablet uses the icon rail/two columns; mobile drawer opens, closes by link/backdrop/Escape, and traps focus within the open drawer.
- Current navigation is identified with text/shape plus `aria-current`, keyboard focus is visible, touch controls are at least 44px, and no document-level horizontal scroll appears.
- Global search preserves `q`, Clear filters resets results, cards navigate to detail, an active app opens directly and records Recent, and favorites update on this device.
- Refresh preserves ready content on recoverable failure; logout error exposes Retry sign out; profile clear requires confirmation; request/ticket actions retain validation, pending state, success/error evidence, and duplicate prevention.
- Loading, empty catalog, no-access, no-favorites, no-recent, no-receipts, no-tickets, authentication error, Platform error, detail error, and not-found screens each provide a valid next action.
- With reduced motion enabled, drawer/hover/state transitions are effectively removed.

- [ ] **Step 6: Fix only evidenced Store regressions, rerun the smallest failing test, then rerun Step 2 and Step 3**

For each browser defect, first add or tighten the nearest Store test, observe it fail, make the smallest Store-scoped correction, and rerun that focused test before the complete Store command. Do not modify unrelated Admin, Creator, preview, or logo work.

- [ ] **Step 7: Commit verification coverage and any Store-scoped corrections**

```bash
git add tests/integration/store-ui-routing-contract.test.mjs tests/unit/app-store-pwa-route-behavior.test.mjs tests/e2e/sprint7-store-ticket-smoke.test.mjs tests/e2e/store-actions-api-client-smoke.test.mjs
git add -p packages/ui/styles.css
git diff --cached --check
git commit -m "test(store): verify enterprise workspace flows"
```

Only stage additional Store CSS hunks if Step 6 produced an evidenced correction; otherwise leave them unstaged.
