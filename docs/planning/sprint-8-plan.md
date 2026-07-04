# Sprint 8 Plan - Ticket-to-PRD + Domain + Hardening

Version: 0.1
Date: 2026-07-04
Status: Implemented and Accepted
Sprint dates: 2026-08-31 to 2026-09-04
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

ปิด MVP feedback loop จาก End User ticket ไปเป็น PRD change request พร้อม domain flow, deployment traceability, monitoring และ demo readiness สำหรับ pilot

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 8 Scope |
| --- | --- |
| S8.1 Convert ticket to PRD change request | Creator converts ticket into PRD change |
| S8.2 PRD change request approval flow | Approve/reject PRD change |
| S8.3 Domain settings UI | Internal/custom/public domain settings |
| S8.4 Public domain request UI | Request public domain exposure |
| S8.5 Domain approval API | Approve/reject domain request |
| S8.6 Deployment traceability view | Link PRD, frontend version, publish and deployment |
| S8.7 Monitoring dashboard | MVP health/audit/usage dashboard |
| S8.8 Full audit log filter | Filter audit by actor, app, event, date |
| S8.9 Demo data cleanup | Stable demo fixtures |
| S8.10 End-to-end demo script | Full pilot demo script |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 7 submitted ticket and Creator inbox |
| Domain scope | MVP request/approval flow, production TLS hardening moves to Sprint 14 |
| Monitoring scope | MVP dashboard, production observability moves to Sprint 13 |
| Release target | MVP pilot demo ready, not final production release |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S8.1 | P5-TKT-003 | Convert ticket to PRD change request | Full-stack Engineer |
| P0 | S8.2 | P3-PRD-003, P4-PUB-002 | Add PRD change approval flow | Full-stack Engineer |
| P0 | S8.3 | P4-DOM-001 | Build domain settings UI | Frontend Engineer |
| P0 | S8.4 | P4-DOM-001 | Build public domain request UI | Frontend Engineer |
| P0 | S8.5 | P4-DOM-001, P4-PUB-001 | Implement domain approval API | Platform Engineer |
| P0 | S8.6 | P4-PUB-002 | Build deployment traceability view | Full-stack Engineer |
| P0 | S8.7 | P6-OBS-001 early MVP | Build monitoring dashboard | Full-stack Engineer |
| P0 | S8.8 | P1-AUD-001 | Add full audit log filters | Platform Engineer |
| P0 | S8.9 | Demo readiness | Clean demo data | QA/Product |
| P0 | S8.10 | Demo readiness | Write end-to-end demo script | QA/Product |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| Ticket-to-PRD | Creator converts ticket into PRD change | UI/API test |
| Approval | Approve/reject updates PRD change state | API/UI test |
| Domain | Domain request and approval state persist | API/UI test |
| Traceability | Deployment view links PRD/version/publish/deploy | UI/API test |
| Monitoring | Dashboard shows core service/app status | UI/manual test |
| Audit | Filters return correct event slices | API test |
| E2E | Full Admin-Creator-End User flow works | Demo script run |

## 6. Definition of Done

- [x] Ticket converts to PRD change request.
- [x] PRD change request approval flow works.
- [x] Domain request and approval flow works.
- [x] Deployment links PRD, frontend version, publish and deployment.
- [x] Monitoring dashboard and audit filters are usable.
- [x] Demo data is stable.
- [x] Full MVP demo script is represented as a visible checklist and covered by API/UI smoke checks.
- [x] Production extension Sprint 9 can start from a validated MVP baseline after final full verification passes.

## 7. Demo Script

1. Admin configures AI provider/key and guardrail.
2. Creator creates Leave Management project and confirms PRD baseline.
3. Creator prompts change, previews app, checks database and restores frontend.
4. Creator invites End User, assigns role and publishes app.
5. End User opens App Store PWA and submits ticket.
6. Creator converts ticket to PRD change request.
7. Approve PRD change and show deployment traceability.
8. Show domain request, monitoring and audit filters.
