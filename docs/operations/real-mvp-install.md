# Real MVP Private-Server Install Foundation

Status: Phase 2 implementation started  
Issue: #26

## Purpose

The Sprint 0-14 stack is an integrated mock-first MVP prototype. This document defines the first concrete step toward a real usable MVP: a reproducible private-server install foundation.

This install contract deploys server-owned Keycloak authentication alongside the
Platform API. Browser sign-in uses OpenID Connect **Authorization Code with PKCE**;
Keycloak owns credentials and EVCP receives only the validated, short-lived Platform
session. AI generation, generated-app runtime, and some frontend data flows remain
separate operational concerns.

## Install Steps

1. Copy the environment template.

```bash
cp .env.example .env
```

2. Replace every example secret in `.env`.

Required secrets include:

- `POSTGRES_PASSWORD`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `KEYCLOAK_ADMIN_PASSWORD`
- `KEYCLOAK_PLATFORM_CLIENT_SECRET`
- `KEYCLOAK_ADMIN_CLIENT_SECRET`
- `MINIO_ROOT_PASSWORD`
- `STORAGE_SECRET_KEY`
- `AI_API_KEY`

Required runtime mode:

- `EVCP_CORE_PERSISTENCE=prisma` for private-server core API persistence
- `KEYCLOAK_REALM=evcp` unless deploying an intentionally different imported realm
- `KEYCLOAK_ISSUER_URL` reachable by `platform-api`, for example
  `http://keycloak:8080/realms/evcp` in the bundled network
- `EVCP_PUBLIC_API_URL` set to the externally reachable Platform API origin; its
  `/auth/keycloak/callback` URL must match the Keycloak client redirect URI exactly
- `EVCP_ADMIN_WEB_URL`, `EVCP_CREATOR_WEB_URL`, and `EVCP_STORE_WEB_URL` set to the
  exact browser origins allowed to receive the post-login handoff

3. Run preflight.

```bash
pnpm install:preflight
```

For contract verification against the checked-in template:

```bash
pnpm install:preflight:example
```

4. Plan the full install flow.

```bash
pnpm install:plan
```

The planner runs the ordered install stages in dry-run mode and writes a redacted JSON report under `.evcp/install-reports/`:

```mermaid
flowchart LR
  A["preflight"] --> B["configure"]
  B --> C["write_config_evidence"]
  C --> D["deploy_compose"]
  D --> E["migrate_seed"]
  E --> F["verify_health"]
```

5. Execute the install flow on a prepared private server.

```bash
pnpm install:real
```

`install:real` runs the same stages in execute mode. It blocks if preflight fails, if example secrets are still present, or if required Compose services are missing.

6. Start the private-server stack manually if you are not using `install:real`.

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

7. Confirm Keycloak is ready and its confidential clients were bootstrapped.

```bash
docker compose --env-file .env -f docker/docker-compose.yml ps
```

`keycloak` must be healthy and `keycloak-bootstrap` must have completed
successfully before `platform-api` starts. Compose imports the versioned
`apps/platform-api/keycloak/evcp-realm.json`; `keycloak-bootstrap` then applies the
server-only Platform API and admin-service client secrets. Do not put either secret
in the realm JSON, frontend configuration, or a browser redirect URL.

8. Create the first EVCP administrator in Keycloak. Sign in to the Keycloak Admin
Console with `KEYCLOAK_ADMIN`, select the `evcp` realm, create the user named by
`FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_NAME`, assign `evcp-admins`, and require a
password update. The Keycloak master administrator is not itself an EVCP user.

9. Verify the stack and installer contract.

```bash
pnpm verify:installer
pnpm verify:install
pnpm verify:sprint14
```

## Admin First-Run Install Wizard

The Admin Console operations surface includes a first-run install wizard for IT/System Admin review. It is designed to sit on top of the installer API and the private-server Caddy route:

- `Run Preflight` uses the shared `@evcp/api-client` to post the supported server profile to `/api/admin/installer/preflight` by default.
- `Save Setup` posts editable domain, database, storage, auth, external AI provider, guardrail, backup and first-admin values to `/api/admin/installer/setup`.
- The wizard retrieves `/api/admin/installer/reports` so the UI can show the latest install report status after preflight.
- `VITE_PLATFORM_API_BASE_URL` can point the Admin Web bundle at a direct Platform API URL for local integration testing.
- The wizard displays the ordered install contract: preflight, setup config, compose readiness, migrate/seed and verify health, with Back/Next controls and per-step status badges.
- Failed preflight checks mark install as blocked and show actionable remediation.
- Setup evidence shows domain, masked database URL, storage, auth, external AI provider, backup and first admin without rendering plaintext secrets after save.

The wizard keeps deterministic fallback evidence for local UI development when the API is not running, but the private-server compose path is API-ready through Caddy's `/api/*` route.

## First-Run Installation Journey

The Admin Console now presents the install as an explicit operations journey rather than a hidden CLI-only path. Each card has an owner, evidence and next action so IT/System Admin can see whether the platform is still being prepared, already configured, blocked by preflight, ready for deployment, or ready for first login.

| Step | Owner | Evidence | Next Action |
| --- | --- | --- | --- |
| Prepare Server | System Admin | Docker host CPU/RAM/disk/ports/DNS/TLS profile | Prepare private server capacity and replace example secrets |
| Configure Environment | IT Admin | `.env`, `docker/docker-compose.yml`, `VITE_PLATFORM_API_BASE_URL` | Review environment, domain, ports and external AI values |
| Run Preflight | IT Admin | `POST /api/admin/installer/preflight` and installer report path | Run Preflight |
| Save Setup | Platform Admin | `POST /api/admin/installer/setup` and masked setup evidence | Save Setup |
| Deploy Stack | System Admin | `docker compose --env-file .env -f docker/docker-compose.yml up -d` | Deploy Stack |
| Migrate + Seed | Platform API | `pnpm --filter @evcp/platform-api exec prisma migrate deploy` plus seed | Run Prisma migrate deploy and seed |
| Verify Health | IT Admin | health endpoints, Caddy `/api/*` route and service readiness | Verify Health |
| First Admin Bootstrap | Keycloak Admin | `evcp` user in `evcp-admins` with required password update | Create first application admin in Keycloak Admin Console |
| First Admin Login | Platform Admin | `GET /api/auth/me` through a Keycloak-issued Platform Auth session | Continue with Keycloak in Admin Web |

The journey does not mark deployment, migration or health as complete from UI text alone. It follows the same state source as the wizard: preflight report status, saved setup evidence, active step and installer report history.

## Installer Report

The installer report includes:

- stage status and retry hints for `preflight`, `configure`, `write_config_evidence`, `deploy_compose`, `migrate_seed` and `verify_health`
- redacted setup evidence for domain, ports/TLS mode, database, storage, bundled Keycloak, external AI provider, guardrail, backup and first admin
- compose readiness for `platform-api`, `admin-web`, `creator-web`, `app-store-pwa`, `postgres`, `redis`, `minio`, `keycloak` and `caddy`
- actionable failures for missing env values, weak/example secrets, invalid ports and missing services

## Compose Services

| Service | Purpose |
| --- | --- |
| `postgres` | Platform database |
| `redis` | Queue/cache foundation |
| `minio` | S3-compatible object storage |
| `keycloak` | Local/private SSO foundation |
| `platform-api` | Platform API service |
| `admin-web` | Admin Console |
| `creator-web` | Creator App |
| `app-store-pwa` | End User App Store |
| `caddy` | Private-server reverse proxy |

## Keycloak authentication operations

The imported `evcp` realm provides two confidential clients:

- `evcp-platform-api` permits Authorization Code login and is the only client that
  may use the callback URL `${EVCP_PUBLIC_API_URL}/auth/keycloak/callback`.
- `evcp-admin-service` is a service-account client limited to Keycloak user
  management permissions.

The realm groups are `evcp-admins`, `evcp-creators`, and `evcp-users`; they map to
the EVCP `admin`, `creator`, and `end_user` roles. Keep direct grants disabled and
do not create public browser clients for EVCP.

Production Compose pins `EVCP_ALLOW_SIMULATE_LOGIN=0`. Mock identity headers and
`/admin/auth/simulate-login` are disabled, while legacy native credential requests
are rejected and must not be used as a production identity journey. Test-only
harnesses may enable that flag explicitly, but it must never be enabled in a deployed
`.env` or Compose override.

For Keycloak readiness failures, inspect the `keycloak` and `keycloak-bootstrap`
container logs, confirm the issuer resolves from `platform-api`, and verify that the
public API URL, callback URL, and frontend origins match exactly. Missing or unmapped
group claims, a failed discovery/JWKS request, or an invalid callback transaction
are fail-closed errors; begin a fresh login after correcting configuration.
