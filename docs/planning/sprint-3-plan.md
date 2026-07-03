# Sprint 3 Plan - Creator Project Picker + PRD Generation

Version: 0.1
Date: 2026-07-03
Status: Draft for Sprint Planning Review
Sprint dates: 2026-07-27 to 2026-07-31
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

ให้ Creator สร้าง project ได้จากหน้า Project Picker และสร้าง/ยืนยัน PRD baseline แรกสำหรับ Leave Management demo ได้ครบ

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 3 Scope |
| --- | --- |
| S3.1 Creator project picker UI | Project list and empty state |
| S3.2 Create project wizard | Capture app name, problem, app type, users, sensitivity |
| S3.3 Project APIs | Project CRUD and membership checks |
| S3.4 PRD data model | PRD document, section, version and baseline fields |
| S3.5 PRD generation mock service | Deterministic PRD generator |
| S3.6 PRD viewer UI | Structured PRD viewer |
| S3.7 PRD version history | Version timeline |
| S3.8 Confirm PRD baseline | Confirm immutable v1.0 baseline |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 2 governed AI/mock AI path |
| Demo app | Leave Management |
| PRD generator | Mock deterministic output is acceptable for MVP |
| Baseline policy | Confirmed PRD version is immutable |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S3.1 | P3-CRE-001 | Build Creator project picker UI | Frontend Engineer |
| P0 | S3.2 | P3-CRE-001 | Build create project wizard | Frontend Engineer |
| P0 | S3.3 | P3-CRE-001, P1-CORE-002 | Implement project APIs | Platform Engineer |
| P0 | S3.4 | P3-PRD-001, P3-PRD-002 | Add PRD data model | Platform Engineer |
| P0 | S3.5 | P3-PRD-001 | Add PRD generation mock service | AI/Platform Engineer |
| P0 | S3.6 | P3-PRD-002 | Build PRD viewer UI | Frontend Engineer |
| P0 | S3.7 | P3-PRD-002 | Add PRD version history | Full-stack Engineer |
| P0 | S3.8 | P3-PRD-002 | Add confirm baseline action | Full-stack Engineer |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| Project | Creator can create project and sees it in picker | UI/API test |
| Permission | Creator cannot see unauthorized project | API test |
| PRD | PRD draft is generated from project inputs | API/unit test |
| Version | PRD version history records draft and baseline | DB/test |
| Baseline | Confirmed PRD cannot be modified in place | API test |
| Audit | Project create and baseline confirm are audited | DB/test |

## 6. Definition of Done

- [ ] Creator sees own projects.
- [ ] Creator creates Leave Management project.
- [ ] System generates PRD draft.
- [ ] Creator can view PRD sections and version history.
- [ ] Creator confirms PRD v1.0 baseline.
- [ ] Sprint 4 workspace can load project and PRD context.

## 7. Demo Script

1. Login as Creator.
2. Open Project Picker.
3. Create Leave Management project.
4. Generate PRD draft.
5. Review PRD viewer and version history.
6. Confirm PRD v1.0 baseline.
