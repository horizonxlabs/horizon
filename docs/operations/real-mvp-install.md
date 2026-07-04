# Real MVP Private-Server Install Foundation

Status: Phase 2 implementation started  
Issue: #26

## Purpose

The Sprint 0-14 stack is an integrated mock-first MVP prototype. This document defines the first concrete step toward a real usable MVP: a reproducible private-server install foundation.

This phase does not claim that auth, AI generation, generated app runtime and all frontend data flows are production-real yet. It creates the install contract required before those mock-to-real conversions can be verified end to end.

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
- `MINIO_ROOT_PASSWORD`
- `STORAGE_SECRET_KEY`
- `AI_API_KEY`

Required runtime mode:

- `EVCP_CORE_PERSISTENCE=prisma` for private-server core API persistence

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

7. Verify the stack and installer contract.

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

## Remaining Mock-to-Real Work

- Replace simulated SSO login with the real Keycloak/OIDC callback and remove mock auth header fallback after all clients send Platform Auth bearer sessions.
- Continue replacing static frontend demo sections with API calls; primary user/project/store bootstrap now uses `@evcp/api-client`.
- Move service state from in-memory/demo records to Prisma-backed repositories.
- Connect AI Provider Adapter to real external providers.
- Replace mock generated app preview with real build/deploy/runtime flow.
- Add E2E tests that use real login, database state and deployed generated app routes.
