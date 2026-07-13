# Task 3 report — Keycloak user management API

## TDD record

1. Added `tests/integration/keycloak-user-management-contract.test.mjs` before the implementation.
2. RED: `node --import tsx --test tests/integration/keycloak-user-management-contract.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `src/keycloak/admin-client.ts`, proving the requested capability was absent.
3. GREEN: implemented the server-only client, user service, route adapters, application wiring, and shared DTOs.
4. Re-ran the focused contract test successfully.

## Verification

- `node --import tsx --test tests/integration/keycloak-user-management-contract.test.mjs` — 2 passing tests.
- `pnpm --filter @evcp/platform-api typecheck` — passed.
- `pnpm --filter @evcp/api-client typecheck` — passed.
- `git diff --check` — passed.

## Self-review

- Keycloak Admin API calls use a client-credentials service token inside Platform API only; no browser-facing response contains service credentials.
- The client is limited to the token endpoint plus Keycloak user, user-group, and reset-password paths.
- Every service operation first requires the platform actor to be an admin; the route contract verifies a creator receives 403.
- Role changes replace EVCP role groups only and retain unrelated Keycloak groups.
- Audit records include actor, action, and user ID only; temporary passwords are never placed in audit metadata or response DTOs. The lifecycle test checks both submitted passwords do not appear in audit events.

## Review follow-up TDD record

1. Expanded the integration contract before changing production code to cover list, update, enable, EVCP-role replacement with an unrelated group retained, every supported role, invalid roles, full audit action coverage, and anonymous access.
2. RED: the focused suite failed because create suppressed `auth.keycloak_user.role_changed` and `MockAuthError` was translated to 400 rather than 401.
3. GREEN: create now audits the assigned role change, and the route adapter maps authentication resolution failures to the normal 401/`UNAUTHORIZED` envelope.
4. Verification: `node --import tsx --test tests/integration/keycloak-user-management-contract.test.mjs` passed 5 tests; both package typechecks and `git diff --check` passed.

## CI regression follow-up

- Root cause for the stale-role contract: the Keycloak session issuer bypassed `simulateLogin`, so it did not refresh the in-memory identity that bearer-session resolution reads. It now re-enters the Keycloak provider mapping/provisioning path, making the newest Keycloak groups authoritative.
- Root cause for the management-contract failures after the auth hardening task: its harness relied on mock headers, which are intentionally disabled by default. The harness now issues Keycloak-backed Platform Auth bearer sessions.
- Verification: `pnpm exec oxlint --deny-warnings tests/integration/keycloak-user-management-contract.test.mjs`, both Keycloak integration contracts (9 passing tests), Platform API typecheck, and `git diff --check` passed.

## Test bootstrap follow-up

- Test-only `test:unit`, `test:integration`, and `test:e2e` commands explicitly set `EVCP_ALLOW_SIMULATE_LOGIN=1`, restoring legacy mock-header fixtures without changing application defaults.
- The native auth harness can temporarily delete an environment value, and its security regression now verifies that an unset flag rejects mock headers and simulated login.
- `pnpm check:ci` passed hygiene, install, architecture, lint, and typecheck, then reached unrelated pre-existing unit assertions for removed mock-client APIs; it no longer fails on disabled mock headers.

## Production deployment follow-up

1. RED: added deploy-boundary contracts for Keycloak callback reconciliation, public `/auth/*` proxying with an internal back-channel issuer, and a persistence-backed Keycloak login projection. The new contracts failed because bootstrap only set secrets and OIDC sessions did not project to core persistence.
2. GREEN: bootstrap now reconciles the Platform API callback from `EVCP_PUBLIC_API_URL`; Keycloak runs under public `/auth` through Caddy while Platform API uses `KEYCLOAK_INTERNAL_ISSUER_URL` for token/JWKS/Admin calls; and session issuance upserts the current Keycloak name/role before it signs a Platform session.
3. Verification: focused Keycloak unit, integration, user-management, and production contracts passed (15 tests), alongside Platform API and API client typechecks and `git diff --check`.
