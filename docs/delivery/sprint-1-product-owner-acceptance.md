# Sprint 1 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted for Platform API foundation implementation

## 1. Acceptance Principle

Sprint 1 is accepted only if the Platform API foundation can run as a real service boundary, has a Prisma/PostgreSQL schema, has repeatable seed data, exposes mock auth, and records audit events. Static scaffolding alone is not accepted.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| NestJS Platform API exists | `apps/platform-api/src/app-factory.ts`, `src/main.ts` | Passed |
| Health endpoint returns success envelope | E2E/API smoke output | Passed |
| `/auth/me` returns seeded user and permissions | Unit and E2E/API smoke output | Passed |
| Protected route denies missing mock user | E2E/API smoke output | Passed |
| Prisma schema defines users/groups/roles/projects/apps/audit | Integration test output and `prisma generate` | Passed |
| Migration applies to PostgreSQL | `prisma migrate deploy` against Docker PostgreSQL | Passed |
| Seed creates admin, creator, end user, project, app and audit | Seed command and DB query output | Passed |
| Sprint 0 regression remains green | `pnpm verify:sprint1` includes Sprint 0 tests | Passed |
| Admin audit UI evidence | UI screenshot/manual evidence | Deferred to Sprint 2 Admin console work |

## 3. Product Owner Checklist

- [x] Platform API has a NestJS bootstrap path.
- [x] Platform API exposes `/health`.
- [x] Platform API exposes `/auth/me`.
- [x] Mock auth supports admin, creator and end_user users.
- [x] Missing mock auth is denied.
- [x] Project creation records an audit event.
- [x] Audit log can be read by admin mock user.
- [x] Prisma schema includes identity, project, app and audit tables.
- [x] First migration applies to local PostgreSQL.
- [x] Seed is repeatable and creates demo records.
- [x] Unit, integration and E2E/API smoke tests pass.
- [x] Sprint 0 regression tests remain included.
- [ ] Admin audit UI screenshot exists.

## 4. Verification Evidence

Commands executed on 2026-07-03:

```bash
pnpm verify:sprint1
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
docker compose -f docker/docker-compose.yml exec -T postgres psql -U evcp -d evcp -c "<record count query>"
docker compose -f docker/docker-compose.yml down
```

Results:

- Lint/static governance: passed.
- TypeScript typecheck: passed for packages and apps.
- Production build: passed for Platform API and all three frontends.
- Unit tests: 6 passed, 0 failed.
- Integration tests: 7 passed, 0 failed.
- E2E/API smoke tests: 4 passed, 0 failed.
- Prisma Client generation: passed.
- PostgreSQL migration: 1 migration applied successfully.
- Seed verification query: `platform_users=3`, `platform_roles=3`, `projects=1`, `apps=1`, `audit_logs=1`.

## 5. Rejection Rules

Reject Sprint 1 if:

- Platform API cannot be typechecked or built.
- `/auth/me` does not return role-specific permissions.
- Protected API access succeeds without mock user context.
- Migration cannot apply to an empty PostgreSQL database.
- Seed command cannot be rerun safely.
- Audit event is missing for project creation.
- Any Sprint 0 regression test fails.

## 6. Product Owner Decision

Sprint 1 backend foundation is accepted. The only open evidence item is the Admin audit UI screenshot, which is intentionally deferred because Sprint 1 source scope is API/database foundation and Sprint 2 is the Admin console sprint.
