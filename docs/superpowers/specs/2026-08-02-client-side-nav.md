# Client-side Shell Navigation — Design

**Status:** Draft for review.
**Date:** 2026-08-02
**Scope:** Stop the full-page reload / white flash when clicking the sidebar menu in the admin and creator consoles. Make the shared `AppShell` sidebar navigate client-side (history API) instead of a browser navigation. The app-store PWA is out of scope (see below).

## Problem

`packages/ui/src/app-shell.tsx` renders each sidebar item as a plain `<a href={item.route}>` with no click interception, and there is no client-side router anywhere in the frontends. So every menu click is a real browser navigation: the SPA fully reloads (blank → re-download index.html + JS bundle → re-mount React → re-fetch data), producing a visible white flash. Each app's page-switcher (`AdminConsole`, `CreatorShell`/`use-creator-app`) just reads `window.location.pathname` to pick the panel.

## Scope

- **admin-web + creator-web** — both render the `AppShell` sidebar → both flash. Fixed here.
- **app-store-pwa** — does **not** use `AppShell`; its navigations (`window.location.assign` to a generated app at `/apps/*`, Keycloak auth redirects, an `<a href="/store">` back-link) are intentional full-page transitions between *separate* apps. No flashing sidebar menu exists there. Out of scope.

## Design

Opt-in, backward-compatible, and small.

### 1. `AppShell` (packages/ui) — optional `onNavigate`

Add `onNavigate?: (route: string) => void` to `AppShell`'s props. In the sidebar item's `<a>` `onClick`:
- If `onNavigate` is set **and** the click is a plain left-click (`event.button === 0`, no `ctrl/meta/shift/alt`, no default-prevented) → `event.preventDefault()` then `onNavigate(item.route)`.
- Otherwise fall through to the native `<a href>` (open-in-new-tab, middle-click, ctrl/cmd-click, right-click, and — when no `onNavigate` is passed — the existing full-reload behavior for any app that hasn't opted in).

Keep `href={item.route}` always (accessibility, middle-click, and progressive-enhancement fallback). Extract the decision as a pure, unit-testable helper `isPlainLeftClick(event): boolean`.

### 2. Each console's page-switcher — reactive path + history

`AppShell` stays presentational (it does not own routing). The app wires `onNavigate`:
- `const [path, setPath] = useState(() => window.location.pathname)`.
- `onNavigate = (route) => { if (route !== window.location.pathname) window.history.pushState(null, "", route); setPath(route); }` — passed to `AppShell`.
- A `useEffect` adds a `popstate` listener → `setPath(window.location.pathname)` (back/forward), cleaned up on unmount.
- The existing `pageFromPath(path)` / `creatorPageFromPath(path)` now runs off the reactive `path` state, so the correct panel renders without a reload.

**admin-web** (`AdminConsole.tsx`): introduce the `path` state + effect, feed `pageFromPath(path)`, pass `onNavigate` to `AppShell`. (`AdminConsole` currently reads `window.location.pathname` once at render — make it reactive.)

**creator-web** (`use-creator-app.tsx` + `CreatorShell.tsx`): the hook already has a `popstate` listener and `pushState`/`replaceState` helpers for project selection — extend it so the sidebar page is driven by the same reactive path and `onNavigate` is threaded to `CreatorShell`'s `AppShell`. Reuse the existing history plumbing; do not add a second competing one.

No data-fetching change: panels still fetch on mount; the flash is gone because the shell + bundle no longer reload.

## Data flow

Click sidebar item → `AppShell` (plain left-click) `preventDefault` + `onNavigate(route)` → app does `history.pushState` + `setPath` → `pageFromPath(path)` re-renders the panel in place. Back/forward → `popstate` → `setPath` → re-render. Middle/ctrl/cmd-click → native `<a>` (new tab), unchanged.

## Error handling

None new. If an app does not pass `onNavigate`, behavior is exactly as today (full-reload) — so this cannot regress the store or any not-yet-wired surface.

## Testing

- **Unit:** `isPlainLeftClick` — accepts `{button:0}` with no modifiers; rejects `ctrlKey`/`metaKey`/`shiftKey`/`altKey`/`button!==0`/`defaultPrevented`. (`pageFromPath`/`creatorPageFromPath` are already pure — a small test that the switch maps the new reactive path is enough.)
- **Render-smoke:** `AppShell` renders with and without `onNavigate` (extend `tests/unit/ui-primitives.test.mjs`), and admin/creator render-smoke still pass (the shells now pass `onNavigate`). Assert the sidebar items still render an `href` (a11y/fallback preserved).
- **Live (controller-run, gated):** with the local stack running, load `/admin`, click between menu items, and confirm the URL changes and the panel swaps **without a full document reload** (no network re-fetch of index.html / the JS bundle; e.g. check via the Network panel or that a set-once `window.__navProbe` survives clicks). Same spot-check on `/creator`.

## Acceptance criteria

- Clicking the admin/creator sidebar swaps panels client-side (no reload, no white flash); URL updates; back/forward work.
- ctrl/cmd/middle-click still open in a new tab; the `<a href>` and `aria-current` are preserved.
- `AppShell` change is opt-in — any surface that doesn't pass `onNavigate` (incl. app-store) is unchanged.
- `pnpm check` green (incl. design-system, render-smoke).

## Out of scope

- app-store-pwa (no `AppShell` sidebar; its full-page navigations are intentional).
- A general router library / route-based code-splitting / nested routes.
- Per-panel data caching or transition animations.
