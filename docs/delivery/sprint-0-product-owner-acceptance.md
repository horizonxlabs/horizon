# Sprint 0 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted for Sprint 0 foundation implementation

## 1. Acceptance Principle

Sprint 0 is accepted only if the three surfaces work together through shared packages, mock auth and mock fixtures. A file scaffold alone is not accepted.

## 2. Required Evidence

| Gate | Evidence Required |
| --- | --- |
| Shared UI imports in all shells | `pnpm typecheck` and app source imports |
| Mock auth controls role-based shell access | unit/integration test output |
| Admin, Creator and Store shells render Leave Management context | e2e smoke test output |
| No real secrets committed | lint/static check output |
| Unit tests pass | `pnpm test:unit` |
| Integration tests pass | `pnpm test:integration` |
| E2E smoke tests pass | `pnpm test:e2e` |
| Regression gate passes | `pnpm verify:sprint0` |

## 3. Product Owner Checklist

- [x] Admin shell renders dashboard, service status, AI Keys and Guardrails navigation.
- [x] Creator shell renders Project Picker and Leave Management project card.
- [x] Store PWA shell renders mobile-first My Apps and Available Apps.
- [x] Mock role switching supports admin, creator and end_user.
- [x] Shared fixtures are reused across surfaces.
- [x] API response envelope helpers are covered by unit tests.
- [x] Integration test proves role-to-surface access rules.
- [x] E2E smoke test proves all three surfaces compose from shared data.
- [x] No test gate is skipped.

## 4. Verification Evidence

Command executed on 2026-07-03:

```bash
pnpm verify:sprint0
```

Result:

- Lint/static governance: passed.
- TypeScript typecheck: passed for packages and apps.
- Production build: passed for Admin Web, Creator Web and App Store PWA.
- Unit tests: 3 passed, 0 failed.
- Integration tests: 4 passed, 0 failed.
- E2E smoke tests: 2 passed, 0 failed.

Note: Sprint 0 E2E is a source-level smoke suite that verifies integrated shell journeys and route composition. Browser-driven E2E should be introduced when Sprint 1 adds real auth/session screens and route execution.

## 5. Rejection Rules

Reject Sprint 0 if:

- Any surface only renders placeholder text without shared data.
- A surface uses private/local mock data instead of shared fixtures.
- A protected route is visible to the wrong mock role.
- Any unit, integration or E2E smoke test fails.
- A secret-like value is committed outside explicit test fixtures.
