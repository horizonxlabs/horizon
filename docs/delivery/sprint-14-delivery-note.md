# Sprint 14 Delivery Note

Branch: `codex/sprint-14-security-release-readiness`

Scope: Security release readiness, admin-only security APIs, upload validation/quarantine, public/external release checklist, sensitive redaction evidence, Prisma security release tables and Admin UI dashboard.

## Delivered

- Added `SecurityReleaseService` for readiness overview, upload validation, release checklist evaluation and sensitive payload redaction.
- Added `/admin/security/readiness`, `/admin/security/uploads/validate`, `/admin/security/release-checklist` and `/admin/security/redaction/preview` API routes.
- Added Prisma models, migration and seed records for security readiness reports, checks, upload scan events, release checklist reports and redaction evidence.
- Added Admin Security Release Readiness dashboard using shared `@evcp/ui` primitives and responsive `security-release-mobile-list`.
- Added Sprint 14 unit, integration and E2E/API/UI tests and `pnpm verify:sprint14`.

## Verification

```bash
node --import tsx --test tests/unit/platform-sprint14-security-release-services.test.mjs
node --import tsx --test tests/integration/platform-sprint14-security-release-schema.test.mjs
node --import tsx --test tests/e2e/sprint14-security-release-smoke.test.mjs
pnpm verify:sprint14
```

Current focused evidence:

| Gate | Result |
| --- | --- |
| Sprint 14 unit tests | Passed: 4/4 |
| Sprint 14 integration tests | Passed: 3/3 |
| Sprint 14 E2E/API/UI smoke tests | Passed: 3/3 |
| Full `pnpm verify:sprint14` | Passed: lint, typecheck, build, unit 65/65, integration 48/48, e2e 49/49 |
| Prisma migrate deploy | Passed: applied `20260703000013_sprint14_security_release_readiness` |
| Prisma generate + seed | Passed |
| UI screenshot evidence | Passed: desktop/mobile captured, console warnings 0 |

Sprint 14 count evidence after migrate/seed:

| Table | Expected Count |
| --- | --- |
| `security_readiness_reports` | 1 |
| `security_readiness_checks` | 1 |
| `upload_scan_events` | 1 |
| `release_checklist_reports` | 1 |
| `sensitive_redaction_evidence` | 1 |

Screenshot evidence:

- `docs/assets/screenshots/sprint14-security-release-readiness.png`
- `docs/assets/screenshots/sprint14-security-release-readiness-mobile.png`
- `docs/assets/screenshots/sprint14-console-warnings.txt`

## Product Owner Note

Sprint 14 is ready for external maintainer review and stacked merge. Code, API, persistence, seed data, UI screenshots and automated regression gates are green; formal GitHub approval is still required from a non-author maintainer.
