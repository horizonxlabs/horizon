# Task 5 report — production Keycloak auth operations

## Delivered

- Replaced simulated-auth operations guidance with the deployed server-owned Keycloak
  OpenID Connect Authorization Code with PKCE contract.
- Documented the realm import, confidential-client secret bootstrap, required runtime
  variables, exact callback and frontend-origin constraints, first EVCP administrator
  bootstrap, readiness checks, and fail-closed troubleshooting.
- Updated native-auth coverage so production mode rejects native login and password
  changes, mock headers, and simulated login. The legacy native credential harness
  is exercised only with an explicit `EVCP_ALLOW_SIMULATE_LOGIN=1` test setting.
- Added the production documentation contract at
  `tests/e2e/keycloak-production-contract.test.mjs`.

## TDD record

1. Added the production documentation contract before changing operations docs.
2. RED: `node --import tsx --test tests/e2e/keycloak-production-contract.test.mjs`
   failed because frontend bootstrap guidance still described the simulated SSO bridge.
3. Replaced the obsolete guidance and reran the contract successfully.
4. Replaced the native-auth test with a production rejection contract.
5. RED: `node --import tsx --test tests/integration/platform-auth-native-contract.test.mjs`
   returned 401 from native login instead of the required disabled endpoint response.
6. GREEN: production-mode requests are rejected, and the legacy native credential
   harness remains available only under the explicit test flag; the focused native-auth
   contract passes.

## Verification

- `node --import tsx --test tests/e2e/keycloak-production-contract.test.mjs tests/integration/platform-auth-native-contract.test.mjs` — 3 passing tests.
- `git diff --check` — passed.
- `pnpm check:ci` — blocked by pre-existing oxlint warnings in
  `tests/integration/keycloak-user-management-contract.test.mjs` at lines 30 and 40
  (`ignored` unused). All preceding quality stages passed.

## Scope note

An additional pre-existing focused Keycloak callback test currently fails because a
new Keycloak session does not replace an older in-memory local role. It is outside
this documentation/native-auth task and was not changed here.
