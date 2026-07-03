# Sprint 2 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted for Admin AI governance implementation

## 1. Acceptance Principle

Sprint 2 is accepted only if Admin governance works across API, service logic, schema, seed data and UI. Secret masking, admin-only access, quota pre-checks and guardrail events must be enforced by backend tests, not only visible in the UI.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Admin can create external AI provider | Unit and E2E/API smoke output | Passed |
| API key plaintext never appears after save | Unit and E2E/API smoke output | Passed |
| Creator cannot manage AI providers/keys | Unit and E2E/API smoke output | Passed |
| Scenario routing resolves provider/model/fallback | Unit and E2E/API smoke output | Passed |
| Quota hard stop blocks before provider call | Unit test output | Passed |
| Guardrail prompt test returns allow/warn/block | Unit and E2E/API smoke output | Passed |
| Guardrail decision event is logged | Unit and E2E/API smoke output | Passed |
| Prisma schema/migration includes governance tables | Integration test and migration output | Passed |
| Seed includes provider/key/route/quota/rule/event demo data | Integration test and DB query output | Passed |
| Admin UI shows providers, keys, routing, quota, rules, prompt test and events | Screenshot and E2E source smoke | Passed |

## 3. Product Owner Checklist

- [x] Admin can add an external AI provider.
- [x] Admin can create an API key without exposing plaintext after save.
- [x] API returns fingerprint/masked value only.
- [x] Creator is denied from AI provider/key management.
- [x] Scenario routing can be configured for PRD generation.
- [x] Quota can block before any provider call is counted.
- [x] Admin can create banned keyword guardrail rule.
- [x] Prompt test returns allow, warn and block states.
- [x] Guardrail event log records blocked prompt with actor/context.
- [x] Admin UI exposes Sprint 2 governance screen.
- [x] Sprint 0 and Sprint 1 regression tests remain green.

## 4. Verification Evidence

Commands executed on 2026-07-03:

```bash
pnpm verify:sprint2
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
docker compose -f docker/docker-compose.yml exec -T postgres psql -U evcp -d evcp -c "<governance record count query>"
pnpm dev:admin
```

Results:

- Lint/static governance: passed.
- TypeScript typecheck: passed for packages and apps.
- Production build: passed for Platform API and all three frontends.
- Unit tests: 11 passed, 0 failed.
- Integration tests: 10 passed, 0 failed.
- E2E/API/UI smoke tests: 7 passed, 0 failed.
- Prisma Client generation: passed.
- PostgreSQL migration: 2 migrations applied successfully.
- Governance seed verification query: `ai_providers=1`, `ai_api_keys=1`, `ai_scenario_routes=1`, `ai_quotas=1`, `guardrail_rules=1`, `guardrail_events=1`.
- UI screenshot evidence: `docs/assets/screenshots/sprint2-admin-governance.png`.

## 5. Rejection Rules

Reject Sprint 2 if:

- API response includes plaintext key material.
- Non-admin users can create/list AI provider or key records.
- Quota check happens after provider-call accounting.
- Guardrail blocked prompt does not create a guardrail event.
- Scenario route cannot resolve a provider/model for PRD generation.
- Admin UI does not expose provider, key, route, quota, prompt test and event evidence.
- Sprint 0 or Sprint 1 regression tests fail.

## 6. Product Owner Decision

Sprint 2 is accepted. The platform now has an Admin governance surface and backend decision services sufficient for Sprint 3 PRD generation to call a governed AI/mock AI path.
