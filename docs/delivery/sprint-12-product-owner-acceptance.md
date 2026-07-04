# Sprint 12 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-04
Status: Accepted pending Principal review

## 1. Acceptance Principle

Sprint 12 is accepted only if the private-server deployment path can be inspected and recovered as an integrated production blueprint contract: preflight blocks unsafe installs, setup evidence masks secrets, backups are encrypted and linked to retention policy, PostgreSQL PITR metadata is recorded, restore drill failures cannot be misread as success, and previous sprint behavior remains green.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Installer preflight pass/fail and actionable failures work | Unit and E2E/API output | Passed |
| Setup wizard stores config without secret leakage | Unit and E2E/API output | Passed |
| Backup policy/run metadata supports MinIO and S3-compatible storage | Unit and E2E/API output | Passed |
| PostgreSQL PITR records WAL retention, base backup and RPO/RTO | Unit and E2E/API output | Passed |
| Restore drill pass/fail reports and critical audit work | Unit and E2E/API output | Passed |
| Prisma migration and seed include Sprint 12 operations records | Integration and DB count evidence | Passed |
| Admin Installer Backup Restore UI renders desktop/mobile evidence | UI screenshot and console evidence | Passed |
| Sprint 0-11 regression tests remain green | `pnpm verify:sprint12` | Passed |

## 3. Product Owner Checklist

- [x] Admin can create a preflight report with pass/fail checks.
- [x] Failed preflight sets `installBlocked=true` and returns actionable failures.
- [x] Setup configuration masks database URL and redacts unsafe nested secret values.
- [x] Backup policy records schedule, retention, storage target and encryption key reference.
- [x] Backup run records encrypted artifact URI, checksum, size and trigger.
- [x] PITR configuration links to a base backup and records WAL retention/RPO/RTO.
- [x] Restore drill records validation checks, failed checks and recovery status.
- [x] Failed restore drill writes critical audit severity and does not mark recovery verified.
- [x] Creator role is denied from installer and backup overview routes.
- [x] Admin UI includes Installer, Backup and Restore dashboard with desktop and mobile states.
- [x] Admin UI uses design-system primitives and has no captured console warnings/errors.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified against PostgreSQL.
- [x] Screenshot and console evidence are captured.
- [ ] Principal Engineer review approves the PR.

## 4. Verification Evidence

Commands executed for acceptance:

```bash
pnpm verify:sprint12
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma validate --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma generate --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:admin
```

Current results:

| Evidence | Result |
| --- | --- |
| Focused Sprint 12 unit tests | Passed: 4/4 |
| Focused Sprint 12 integration tests | Passed: 4/4 |
| Focused Sprint 12 E2E/API/UI smoke tests | Passed: 4/4 |
| `pnpm verify:sprint12` | Passed: lint, typecheck, build, unit 57/57, integration 42/42, e2e 43/43 |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000011_sprint12_installer_backup_restore` |
| Prisma seed | Passed |
| DB count query | `installer_reports=1`, `setup_configurations=1`, `backup_policies=1`, `backup_runs=1`, `pitr_configurations=1`, `restore_drill_reports=1` |
| Browser console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint12-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint12-installer-backup-restore.png`, `docs/assets/screenshots/sprint12-installer-backup-restore-mobile.png` |

## 5. Rejection Rules

Reject Sprint 12 if:

- Preflight passes when required CPU, RAM, disk, Docker, Compose, port, DNS, TLS or network checks fail.
- Setup response or persisted evidence exposes plaintext database password, storage secret or auth secret.
- Backup runs can complete without an active policy or encryption key reference.
- PITR configuration references a missing base backup run.
- Restore drill failure marks `recoveryVerified=true` or omits failed checks.
- Creator or End User can read or mutate installer/backup operations routes.
- Prisma schema, migration or seed records are missing.
- Admin UI omits required recovery sections, clips evidence on mobile or logs browser warnings/errors.
- Regression from a previous accepted sprint breaks without documented exception.

## 6. Product Owner Decision

Accepted pending Principal review. Sprint 12 is approved for review because install readiness, setup redaction, backup metadata, PITR readiness and restore drill evidence now work together across service, API, persistence, Admin UI and automated regression gates.
