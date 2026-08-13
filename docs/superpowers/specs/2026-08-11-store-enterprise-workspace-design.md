# Horizon Store Enterprise Workspace Design

**Date:** 2026-08-11
**Status:** Approved
**Scope:** The complete Horizon Store experience across every existing Store route

## Summary

Redesign Horizon Store from a narrow, card-centered PWA page into a professional enterprise application workspace. The new Store uses the available screen width, gives application discovery priority, and preserves the existing Platform API, routing, access, favorites, recent history, ticket, and profile behaviors.

The approved direction is an Enterprise Workspace: persistent desktop navigation, a contextual top bar, fluid content, responsive application grids, and a mobile navigation drawer. All user-facing copy remains English.

## Problem

The current Store is constrained to a 720px centered column. On desktop this leaves most of the screen unused, while the large header, pill navigation, summary cards, and vertically stacked results consume space before users can reach applications. The same visual pattern is used for workflows with very different information needs, including app discovery, access receipts, tickets, and account settings.

The Store is functional, but its information architecture and density do not communicate the quality expected from an enterprise product.

## Goals

- Use desktop and tablet screen space efficiently without making content difficult to scan.
- Give users faster access to assigned applications and catalog search.
- Create one coherent visual and interaction system for every Store route.
- Preserve real API-backed behavior and device-local preferences.
- Make loading, empty, error, pending, and success states actionable and visually intentional.
- Maintain keyboard, screen-reader, touch, and reduced-motion support.
- Keep Store routes and Platform API contracts backward-compatible.
- Treat active web applications as launchable products without requiring an installation ceremony.

## Non-goals

- No Platform API or database contract redesign.
- No fabricated catalog records, access states, tickets, or success responses.
- No new billing, purchasing, ratings, reviews, or marketplace workflow.
- No custom application artwork management in this iteration; cards derive a stable visual identity from existing app metadata.
- No replacement of Keycloak or the existing Store session bridge.

## Information Architecture

The Store navigation is grouped by user intent rather than rendered as one row of equal pills.

### Workspace

- **My Apps** — applications with active access.
- **Discover** — the current Available Apps catalog.
- **Search** — full catalog search and filters.
- **Favorites** — device-local saved applications.
- **Recent** — device-local recently opened applications.

### Service

- **Access Requests** — remembered request receipts with current catalog access state.
- **Tickets** — remembered support tickets and their current Platform API status.

### Account

- **Profile** — signed-in identity and device preference controls.
- **Logout** — ends the Store session through the existing logout flow.

Existing URLs remain authoritative:

| Destination | Route |
| --- | --- |
| My Apps | `/store/` |
| Discover | `/store/available` |
| Search | `/store/search` |
| Favorites | `/store/favorites` |
| Recent | `/store/recent` |
| Access Requests | `/store/access-requests` |
| Tickets | `/store/tickets` |
| Profile | `/store/profile` |
| App detail | `/store/apps/:slug` |
| Ticket detail | `/store/tickets/:id` |

Search additionally accepts a backward-compatible `q` query parameter, for example `/store/search?q=payroll`.

## Workspace Shell

### Desktop

At widths of 1200px and above, the Store is a full-height application frame:

- A fixed 240px navigation sidebar.
- A sticky contextual top bar above the route content.
- A fluid content canvas capped between 1440px and 1600px for readable density on very large displays.
- Content padding of 28–36px, with the app grid using three or four columns according to available width.

The sidebar contains the Horizon mark and `Horizon Store` wordmark, grouped navigation, current role, and a compact account area. Active navigation uses an icon, surface highlight, and left indicator so state does not rely on color alone.

The top bar contains:

- Current route title and a short contextual description.
- A global app search control.
- Platform API connection state.
- Refresh action for API-backed Store data.
- Compact account menu with identity and logout.

### Tablet

Between 760px and 1199px, the sidebar becomes a compact icon rail with accessible labels. Content uses a two-column application grid. The top bar retains search and account controls.

### Mobile

Below 760px, navigation moves into a drawer opened from a sticky top bar. Route content is one column, controls use at least 44px touch targets, and no page requires horizontal document scrolling. Long result rows collapse into stacked cards while preserving status and actions.

## Shared Components

### `StoreWorkspaceShell`

Owns the responsive frame and composes the sidebar, top bar, route content, and shell-level alerts. It consumes existing Store bootstrap state and navigation helpers but does not own catalog filtering or route-specific mutations.

### `StoreSidebar`

Renders grouped navigation from the Store route configuration with Lucide icons, `aria-current`, request/ticket count badges when evidence exists, and the responsive drawer controls.

### `StoreTopbar`

Renders page context, global search, refresh, connection state, and account controls. Submitting global search navigates to `/store/search?q=<encoded query>`.

### `StorePageHeader`

Standardizes route eyebrow, title, description, count, device-local label, and optional page action.

### `StoreAppCard`

Presents one application with:

- Stable derived icon tile.
- Name, description, and owner.
- Access and health state.
- Favorite toggle.
- One clear primary action: **Open app**, **View details**, **Request access**, or **View request** according to existing capabilities.

The entire card has a clear navigation affordance, but favorite and primary action remain independent native buttons. Active web applications open directly; the Store does not ask the user to install a website.

### `StoreStatePanel`

Provides consistent loading, empty, error, and recovery layouts with an icon, concise explanation, and a real next action.

## Page Designs

### My Apps

The default Store page prioritizes immediate launch:

- A compact welcome header showing assigned-app count and account context.
- A responsive grid of active applications.
- A catalog discovery action when the user has no active apps.
- An Open Creator action only when the catalog is empty and the current role is allowed to publish.

Large summary cards are removed. My Apps, catalog, and access information become compact contextual metrics in the page header or sidebar.

### Discover

Discover presents the available catalog in the shared application grid. It shows owner, health, and access status without pretending that web apps must be installed. Selecting an app opens its detail page; access actions use the current Platform API capability rules.

### Search

Search uses the horizontal space explicitly:

- A 240px filter rail on desktop.
- A results area with a two- to four-column app grid.
- Query synchronized with `?q=` so global search, refresh, and browser navigation preserve intent.
- Collection and access-status filters using the existing catalog filter engine.
- Visible result count and a Clear filters action.
- Mobile filters collapse into a compact panel above results.

### Favorites and Recent

These routes reuse `StoreAppCard` and retain current device-local storage semantics. Each page clearly labels its scope as `This device`. Empty states link to Discover or My Apps instead of ending in a dead end.

### Access Requests

Access request receipts become a responsive status list. Each row shows app, requested role, reason, receipt state, current access state, and timestamp. Available apps link to app detail; missing catalog apps remain clearly marked as unavailable.

### Tickets

Ticket history uses a compact status list with ticket number, app, subject, status, and last available evidence. Rows navigate to the existing ticket detail route. Reload remains available and preserves previously rendered entries while refreshing.

### Profile

Profile becomes a two-column account workspace:

- Identity and SSO role summary.
- Device-local data summary and clear controls.

The existing confirmation behavior for clearing preferences remains. Copy distinguishes server identity from device-local favorites, recent apps, ticket IDs, and receipts.

### App Detail

Desktop app detail uses a two-column composition:

- Main column: identity, description, owner, department, health, role, and relevant support content.
- Action rail: Open app, access state, request access, request status, and support ticket actions.

Mobile stacks these sections. Existing capability checks, validation, pending state, deduplication, API mutations, receipts, tickets, and refresh behavior remain authoritative. Installation controls are not part of the primary web-app experience.

## Data and Interaction Flow

- `StoreProvider` remains the source of bootstrap, merged catalog, device preferences, mutation states, refresh, and logout.
- The shell reads bootstrap and aggregate counts but does not duplicate them in local state.
- Route pages continue to consume `useStorefront` for route-specific data and actions.
- Search query state initializes from `window.location.search`; form submission updates the Store URL through the existing browser navigation boundary.
- Filters remain local to the Search page and use `filterStoreApps`.
- Favorite and recent behavior remains device-local through the current device repository.
- Access requests and tickets continue to call the Platform API and remember only receipt identifiers/evidence locally.
- Refresh preserves ready Store content on recoverable failure and surfaces an inline error rather than replacing the catalog with fixtures.

## State Design

### Loading

The Store frame renders immediately with skeleton navigation and content cards. This prevents a small centered loading card from replacing the entire application frame.

### Empty

Every empty state explains why it is empty and offers the next valid action:

- No active apps → Discover applications.
- Empty catalog → publish through Creator when authorized.
- No favorites → browse Discover.
- No recent apps → open an application.
- No receipts or tickets → submit from an app detail page.

### Errors

- Authentication errors retain a secure Store shell and offer Keycloak sign-in.
- Platform errors retain context and offer Retry Store.
- Logout failure remains visible with Retry sign out.
- Refresh errors preserve ready content and are announced through an inline alert.
- Mutation errors remain adjacent to the action that failed.

### Pending and Success

Mutation buttons disable while pending, expose progress copy, and prevent duplicate submissions using the current action coordinator. Success evidence is rendered close to the initiating action and retained only as long as the existing state model supports it.

## Visual System

- Crisp enterprise direction using Horizon navy, indigo-blue interaction color, white surfaces, subtle cool-gray canvas, and restrained semantic colors.
- LINE Seed Sans TH remains the shared product typeface even though Store UI copy is English.
- Thin borders and low-elevation shadows replace large floating cards.
- App tiles use a stable deterministic accent derived from app identity rather than random gradients.
- Icons communicate navigation and status; text labels remain visible or available to assistive technology.
- Motion is limited to drawer, hover, and state transitions and is removed under `prefers-reduced-motion`.

## Accessibility

- Semantic `nav`, `main`, `header`, headings, lists, and forms.
- `aria-current="page"` for the active route.
- Native buttons and links for all interactions.
- Visible keyboard focus on navigation, cards, filters, menus, and drawer controls.
- Drawer focus management, Escape close, and background dismissal.
- Status changes announced using appropriate `role="status"` or `role="alert"` regions.
- Text and non-text contrast target WCAG 2.1 AA.
- Touch targets are at least 44px on mobile.
- Recommended and active states use shape, indicator, or text in addition to color.

## Testing and Verification

### Automated

- Unit tests for route grouping, active navigation, query parsing, and app-card primary actions.
- Integration tests for global search navigation, query/filter behavior, favorites, recent tracking, access request, ticket submission, refresh, and logout retry.
- Render-smoke coverage for every Store route and loading, ready, empty, authentication-error, platform-error, and not-found states.
- Existing Store lifecycle, action deduplication, and device-state suites remain green.
- Store typecheck, production build, changed-file quality checks, and `git diff --check` pass.

### Browser QA

Verify against real local Store data at desktop, tablet, and mobile widths:

- Content uses available width without excessive empty margins.
- Navigation identifies the current route and works without full reload.
- Global search and filters update real results.
- App cards open details and active apps launch through existing routes.
- Favorites and recent state update on the device.
- Access, ticket, refresh, logout, clear-device, loading, empty, and error states remain usable.
- No horizontal document overflow occurs at supported widths.
- Keyboard order and focus visibility remain coherent.

## Acceptance Criteria

The redesign is complete only when:

1. Every existing Store route renders inside the new workspace shell.
2. Desktop content is no longer limited to the current 720px centered column.
3. Application collections render as responsive grids and use meaningful empty states.
4. Global search navigates to a query-preserving Search page and existing filters still work.
5. Favorites, recent history, requests, tickets, profile, refresh, authentication, logout, and app detail actions remain functional.
6. Active web applications can be opened without an installation requirement.
7. Tablet and mobile layouts use the approved responsive navigation and avoid horizontal document overflow.
8. Automated Store tests, typecheck, build, and targeted quality checks pass.
9. Browser QA confirms the approved visual direction and real interactions across representative routes and states.
