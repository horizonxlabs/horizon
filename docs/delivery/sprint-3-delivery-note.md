# Sprint 3 Delivery Note

Date: 2026-07-03
Branch: `codex/sprint-3-creator-prd`
Scope: Creator project picker, create-project wizard surface, governed PRD generation, PRD version history and baseline confirmation.

## Delivered Scope

- Added Sprint 3 PRD service for deterministic draft generation from project inputs.
- Connected PRD generation to Sprint 2 governance: `prd_generation` route resolution, creator quota check and guardrail evaluation.
- Added immutable baseline confirmation that creates PRD version `1.0` instead of mutating the draft.
- Added Platform API routes for PRD draft generation, current PRD, version history and baseline confirmation.
- Extended project creation with app type, business problem, target department, intended users and data sensitivity fields.
- Added Prisma schema and migration for PRD documents, versions and ordered sections.
- Added seed data for Leave Management PRD baseline demo.
- Rebuilt Creator UI using EVCP design system primitives for project picker, wizard, PRD viewer, version history and baseline confirmation.
- Added unit, integration and E2E/API/UI smoke coverage for Sprint 3 while keeping earlier sprint regression checks.

## Verification

Primary gate:

```bash
pnpm verify:sprint3
```

Expected evidence:

- Lint/static checks: passed.
- Typecheck: passed across packages and apps.
- Build: passed for Platform API and all frontend apps.
- Unit tests: 17 passed.
- Integration tests: 13 passed.
- E2E/API/UI smoke tests: 10 passed.

Additional database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

UI evidence:

- `docs/assets/screenshots/sprint3-creator-prd.png`
- Playwright console contained only the React DevTools informational message after favicon fix.

Database record counts after seed:

| Table | Count |
| --- | ---: |
| `prd_documents` | 1 |
| `prd_versions` | 2 |
| `prd_sections` | 6 |
| `projects` | 1 |
| `guardrail_events` | 1 |

## Product Owner Decision

Sprint 3 is accepted. Sprint 4 can now load a project with confirmed PRD baseline context.
