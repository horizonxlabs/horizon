# Sprint 8 Delivery Note

Date: 2026-07-04
Branch: `codex/sprint-8-mvp-feedback-domain-hardening`
Issue: #9
Scope: Ticket-to-PRD change requests, PRD change approval, domain request governance, deployment traceability, MVP monitoring, audit filters and demo checklist.

## Delivered Scope

- Added `PrdChangeService` for ticket conversion, duplicate prevention, PRD change approval/rejection and linked PRD version creation.
- Added `DomainService` for project domain settings, public domain requests and Admin approval decisions.
- Added `TraceabilityService` to link ticket, PRD change, PRD version, frontend checkpoint, manifest, deployment, domain and audit evidence.
- Added `MonitoringService` for MVP service health, app health, ticket counts, domain request counts, provider calls, guardrail events and recent audit data.
- Added Platform API routes for PRD changes, domain requests, domain approval, traceability, monitoring and audit filtering.
- Added Prisma schema, migration and seed data for PRD change requests, PRD decisions, domain settings, domain requests and deployment trace records.
- Added Creator UI surfaces for Ticket-to-PRD Change, PRD Change Requests, Domain Settings, Deployment Traceability and MVP Demo Checklist.
- Added Admin MVP Monitoring surface for Service Health, Ticket Counts, Domain Requests and Audit Filters.
- Extended shared design-system CSS for Sprint 8 Creator/Admin operational layouts.
- Added Sprint 8 unit, integration and E2E/API/UI smoke coverage while preserving prior sprint regression checks.

## Verification

Primary gate:

```bash
pnpm verify:sprint8
```

Result: Passed on 2026-07-04.

| Gate | Evidence |
| --- | --- |
| Sprint lint | `Sprint lint checks passed` |
| Typecheck | 10 workspace projects passed |
| Build | Platform API plus Admin Web, Creator Web and App Store PWA passed |
| Unit tests | 39 passed, 0 failed |
| Integration tests | 28 passed, 0 failed |
| E2E/API/UI smoke tests | 27 passed, 0 failed |
| Console check | Playwright warning capture reported 0 errors and 0 warnings |

Additional database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Result: Passed on 2026-07-04.

| Table | Count |
| --- | ---: |
| `prd_change_requests` | 1 |
| `prd_change_decisions` | 1 |
| `domain_settings` | 1 |
| `domain_requests` | 1 |
| `deployment_trace_records` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint8-creator-feedback-domain.png`
- `docs/assets/screenshots/sprint8-admin-monitoring-audit.png`
- `docs/assets/screenshots/sprint8-console-warnings.txt`

## Product Owner Decision

Accepted. Sprint 8 meets the MVP hardening acceptance gate: ticket feedback can become approved PRD scope, public domain requests are governed, traceability links requirement and deployment evidence, Admin monitoring/audit surfaces are usable, and the full Sprint 0-8 regression suite remains green.
