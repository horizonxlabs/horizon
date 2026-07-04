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

3. Run preflight.

```bash
pnpm install:preflight
```

For contract verification against the checked-in template:

```bash
pnpm install:preflight:example
```

4. Start the private-server stack.

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

5. Verify the stack.

```bash
pnpm verify:install
pnpm verify:sprint14
```

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

- Replace mock auth headers with Platform Auth sessions backed by Keycloak/OIDC.
- Replace direct frontend mock-data imports with API clients.
- Move service state from in-memory/demo records to Prisma-backed repositories.
- Connect AI Provider Adapter to real external providers.
- Replace mock generated app preview with real build/deploy/runtime flow.
- Add E2E tests that use real login, database state and deployed generated app routes.

