# Sprint 10 Delivery Note

Date: 2026-07-04
Branch: `codex/sprint-10-runtime-hardening`
Issue: #13
Scope: Generated app runtime evidence, schema isolation, runtime health/readiness/log/metrics, OpenAPI and migration dry-run contract.

## Delivered Scope

- Added `GeneratedAppRuntimeService` for runtime overview, schema access checks and migration dry-run reports.
- Added Platform API routes for Admin runtime overview, schema check, health/readiness/metrics/log evidence, OpenAPI and migration dry-run.
- Integrated Admin monitoring app health with generated runtime evidence.
- Added Prisma schema, migration and seed data for generated app runtimes, schema grants, health checks, logs, metrics, OpenAPI contracts and migration reports.
- Added Admin Generated App Runtime Hardening UI using shared design-system components and responsive CSS.
- Added Sprint 10 unit, integration and E2E/API/UI smoke tests while preserving previous sprint regression checks.
- Updated ADR-003, sprint planning, UI spec, test plan, traceability and product-owner acceptance docs.

## Verification

Primary gate:

```bash
pnpm verify:sprint10
```

Result: Passed on 2026-07-04.

| Gate | Evidence |
| --- | --- |
| Sprint lint | `Sprint lint checks passed` |
| Typecheck | 10 workspace projects passed |
| Build | Platform API plus Admin Web, Creator Web and App Store PWA passed |
| Unit tests | 50 passed, 0 failed |
| Integration tests | 34 passed, 0 failed |
| E2E/API/UI smoke tests | 35 passed, 0 failed |
| Console check | Playwright warning capture reported 0 errors and 0 warnings |

Additional database verification:

```bash
pnpm --filter @evcp/platform-api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Result: Passed on 2026-07-04.

| Table | Count |
| --- | ---: |
| `generated_app_runtimes` | 1 |
| `generated_app_schema_grants` | 1 |
| `generated_app_health_checks` | 1 |
| `generated_app_runtime_logs` | 1 |
| `generated_app_runtime_metrics` | 1 |
| `generated_app_openapi_contracts` | 1 |
| `generated_app_migration_reports` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint10-runtime-hardening.png`
- `docs/assets/screenshots/sprint10-runtime-hardening-mobile.png`
- `docs/assets/screenshots/sprint10-console-warnings.txt`

## Product Owner Decision

Accepted. Sprint 10 meets the production blueprint runtime hardening gate: published generated apps now expose artifact, container, schema isolation, health/readiness/log/metrics, OpenAPI and migration dry-run evidence through service, API, persistence and Admin UI, while the full Sprint 0-10 regression suite remains green.
