# Sprint 13 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-04
Status: Accepted pending Principal review

## 1. Acceptance Principle

Sprint 13 is accepted only if the private-server production path can be operated and governed as an integrated platform contract: Admin can inspect health and telemetry, unsafe upgrades cannot proceed, rollback evidence is retained, license validation handles signed payload/offline cache/tamper states, license enforcement blocks privileged new actions, and existing app data remains safe.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Observability dashboard reports core service/app/queue/retention/telemetry state | Unit and E2E/API output | Passed |
| Admin-only production and license routes deny Creator access | E2E/API output | Passed |
| Upgrade compatibility blocks unsafe state and records audit | Unit and E2E/API output | Passed |
| Rollback report records version/window/reason/status | Unit and E2E/API output | Passed |
| License install/validate handles signed payload, tamper and offline cache | Unit and E2E/API output | Passed |
| License enforcement blocks privileged actions while preserving existing app usage | Unit and E2E/API output | Passed |
| Prisma migration and seed include Sprint 13 production/license records | Integration and DB count evidence | Passed |
| Admin Observability and License UI renders desktop/mobile evidence | UI screenshot and console evidence | Passed |
| Sprint 0-12 regression tests remain green | `pnpm verify:sprint13` | Passed |

## 3. Product Owner Checklist

- [x] Admin can view core service health, generated app health, queue backpressure, retention and telemetry export state.
- [x] Creator role is denied from Admin observability and license install routes.
- [x] Upgrade compatibility blocks unsafe disk, backup, service health or license state.
- [x] Rollback report includes from version, to version, reason, rollback window and succeeded status.
- [x] License install validates signed payload and stores fingerprints rather than plaintext secret material.
- [x] Tampered license payload is detected and audited.
- [x] Offline validation uses cache while valid and marks expiry after cache window.
- [x] License enforcement blocks publish, AI generation, new app, external invite and activation when policy requires.
- [x] Existing generated app usage remains allowed through `run_existing_app`.
- [x] Enforcement response sets `preserveExistingData=true`.
- [x] Admin UI includes Observability and License dashboard with desktop and mobile states.
- [x] Admin UI uses design-system primitives and has no captured console warnings/errors.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified against PostgreSQL.
- [x] Screenshot and console evidence are captured.
- [ ] Principal Engineer review approves the PR.

## 4. Verification Evidence

Commands executed for acceptance:

```bash
pnpm verify:sprint13
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
| Focused Sprint 13 unit tests | Passed: 4/4 |
| Focused Sprint 13 integration tests | Passed: 3/3 |
| Focused Sprint 13 E2E/API/UI smoke tests | Passed: 3/3 |
| `pnpm verify:sprint13` | Passed: lint, typecheck, build, unit 61/61, integration 45/45, e2e 46/46 |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000012_sprint13_observability_license` |
| Prisma seed | Passed |
| DB count query | `service_health_snapshots=1`, `telemetry_export_configs=1`, `upgrade_compatibility_reports=1`, `rollback_reports=1`, `license_records=1`, `license_validation_logs=1`, `license_enforcement_events=1` |
| Browser console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint13-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint13-observability-license.png`, `docs/assets/screenshots/sprint13-observability-license-mobile.png`, `docs/assets/screenshots/sprint13-license-enforcement-mobile.png` |

## 5. Rejection Rules

Reject Sprint 13 if:

- Admin observability omits core service, generated app, queue, retention or telemetry evidence.
- Creator or End User can access Admin production/license routes.
- Upgrade compatibility passes when backup, disk, service health or license checks fail.
- Rollback report omits from/to version, reason, status or rollback window.
- License storage exposes plaintext license secret, private key or raw signature secret.
- Tampered license payload is accepted as active.
- Offline cache remains valid after its configured expiry.
- License enforcement deletes data or blocks existing app usage.
- Prisma schema, migration or seed records are missing.
- Admin UI omits required production/license sections, clips enforcement evidence on mobile or logs browser warnings/errors.
- Regression from a previous accepted sprint breaks without documented exception.

## 6. Product Owner Decision

Accepted pending Principal review. Sprint 13 is approved for review because observability, upgrade/rollback safety, license validation and license enforcement now work together across service, API, persistence, Admin UI and automated regression gates.
