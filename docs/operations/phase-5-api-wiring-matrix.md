# Phase 5 API Wiring Matrix

This matrix is the acceptance inventory for a pilot build. “API-backed” means the
screen reads its authoritative state through a Platform API request and reports a
server error without manufacturing a local result. Static explanatory copy is not
authoritative application data.

| Surface | Capability | Platform API contract | Empty / denied / retry behaviour | Status |
| --- | --- | --- | --- | --- |
| Creator | Project selection | `GET /projects` | Empty routes to `ProjectsPage`; API failure shows retry without a fixture | API-backed |
| Creator | PRD and versions | `GET /projects/:id/prd`, `GET /projects/:id/prd/versions`, baseline mutation | Explicit “No local PRD fallback”; mutation failure preserves rendered API state | API-backed |
| Creator | Workspace chat, preview, usage and files | Workspace, SSE chat, preview and persistent-file endpoints | Existing preview is retained on failure; no generated client result | API-backed |
| Creator | Database | `GET /projects/:id/database` in `WorkspaceDatabasePanel` | Loading and unavailable state belong to the panel; root dashboard does not render sample records | API-backed |
| Creator | Tickets | `GET /creator/projects/:id/tickets` | Empty inbox and unavailable message; no demo approval queue | API-backed |
| Creator | Access and publish | App access and publish client contracts | Queries refresh after mutations; API error stays visible | API-backed |
| Creator | Unknown/default route | none | Informational fail-closed screen; does not mount the old demo dashboard | fail-closed |
| Admin | User/session administration | Keycloak management and Platform session routes | Loading, empty sessions, mutation error and revoke state are explicit | API-backed |
| Admin | AI governance | Persisted provider/key/primary+fallback route/quota/guardrail/execution APIs | Availability gate blocks mutations without a valid API response; never exposes secret material | API-backed |
| Admin | Audit and operations | Production audit and operations APIs | Loading/unavailable states are explicit | API-backed |
| App Store | App list/detail/access/install | `/store/apps`, detail, access and install routes | Current session required; mutations refetch the storefront | API-backed |
| App Store | Ticket/status | Store ticket create/read routes | Server failure leaves no local ticket result | API-backed |

## Explicitly excluded from pilot authority

- `apps/app-store-pwa/src/features/generated-leave-management/` is a generated-app
  showcase, not the App Store authority. It must not be seeded or published as a
  pilot application without an explicit local-development opt-in.
- The former Creator default dashboard was removed from the fallback route because
  it rendered fixture database, ticket, trace, and deployment data beside the
  API-backed pages.
- The App Store has no local ticket or installation fallback helpers.

## Verification

Run the browser flow with a new account and an empty database. Confirm that every
empty page remains empty, a forced API 5xx exposes an error/retry state, and no
`TKT-LOCAL`, `local_install`, or demo project is inserted into PostgreSQL.
`EVCP_SEED_DEMO_PROJECT` defaults to `0`; setting it to `1` is required before
the seed script creates sample users, projects, tickets, or artifacts.
