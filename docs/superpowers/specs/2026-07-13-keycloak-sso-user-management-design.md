# Keycloak SSO and User Management Design

## Goal

Make Keycloak the sole source of user identities, credentials, account state, and
role-group membership for EVCP. Replace simulated SSO and native credential login
with a production OIDC Authorization Code with PKCE flow. Give Platform Admins a
safe user-management surface mediated by Platform API.

## Scope

- Provision the `evcp` realm, a Platform API confidential OIDC client,
  service-account permissions, and the three EVCP role groups in Docker.
- Redirect Admin, Creator, and Store users to Keycloak for login.
- Have Platform API complete the OIDC callback, validate tokens and claims, then
  issue the existing short-lived `platform_session` for product API calls.
- Replace the Admin user page with Keycloak-backed list, create, edit, group-role,
  enable/disable, and reset-password actions.
- Record all user-management actions in the existing audit service.

## Authentication Design

Each frontend starts login through a Platform API authorization endpoint. The API
creates a short-lived, one-time transaction containing `state`, a nonce, the
requesting application and the PKCE verifier. It redirects the browser to the
appropriate Keycloak client authorization endpoint.

Keycloak redirects to the API callback. The API verifies the transaction and
exchanges the authorization code server-side. It validates issuer, audience,
expiry, nonce and signature using realm metadata/JWKS. Groups map exactly as:

| Keycloak group | Platform role |
| --- | --- |
| `evcp-admins` | `admin` |
| `evcp-creators` | `creator` |
| `evcp-users` | `end_user` |

The API provisions or updates its local user projection only as required by
existing domain records, then issues `platform_session`. Browsers never receive a
Keycloak administrative credential or refresh token. A successful callback returns
to the validated application URL with the platform-session handoff.

Native password login, password-change endpoints, and simulated SSO are disabled
outside explicitly enabled test mode. This is a breaking runtime change by design:
all real identities authenticate with Keycloak.

## Administrative User Management

Platform API is the only browser-facing interface for Keycloak user management.
Its Keycloak Admin client authenticates with a narrowly-scoped service account;
the browser does not call the Keycloak Admin REST API directly.

The `/users` page supports:

- paginated user list with name, email, enabled state, groups and creation time;
- user creation with a generated temporary password and required update on first
  login;
- name and email updates;
- group assignment constrained to the three EVCP groups;
- enable/disable account actions; and
- password reset to a new temporary password.

All mutations require the Platform `admin` role, validate inputs, do not expose
password hashes or prior passwords, and create audit events. Keycloak remains the
authoritative store; Platform API does not create native credential records.

## Configuration and Provisioning

Production configuration uses environment variables for the public issuer URL,
realm, Platform API client ID and secret, callback URLs, and the Keycloak admin
service-account credentials. Browser applications are not Keycloak clients: Docker
imports a versioned realm definition, then a server-only bootstrap assigns the
runtime secrets to its confidential clients so a new installation has the required
clients, groups and service-account permissions without exposing refresh tokens to
browsers or requiring manual console work.

## Failure Handling

Authentication and user mutations fail closed when Keycloak, discovery, JWKS or
the token exchange is unavailable. Sessions already validated by Platform API
remain usable only until their existing expiry. Callback validation rejects missing
or mismatched state, PKCE verifier, nonce, redirect URI, issuer, audience and
token lifetime.

## Verification

Automated coverage will verify callback transaction validation, token and group
mapping, authorization boundaries, disabled simulated/native flows, every user
lifecycle operation, Admin UI API contracts, realm-import configuration, and
failure-closed errors. Operations documentation will specify deployment variables
and remove claims that SSO is simulated.
