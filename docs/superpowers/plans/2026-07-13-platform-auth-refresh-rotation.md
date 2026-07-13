# Platform Auth Refresh Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and rotate Platform Auth sessions so Keycloak-authenticated browsers remain secure across Platform API restarts.

**Architecture:** PostgreSQL owns every platform-session record and refresh-token hash. The API signs 15-minute access tokens but verifies their session row on every protected request; an opaque 7-day refresh token rotates in one database transaction. Shared API-client storage and retry behavior provide the same contract to Admin, Creator, and Store.

**Tech Stack:** TypeScript, Platform API, Prisma/PostgreSQL, Node crypto, existing API client, Node integration tests.

## Global Constraints

- Access tokens expire after 15 minutes; refresh tokens expire after 7 days.
- Never persist or log plaintext access or refresh tokens.
- Refresh-token reuse revokes every active session in its family.
- Keycloak tokens remain server-side; browser receives only Platform tokens.
- Pilot configuration fails closed and may not render demo data after auth failure.

---

### Task 1: Persisted session schema and repository

**Files:**
- Modify: `apps/platform-api/prisma/schema.prisma`
- Create: `apps/platform-api/prisma/migrations/20260713000000_platform_auth_refresh_rotation/migration.sql`
- Modify: `apps/platform-api/src/persistence/core-repositories.ts`
- Test: `tests/integration/platform-auth-session-persistence.test.mjs`

- [ ] **Step 1: Write the failing persistence test**

```js
test("stores only a refresh-token hash and finds an active session", async () => {
  const created = await repository.createPlatformAuthSession(fixture);
  assert.equal(created.refreshTokenHash, sha256("refresh-secret"));
  assert.equal(await repository.findActivePlatformAuthSession(created.id), created);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `node --test tests/integration/platform-auth-session-persistence.test.mjs`
Expected: FAIL because the repository methods do not exist.

- [ ] **Step 3: Implement schema and repository contract**

```ts
createPlatformAuthSession(input: PersistedPlatformAuthSessionInput): Promise<PersistedPlatformAuthSession>;
findActivePlatformAuthSession(id: string, now?: Date): Promise<PersistedPlatformAuthSession | undefined>;
rotatePlatformAuthSession(input: RotatePlatformAuthSessionInput): Promise<PersistedPlatformAuthSession>;
revokePlatformAuthSession(id: string, reason: string, now?: Date): Promise<void>;
revokePlatformAuthSessionFamily(familyId: string, reason: string, now?: Date): Promise<void>;
```

- [ ] **Step 4: Run the persistence test**

Run: `node --test tests/integration/platform-auth-session-persistence.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/prisma apps/platform-api/src/persistence/core-repositories.ts tests/integration/platform-auth-session-persistence.test.mjs
git commit -m "feat: persist platform auth sessions"
```

### Task 2: Session issuer, verifier, and rotation service

**Files:**
- Create: `apps/platform-api/src/auth/platform-session-service.ts`
- Modify: `apps/platform-api/src/platform-services.ts`
- Modify: `apps/platform-api/src/keycloak/platform-session-issuer.ts`
- Test: `tests/unit/platform-session-service.test.mjs`

- [ ] **Step 1: Write the failing rotation test**

```js
test("rotates once and revokes a family when the previous token is reused", async () => {
  const first = await service.issue(user, claims);
  const second = await service.refresh(first.refreshToken);
  await assert.rejects(() => service.refresh(first.refreshToken), /refresh_token_reused/);
  await assert.rejects(() => service.verify(second.token), /revoked/);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `node --test tests/unit/platform-session-service.test.mjs`
Expected: FAIL because `PlatformSessionService` does not exist.

- [ ] **Step 3: Implement the service contract**

```ts
issue(input: IssuePlatformSessionInput): Promise<PlatformTokenPair>;
verify(accessToken: string): Promise<VerifiedPlatformSession>;
refresh(refreshToken: string): Promise<PlatformTokenPair>;
logout(sessionId: string): Promise<void>;
revokeUserSessions(userId: string, reason: string): Promise<void>;
```

- [ ] **Step 4: Run unit tests**

Run: `node --test tests/unit/platform-session-service.test.mjs`
Expected: PASS for expiry, signature failure, single revoke, and reuse-family revoke.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/auth apps/platform-api/src/platform-services.ts apps/platform-api/src/keycloak/platform-session-issuer.ts tests/unit/platform-session-service.test.mjs
git commit -m "feat: rotate platform auth sessions"
```

### Task 3: API routes and callback contract

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `apps/platform-api/src/main.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `tests/integration/platform-auth-refresh-api.test.mjs`

- [ ] **Step 1: Write failing API tests**

```js
test("refresh rotates a pair and logout rejects the access token", async () => {
  const refreshed = await request("POST", "/auth/refresh", { refreshToken: login.refreshToken });
  assert.equal(refreshed.status, 200);
  assert.equal((await request("POST", "/auth/logout", {}, refreshed.token)).status, 204);
  assert.equal((await request("GET", "/auth/me", undefined, refreshed.token)).status, 401);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `node --test tests/integration/platform-auth-refresh-api.test.mjs`
Expected: FAIL because the routes are absent.

- [ ] **Step 3: Add routes and token-pair response types**

```text
POST /auth/refresh { refreshToken } -> { token, expiresAt, refreshToken, refreshExpiresAt }
POST /auth/logout -> 204
POST /admin/users/:userId/sessions/revoke -> 204
POST /admin/users/:userId/sessions/revoke-all -> 204
```

- [ ] **Step 4: Run API tests**

Run: `node --test tests/integration/platform-auth-refresh-api.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/app-factory.ts apps/platform-api/src/main.ts packages/api-client/src/index.ts tests/integration/platform-auth-refresh-api.test.mjs
git commit -m "feat: expose platform session refresh APIs"
```

### Task 4: Shared browser session lifecycle

**Files:**
- Modify: `packages/api-client/src/index.ts`
- Modify: `apps/admin-web/src/shared/platform-client.ts`
- Modify: `apps/creator-web/src/shared/platform-client.ts`
- Modify: `apps/app-store-pwa/src/shared/platform-client.ts`
- Test: `tests/unit/api-client-runtime.test.mjs`

- [ ] **Step 1: Write failing session-store and retry test**

```js
test("refreshes an expiring session once and clears storage after failure", async () => {
  await client.getCurrentUser();
  assert.equal(fetchCalls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
  assert.equal(storage.getItem("evcp_refresh_token"), null);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `node --test tests/unit/api-client-runtime.test.mjs`
Expected: FAIL because the session store lacks refresh-token fields.

- [ ] **Step 3: Implement shared storage and one-retry policy**

```ts
saveSession(session: PlatformTokenPair): void;
getRefreshToken(): string | undefined;
clearSession(): void;
refreshSession(): Promise<PlatformTokenPair>;
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/api-client-runtime.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/index.ts apps/admin-web/src/shared apps/creator-web/src/shared apps/app-store-pwa/src/shared tests/unit/api-client-runtime.test.mjs
git commit -m "feat: refresh browser platform sessions"
```

### Task 5: Fail-closed Store and Admin session UI

**Files:**
- Modify: `apps/app-store-pwa/src/features/storefront/bootstrap.ts`
- Modify: `apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx`
- Create: `apps/admin-web/src/features/users/SessionManagementPanel.tsx`
- Modify: `apps/admin-web/src/features/users/UserManagementPage.tsx`
- Test: `tests/unit/app-store-pwa-render-smoke.test.mjs`
- Test: `tests/unit/admin-user-management-render.test.mjs`

- [ ] **Step 1: Write failing UI tests**

```js
assert.doesNotMatch(storefrontSource, /catch \{\s*setBootstrap\(initialStoreBootstrap\)/);
assert.match(adminUserPage, /SessionManagementPanel/);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/unit/app-store-pwa-render-smoke.test.mjs tests/unit/admin-user-management-render.test.mjs`
Expected: FAIL because Store silently renders fallback data and Admin has no session controls.

- [ ] **Step 3: Render an explicit session-ended state and revocation controls**

```tsx
<SessionEndedState onSignIn={() => signInStoreSessionBridge()} />
<SessionManagementPanel userId={user.id} onRevoke={revokeSession} onRevokeAll={revokeAllSessions} />
```

- [ ] **Step 4: Run UI tests**

Run: `node --test tests/unit/app-store-pwa-render-smoke.test.mjs tests/unit/admin-user-management-render.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app-store-pwa/src/features/storefront apps/admin-web/src/features/users tests/unit/app-store-pwa-render-smoke.test.mjs tests/unit/admin-user-management-render.test.mjs
git commit -m "feat: manage and recover platform sessions"
```

### Task 6: Operations evidence and verification

**Files:**
- Modify: `docs/operations/real-mvp-auth-session.md`
- Modify: `docs/MVP_PENDING_TASKS.md`
- Test: `tests/integration/platform-auth-session-runtime-contract.test.mjs`

- [ ] **Step 1: Write failing operating-contract assertions**

```js
assert.match(authOperationsDoc, /15 minutes/);
assert.match(authOperationsDoc, /7 days/);
assert.match(authOperationsDoc, /reuse.*revoke/i);
```

- [ ] **Step 2: Run it and verify failure**

Run: `node --test tests/integration/platform-auth-session-runtime-contract.test.mjs`
Expected: FAIL until the operating contract describes rotation.

- [ ] **Step 3: Document clean-install, restart, and browser verification commands**

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
pnpm check:ci
```

- [ ] **Step 4: Run focused suite and quality checks**

Run: `node --test tests/unit/platform-session-service.test.mjs tests/integration/platform-auth-session-persistence.test.mjs tests/integration/platform-auth-refresh-api.test.mjs && pnpm check:changed --base origin/main`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/real-mvp-auth-session.md docs/MVP_PENDING_TASKS.md tests/integration/platform-auth-session-runtime-contract.test.mjs
git commit -m "docs: record persistent platform auth evidence"
```

