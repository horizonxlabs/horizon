# Sprint 1 Delivery Note

Date: 2026-07-03
Branch: `codex/sprint-1-platform-api`
Scope: Platform API foundation, Prisma/PostgreSQL schema, seed data, mock auth and audit.

## Delivered Scope

- Converted `apps/platform-api` from Sprint 0 placeholder to a NestJS-backed Platform API.
- Added shared API route execution for `/health`, `/auth/me`, `/projects` and `/audit-logs`.
- Added mock auth resolution through `x-mock-user-email` and `x-evcp-user` headers.
- Added role-specific permissions for admin, creator and end user.
- Added audit recording for auth lookup and project creation.
- Added Prisma schema, first migration and idempotent seed script.
- Added Docker Compose PostgreSQL for local migration/seed verification.
- Added Sprint 1 unit, integration and E2E/API smoke tests while keeping Sprint 0 regression coverage.

## Verification

Primary gate:

```bash
pnpm verify:sprint1
```

Result:

- Lint/static checks: passed.
- Typecheck: passed across packages and apps.
- Build: passed for Platform API and all Vite apps.
- Unit tests: 6 passed.
- Integration tests: 7 passed.
- E2E/API smoke tests: 4 passed.

Database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Database record counts after seed:

| Table | Count |
| --- | ---: |
| `platform_users` | 3 |
| `platform_roles` | 3 |
| `projects` | 1 |
| `apps` | 1 |
| `audit_logs` | 1 |

## Product Owner Decision

Sprint 1 is accepted for backend foundation. The Platform API, schema and seed data are sufficient for Sprint 2 Admin AI Keys and Guardrails to start without a schema rewrite.

## Known Follow-Up

Admin audit UI screenshot evidence remains open and should be closed in Sprint 2, where Admin console work is in scope.
