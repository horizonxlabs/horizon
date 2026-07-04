# Sprint 3 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted for Creator PRD baseline implementation

## 1. Acceptance Principle

Sprint 3 is accepted only if Creator can move through one integrated workflow: create or select a project, generate a governed PRD draft, inspect PRD sections and version history, then confirm immutable PRD baseline v1.0. The workflow must be backed by service/API/schema tests, not only static UI.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Creator can create project with MVP wizard fields | Unit and E2E/API smoke output | Passed |
| Creator sees only authorized projects/PRDs | Unit/API deny-path output | Passed |
| PRD draft is generated from project input | Unit and E2E/API smoke output | Passed |
| PRD generation uses governed route/quota/guardrail path | Unit service assertion | Passed |
| PRD version history records draft and baseline | Unit and E2E/API smoke output | Passed |
| Baseline confirmation creates immutable v1.0 version | Unit and E2E/API smoke output | Passed |
| Prisma migration adds PRD document/version/section tables | Integration test and migration output | Passed |
| Seed includes Leave Management PRD baseline data | Integration test and DB query output | Passed |
| Creator UI shows picker, wizard, PRD viewer, history and baseline state | Screenshot and UI smoke | Passed |
| Sprint 0-2 regression tests remain green | `pnpm verify:sprint3` | Passed |

## 3. Product Owner Checklist

- [x] Creator can identify project status in Project Picker.
- [x] Create Project Wizard captures app basics, users/access and data/risk inputs.
- [x] Generate PRD action is represented as a governed flow.
- [x] PRD Viewer displays structured sections.
- [x] Version History shows draft and baseline records.
- [x] Confirm Baseline clearly explains immutability.
- [x] Confirmed baseline is version `1.0` and separate from draft `0.1`.
- [x] Unauthorized end user cannot create projects or access PRD flow.
- [x] Sprint 4 has a project + PRD baseline context to load.

## 4. Verification Evidence

Commands executed on 2026-07-03:

```bash
pnpm verify:sprint3
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:creator
```

Expected UI screenshot evidence: `docs/assets/screenshots/sprint3-creator-prd.png`.

Results:

- Lint/static governance: passed.
- TypeScript typecheck: passed for packages and apps.
- Production build: passed for Platform API and all three frontends.
- Unit tests: 17 passed, 0 failed.
- Integration tests: 13 passed, 0 failed.
- E2E/API/UI smoke tests: 10 passed, 0 failed.
- Prisma Client generation: passed.
- PostgreSQL migration: 3 migrations applied successfully.
- Sprint 3 seed verification query: `prd_documents=1`, `prd_versions=2`, `prd_sections=6`, `projects=1`, `guardrail_events=1`.
- UI screenshot evidence: `docs/assets/screenshots/sprint3-creator-prd.png`.

## 5. Rejection Rules

Reject Sprint 3 if:

- PRD generation works without Sprint 2 route/quota/guardrail checks.
- Baseline confirmation mutates the draft instead of creating a separate baseline version.
- Creator can access another user's project PRD.
- End User can create projects or PRDs.
- PRD tables/migration/seed are missing.
- Creator UI does not expose wizard, PRD viewer, version history and baseline decision.
- Sprint 0, Sprint 1 or Sprint 2 regression tests fail.

## 6. Product Owner Decision

Sprint 3 is accepted. The platform now has a Creator project and PRD baseline workflow sufficient for Sprint 4 workspace generation to require and load a confirmed PRD baseline.
