# Sprint 2 Delivery Note

Date: 2026-07-03
Branch: `codex/sprint-2-admin-governance`
Scope: Admin AI Providers, API Keys, routing, quota, guardrails, prompt test and event log.

## Delivered Scope

- Added AI governance service logic for providers, API keys, routing, quota and provider-call accounting.
- Added API key masking and encryption-ready secret envelope fields.
- Added guardrail rule and prompt-test service with allow, warn and block outcomes.
- Added guardrail decision event log and audit events.
- Added Platform API routes for AI providers, API keys, routes, quotas, guardrail rules, prompt test and guardrail events.
- Added Prisma migration and seed data for Sprint 2 governance tables.
- Added Admin UI governance dashboard with provider/key/routing/quota/guardrail/event sections.
- Added unit, integration and E2E/API/UI smoke coverage for Sprint 2 while keeping Sprint 0 and Sprint 1 regression checks.

## Verification

Primary gate:

```bash
pnpm verify:sprint2
```

Result:

- Lint/static checks: passed.
- Typecheck: passed across packages and apps.
- Build: passed for Platform API and all frontend apps.
- Unit tests: 11 passed.
- Integration tests: 10 passed.
- E2E/API/UI smoke tests: 7 passed.

Database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Database record counts after seed:

| Table | Count |
| --- | ---: |
| `ai_providers` | 1 |
| `ai_api_keys` | 1 |
| `ai_scenario_routes` | 1 |
| `ai_quotas` | 1 |
| `guardrail_rules` | 1 |
| `guardrail_events` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint2-admin-governance.png`
- Playwright console contained only the React DevTools informational message after favicon fix.

## Product Owner Decision

Sprint 2 is accepted for MVP governance. Sprint 3 can now build PRD generation on top of a governed provider route, quota check and guardrail prompt-test path.
