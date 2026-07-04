# Sprint 4 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted

## 1. Acceptance Principle

Sprint 4 is accepted only if Creator can use one integrated workspace flow: a confirmed PRD baseline project accepts a safe prompt, runs guardrail pre-check, shows deterministic task progress, consumes tokens, records usage and updates live preview. Blocked prompts must not update preview or usage records.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Workspace requires PRD baseline before prompt | Unit negative test | Passed |
| Safe prompt creates task progress | Unit and E2E/API smoke output | Passed |
| Guardrail block prevents preview update | Unit and E2E/API smoke output | Passed |
| Token remaining decreases after accepted prompt | Unit and E2E/API smoke output | Passed |
| AI usage log is recorded for accepted prompt | Unit and E2E/API smoke output | Passed |
| Preview refresh returns latest mock generated preview | E2E/API smoke output | Passed |
| Prisma migration adds workspace/preview/usage tables | Integration test and migration output | Passed |
| Seed includes workspace task, preview and usage demo data | Integration test and DB query output | Passed |
| Creator UI shows prompt, progress, tokens, preview and logs | Screenshot and UI smoke | Passed |
| Sprint 0-3 regression tests remain green | `pnpm verify:sprint4` | Passed |

## 3. Product Owner Checklist

- [x] Creator sees project, PRD baseline, frontend preview and token status while working.
- [x] Prompt Composer explains guardrail pre-check.
- [x] Safe prompt shows guardrail allow before task progress.
- [x] Task Progress shows deterministic steps.
- [x] Live Preview updates after accepted prompt.
- [x] Token Remaining and Usage Log are visible.
- [x] Blocked prompt path is explicit and testable.
- [x] No provider secret or system-wide model config is visible to Creator.
- [x] Sprint 5 has preview/version output to use for restore.

## 4. Verification Evidence

Commands executed before acceptance:

```bash
pnpm verify:sprint4
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:creator
```

Results:

| Evidence | Result |
| --- | --- |
| `pnpm verify:sprint4` | Passed: unit 20/20, integration 16/16, e2e 13/13 |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000003_sprint4_workspace_preview` |
| Prisma seed | Passed |
| DB count query | `workspace_tasks=1`, `workspace_task_steps=9`, `preview_versions=1`, `ai_usage_logs=1`, `prd_versions=2` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint4-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint4-creator-workspace.png` |

## 5. Rejection Rules

Reject Sprint 4 if:

- Workspace accepts prompts without confirmed PRD baseline.
- Guardrail block still creates preview or usage records.
- Token remaining does not change after accepted prompt.
- Task progress is not visible and deterministic.
- Creator UI hides prompt, preview, token or log evidence.
- Sprint 0, Sprint 1, Sprint 2 or Sprint 3 regression tests fail.

## 6. Product Owner Decision

Accepted. Sprint 4 is approved for the next sprint because the Creator workspace works as one integrated flow with baseline enforcement, guardrail pre-check, deterministic AI task progress, token evidence, usage logging and preview output while Sprint 0-3 regression checks remain green.
