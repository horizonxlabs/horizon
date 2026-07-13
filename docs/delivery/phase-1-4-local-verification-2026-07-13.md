# Phase 1–4 local verification — 2026-07-13

Scope: local Docker Compose verification only. This is not a production acceptance record and does
not substitute for DNS/TLS, external registry, KMS/secret-store, backup destination, or pilot
cutline decisions that are currently deferred.

## Environment

- Compose stack: PostgreSQL, Redis, MinIO, Keycloak, LiteLLM, Platform API, Admin, Creator,
  App Store and Caddy.
- Runtime mode: `EVCP_CORE_PERSISTENCE=prisma`.
- Caddy entrypoint: `http://localhost:8088`.

## Evidence

| Check | Result |
| --- | --- |
| `GET /api/health` after Platform API restart | 200; database configured |
| Keycloak discovery under `/auth/realms/evcp/.well-known/openid-configuration` | 200 |
| Admin `/admin/users`, Creator `/creator/`, Store `/store/` | 200 HTML from Caddy |
| `GET /api/auth/keycloak/start?app=creator&returnTo=…` | 302 to Keycloak authorization endpoint with PKCE challenge |
| `prisma migrate deploy` during restart | applied `20260713000000_platform_auth_refresh_rotation`, `20260713000001_workspace_migration_records`, and `20260713000002_workspace_runtime_records` |
| PostgreSQL inspection | session refresh fields, `workspace_migration_records`, and `workspace_runtime_records` tables exist |
| Seed with `EVCP_SEED_DEMO_PROJECT` unset | Keycloak provider `authprov_keycloak_default_001` exists and is active |
| Browser smoke: Admin and Creator unauthenticated entry screens | Keycloak-only login screens rendered with no browser console errors |
| Browser smoke: Admin OIDC start | redirected to the Keycloak authorization endpoint with state, nonce and PKCE S256 challenge |
| Browser smoke: Store unauthenticated lifecycle | started the Keycloak authorization redirect with no browser console errors |

## Automated coverage run locally

- `pnpm typecheck`
- `pnpm test` — unit, integration and E2E contract suites
- `pnpm check:changed --base origin/main`
- Session refresh, rotation/reuse, logout/revoke, admin session metadata redaction, workspace
  lifecycle hydration, and migration persistence have focused tests.

## Remaining evidence before pilot

- Complete credentialed OIDC login for all three surfaces, then capture session refresh, Admin
  revoke and fail-closed states. Unauthenticated rendering and OIDC-start smoke coverage is
  recorded above; no credentials were used in this local verification.
- Clean-host install and a complete restart after real Creator project/provision/publish flow.
- External DNS/TLS, registry, KMS/secret store, backup/restore and signed pilot cutline.
