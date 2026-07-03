# Sprint 4 Delivery Note

Date: 2026-07-03
Branch: `codex/sprint-4-creator-workspace`
Scope: Creator Workspace prompt flow, deterministic AI task progress, token remaining, live preview, guarded prompt API and AI usage log.

## Delivered Scope

- Added Workspace service requiring confirmed PRD baseline before accepting prompts.
- Added guarded prompt pipeline: guardrail pre-check runs before AI/mock generation and preview update.
- Added deterministic AI task progress steps for accepted and blocked prompt paths.
- Added mock live preview version generation for Leave Management.
- Added token remaining response and AI usage log for accepted prompts.
- Added Platform API routes for workspace snapshot, prompt submission and preview refresh.
- Added Prisma schema and migration for workspace tasks, task steps, preview versions and AI usage logs.
- Added seed data for a Leave Management workspace prompt, preview and usage log.
- Extended Creator UI with a Lovable-like workspace surface using EVCP design system primitives.
- Added unit, integration and E2E/API/UI smoke coverage for Sprint 4 while keeping Sprint 0-3 regression checks.

## Verification

Primary gate:

```bash
pnpm verify:sprint4
```

Result: Passed on 2026-07-03.

| Gate | Evidence |
| --- | --- |
| Sprint lint | `Sprint lint checks passed` |
| Typecheck | 10 workspace projects passed |
| Build | Platform API plus Admin Web, Creator Web and App Store PWA passed |
| Unit tests | 20 passed, 0 failed |
| Integration tests | 16 passed, 0 failed |
| E2E/API/UI smoke tests | 13 passed, 0 failed |
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
| `workspace_tasks` | 1 |
| `workspace_task_steps` | 9 |
| `preview_versions` | 1 |
| `ai_usage_logs` | 1 |
| `prd_versions` | 2 |

UI evidence:

- `docs/assets/screenshots/sprint4-creator-workspace.png`
- `docs/assets/screenshots/sprint4-console-warnings.txt`

## Product Owner Decision

Accepted. Sprint 4 meets the workspace acceptance gate: safe prompts require PRD baseline, guardrail blocks prevent preview/usage creation, accepted prompts create deterministic task progress, token budget evidence, AI usage log and latest preview output. Sprint 5 can use preview/version output for frontend checkpoint and restore.
