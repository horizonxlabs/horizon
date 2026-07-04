# Sprint 7 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted

## 1. Acceptance Principle

Sprint 7 is accepted only if End Users can use the App Store PWA to discover accessible apps, request access and submit tickets, and Creators can receive those tickets in an inbox that can feed Sprint 8 PRD change work.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| App Store PWA has install metadata and offline fallback | Manifest/offline files, build and screenshot | Passed |
| End User sees My Apps and Available Apps from access policy | Unit and E2E/API output | Passed in scoped run |
| End User opens app detail with owner, role, health and version | Unit and E2E/API output | Passed in scoped run |
| End User can request access and duplicate request is stable | Unit and E2E/API output | Passed in scoped run |
| End User can submit ticket for visible app only | Unit and E2E/API output | Passed in scoped run |
| End User can track submitted ticket status | Unit and E2E/API output | Passed in scoped run |
| Creator can see routed ticket in inbox | Unit, E2E/API and UI evidence | Passed in scoped run |
| Prisma migration and seed include Sprint 7 records | Integration test and DB query output | Passed |
| Sprint 0-6 regression tests remain green | `pnpm verify:sprint7` | Passed |

## 3. Product Owner Checklist

- [x] End User App Store PWA includes manifest and offline fallback files.
- [x] End User can view My Apps and Available Apps.
- [x] App detail exposes owner, role, health, route and app actions.
- [x] Request access creates pending request and duplicate returns existing request.
- [x] Ticket creation stores type, priority, title, description, device info and timeline.
- [x] Ticket status is scoped to submitter.
- [x] Creator ticket inbox receives routed app tickets.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified.
- [x] Screenshot and console evidence are captured.

## 4. Verification Evidence

Commands to execute before acceptance:

```bash
pnpm verify:sprint7
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:store
```

Expected UI screenshot evidence: `docs/assets/screenshots/sprint7-app-store-ticket.png`.

Results:

| Evidence | Result |
| --- | --- |
| Scoped Sprint 7 unit/integration/e2e run | Passed: unit 34/34, integration 25/25, e2e 23/23 |
| `pnpm verify:sprint7` | Passed: lint, typecheck, build, unit 34/34, integration 25/25, e2e 23/23 |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000006_sprint7_store_ticket` |
| Prisma seed | Passed |
| DB count query | `support_tickets=1`, `support_ticket_timeline_entries=1`, `in_app_notifications=1` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint7-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint7-app-store-ticket.png` |

## 5. Rejection Rules

Reject Sprint 7 if:

- The App Store PWA has no manifest or offline fallback.
- My Apps and Available Apps do not reflect access state.
- End Users can submit tickets for unknown or non-visible apps.
- Another End User can see a ticket they did not submit.
- Creator cannot see the routed project ticket.
- Ticket schema, migration or seed records are missing.
- Sprint 0, Sprint 1, Sprint 2, Sprint 3, Sprint 4, Sprint 5 or Sprint 6 regression tests fail.

## 6. Product Owner Decision

Accepted. Sprint 7 is approved for the next sprint because the App Store PWA is installable/offline-aware, access state is enforced by API behavior, ticket submission/status are permission-scoped, Creator receives the routed ticket, and Sprint 8 can convert feedback into PRD change work.
