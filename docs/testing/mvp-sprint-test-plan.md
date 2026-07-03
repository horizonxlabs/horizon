# Enterprise Vibe Coding Platform - MVP Sprint Test Plan

Version: 0.1
Date: 2026-07-03
Status: Ready for Sprint 0-8 planning
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

## 12. Regression Suite Growth

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

## 13. Exit Rule

A sprint is not accepted if:

- P0 happy path fails.
- A security/permission deny path is untested.
- A secret appears in UI, API response or logs.
- Audit is missing for a security-sensitive action.
- UI acceptance criteria for the sprint's primary screens have no screenshot/manual evidence.
- Regression from a previous accepted sprint breaks without documented exception.
