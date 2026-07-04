# Enterprise Vibe Coding Platform - MVP Sprint Test Plan

Version: 0.1
Date: 2026-07-03
Status: Ready for Sprint 0-8 planning and production extension Sprint 9-13 verification
Related strategy: `docs/testing/mvp-test-strategy.md`

## 1. Purpose

เอกสารนี้แตก test scope ราย sprint เพื่อให้ทุก sprint มี testing outcome ชัดเจน ไม่ใช่รอทดสอบตอนท้าย MVP

## 2. Sprint Test Matrix

| Sprint | Primary Test Focus | Required Evidence |
| --- | --- | --- |
| Sprint 0 | Shells, shared UI, mock auth, mock fixtures | Build/typecheck output, component tests, screenshots |
| Sprint 1 | API health, Prisma schema, seed users, auth/me, audit log | API test output, migration/seed output, audit DB record |
| Sprint 2 | AI providers/API keys, routing, quota, guardrails | API/UI tests, secret masking evidence, guardrail event |
| Sprint 3 | Project creation, PRD draft, PRD baseline | API/UI tests, PRD version record, baseline audit |
| Sprint 4 | Prompt, guardrail check, task progress, live preview, usage log | E2E/workspace screenshot, API response, usage/audit log |
| Sprint 5 | Database view, frontend checkpoint, restore boundary | UI screenshot, restore diff, audit record, boundary assertion |
| Sprint 6 | App roles, members, invites, manifest, publish registry | API/UI tests, manifest contract test, deployment record |
| Sprint 7 | App Store PWA, access request, ticket, creator inbox | PWA screenshot, API/UI tests, ticket record |
| Sprint 8 | Ticket-to-PRD, domain request, traceability, monitoring/audit, full demo | Full E2E evidence, traceability record, demo checklist, screenshots |
| Sprint 9 | Auth SSO, Keycloak/direct IdP strategy, break-glass, policy templates | Unit/integration/E2E API/UI evidence, auth/policy DB records, screenshot |
| Sprint 10 | Generated app runtime, schema isolation, health/readiness/log/metrics, OpenAPI, migration dry-run | Unit/integration/E2E API/UI evidence, runtime DB records, screenshots |
| Sprint 11 | Knowledge/skill governance, scoped retrieval, assignment, workspace context metadata | Unit/integration/E2E API/UI evidence, governance DB records, screenshots |
| Sprint 12 | Installer, setup wizard, backup/PITR, restore drill and recovery UI | Unit/integration/E2E API/UI evidence, operations DB records, screenshots |
| Sprint 13 | Observability, telemetry export, upgrade/rollback, license validation/enforcement and data continuity | Unit/integration/E2E API/UI evidence, production/license DB records, screenshots |
| Sprint 14 | Security release readiness, upload validation, public/external checklist, redaction evidence and RTM regression | Unit/integration/E2E API/UI evidence, security release DB records, screenshots |

## 3. Sprint 0 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S0-T001 | Root workspace install/discovery works | Smoke | Command output |
| S0-T002 | Shared UI exports import in all shells | Build/typecheck | Typecheck output |
| S0-T003 | Admin shell renders with sidebar/topbar | Component/visual | Screenshot |
| S0-T004 | Creator project picker renders mock project cards | Component/visual | Screenshot |
| S0-T005 | Store PWA mobile home renders My Apps/Available Apps | Component/visual | Mobile screenshot |
| S0-T006 | Mock role switch changes navigation/access | Interaction | Test output or manual evidence |
| S0-T007 | Empty/loading/error states render for shared components | Component | Test output |

## 4. Sprint 1 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S1-T001 | Platform API health returns success envelope | API integration | HTTP response |
| S1-T002 | Prisma migration applies cleanly | Integration | Migration output |
| S1-T003 | Seed users admin/creator/end user are created | Integration | DB query/seed output |
| S1-T004 | `/auth/me` returns current user and permissions | API integration | API response |
| S1-T005 | Protected route denies missing/invalid mock user | Security/API | 401/403 response |
| S1-T006 | Audit service records login/project event | Integration | Audit DB record |
| S1-T007 | Admin audit log UI displays initial events | UI | Screenshot |

## 5. Sprint 2 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S2-T001 | Admin creates/updates/disables AI provider | API/UI | API response, screenshot |
| S2-T002 | API key secret is masked after save | Security/UI/API | UI/API response, DB inspection |
| S2-T003 | Creator cannot access AI key secret | Security/API | Denied API response, audit event |
| S2-T004 | Scenario routing resolves primary/fallback provider | Unit/API | Test output |
| S2-T005 | Quota exhausted blocks before provider call | Unit/API | Quota response, no provider call log |
| S2-T006 | Rule-based guardrail blocks banned prompt | Unit/API | Guardrail event |
| S2-T007 | Test Prompt returns allow/warn/block states | UI/API | Screenshot/API response |

## 6. Sprint 3 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S3-T001 | Creator sees only authorized projects | Security/API/UI | API response/screenshot |
| S3-T002 | Create Project Wizard validates required fields | Component/UI | Test output |
| S3-T003 | Creator creates Leave Management project | E2E/API | Project record |
| S3-T004 | PRD draft is generated from project inputs | API/integration | PRD record |
| S3-T005 | PRD viewer displays required sections | UI | Screenshot |
| S3-T006 | Confirm baseline creates immutable PRD v1.0 | API/integration | PRD version, audit |
| S3-T007 | Attempt to edit baseline directly is blocked | Negative/API | Error response |

## 7. Sprint 4 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S4-T001 | Workspace requires PRD baseline | Negative/UI/API | Blocked state |
| S4-T002 | Safe prompt creates AI task | API/UI | Task record/screenshot |
| S4-T003 | Guardrail blocked prompt does not update preview | Negative/E2E | Guardrail event, unchanged preview |
| S4-T004 | Task progress displays deterministic steps | UI | Screenshot/test output |
| S4-T005 | Live preview updates after accepted prompt | E2E/UI | Screenshot |
| S4-T006 | Token remaining decreases after accepted prompt | API/UI | Usage log |
| S4-T007 | Token exhausted blocks prompt | Negative/API/UI | Error state |

## 8. Sprint 5 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S5-T001 | Database view shows schema/table/sample records | UI/API | Screenshot/API response |
| S5-T002 | Creator cannot run raw SQL | Negative/UI/API | No UI action/API denied |
| S5-T003 | Unauthorized user cannot view app database metadata | Security/API | 403 response |
| S5-T004 | Frontend checkpoint is recorded after generation | Integration | Checkpoint record |
| S5-T005 | Compare/preview old version works | UI | Screenshot |
| S5-T006 | Restore changes active frontend version only | Integration/boundary | Diff/assertion |
| S5-T007 | Restore emits audit event | Integration | Audit record |

## 9. Sprint 6 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S6-T001 | Creator creates/assigns app role | API/UI | Role/member record |
| S6-T002 | Invite internal End User creates pending invitation | API/UI | Invitation record |
| S6-T003 | External invite shows policy warning | UI/security | Screenshot |
| S6-T004 | Access request approve/reject updates status | API/UI | Request record |
| S6-T005 | App manifest contains PRD/frontend/auth/role data | Contract | Manifest schema test |
| S6-T006 | Publish blocked when checklist fails | Negative/UI/API | Blocked state |
| S6-T007 | Published app appears in App Store registry | E2E/API | Registry record |

## 10. Sprint 7 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S7-T001 | PWA manifest and offline fallback exist | PWA/smoke | Browser/tool output |
| S7-T002 | App Store mobile home renders correctly | Visual/UI | Mobile screenshot |
| S7-T003 | My Apps/Available Apps reflect access policy | API/UI/security | API response/screenshot |
| S7-T004 | End User can request access and see pending status | E2E/API | Request record |
| S7-T005 | End User can submit bug ticket | E2E/API | Ticket record |
| S7-T006 | User cannot submit ticket for invisible app | Negative/API | 403/404 response |
| S7-T007 | Creator sees routed ticket in inbox | E2E/UI | Screenshot/API response |

## 11. Sprint 8 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S8-T001 | Creator converts ticket to PRD change request | E2E/API | Ticket/change records |
| S8-T002 | Duplicate conversion is blocked or links existing change | Negative/API/UI | Existing link state |
| S8-T003 | PRD change approval updates status and version | Integration/API | PRD version/audit |
| S8-T004 | Domain request and approval state persist | API/UI | Domain request record |
| S8-T005 | Deployment traceability links ticket, PRD, frontend, manifest and deployment | Integration/UI | Traceability page/record |
| S8-T006 | Monitoring dashboard shows core service/app status | UI/smoke | Screenshot |
| S8-T007 | Audit filters return correct event slices | API/UI | API response |
| S8-T008 | Full MVP demo flow passes | E2E/manual | Demo checklist result |

Accepted evidence on 2026-07-04:

- Unit: 39 passed, 0 failed.
- Integration: 28 passed, 0 failed.
- E2E/API/UI smoke: 27 passed, 0 failed.
- Full `pnpm verify:sprint8`: passed lint, typecheck, build, unit, integration and E2E.
- Database counts: `prd_change_requests=1`, `prd_change_decisions=1`, `domain_settings=1`, `domain_requests=1`, `deployment_trace_records=1`.
- Screenshot evidence: `docs/assets/screenshots/sprint8-creator-feedback-domain.png`, `docs/assets/screenshots/sprint8-admin-monitoring-audit.png`.

## 12. Production Extension Sprint 9 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S9-T001 | OIDC provider config masks client secret and records fingerprint | Security/API/unit | Provider response, audit event |
| S9-T002 | SAML provider config fingerprints certificate and hides raw cert | Security/API/unit | Provider response, audit event |
| S9-T003 | Keycloak defaults expose realm, clients and group mappings | Contract/API | API response |
| S9-T004 | Direct IdP constraints require Platform Auth boundary and security review | Architecture/API | ADR-005 and API response |
| S9-T005 | SSO login normalizes claims and platform/app roles | Unit/API | Auth session response |
| S9-T006 | Generated app session validation denies invalid token and missing app role | Security/API | Deny response reason |
| S9-T007 | Break-glass requires reason, TTL is 15 minutes and audit severity is critical | Security/API/unit | Error response and audit event |
| S9-T008 | Policy templates cover Public/Internal/Confidential/Restricted | Contract/integration/API | Template records and API response |
| S9-T009 | Admin Auth/SSO production readiness UI renders all required sections | UI/E2E | Screenshot and console capture |
| S9-T010 | Prisma migration and seed create Sprint 9 auth/policy records | Integration/DB | Migrate/seed output and DB counts |

Accepted evidence on 2026-07-04:

- Unit: 46 passed, 0 failed.
- Integration: 31 passed, 0 failed.
- E2E/API/UI smoke: 31 passed, 0 failed.
- Full `pnpm verify:sprint9`: passed lint, typecheck, build, unit, integration and E2E.
- Database counts: `auth_provider_configs=3`, `platform_auth_sessions=1`, `break_glass_sessions=1`, `policy_templates=4`.
- Screenshot evidence: `docs/assets/screenshots/sprint9-auth-policy.png`, `docs/assets/screenshots/sprint9-auth-policy-mobile.png`.
- Console evidence: `docs/assets/screenshots/sprint9-console-warnings.txt` recorded 0 errors or warnings.

## 13. Production Extension Sprint 10 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S10-T001 | Runtime overview exposes artifact root, required paths, app ID and deployment ID | Contract/unit/API | Runtime overview response |
| S10-T002 | Container contract exposes status, container name, image tag, route and probe endpoints | Contract/unit/API | Runtime overview response |
| S10-T003 | Schema isolation allows assigned schema and denies cross-schema access | Security/unit/API | Allow/deny response and audit event |
| S10-T004 | Health/readiness/log/metrics evidence is visible | Runtime/API/UI | Health endpoint response and Admin UI |
| S10-T005 | OpenAPI contract is linked to generated API paths | Contract/API/UI | OpenAPI response and UI section |
| S10-T006 | Migration dry-run blocks destructive changes without approval | Security/API/unit | Blocked report with required approvers |
| S10-T007 | Prisma migration and seed create Sprint 10 runtime records | Integration/DB | Migrate/seed output and DB counts |
| S10-T008 | Admin Runtime Hardening UI renders all required sections | UI/E2E | Screenshot and console capture |

Accepted evidence on 2026-07-04:

- Unit: 50 passed, 0 failed.
- Integration: 34 passed, 0 failed.
- E2E/API/UI smoke: 35 passed, 0 failed.
- Full `pnpm verify:sprint10`: passed lint, typecheck, build, unit, integration and E2E.
- Database counts: `generated_app_runtimes=1`, `generated_app_schema_grants=1`, `generated_app_health_checks=1`, `generated_app_runtime_logs=1`, `generated_app_runtime_metrics=1`, `generated_app_openapi_contracts=1`, `generated_app_migration_reports=1`.
- Screenshot evidence: `docs/assets/screenshots/sprint10-runtime-hardening.png`, `docs/assets/screenshots/sprint10-runtime-hardening-mobile.png`.
- Console evidence: `docs/assets/screenshots/sprint10-console-warnings.txt` recorded 0 errors or warnings.

## 14. Production Extension Sprint 11 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S11-T001 | Knowledge source/version/approval lifecycle works | Governance/unit/API | Source, version, approval and audit response |
| S11-T002 | Knowledge retrieval filters by actor, project, app, department, role and scenario | Security/unit/API | Retrieval response and denied reasons |
| S11-T003 | Skill lifecycle stores version contract and approval | Governance/unit/API | Skill, version, schema/tool contract and approval |
| S11-T004 | Skill assignment resolves approved active version by role/scenario/scope | Governance/unit/API | Skill resolve metadata |
| S11-T005 | Disabled skills and pending versions are excluded | Security/unit/API | Validation/no-match response |
| S11-T006 | Workspace prompt returns governed knowledge and skill metadata | Workflow/unit/E2E | Prompt result task metadata |
| S11-T007 | Prisma migration and seed create Sprint 11 governance records | Integration/DB | Migrate/seed output and DB counts |
| S11-T008 | Admin Knowledge and Skill Governance UI renders required sections | UI/E2E | Screenshot and console capture |

Current evidence on 2026-07-04:

- Focused Unit: 3 passed, 0 failed.
- Focused Integration: 4 passed, 0 failed.
- Focused E2E/API/UI smoke: 4 passed, 0 failed.
- Typecheck: 10 workspace projects passed.
- Platform API build: passed.
- Admin Web build: passed.
- Prisma validate/generate: passed.
- Full `pnpm verify:sprint11`: passed lint, typecheck, build, unit 53/53, integration 38/38, E2E/API/UI 39/39.
- Database counts: `knowledge_sources=1`, `knowledge_versions=1`, `knowledge_approvals=1`, `knowledge_index_chunks=1`, `knowledge_retrieval_logs=1`, `skill_definitions=1`, `skill_versions=1`, `skill_approvals=1`, `skill_assignments=1`.
- Screenshot evidence: `docs/assets/screenshots/sprint11-knowledge-skill-governance.png`, `docs/assets/screenshots/sprint11-knowledge-skill-governance-mobile.png`.
- Console evidence: `docs/assets/screenshots/sprint11-console-warnings.txt` recorded 0 errors or warnings.

## 15. Production Extension Sprint 12 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S12-T001 | Installer preflight creates pass/fail install reports | Operations/unit/API | Checks, installBlocked and actionable failures |
| S12-T002 | Local setup wizard stores config without exposing secrets | Security/unit/API | Masked database URL and redacted storage/auth values |
| S12-T003 | Backup policy and run create encrypted artifact metadata | Backup/unit/API | Artifact URI, checksum, size and audit event |
| S12-T004 | Storage contract supports MinIO and S3-compatible targets | Backup/unit/API | Provider-neutral artifact metadata |
| S12-T005 | PostgreSQL PITR records WAL retention and RPO/RTO | Recovery/unit/API | PITR config response |
| S12-T006 | Restore drill pass/fail reports are explicit and audited | Recovery/unit/API | Validation checks, failed checks and critical audit |
| S12-T007 | Prisma migration and seed create Sprint 12 operations records | Integration/DB | Migrate/seed output and DB counts |
| S12-T008 | Admin Installer Backup Restore UI renders required sections | UI/E2E | Screenshot and console capture |

Current focused evidence on 2026-07-04:

- Focused Unit: 4 passed, 0 failed.
- Focused Integration: 4 passed, 0 failed.
- Focused E2E/API/UI smoke: 4 passed, 0 failed.
- Platform API typecheck: passed.
- Admin Web typecheck: passed.
- Prisma validate: passed.
- Prisma generate: passed.
- Prisma migrate deploy: passed, applied `20260703000011_sprint12_installer_backup_restore`.
- Prisma seed: passed.
- Full `pnpm verify:sprint12`: passed lint, typecheck, build, unit 57/57, integration 42/42, E2E/API/UI 43/43.
- Database counts: `installer_reports=1`, `setup_configurations=1`, `backup_policies=1`, `backup_runs=1`, `pitr_configurations=1`, `restore_drill_reports=1`.
- Screenshot evidence: `docs/assets/screenshots/sprint12-installer-backup-restore.png`, `docs/assets/screenshots/sprint12-installer-backup-restore-mobile.png`.
- Console evidence: `docs/assets/screenshots/sprint12-console-warnings.txt` recorded 0 errors or warnings.

## 16. Production Extension Sprint 13 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S13-T001 | Admin observability dashboard exposes core service, generated app, queue, retention and telemetry state | Observability/unit/API/UI | Dashboard response and Admin UI |
| S13-T002 | Creator cannot read Admin observability or license install routes | Security/API | 403 response |
| S13-T003 | Upgrade compatibility blocks unsafe target when disk, backup, service health or license checks fail | Operations/unit/API | Blocked report and audit |
| S13-T004 | Rollback report records from/to version, reason, rollback window and audit | Operations/unit/API | Rollback response |
| S13-T005 | Signed license install validates payload, stores fingerprints and detects tamper | License/unit/API | License response and tamper audit |
| S13-T006 | Offline license validation uses signed cache until offline validity expires | License/unit/API | Validation log |
| S13-T007 | License enforcement blocks publish, AI generation, new app, invite and activation when policy requires | License/security/unit/API | Enforcement response |
| S13-T008 | Existing generated apps remain runnable and data is preserved under license enforcement | Continuity/E2E/API | `run_existing_app` allow response |
| S13-T009 | Prisma migration and seed create Sprint 13 production/license records | Integration/DB | Migrate/seed output and DB counts |
| S13-T010 | Admin Observability and License UI renders required sections | UI/E2E | Screenshot and console capture |

Current evidence on 2026-07-04:

- Focused Unit: 4 passed, 0 failed.
- Focused Integration: 3 passed, 0 failed.
- Focused E2E/API/UI smoke: 3 passed, 0 failed.
- Platform API typecheck: passed.
- Admin Web typecheck: passed.
- Prisma validate: passed with local `DATABASE_URL`.
- Prisma generate: passed.
- Prisma migrate deploy: passed, applied `20260703000012_sprint13_observability_license`.
- Prisma seed: passed.
- Full `pnpm verify:sprint13`: passed lint, typecheck, build, unit 61/61, integration 45/45, E2E/API/UI 46/46.
- Database counts: `service_health_snapshots=1`, `telemetry_export_configs=1`, `upgrade_compatibility_reports=1`, `rollback_reports=1`, `license_records=1`, `license_validation_logs=1`, `license_enforcement_events=1`.
- Screenshot evidence: `docs/assets/screenshots/sprint13-observability-license.png`, `docs/assets/screenshots/sprint13-observability-license-mobile.png`, `docs/assets/screenshots/sprint13-license-enforcement-mobile.png`.
- Console evidence: `docs/assets/screenshots/sprint13-console-warnings.txt` recorded 0 errors or warnings.

## 17. Production Extension Sprint 14 Tests

| Test ID | Test | Type | Evidence |
| --- | --- | --- | --- |
| S14-T001 | Admin readiness dashboard exposes TLS, session, secret redaction, upload, checklist and RTM state | Security/unit/API/UI | Readiness response and Admin UI |
| S14-T002 | Creator cannot read Admin security readiness route | Security/API | 403 response |
| S14-T003 | Upload validation allows safe PDF and blocks unsupported or oversize file | Upload/unit/API | Upload decision response |
| S14-T004 | Pending/failed malware scan state is quarantined before ingestion | Upload/unit/API | Quarantine decision response |
| S14-T005 | Public/external release checklist blocks until auth, permissions, domain, TLS, data and audit checks pass | Security/unit/API | Checklist report |
| S14-T006 | Sensitive prompt, ticket and request payload values are redacted | Security/unit/API | Redaction evidence response |
| S14-T007 | Prisma migration and seed create Sprint 14 security release records without plaintext secret columns | Integration/DB | Migrate/seed output and DB counts |
| S14-T008 | Admin Security Release Readiness UI renders required sections and mobile checklist list | UI/E2E | Screenshot and console capture |

Current focused evidence on 2026-07-04:

- Focused Unit: 4 passed, 0 failed.
- Focused Integration: 3 passed, 0 failed.
- Focused E2E/API/UI smoke: 3 passed, 0 failed.
- Full `pnpm verify:sprint14`: passed lint, typecheck, build, unit 65/65, integration 48/48, E2E/API/UI 49/49.
- Prisma migrate deploy: passed, applied `20260703000013_sprint14_security_release_readiness`.
- Prisma generate and seed: passed.
- Database counts: `security_readiness_reports=1`, `security_readiness_checks=1`, `upload_scan_events=1`, `release_checklist_reports=1`, `sensitive_redaction_evidence=1`.
- Screenshot evidence: `docs/assets/screenshots/sprint14-security-release-readiness.png`, `docs/assets/screenshots/sprint14-security-release-readiness-mobile.png`.
- Console evidence: `docs/assets/screenshots/sprint14-console-warnings.txt` recorded 0 errors or warnings.

## 18. Regression Suite Growth

| After Sprint | Regression Must Include |
| --- | --- |
| Sprint 0 | Shell render, role switch, shared UI import |
| Sprint 1 | Sprint 0 + API health, auth/me, audit |
| Sprint 2 | Sprint 1 + AI key masking, guardrail block |
| Sprint 3 | Sprint 2 + project create, PRD baseline |
| Sprint 4 | Sprint 3 + prompt/live preview happy and blocked paths |
| Sprint 5 | Sprint 4 + database view and frontend restore boundary |
| Sprint 6 | Sprint 5 + invite, role, manifest, publish registry |
| Sprint 7 | Sprint 6 + App Store PWA, ticket, creator inbox |
| Sprint 8 | Full MVP E2E demo and traceability |
| Sprint 9 | Sprint 8 + auth provider config, Platform Auth session validation, break-glass, policy templates |
| Sprint 10 | Sprint 9 + runtime overview, schema isolation, health/OpenAPI and migration dry-run |
| Sprint 11 | Sprint 10 + knowledge retrieval, skill resolution, workspace context metadata and governance UI |
| Sprint 12 | Sprint 11 + installer preflight, setup redaction, backup/PITR, restore drill and recovery UI |
| Sprint 13 | Sprint 12 + observability dashboard, telemetry export, upgrade/rollback, license validation/enforcement and existing app continuity |
| Sprint 14 | Sprint 13 + security release readiness, upload quarantine, public/external checklist and redaction evidence |

## 19. Exit Rule

A sprint is not accepted if:

- P0 happy path fails.
- A security/permission deny path is untested.
- A secret appears in UI, API response or logs.
- Audit is missing for a security-sensitive action.
- UI acceptance criteria for the sprint's primary screens have no screenshot/manual evidence.
- Regression from a previous accepted sprint breaks without documented exception.
