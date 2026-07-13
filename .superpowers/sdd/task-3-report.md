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
