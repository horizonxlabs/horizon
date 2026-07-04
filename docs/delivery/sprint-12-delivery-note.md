# Sprint 12 Delivery Note

Date: 2026-07-04
Branch: `codex/sprint-12-installer-backup-restore`
Issue: #17
Scope: Installer preflight, local setup wizard evidence, backup policy/run metadata, PostgreSQL PITR, restore drill reports, Prisma operations tables and Admin UI recovery dashboard.

## Delivered Scope

- Added `OperationsRecoveryService` for installer preflight, setup configuration redaction, backup policy, backup run, PITR configuration, restore drill and recovery overview workflows.
- Added Admin API routes for `/admin/installer/*` and `/admin/backup/*` with admin-only access through the existing auth and error envelope.
- Added Prisma models, migration and seed records for installer reports, setup configurations, backup policies, backup runs, PITR configurations and restore drill reports.
- Added Admin Installer, Backup and Restore dashboard using `@evcp/ui` primitives, responsive recovery layout, mobile evidence list and hash-link support for reviewer deep links.
- Added Sprint 12 unit, integration and E2E/API/UI tests and `pnpm verify:sprint12`.
- Updated planning, UI spec, design system, traceability, test plan, README and changelog.

## Verification

Primary gate:

```bash
pnpm verify:sprint12
```

Result: Passed on 2026-07-04.

Focused checks completed during implementation:

| Gate | Evidence |
| --- | --- |
| Sprint 12 unit tests | Passed: 4/4 |
| Sprint 12 integration tests | Passed: 4/4 |
| Sprint 12 E2E/API/UI smoke tests | Passed: 4/4 |
| Typecheck | Passed for Platform API and Admin Web during focused verification |
| Prisma validate | Passed with local `DATABASE_URL` |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000011_sprint12_installer_backup_restore` |
| Prisma seed | Passed |
| Full `pnpm verify:sprint12` | Passed: lint, typecheck, build, unit 57/57, integration 42/42, e2e 43/43 |

Sprint 12 count evidence:

| Table | Count |
| --- | ---: |
| `installer_reports` | 1 |
| `setup_configurations` | 1 |
| `backup_policies` | 1 |
| `backup_runs` | 1 |
| `pitr_configurations` | 1 |
| `restore_drill_reports` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint12-installer-backup-restore.png`
- `docs/assets/screenshots/sprint12-installer-backup-restore-mobile.png`
- `docs/assets/screenshots/sprint12-console-warnings.txt`

## Product Owner Decision

Accepted pending Principal review. Sprint 12 meets the production blueprint recovery gate across service, API, schema, seed data, Admin UI and regression coverage: private-server install readiness is explicit, setup secrets are redacted, backup/PITR metadata is recoverable, restore drills record pass/fail evidence, creator access is denied, and the full Sprint 0-12 verification suite passes.
