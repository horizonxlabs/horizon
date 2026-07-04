# Sprint 5 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted

## 1. Acceptance Principle

Sprint 5 is accepted only if Creator can inspect generated app database metadata safely and restore a frontend checkpoint without mutating backend, database, auth, app roles, membership, domain settings or PRD baseline.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Database view exposes schema/table/relationships/migrations | Unit, E2E/API and screenshot | Passed |
| Sample records are read-only and scoped | Unit and E2E/API output | Passed |
| Raw SQL is unavailable | Unit and E2E/API denial | Passed |
| Unauthorized users cannot view database metadata | Unit and E2E/API denial | Passed |
| Frontend checkpoints are recorded after generation | Unit and E2E/API output | Passed |
| Compare/preview old checkpoint is available | E2E/API and screenshot | Passed |
| Restore creates a new active checkpoint | Unit and E2E/API output | Passed |
| Restore changes frontend only | Boundary snapshot assertion | Passed |
| Restore emits audit event | Unit and E2E/API output | Passed |
| Prisma migration and seed include Sprint 5 records | Integration test and DB query output | Passed |
| Sprint 0-4 regression tests remain green | `pnpm verify:sprint5` | Passed |

## 3. Product Owner Checklist

- [x] Creator sees Database View without raw SQL or destructive actions.
- [x] Creator sees Schema, Sample Records and Migration History.
- [x] Creator sees Frontend Versions timeline.
- [x] Creator can compare current and old frontend checkpoints.
- [x] Restore confirmation clearly says "Restore Frontend Only".
- [x] Restore copy lists what will change and what will not change.
- [x] Backend/database/auth/app roles/membership/domain/PRD baseline remain unchanged after restore.
- [x] Restore audit event is present.
- [x] Sprint 6 publish can reference active frontend checkpoint.

## 4. Verification Evidence

Commands executed before acceptance:

```bash
pnpm verify:sprint5
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:creator
```

Expected UI screenshot evidence: `docs/assets/screenshots/sprint5-database-restore.png`.

Results:

| Evidence | Result |
| --- | --- |
| `pnpm verify:sprint5` | Passed: unit 23/23, integration 19/19, e2e 17/17 |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000004_sprint5_database_restore` |
| Prisma seed | Passed |
| DB count query | `app_database_tables=3`, `app_database_columns=11`, `app_database_relationships=2`, `app_database_sample_records=2`, `app_database_migrations=1`, `frontend_checkpoints=1` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint5-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint5-database-restore.png` |

## 5. Rejection Rules

Reject Sprint 5 if:

- Database view exposes raw SQL or destructive operations.
- Sample records bypass project authorization.
- End users can access Creator database/checkpoint APIs.
- Restore mutates database metadata, backend, auth, roles, membership, domain or PRD baseline.
- Restore does not create an audit event.
- Sprint 0, Sprint 1, Sprint 2, Sprint 3 or Sprint 4 regression tests fail.

## 6. Product Owner Decision

Accepted. Sprint 5 is approved for the next sprint because database visibility is read-only, frontend restore is checkpoint-based and audited, unauthorized access is denied, and non-frontend boundaries remain unchanged.
