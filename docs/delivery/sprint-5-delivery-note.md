# Sprint 5 Delivery Note

Date: 2026-07-03
Branch: `codex/sprint-5-db-restore`
Issue: #3
Scope: Creator Database View, read-only sample records, frontend checkpoint timeline, compare/preview and frontend-only restore.

## Delivered Scope

- Added read-only database metadata service for schema, tables, columns, relationships, sample records and migration history.
- Added raw SQL denial path for Creator database view.
- Added frontend checkpoint service with timeline, compare and frontend-only restore.
- Connected Sprint 4 accepted prompts to frontend checkpoint creation.
- Added restore audit event `frontend.restore.completed`.
- Added Prisma schema and migration for database metadata and frontend checkpoints.
- Added seed data for Leave Management database metadata, sample records, migration and checkpoint.
- Extended Creator UI with Database View, Sample Records, Migration History, Frontend Versions, Compare and Restore Frontend Only boundary copy.
- Added Sprint 5 unit, integration and E2E/API/UI smoke coverage while preserving Sprint 0-4 regression checks.

## Verification

Primary gate:

```bash
pnpm verify:sprint5
```

Result: Passed on 2026-07-03.

| Gate | Evidence |
| --- | --- |
| Sprint lint | `Sprint lint checks passed` |
| Typecheck | 10 workspace projects passed |
| Build | Platform API plus Admin Web, Creator Web and App Store PWA passed |
| Unit tests | 23 passed, 0 failed |
| Integration tests | 19 passed, 0 failed |
| E2E/API/UI smoke tests | 17 passed, 0 failed |
| Console check | Playwright warning capture reported 0 errors and 0 warnings |

Additional database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Result: Passed on 2026-07-03.

| Table | Count |
| --- | ---: |
| `app_database_tables` | 3 |
| `app_database_columns` | 11 |
| `app_database_relationships` | 2 |
| `app_database_sample_records` | 2 |
| `app_database_migrations` | 1 |
| `frontend_checkpoints` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint5-database-restore.png`
- `docs/assets/screenshots/sprint5-console-warnings.txt`

## Product Owner Decision

Accepted. Sprint 5 meets the database/restore acceptance gate: Creator can inspect read-only schema/sample/migration metadata, raw SQL is denied, unauthorized users are blocked, frontend restore creates a new active checkpoint and audit event, and non-frontend boundaries remain unchanged.
