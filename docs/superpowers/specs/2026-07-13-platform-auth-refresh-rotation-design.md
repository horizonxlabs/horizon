# Platform Auth refresh-token rotation design

## Goal

Make Platform Auth authoritative in PostgreSQL so Admin, Creator, and App Store retain a
secure login contract across API restarts. Keycloak remains the identity provider; the Platform
API alone issues and refreshes Platform access tokens.

## Scope

- Replace the process-local issued-session map with PostgreSQL-backed session state.
- Issue a signed Platform access token valid for 15 minutes and an opaque refresh token valid for
  7 days after a successful Keycloak or native login.
- Rotate the refresh token on every refresh, detect reuse, and revoke the full session family on
  reuse.
- Support single-session revocation and revoke-all-for-user operations for admins/operators.
- Keep Keycloak authorization-code tokens and client secrets server-side.

This does not add Keycloak refresh-token pass-through, a persistent OIDC transaction store, or
remember-me longer than the 7-day refresh lifetime.

## Data model

`PlatformAuthSession` becomes one row per browser/device session and owns these fields in addition
to its existing user, provider, claims, issued and expiry data:

- `sessionFamilyId`: stable random ID for the original login and all rotations.
- `accessTokenId`: random JWT identifier (`jti`) for the currently issued access token.
- `refreshTokenHash`: SHA-256 hash of the current opaque refresh token; plaintext is never stored.
- `refreshExpiresAt`, `lastUsedAt`, `revokedAt`, `revokeReason`, and `replacedBySessionId`.

Rows are indexed by `id`, `sessionFamilyId`, `userId + refreshExpiresAt`, and `refreshTokenHash`.
The hash is unique. A rotation atomically marks the current row replaced and creates its successor
in the same family. This preserves an audit trail without retaining a usable previous token.

## Token and API contract

The signed access token has `typ=evcp.platform.session`, `sid`, `jti`, `sub`, `email`, `iat`, and
`exp`. Authentication validates the HMAC, expiry, then loads `sid` from PostgreSQL and rejects a
missing, revoked, replaced, expired, or user-mismatched session. This deliberately adds a DB lookup
so revocation is immediate across API processes.

Login/callback responses and browser session storage carry:

```json
{ "token": "access-token", "expiresAt": "ISO-8601", "refreshToken": "opaque-token", "refreshExpiresAt": "ISO-8601" }
```

`POST /auth/refresh` accepts only the opaque refresh token and returns a newly rotated token pair.
`POST /auth/logout` revokes the authenticated session. Admin/operator endpoints can revoke a
specific session or every active session for a user. Access-token expiry triggers exactly one
refresh attempt in the API client; a failed refresh clears browser state and sends the user to the
surface-specific Keycloak login flow.

## Rotation and abuse handling

Refresh handling is transactional:

1. Hash the presented token and lock/look up its row.
2. Reject expired or revoked rows.
3. If the row was already replaced, revoke every active row in its `sessionFamilyId`, emit a
   security audit event, and return unauthorized.
4. Otherwise revoke/replace the presented row, create a successor with new random IDs/token hash,
   and return the new pair.

Logout and expiry never reveal which condition failed. Audit events contain session/family IDs and
actor IDs, never access or refresh token material.

## UI and UX

Each surface uses the shared session client. It refreshes silently before a protected request when
the access token is within a short skew window. A failed refresh presents a concise “Session ended;
sign in again” state instead of demo data or a fake success. Session-management UI belongs in Admin:
active device/session rows, expiry, last used time, revoke action, and revoke-all action with a
confirmation state.

## Validation

- Unit tests cover signing, persistence lookup, expiry, logout/revocation, rotation, and reuse.
- PostgreSQL integration tests prove a valid session survives API recreation, a revoked access
  token is rejected immediately, and concurrent refresh attempts cannot both succeed.
- Browser E2E covers Keycloak login, silent refresh, logout, expired/revoked state, and the Store
  login path.
- Logs and API responses are scanned to ensure neither token type is exposed beyond the intended
  browser response or persisted plaintext.
