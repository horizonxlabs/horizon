# Enterprise Vibe Coding Platform

Private AI application builder for organizations.

## Current Implementation State

Sprint 0 foundation, Sprint 1 Platform API foundation and Sprint 2 Admin AI governance are implemented on top of the validated requirements baseline.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm verify:sprint0
pnpm verify:sprint1
pnpm verify:sprint2
```

Start frontend shells:

```bash
pnpm dev
```

Start Platform API:

```bash
pnpm dev:api
```

## Sprint 1 Database

Start PostgreSQL:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

Apply migration and seed:

```bash
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

## Sprint 0 Scope

- Monorepo workspace
- Shared UI package
- Admin, Creator and App Store shells
- Mock auth provider
- Shared API client
- Leave Management mock fixtures
- Unit, integration and E2E smoke tests

## Sprint 1 Scope

- NestJS-backed Platform API
- `/health`, `/auth/me`, `/projects` and `/audit-logs`
- Mock auth guard behavior for admin, creator and end user
- Prisma PostgreSQL schema and first migration
- Idempotent seed users, roles, Leave Management project/app and audit event
- Docker Compose PostgreSQL verification path

## Sprint 2 Scope

- Admin AI Providers and API Keys governance screen
- External provider adapter configuration contract
- Masked API key response with encryption-ready storage fields
- Scenario routing and fallback configuration
- Token quota hard-stop checks before provider calls
- Guardrail keyword/policy prompt test with allow, warn and block decisions
- Guardrail event log and audit records
- Prisma migration and seed data for AI governance tables
