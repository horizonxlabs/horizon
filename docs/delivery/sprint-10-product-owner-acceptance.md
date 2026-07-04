# Sprint 10 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-04
Status: Accepted

## 1. Acceptance Principle

Sprint 10 is accepted only if generated app runtime hardening works as an integrated production blueprint contract: runtime evidence is available through service/API/UI, database isolation is explicit and testable, migration changes are dry-runnable and approval-gated, and the full regression suite remains green.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Runtime overview exposes artifact, container, schema, health, OpenAPI and migration contracts | Unit and E2E/API output | Passed focused tests |
| Schema isolation allows assigned schema and denies cross-schema access | Unit and E2E/API output | Passed focused tests |
| Destructive migration dry-run requires Developer Reviewer and Data Owner | Unit and E2E/API output | Passed focused tests |
| Admin runtime API exposes overview, schema check, health, OpenAPI and migration dry-run routes | E2E/API output | Passed focused tests |
| Prisma migration and seed include Sprint 10 runtime records | Integration test and DB query output | Passed |
| Admin Runtime Hardening UI renders required sections | E2E/UI and screenshot evidence | Passed |
| Sprint 0-9 regression tests remain green | `pnpm verify:sprint10` | Passed |

## 3. Product Owner Checklist

- [x] Runtime overview links project, app and deployment IDs.
- [x] Artifact contract includes manifest, package, frontend, backend, prisma, openapi, tests and README paths.
- [x] Container contract includes status, container name, image tag, route and probe endpoints.
- [x] Schema isolation includes schema name, DB user, allowed schemas and denied schemas.
- [x] Cross-schema access returns `cross_schema_access_denied`.
- [x] Health/readiness/log/metrics evidence is exposed.
- [x] OpenAPI contract includes version and generated paths.
- [x] Migration dry-run blocks destructive changes without approval.
- [x] Prisma schema, migration and seed records exist.
- [x] Admin UI includes Container Contract, Schema Isolation, Health / Readiness, Structured Logs, Metrics, OpenAPI Contract and Migration Dry Run.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified against PostgreSQL.
- [x] Screenshot and console evidence are captured.

## 4. Verification Evidence

Commands to execute before acceptance:

```bash
pnpm verify:sprint10
pnpm --filter @evcp/platform-api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:admin
```

Expected UI screenshot evidence:

- `docs/assets/screenshots/sprint10-runtime-hardening.png`
- `docs/assets/screenshots/sprint10-runtime-hardening-mobile.png`

Current results:

| Evidence | Result |
| --- | --- |
| Focused unit tests | Passed: 50/50 |
| Focused integration tests | Passed: 34/34 |
| Focused E2E/API/UI smoke tests | Passed: 35/35 |
| `pnpm verify:sprint10` | Passed: lint, typecheck, build, unit 50/50, integration 34/34, e2e 35/35 |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000009_sprint10_generated_runtime_hardening` |
| Prisma seed | Passed |
| DB count query | `generated_app_runtimes=1`, `generated_app_schema_grants=1`, `generated_app_health_checks=1`, `generated_app_runtime_logs=1`, `generated_app_runtime_metrics=1`, `generated_app_openapi_contracts=1`, `generated_app_migration_reports=1` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint10-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint10-runtime-hardening.png`, `docs/assets/screenshots/sprint10-runtime-hardening-mobile.png` |

## 5. Rejection Rules

Reject Sprint 10 if:

- Runtime overview can be produced without a published deployment.
- Container identity, route or probe endpoints are missing.
- Schema isolation allows cross-schema access without an explicit allowlist.
- Migration dry-run passes destructive changes without required approvals.
- OpenAPI contract is missing or not linked to deployment.
- Runtime health/log/metrics evidence is not visible through Admin API/UI.
- Prisma schema, migration or seed records are missing.
- Admin UI omits any required runtime hardening section.
- Regression from a previous accepted sprint breaks without documented exception.

## 6. Product Owner Decision

Accepted. Sprint 10 is approved for the next sprint because generated runtime hardening now works across API, schema, seed data and Admin UI: runtime overview links to deployment, schema isolation denies cross-schema access, migration dry-run blocks destructive changes without required approvals, OpenAPI and health evidence are visible, and the full Sprint 0-10 regression suite passes.
