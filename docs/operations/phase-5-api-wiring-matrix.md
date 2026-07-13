# Phase 5 API wiring matrix

Status date: 2026-07-13. The browser is a Platform API client, not an authority for project,
publish, installation, or support state. When an endpoint fails, UI preserves the last server
snapshot and shows loading, empty, denied, or retryable error state; it does not construct a local
success response.

| Surface | View/state | API client methods | Loading / empty / denied / error behavior |
| --- | --- | --- | --- |
| Admin | Setup, AI governance, Keycloak user/session controls | `getSetupStatus`, AI governance methods, Keycloak user/session methods | Existing governance data clears on session change; unavailable state disables mutations |
| Creator | Projects, PRD, workspace, app access, publish | project/PRD/workspace/access/publish methods | No API project means no workspace/publish operation; failed mutation keeps prior snapshot |
| App Store | Store home, access, install, uninstall, ticket | `getCurrentUser`, `listStoreApps`, store detail/action methods | Starts loading with no app card; missing/revoked session redirects to Keycloak; no assigned app is explicit empty state |

## State ownership

- Access/refresh credentials: browser Platform session store only; refresh/revoke behavior is owned by
  the session-aware fetcher.
- User/project/PRD/workspace/publish/store entities: Platform API and its configured persistence
  runtime.
- Form field values, in-flight flags, selected tab, and visible error copy: local React view state.
- A browser action may only show success when it receives a successful Platform API response.

## Deliberate local-only behaviors

The test runtime may enable deterministic memory services with
`EVCP_ALLOW_SIMULATE_LOGIN=1`. This flag is not a production UI fallback: production builds do
not invent Store apps, workspace previews, invitations, access decisions, or publish records.

