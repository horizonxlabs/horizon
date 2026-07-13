# Keycloak SSO and User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Keycloak the sole identity provider and let Platform Admins manage Keycloak users safely from Horizon Admin.

**Architecture:** Platform API owns the OAuth callback, authorization-code exchange, token validation, and conversion to the existing short-lived `platform_session`. A server-only Keycloak Admin client backs a small allow-listed user-management API. The three browser apps redirect to the API to start login and consume only the platform-session handoff.

**Tech Stack:** NestJS/Express route adapter, TypeScript, `jose` for OIDC JWT/JWKS validation, Keycloak 26 realm import, React 19, Vite, Node test runner.

## Global Constraints

- Keycloak realm `evcp` is the sole authority for identity, credentials, enabled state and EVCP group membership.
- The only supported role groups are `evcp-admins`, `evcp-creators`, and `evcp-users`.
- Browser code must never receive Keycloak admin credentials, an API client secret, or a refresh token.
- Production fails closed for unavailable Keycloak/discovery/JWKS/token exchange and must not use simulated SSO or native password endpoints.
- All user mutations require Platform role `admin` and write audit evidence without passwords.
- Keep each changed production source file at or below the repository large-file policy; extract focused modules rather than expanding `app-factory.ts` or `AdminConsole.tsx`.

---

## File Structure

- `apps/platform-api/src/keycloak/config.ts` — validates runtime Keycloak configuration and produces public OIDC URLs.
- `apps/platform-api/src/keycloak/oidc-service.ts` — creates one-time PKCE transactions, exchanges codes and validates ID tokens.
- `apps/platform-api/src/keycloak/admin-client.ts` — allow-listed Keycloak Admin REST operations and response mapping.
- `apps/platform-api/src/keycloak/user-service.ts` — authorization, group validation and audit-recording use cases.
- `apps/platform-api/src/keycloak/routes.ts` — route-specific parsing and HTTP results, composed by `app-factory.ts`.
- `apps/platform-api/keycloak/evcp-realm.json` — repeatable realm/group/server-only-client bootstrap.
- `packages/api-client/src/index.ts` — public browser-safe login and Keycloak-user DTO/methods.
- `apps/admin-web/src/features/user-management/KeycloakUserManagement.tsx` — list and mutation UI.
- `apps/*/src/**/platform-client.ts` — starts redirect login and receives platform-session handoff; no simulated bridge remains.

### Task 1: Keycloak realm provisioning and configuration

**Files:**
- Create: `apps/platform-api/keycloak/evcp-realm.json`
- Create: `apps/platform-api/src/keycloak/config.ts`
- Modify: `.env.example`
- Modify: `docker/docker-compose.yml`
- Modify: `docker/docker-compose.release.yml`
- Test: `tests/unit/keycloak-realm-config.test.mjs`

**Interfaces:**
- Produces `readKeycloakConfig(env): KeycloakConfig` for Tasks 2–4.
- Produces a realm import defining `evcp-admins`, `evcp-creators`, `evcp-users`, a confidential Platform API callback client and an API service-account client. Browser apps initiate login through Platform API and are not Keycloak clients.

- [ ] **Step 1: Write the failing realm/config test**

```js
test("Keycloak realm import and environment config expose only the required EVCP clients and groups", async () => {
  const { readKeycloakConfig } = await import("../../apps/platform-api/src/keycloak/config.ts");
  const realm = JSON.parse(await readFile("apps/platform-api/keycloak/evcp-realm.json", "utf8"));
  const config = readKeycloakConfig({
    KEYCLOAK_ISSUER_URL: "http://keycloak:8080/realms/evcp",
    KEYCLOAK_REALM: "evcp", KEYCLOAK_PLATFORM_CLIENT_ID: "evcp-platform-api",
    KEYCLOAK_PLATFORM_CLIENT_SECRET: "secret", KEYCLOAK_ADMIN_CLIENT_ID: "evcp-admin-service",
    KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-secret", EVCP_PUBLIC_API_URL: "http://localhost:3100"
  });
  assert.deepEqual(realm.groups.map(({ name }) => name).sort(), ["evcp-admins", "evcp-creators", "evcp-users"]);
  assert.equal(config.issuerUrl, "http://keycloak:8080/realms/evcp");
  assert.equal(config.callbackUrl, "http://localhost:3100/auth/keycloak/callback");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/keycloak-realm-config.test.mjs`

Expected: FAIL because the config module and realm import do not exist.

- [ ] **Step 3: Implement the minimal configuration and realm import**

```ts
export type KeycloakConfig = {
  issuerUrl: string; realm: string; platformClientId: string; platformClientSecret: string;
  adminClientId: string; adminClientSecret: string; callbackUrl: string;
};
export function readKeycloakConfig(env: Record<string, string | undefined>): KeycloakConfig {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required when Keycloak authentication is enabled`);
    return value;
  };
  const publicApiUrl = required("EVCP_PUBLIC_API_URL").replace(/\/$/, "");
  return { issuerUrl: required("KEYCLOAK_ISSUER_URL"), realm: required("KEYCLOAK_REALM"),
    platformClientId: required("KEYCLOAK_PLATFORM_CLIENT_ID"), platformClientSecret: required("KEYCLOAK_PLATFORM_CLIENT_SECRET"),
    adminClientId: required("KEYCLOAK_ADMIN_CLIENT_ID"), adminClientSecret: required("KEYCLOAK_ADMIN_CLIENT_SECRET"),
    callbackUrl: `${publicApiUrl}/auth/keycloak/callback` };
}
```

Use Keycloak `--import-realm` and mount the JSON read-only at `/opt/keycloak/data/import/evcp-realm.json`. Add the six configuration values to both compose API services and documented example values to `.env.example`.

- [ ] **Step 4: Run the targeted test and compose validation**

Run: `node --import tsx --test tests/unit/keycloak-realm-config.test.mjs && docker compose --env-file .env.example -f docker/docker-compose.yml config --quiet`

Expected: PASS and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/keycloak apps/platform-api/src/keycloak/config.ts .env.example docker/docker-compose.yml docker/docker-compose.release.yml tests/unit/keycloak-realm-config.test.mjs
git commit -m "feat(auth): provision Keycloak realm configuration"
```

### Task 2: OIDC authorization-code callback and Platform session issuance

**Files:**
- Create: `apps/platform-api/src/keycloak/oidc-service.ts`
- Create: `apps/platform-api/src/keycloak/routes.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `apps/platform-api/src/platform-services.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `tests/integration/keycloak-oidc-callback-contract.test.mjs`

**Interfaces:**
- Consumes `KeycloakConfig` from Task 1.
- Produces `KeycloakOidcService.start(app, returnTo)` and `complete({ code, state })`.
- Produces GET `/auth/keycloak/start` and `/auth/keycloak/callback`; callback returns a browser-safe platform-session handoff.

- [ ] **Step 1: Write the failing callback contract test**

```js
test("OIDC callback rejects a mismatched state before exchanging a code", async () => {
  const { service, fetchCalls } = createKeycloakOidcHarness();
  const { authorizationUrl } = service.start("admin", "http://localhost:4100/");
  assert.match(authorizationUrl, /code_challenge=/);
  await assert.rejects(() => service.complete({ code: "code", state: "wrong" }), /invalid_oidc_state/);
  assert.equal(fetchCalls.length, 0);
});
test("OIDC callback maps Keycloak groups and issues a platform session", async () => {
  const { service } = createKeycloakOidcHarness({ groups: ["evcp-admins"] });
  const { state } = service.start("admin", "http://localhost:4100/");
  const result = await service.complete({ code: "valid", state });
  assert.equal(result.session.claims.platformRoles[0], "admin");
  assert.match(result.session.token, /^evcp_session\./);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/integration/keycloak-oidc-callback-contract.test.mjs`

Expected: FAIL because `KeycloakOidcService` and its callback routes do not exist.

- [ ] **Step 3: Implement validated OIDC flow**

```ts
export type OidcLoginResult = { session: PlatformAuthSession; returnTo: string };
export class KeycloakOidcService {
  start(app: "admin" | "creator" | "store", returnTo: string): { state: string; authorizationUrl: string };
  complete(input: { code: string; state: string }): Promise<OidcLoginResult>;
}
```

Use `jose` `createRemoteJWKSet` and `jwtVerify` with the configured issuer and client audience. Store each random state, nonce, PKCE verifier, app and allow-listed return URL in a one-time in-memory transaction with a five-minute expiry; consume it before the code exchange. Exchange at `${issuerUrl}/protocol/openid-connect/token` with server-only client credentials. Map only the three listed groups; reject a token with no mapped role. Delegate the final platform session issuance to `PlatformAuthSsoService.issueKeycloakSession(claims)` and record `auth.keycloak_login.succeeded`. Add Nest/Express GET adapters without adding browser secrets to `PlatformApiClient`.

- [ ] **Step 4: Run callback tests and the existing session regression test**

Run: `node --import tsx --test tests/integration/keycloak-oidc-callback-contract.test.mjs tests/e2e/platform-auth-session-runtime-smoke.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/keycloak apps/platform-api/src/app-factory.ts apps/platform-api/src/platform-services.ts packages/api-client/src/index.ts tests/integration/keycloak-oidc-callback-contract.test.mjs apps/platform-api/package.json pnpm-lock.yaml
git commit -m "feat(auth): complete Keycloak OIDC login"
```

### Task 3: Server-side Keycloak user management API

**Files:**
- Create: `apps/platform-api/src/keycloak/admin-client.ts`
- Create: `apps/platform-api/src/keycloak/user-service.ts`
- Modify: `apps/platform-api/src/keycloak/routes.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `tests/integration/keycloak-user-management-contract.test.mjs`

**Interfaces:**
- Consumes `KeycloakConfig`, `PlatformUser`, and `AuditService`.
- Produces `listUsers`, `createUser`, `updateUser`, `setEnabled`, `setGroups`, and `resetPassword` under `/admin/keycloak/users`.

- [ ] **Step 1: Write failing lifecycle and authorization tests**

```js
test("admin can create, role-map, disable and reset a Keycloak user without receiving a password", async () => {
  const exec = createKeycloakAdminHarness();
  const created = await exec.asAdmin("POST", "/admin/keycloak/users", { email: "new@company.com", name: "New", role: "creator", temporaryPassword: "Temp1234!" });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data.groups, ["evcp-creators"]);
  assert.equal("temporaryPassword" in created.body.data, false);
  assert.equal((await exec.asAdmin("POST", `/admin/keycloak/users/${created.body.data.id}/disable`)).status, 200);
  assert.equal((await exec.asAdmin("POST", `/admin/keycloak/users/${created.body.data.id}/reset-password`, { temporaryPassword: "Next1234!" })).status, 200);
});
test("creator cannot call Keycloak user-management API", async () => {
  const response = await createKeycloakAdminHarness().asCreator("GET", "/admin/keycloak/users");
  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/integration/keycloak-user-management-contract.test.mjs`

Expected: FAIL because the Keycloak admin client and routes do not exist.

- [ ] **Step 3: Implement the allow-listed service**

```ts
export type KeycloakUserDto = { id: string; email: string; name: string; enabled: boolean; groups: string[]; createdAt?: string };
export class KeycloakUserService {
  list(actor: PlatformUser): Promise<KeycloakUserDto[]>;
  create(actor: PlatformUser, input: { email: string; name: string; role: PlatformRole; temporaryPassword: string }): Promise<KeycloakUserDto>;
  update(actor: PlatformUser, id: string, input: { email: string; name: string }): Promise<KeycloakUserDto>;
  setEnabled(actor: PlatformUser, id: string, enabled: boolean): Promise<KeycloakUserDto>;
  setRole(actor: PlatformUser, id: string, role: PlatformRole): Promise<KeycloakUserDto>;
  resetPassword(actor: PlatformUser, id: string, temporaryPassword: string): Promise<void>;
}
```

Get a service token using client credentials; call only `/admin/realms/{realm}/users`, user group endpoints, and reset-password endpoints. Reject roles outside `admin|creator|end_user`; replace only EVCP groups while preserving no unknown groups. Require admin before every call and audit `auth.keycloak_user.created`, `.updated`, `.enabled_changed`, `.role_changed`, and `.password_reset` with user ID and no password fields. Add GET/POST/PUT adapter support as needed rather than treating mutations as GET.

- [ ] **Step 4: Run targeted tests and typecheck**

Run: `node --import tsx --test tests/integration/keycloak-user-management-contract.test.mjs && pnpm --filter @evcp/platform-api typecheck && pnpm --filter @evcp/api-client typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/keycloak apps/platform-api/src/app-factory.ts packages/api-client/src/index.ts tests/integration/keycloak-user-management-contract.test.mjs
git commit -m "feat(admin): manage Keycloak users through Platform API"
```

### Task 4: Replace frontend simulated login and Admin user screen

**Files:**
- Create: `apps/admin-web/src/features/user-management/KeycloakUserManagement.tsx`
- Modify: `apps/admin-web/src/features/admin-console/AdminConsole.tsx`
- Modify: `apps/admin-web/src/shared/platform-client.ts`
- Modify: `apps/admin-web/src/login-screen.tsx`
- Modify: `apps/creator-web/src/app/creator-app-helpers.ts`
- Delete: `apps/creator-web/src/features/authentication/fixtures.ts`
- Modify: `apps/app-store-pwa/src/features/storefront/bootstrap.ts`
- Test: `tests/e2e/keycloak-frontend-contract.test.mjs`

**Interfaces:**
- Consumes `PlatformApiClient.startKeycloakLogin(app, returnTo)` and Keycloak user-management methods from Tasks 2–3.
- Produces one redirect login entry point per app and an Admin UI that calls only Platform API.

- [ ] **Step 1: Write a failing frontend contract test**

```js
test("browser applications start Keycloak login and do not retain simulated SSO bridges", async () => {
  for (const file of ["apps/admin-web/src/login-screen.tsx", "apps/creator-web/src/app/creator-app-helpers.ts", "apps/app-store-pwa/src/features/storefront/bootstrap.ts"]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /simulateSsoLogin|SimulatedSsoLoginInput/);
    assert.match(source, /startKeycloakLogin|window\.location\.assign/);
  }
});
test("admin user page exposes Keycloak lifecycle actions", async () => {
  const source = await readFile("apps/admin-web/src/features/user-management/KeycloakUserManagement.tsx", "utf8");
  for (const label of ["Create user", "Disable", "Enable", "Reset password", "Role"]) assert.match(source, new RegExp(label));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/e2e/keycloak-frontend-contract.test.mjs`

Expected: FAIL because the applications still invoke simulated SSO and the Keycloak management component does not exist.

- [ ] **Step 3: Implement browser-safe redirect and management UI**

```tsx
export function KeycloakUserManagement({ client }: { client: PlatformApiClient }) {
  const [users, setUsers] = useState<KeycloakUserDto[]>([]);
  // load list, submit create/edit/reset, and render status + role controls.
}
```

Use `window.location.assign(client.startKeycloakLogin("admin", window.location.href))` for login. On return, consume only the one-time platform-session handoff and immediately remove it from the URL. Replace the existing native create-user form with `KeycloakUserManagement`; do not display a reset password after submit. Replace Creator/Store bridge calls with their own redirect starts and session-handoff parsing.

- [ ] **Step 4: Run frontend contracts and builds**

Run: `node --import tsx --test tests/e2e/keycloak-frontend-contract.test.mjs && pnpm --filter @evcp/admin-web build && pnpm --filter @evcp/creator-web build && pnpm --filter @evcp/app-store-pwa build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web apps/creator-web apps/app-store-pwa tests/e2e/keycloak-frontend-contract.test.mjs
git commit -m "feat(frontend): use Keycloak login and user management"
```

### Task 5: Remove production-native auth claims and publish operational guidance

**Files:**
- Modify: `docs/operations/real-mvp-auth-session.md`
- Modify: `docs/operations/real-mvp-frontend-api-bootstrap.md`
- Modify: `docs/operations/real-mvp-install.md`
- Modify: `tests/integration/platform-auth-native-contract.test.mjs`
- Test: `tests/e2e/keycloak-production-contract.test.mjs`

**Interfaces:**
- Consumes completed OIDC and management routes from Tasks 2–4.
- Produces deployment documentation matching actual required Keycloak configuration and production auth behavior.

- [ ] **Step 1: Write the failing production-auth contract**

```js
test("production documentation and compose configuration require real Keycloak SSO", async () => {
  const docs = await Promise.all(["docs/operations/real-mvp-auth-session.md", "docs/operations/real-mvp-frontend-api-bootstrap.md", "docs/operations/real-mvp-install.md"].map((file) => readFile(file, "utf8")));
  for (const source of docs) assert.doesNotMatch(source, /Replace simulated SSO login|not the final Keycloak\/OIDC browser callback/);
  assert.match(docs.join("\n"), /Authorization Code.*PKCE/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/e2e/keycloak-production-contract.test.mjs`

Expected: FAIL because the operation documentation still describes simulated SSO.

- [ ] **Step 3: Align docs and remove obsolete production-native behavior**

Document environment variables, realm import, callback URLs, first-admin bootstrap and troubleshooting for Keycloak readiness. Convert native-auth tests to assert that production configuration rejects `/auth/login`, `/auth/change-password`, mock headers and `/admin/auth/simulate-login`, while retaining isolated test-only harness coverage only if explicitly enabled.

- [ ] **Step 4: Run complete verification**

Run: `pnpm check:ci`

Expected: PASS with no architecture, type, lint, build, unit, integration, or E2E failures.

- [ ] **Step 5: Commit**

```bash
git add docs/operations tests/integration/platform-auth-native-contract.test.mjs tests/e2e/keycloak-production-contract.test.mjs
git commit -m "docs(auth): document production Keycloak SSO"
```
