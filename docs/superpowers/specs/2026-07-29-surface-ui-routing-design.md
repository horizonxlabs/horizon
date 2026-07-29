# Admin, Creator, and Store UI Routing Design

**Date:** 2026-07-29  
**Status:** Approved design  
**Scope:** UI, navigation, and client-side routing only

## Objective

Make the Admin, Creator, and Store surfaces match their intended use-case ownership without adding Platform API endpoints, database tables, or third-party routing dependencies.

The implementation must preserve the existing Horizon visual language, authentication flows, setup guards, Platform API contracts, and no-demo-data fallback policy.

## Scope

### Included

- Give every visible navigation item a distinct, directly addressable page.
- Support direct URL loading, refresh, browser back, and browser forward.
- Split the Store single-page prototype into use-case-specific pages.
- Enable the existing Creator project navigation.
- Expose existing access-request decision and ticket-to-PRD actions in Creator UI.
- Reuse existing API-backed Creator workspace, database, version, publish, and deployment state on focused pages.
- Add Admin readiness pages for Auth, Domains, and Publishing using existing live or evidence-backed information.
- Implement Store search and filters in the browser.
- Persist Store favorites, recently opened apps, ticket IDs, and access-request receipts in browser storage.
- Preserve responsive behavior and shared UI component usage.

### Excluded

- New Platform API routes.
- New database schema or migrations.
- Server-synchronized favorites or recent-app history.
- Server-side Store search.
- Ticket comments, attachments, or Creator replies when the current API does not support them.
- A migration to `react-router-dom`.
- Redesigning the Horizon visual system.

Unsupported server actions must be visible only when useful for explaining the workflow. They must be disabled and labelled `Platform API support required`; they must never create local records that appear server-backed.

## Architectural Approach

Keep the existing lightweight browser-history architecture.

Each surface owns:

1. A pure, typed route resolver.
2. A pathname state hook that listens for `popstate`.
3. A `navigate(path)` helper that calls `history.pushState` and updates pathname state.
4. A route composition component that renders one page for the resolved route.
5. A surface-specific not-found page.

Authentication and Admin setup guards continue to run before route composition. No new runtime dependency is introduced.

Route resolvers must not fetch data or mutate browser state. They only turn a pathname into a typed route value. This keeps direct navigation and route behavior independently testable.

## Admin Surface

### Routes

| Route | Page |
|---|---|
| `/admin` | Dashboard and production monitoring |
| `/admin/services` | Service and queue health |
| `/admin/ai-providers` | AI provider, credential, model, routing, and quota management |
| `/admin/guardrails` | Guardrail rules and decisions |
| `/admin/knowledge` | Knowledge and skills governance |
| `/admin/audit-logs` | Audit evidence and filtering |
| `/admin/users` | Platform user management |
| `/admin/auth` | Authentication and SSO readiness |
| `/admin/domains` | Domain and routing readiness |
| `/admin/publishing` | Publish governance and release readiness |

### Behavior

- Existing live pages keep their current hooks and Platform API clients.
- Auth, Domains, and Publishing render focused readiness pages from existing live information when available.
- Evidence-only information is labelled as readiness evidence, not live configuration.
- An unavailable endpoint renders a warning state and never falls back to a successful sample.
- `AdminConsole` remains the composition root; page implementations move to focused components instead of expanding the root conditional.

## Creator Surface

### Routes

| Route | Page |
|---|---|
| `/creator/` | Projects |
| `/creator/projects/:projectId` | Workspace |
| `/creator/projects/:projectId/prd` | PRD review and baseline |
| `/creator/projects/:projectId/database` | Project database view |
| `/creator/projects/:projectId/versions` | Frontend checkpoints and restore |
| `/creator/projects/:projectId/users` | Members, invitations, roles, and access requests |
| `/creator/projects/:projectId/publish` | Publish review and registry |
| `/creator/projects/:projectId/deployments` | Current deployment and available deployment evidence |
| `/creator/projects/:projectId/tickets` | Creator ticket inbox |
| `/creator/projects/:projectId/tickets/:ticketId` | Ticket detail and supported actions |

### Navigation

- Project-scoped navigation uses the selected project ID.
- PRD, Users, Publish, and Tickets are no longer labelled `(Soon)` or disabled.
- Database, Versions, and Deployments are added as project-scoped navigation items.
- Unknown project IDs render a project-unavailable state instead of silently selecting a different project.

### Access Requests

The Users page displays one decision control per pending request:

- Approve calls the existing access-request decision API with that request ID.
- Reject calls the same API with `rejected`.
- Only the selected row is disabled while its request is running.
- A successful decision refreshes members, roles, and access requests.
- A failed decision preserves the existing rows and shows an error message.

The current behavior that automatically chooses the first pending request is removed from the UI contract.

### Tickets

- The inbox route lists API-backed tickets.
- Selecting a ticket navigates to its detail route.
- The detail page renders fields already returned by the inbox API.
- Convert to PRD Change uses the current ticket-to-PRD endpoint.
- After conversion, ticket and PRD state are refreshed.
- Reply and status mutation controls are disabled when no current API supports them.
- The UI does not create local Creator ticket or PRD records.

### Database, Versions, and Deployments

- Database and Versions pages reuse existing workspace hooks and panels.
- They do not duplicate fetching logic or introduce demo rows.
- Deployments uses the current publish result, registry entry, and available deployment response data.
- If historical deployments are not returned by the current API, the page clearly presents the current deployment only.

## Store Surface

### Routes

| Route | Page |
|---|---|
| `/store` and `/store/` | My Apps |
| `/store/available` | Available Apps |
| `/store/search` | Search and filters |
| `/store/favorites` | Device favorites |
| `/store/recent` | Recently opened apps on this device |
| `/store/apps/:appSlug` | App detail and supported actions |
| `/store/access-requests` | Access-request receipts and current app access status |
| `/store/tickets` | Tickets remembered on this device |
| `/store/tickets/:ticketId` | Ticket status and timeline |
| `/store/profile` | Current profile, session source, and device-storage disclosure |

Generated application routes remain outside the Store route namespace and use the route returned by the published app record.

### Store Shell

The Store shell owns:

- Mobile-first header and session actions.
- Navigation with an active state.
- Shared loading, session-error, and action-error presentation.
- Page content selected by the typed Store route.

The Store shell loads current-user and Store-home data once per application load. Route pages consume the shared state rather than each page creating an independent bootstrap request.

### App Discovery

- My Apps and Available Apps are rendered on separate pages.
- App cards navigate to `/store/apps/:appSlug`.
- Open App is available on the detail page only when access is active.
- Search matches app name, description, owner, and current role case-insensitively.
- Filters cover collection, access status, and installation status.
- Empty search and filtered results show explicit empty states.

### Device-Local State

Browser storage is used only for data that can be honestly described as device-local:

- Favorite app slugs.
- Recently opened app slugs with the most recent first.
- Ticket IDs created from this browser.
- Access-request receipts created from this browser.

Storage values are versioned and validated when read. Invalid JSON or an incompatible value returns an empty state without crashing the Store.

The UI labels Favorites, Recent, Tickets, and Access Requests as device-specific where server list APIs do not exist.

### App Detail and Open

- The detail page fetches the current app detail from the existing endpoint.
- Install, Remove, Request Access, and Submit Ticket reuse current API-client methods.
- Open App records the slug in recent history before navigating to the published route.
- A missing or inaccessible slug renders an unavailable state.
- App cards never bypass the detail page.

### Access Requests

- Submitting a request stores the returned receipt locally.
- The Access Requests page combines local receipts with current access status from Store-home app cards.
- No locally stored receipt is presented as a server-authoritative history.
- Pending access remains visible through the app card status returned by the current Store-home endpoint.

### Tickets

- Submitting a ticket stores its returned ID locally.
- The Tickets page fetches each remembered ticket with the existing ticket-detail endpoint.
- Failed or unauthorized ticket IDs are shown as unavailable without removing other valid tickets.
- Ticket detail renders the API-backed status and timeline.
- Comments and attachments are disabled with an API-support explanation.

### Profile

The Profile page renders:

- Current user name and email.
- Session source.
- Sign-out action.
- Explanation of which Store preferences are device-local.
- A control to clear Store device preferences without clearing the authentication session.

## Error and Loading Behavior

- Route-level loading is distinct from action-level loading.
- Existing successful data remains visible while a refresh action is running.
- Failed mutations preserve the previous state.
- Mutation buttons prevent duplicate submission.
- Unauthorized responses follow the existing sign-in/session-expiry behavior.
- Unknown routes render a surface-specific not-found page.
- Unknown project, app, or ticket identifiers render unavailable states with a safe navigation action.
- No surface substitutes mock data after an API failure.

## Responsive and Accessibility Requirements

- Reuse `@evcp/ui` primitives and Horizon tokens.
- Keep Store layouts mobile-first.
- Navigation and per-row actions remain keyboard accessible.
- Current route is represented visually and through an accessible current-page attribute.
- Loading and mutation results use appropriate status or alert semantics.
- Disabled unsupported actions include visible explanatory text.
- Focus moves to the page heading after client-side navigation.

## Testing Strategy

Implementation follows test-driven development.

### Unit Tests

- Admin, Creator, and Store route resolvers.
- Browser pathname-state behavior for push, back, and forward.
- Store search and filter derivations.
- Versioned Store local-state parsing and invalid-value recovery.
- Favorite toggling and recent-app ordering.
- Creator access-request action mapping by request ID.
- Store ticket-ID and access-receipt persistence.

### Integration and UI Contract Tests

- Every configured navigation item resolves to a distinct page.
- Direct URLs render their expected page copy.
- Creator project navigation is enabled and project-scoped.
- Approve and Reject use the selected request ID.
- Store cards navigate to Store app detail.
- Store detail actions call existing API-client methods.
- Ticket and access-request pages disclose device-local history.
- Unsupported actions remain disabled and do not mutate local application data.

### Verification

The final verification run must include:

- Repository lint.
- Workspace typecheck.
- Production build.
- Relevant unit, integration, and end-to-end suites.
- A route and acceptance-criteria checklist against this design.

## Acceptance Criteria

1. Admin, Creator, and Store have no visible dead navigation routes.
2. Direct URL, refresh, browser back, and browser forward render the correct page.
3. Creator project navigation is enabled and contains no `(Soon)` labels for implemented pages.
4. A Creator can approve or reject a specific pending access request from Users using the current API.
5. A Creator can open a ticket detail and invoke the existing ticket-to-PRD flow.
6. Store has distinct My Apps, Available, Search, Favorites, Recent, App Detail, Access Requests, Tickets, Ticket Detail, and Profile pages.
7. Store search, filters, favorites, and recent history work without backend changes.
8. Existing Store access-request and ticket APIs continue to work.
9. Device-local data is clearly labelled and never represented as authoritative server history.
10. API failures never produce demo-success fallbacks.
11. The three surfaces remain responsive and use the shared design system.
12. The full verification commands complete successfully before the implementation is reported complete.
