# Sprint 8 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-04
Status: Accepted

## 1. Acceptance Principle

Sprint 8 is accepted only if the MVP feedback loop works as an integrated product: End User feedback can become a governed PRD change, approved change work can be traced through deployment/domain evidence, and Admin/Creator can inspect monitoring and audit state for a pilot demo.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Creator converts ticket to PRD change | Unit and E2E/API output | Passed in focused pre-final run |
| Duplicate conversion returns existing PRD change | Unit and E2E/API output | Passed in focused pre-final run |
| PRD change approval creates linked PRD version | Unit and E2E/API output | Passed in focused pre-final run |
| Domain request and Admin approval persist state | Unit and E2E/API output | Passed in focused pre-final run |
| Traceability links ticket, PRD, frontend, manifest, deployment and domain | Unit and E2E/API output | Passed in focused pre-final run |
| Monitoring dashboard and audit filters are usable | Unit, E2E/API and UI evidence | Passed in focused pre-final run |
| Prisma migration and seed include Sprint 8 records | Integration test and DB query output | Passed |
| Sprint 0-7 regression tests remain green | `pnpm verify:sprint8` | Passed |
| UI screenshots and console evidence exist | Playwright screenshot + console capture | Passed |

## 3. Product Owner Checklist

- [x] Ticket converts to PRD change request.
- [x] Duplicate ticket conversion is idempotent.
- [x] PRD change approval records decision and creates PRD version 1.1.
- [x] Domain settings expose internal path and public domain approval state.
- [x] Public domain request requires security checklist acknowledgement.
- [x] Admin can approve/reject domain requests.
- [x] Deployment traceability links ticket, PRD change, PRD version, frontend, manifest, deployment and domain.
- [x] Monitoring dashboard exposes service health, ticket counts, domain requests and audit evidence.
- [x] Audit filters can slice events by action, actor, project and severity.
- [x] Demo checklist is visible for the MVP pilot path.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified.
- [x] Screenshot and console evidence are captured.

## 4. Verification Evidence

Commands to execute before acceptance:

```bash
pnpm verify:sprint8
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:creator
pnpm dev:admin
```

Expected UI screenshot evidence:

- `docs/assets/screenshots/sprint8-creator-feedback-domain.png`
- `docs/assets/screenshots/sprint8-admin-monitoring-audit.png`

Results:

| Evidence | Result |
| --- | --- |
| Scoped Sprint 8 unit/integration/e2e run | Passed: unit 39/39, integration 28/28, e2e 27/27 |
| `pnpm verify:sprint8` | Passed: lint, typecheck, build, unit 39/39, integration 28/28, e2e 27/27 |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000007_sprint8_mvp_hardening` |
| Prisma seed | Passed |
| DB count query | `prd_change_requests=1`, `prd_change_decisions=1`, `domain_settings=1`, `domain_requests=1`, `deployment_trace_records=1` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint8-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint8-creator-feedback-domain.png`, `docs/assets/screenshots/sprint8-admin-monitoring-audit.png` |

## 5. Rejection Rules

Reject Sprint 8 if:

- A ticket cannot be converted to a PRD change request.
- Duplicate conversion creates multiple PRD changes for one ticket.
- Approved PRD changes mutate the baseline instead of creating a linked PRD version.
- Public domain requests can bypass Admin approval.
- Deployment traceability cannot connect ticket, PRD, frontend, manifest, deployment and domain.
- Monitoring or audit filters are missing from Admin.
- Prisma schema, migration or seed records are missing.
- Sprint 0 through Sprint 7 regression tests fail.

## 6. Product Owner Decision

Accepted. Sprint 8 is approved for the next sprint because the full feedback loop works across API, schema, seed data and UI: ticket feedback becomes governed PRD scope, approved changes are traceable to deployment/domain evidence, Admin monitoring and audit filters are visible, and the full Sprint 0-8 regression suite passes.
