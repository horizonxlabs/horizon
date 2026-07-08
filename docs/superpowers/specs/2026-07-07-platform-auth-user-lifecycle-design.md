# Platform User Lifecycle + Native Authentication — Design

**Status:** Approved (2026-07-07)
**Author:** brainstorming session
**Scope owner:** platform-api + admin-web + creator-web

## Goal

Let an IT admin create Creator users in the platform, and let those Creators log in
with their own real credentials (not the mock `simulate-login` bridge) to use the
existing vibe-coding workspace. This is the first slice of real authentication for the
pilot.

## Non-Goals (explicit, deferred to separate specs)

- Generated-app end-user auth SDK (apps that Creators build authenticating THEIR users).
- Vibe-loop chat/workspace Postgres persistence.
- Keycloak / OIDC end-to-end browser login (the model keeps room for it, but this slice
  is native email+password only).
- Password reset via email, MFA, account lockout / rate-limiting (documented follow-ups).
- Self-service signup — users are created by IT only.

## Context (verified this session)

- `EVCP_CORE_PERSISTENCE=prisma`; Postgres-backed `PlatformUser`, `PlatformRole`,
  `PlatformGroup`, `PlatformUserRole`, `ProjectMember`, `App`, `AppMember`, `AppRole`.
- `PlatformUser` today has **no credential fields** — `id, email (unique), name, status`
  plus relations. It was modeled as a projection of an external IdP identity.
- `PlatformAuthSession` exists and is what `simulate-login` issues (token, 1h expiry).
  The whole app already authorizes off that session (`evcp_session` localStorage token).
- No admin "create user" endpoint exists yet; admin-web has no user-management page.

## Decisions (locked during brainstorming)

1. **Mechanism:** native email + password (self-contained, no Keycloak dependency).
2. **Initial credential:** IT sets a temporary password at creation; the user is flagged
   `mustChangePassword` and must set a new password on first login. No email/SMTP needed.
3. **Session:** reuse the existing `PlatformAuthSession` + `evcp_session` token exactly —
   real login issues the same session type `simulate-login` does, so nothing downstream
   changes.
4. **Roles:** IT assigns a platform role at creation (default `creator`); the existing
   role model is reused, no new role concept.

---

## Architecture

Three layers, each independently testable:

```
admin-web (Users page)         creator-web (Login + Change-password)
        │  POST /admin/users            │  POST /auth/login
        │                               │  POST /auth/change-password
        ▼                               ▼
              platform-api HTTP routes
        │                               │
        ▼                               ▼
   PlatformCredentialService  ──────────┘        (new, isolated)
        │  hash / verify (bcryptjs)
        ▼
   CorePersistence (Prisma)  ← PlatformUser gains passwordHash + flags
```

### Component 1 — Data model (Prisma)

Add three **nullable** columns to `PlatformUser` (nullable so existing/IdP-mapped users
are unaffected and no backfill is required):

- `passwordHash String?`
- `mustChangePassword Boolean @default(false)`
- `passwordUpdatedAt DateTime?`

A Prisma migration adds these columns. Users with `passwordHash == null` cannot log in
via native auth (they are IdP-only / not yet provisioned) — native login rejects them.

### Component 2 — PlatformCredentialService (new)

A single-purpose service, no HTTP or Prisma-model knowledge leaking into callers.
Location: `apps/platform-api/src/auth/platform-credential-service.ts`.

Dependencies: a `bcryptjs` hasher (pure JS, no native build — matters for the alpine
container) and a small persistence port for reading/writing the three new fields.

Interface:

```ts
export interface PlatformCredentialService {
  // Hash + store a password; used by create-user (mustChange=true) and change-password (false).
  setPassword(userId: string, plaintext: string, opts: { mustChange: boolean }): Promise<void>;
  // Returns the user id on success, or null on unknown email / no passwordHash / mismatch.
  // Callers MUST NOT distinguish the null reasons to the client (generic "invalid credentials").
  verifyLogin(email: string, plaintext: string): Promise<{ userId: string; mustChangePassword: boolean } | null>;
  // Verifies current password then sets the new one and clears mustChangePassword.
  changePassword(userId: string, currentPlaintext: string, newPlaintext: string): Promise<
    { ok: true } | { ok: false; reason: "wrong_current" | "weak_password" }
  >;
}
```

Password policy (enforced in the service): minimum 8 characters; non-empty. bcryptjs
cost factor 10. The plaintext is never logged; the hash is never returned by any method
or route.

### Component 3 — HTTP routes (platform-api)

Follow the existing route-handler style in `app-factory.ts` / `platform-services.ts`.

- **`POST /admin/users`** — admin-authenticated (an existing admin/session guard; caller
  must hold an admin platform role). Body `{ email, name, role?, tempPassword }`
  (`role` defaults to `"creator"`). Effect: create `PlatformUser` (active) if the email
  is free, assign the role via `PlatformUserRole`, call
  `setPassword(user.id, tempPassword, { mustChange: true })`. Response: the created user
  summary `{ id, email, name, role, status, mustChangePassword: true }` — **never** the
  hash or the plaintext. Errors: `409` email exists, `400` invalid email / weak
  tempPassword, `403` caller not admin.
- **`POST /auth/login`** — unauthenticated. Body `{ email, password }`. Calls
  `verifyLogin`; on success issues a `PlatformAuthSession` (the same path
  `simulate-login` uses) and returns `{ token, expiresAt, mustChangePassword }`. On
  failure returns `401 { error: "invalid_credentials" }` — identical response for
  unknown-email, no-hash, and wrong-password (no user enumeration).
- **`POST /auth/change-password`** — session-authenticated. Body
  `{ currentPassword, newPassword }`. Resolves the user from the session, calls
  `changePassword`. Success `200 { ok: true }`; `400` on `wrong_current` (as
  `invalid_credentials`) or `weak_password`.

`simulate-login` stays, but gated behind a dev flag (e.g. `EVCP_ALLOW_SIMULATE_LOGIN`,
default on in dev/test, off in the pilot compose env) so existing tests keep working
while production no longer exposes the mock bridge.

### Component 4 — Admin UI (admin-web)

A "Users" page: a list of platform users (email, name, role, status) and a "Create user"
form (email, name, role select defaulting to Creator, temp password field with a
"generate" helper). On submit → `POST /admin/users`; on success show the temp password
**once** in a copyable confirmation ("hand this to the Creator; they'll change it on
first login"). Uses the existing api-client + session.

### Component 5 — Creator login UI (creator-web)

A login screen (email + password) shown when there is no valid session, replacing the
automatic `simulate-login` bridge. On success store `{ token, expiresAt }` in the
existing `evcp_session` store and enter the workspace. If the login response has
`mustChangePassword: true`, show a "set a new password" screen (new + confirm) that calls
`/auth/change-password` before proceeding. A logout control clears the session.

---

## Data Flow

**Create:** IT (admin session) → admin-web form → `POST /admin/users` → create user +
role + hashed temp password (`mustChange=true`) → temp password shown once to IT.

**First login:** Creator → creator-web login → `POST /auth/login` → session issued,
`mustChangePassword=true` → forced change screen → `POST /auth/change-password` →
`mustChange=false` → workspace.

**Subsequent login:** Creator → login → session issued, `mustChangePassword=false` →
workspace directly.

## Error Handling

- Login failures are uniform `401 invalid_credentials` (no enumeration of which factor
  failed).
- Weak password (< 8 chars) → `400` at create and change time, surfaced inline in the UI.
- Duplicate email at create → `409`, surfaced inline.
- Non-admin calling `/admin/users` → `403`.
- Plaintext and hashes never appear in logs, audit metadata, or responses.

## Security (pilot-appropriate)

- bcryptjs cost 10; hashes only in `passwordHash`.
- Sessions unchanged (1h expiry, existing token).
- Audit events: `platform.user.created`, `platform.auth.login`,
  `platform.auth.password_changed` (metadata: userId/email/actor — never secrets).
- Documented follow-ups (not in this slice): rate-limiting / lockout, password reset,
  MFA, Keycloak/OIDC, secret-strength config.

## Testing (TDD, `.mjs` via `node --import tsx --test`)

- **Unit — credential service:** hash≠plaintext; verify success/failure; verifyLogin
  null on unknown email and on null hash; changePassword wrong-current rejected;
  weak-password rejected; mustChange cleared on change. Uses an in-memory fake of the
  persistence port.
- **Unit — routes:** create-user assigns role + sets mustChange and never returns the
  hash; login maps verify→session and returns uniform 401 on failure; change-password
  authorizes off the session.
- **Integration (Prisma/Postgres, guarded like existing live tests):** create user →
  login → change-password round-trip against a real DB; confirm the three columns
  populate and `mustChangePassword` flips.
- Existing 346+ tests must stay green; `simulate-login` remains available under the dev
  flag so they don't regress.

## File Structure

- `apps/platform-api/prisma/schema.prisma` — add 3 fields to `PlatformUser` (+ migration).
- `apps/platform-api/src/auth/platform-credential-service.ts` — new service.
- `apps/platform-api/src/auth/` route handlers wired into `app-factory.ts` — the 3 routes.
- `apps/admin-web/src/main.tsx` — Users page + create form.
- `apps/creator-web/src/main.tsx` — login + change-password screens (replaces auto-bridge).
- `packages/types/src/index.ts` — request/response DTOs for the 3 routes.
- Tests alongside existing `tests/unit` + `tests/integration`.

## Open Risks

- `creator-web/src/main.tsx` is the user's actively-edited working file; login wiring
  there must be coordinated (do not clobber uncommitted vibe-UI work).
- `bcryptjs` (pure JS) chosen over `bcrypt` (native) to avoid alpine build issues in the
  container.
