# Production Keycloak Authentication

## Production contract

EVCP uses Keycloak as the authoritative identity, credential and group store.
Browser sign-in is a server-brokered OpenID Connect **Authorization Code with PKCE**
flow. The browser never receives a Keycloak client secret, administrative token, or
refresh token.

1. An Admin, Creator, or Store shell sends the browser to
   `GET /api/auth/keycloak/start?app=<admin|creator|store>&returnTo=<approved URL>`.
2. Platform API creates a one-time, five-minute transaction with state, nonce, and
   PKCE verifier, then redirects to Keycloak.
3. Keycloak redirects only to
   `${EVCP_PUBLIC_API_URL}/auth/keycloak/callback`.
4. Platform API validates state, PKCE, nonce, issuer, audience, signature, expiry,
   and group claims; it creates or updates its local user projection and returns an
   `evcp_session` handoff in the approved frontend URL fragment.
5. The shell stores the short-lived Platform session and uses it as
   `Authorization: Bearer <evcp_session>` for Platform API calls.

The realm groups map exactly to platform roles:

| Keycloak group | Platform role |
| --- | --- |
| `evcp-admins` | `admin` |
| `evcp-creators` | `creator` |
| `evcp-users` | `end_user` |

## Required configuration

Set these values in the private-server `.env`; replace all example values before
deployment.

| Variable | Purpose |
| --- | --- |
| `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` | Bootstrap administrator for the Keycloak master realm. |
| `KEYCLOAK_REALM` | Imported EVCP realm; normally `evcp`. |
| `KEYCLOAK_ISSUER_URL` | Platform API's issuer URL, such as `http://keycloak:8080/realms/evcp` inside Compose. |
| `KEYCLOAK_PLATFORM_CLIENT_ID`, `KEYCLOAK_PLATFORM_CLIENT_SECRET` | Confidential authorization-code client used only by Platform API. |
| `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET` | Confidential service-account client used for Keycloak user management. |
| `EVCP_PUBLIC_API_URL` | Public Platform API origin; defines the callback URL. |
| `EVCP_ADMIN_WEB_URL`, `EVCP_CREATOR_WEB_URL`, `EVCP_STORE_WEB_URL` | Allowed browser return origins for Admin, Creator, and Store. |

`keycloak` imports `apps/platform-api/keycloak/evcp-realm.json`, and the
`keycloak-bootstrap` service writes the two confidential client secrets after the
realm is healthy. Do not add client secrets to the realm JSON or browser bundles.

The Platform API callback URL and Keycloak platform client redirect URI must match
exactly. For a public API URL of `https://platform.example.com/api`, configure:

```text
EVCP_PUBLIC_API_URL=https://platform.example.com/api
Keycloak redirect URI=https://platform.example.com/api/auth/keycloak/callback
```

## First administrator bootstrap

`KEYCLOAK_ADMIN` controls Keycloak itself; it is not an EVCP application user.
After the stack is healthy, sign in to the Keycloak Admin Console with that bootstrap
account, select the `evcp` realm, and create the person named by
`FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_NAME`. Assign that user to `evcp-admins` and set
a temporary password with **Update Password** required. That person then signs in
through the Admin Web and becomes the first Platform Admin.

Use the Admin Web Keycloak user-management surface for later user creation, role
changes, disable/enable actions, and password resets. Its server-side service account
has only `query-users`, `view-users`, and `manage-users`; browsers must not call the
Keycloak Admin API directly.

## Production restrictions and troubleshooting

`EVCP_ALLOW_SIMULATE_LOGIN` is `0` in both Compose deployments. Production browser
authentication is Keycloak-only: mock identity headers and
`POST /admin/auth/simulate-login` are disabled, and legacy native credential calls
are rejected instead of establishing a production user journey. The isolated native
credential harness explicitly sets `EVCP_ALLOW_SIMULATE_LOGIN=1`.

If login fails:

- Confirm `keycloak` is healthy and `keycloak-bootstrap` completed successfully:
  `docker compose --env-file .env -f docker/docker-compose.yml ps`.
- Verify `KEYCLOAK_ISSUER_URL` is reachable from `platform-api` and points to the
  imported realm, not the master realm.
- Verify the confidential client IDs/secrets agree with `.env`, and the platform
  client retains Authorization Code flow while direct grants remain disabled.
- Check that `EVCP_PUBLIC_API_URL` and each allowed frontend origin use the exact
  scheme, host, and port seen by the browser. A callback mismatch or unapproved
  `returnTo` is rejected.
- Ensure the user is enabled and belongs to one of the three EVCP groups. An
  identity without a mapped group is rejected rather than receiving a default role.

Sessions previously issued by Platform API remain valid only until their expiry;
new login and all Keycloak user mutations fail closed when Keycloak, discovery,
JWKS, or token exchange is unavailable.
