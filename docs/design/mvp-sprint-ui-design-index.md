# Enterprise Vibe Coding Platform - MVP Sprint UI Design Index

Version: 0.1
Date: 2026-07-03
Status: Complete for MVP Sprint 0-8 design planning and production extension Sprint 9-11 start

## 1. Purpose

เอกสารนี้เป็น index สำหรับ UX/UI design specs ราย sprint เพื่อให้ทีม frontend ใช้คู่กับ sprint plans โดยตรง ก่อนเริ่ม sprint ใดให้เปิด sprint plan และ UI spec ของ sprint นั้นพร้อมกัน

## 2. Design Spec Map

| Sprint | UI Spec | Planning Spec | Visible Outcome |
| --- | --- | --- | --- |
| Sprint 0 | `docs/design/sprint-0-ui-spec.md` | `docs/planning/sprint-0-plan.md` | Shared UI, shells, mock auth, mock data |
| Sprint 1 | `docs/design/sprint-1-ui-spec.md` | `docs/planning/sprint-1-plan.md` | Current user, API health, audit display patterns |
| Sprint 2 | `docs/design/sprint-2-ui-spec.md` | `docs/planning/sprint-2-plan.md` | Admin AI provider/key/routing/quota/guardrail UI |
| Sprint 3 | `docs/design/sprint-3-ui-spec.md` | `docs/planning/sprint-3-plan.md` | Creator project picker, create wizard, PRD viewer/baseline |
| Sprint 4 | `docs/design/sprint-4-ui-spec.md` | `docs/planning/sprint-4-plan.md` | Creator workspace, prompt, task progress, live preview |
| Sprint 5 | `docs/design/sprint-5-ui-spec.md` | `docs/planning/sprint-5-plan.md` | Database view and frontend version restore |
| Sprint 6 | `docs/design/sprint-6-ui-spec.md` | `docs/planning/sprint-6-plan.md` | App users, roles, invite, manifest, publish |
| Sprint 7 | `docs/design/sprint-7-ui-spec.md` | `docs/planning/sprint-7-plan.md` | End User App Store PWA, request access, ticket |
| Sprint 8 | `docs/design/sprint-8-ui-spec.md` | `docs/planning/sprint-8-plan.md` | Ticket-to-PRD, domain flow, traceability, monitoring/audit |
| Sprint 9 | `docs/design/sprint-9-ui-spec.md` | `docs/planning/sprint-9-plan.md` | Auth/SSO production readiness, Platform Auth boundary, break-glass, policy templates |
| Sprint 10 | `docs/design/sprint-10-ui-spec.md` | `docs/planning/sprint-10-plan.md` | Generated app runtime hardening, container contract, schema isolation, OpenAPI and migration dry-run |
| Sprint 11 | `docs/design/sprint-11-ui-spec.md` | `docs/planning/sprint-11-plan.md` | Knowledge and skill governance, scoped retrieval, skill assignment, workspace context metadata |

## 3. How to Use

Baseline system:

- Design system: `docs/design/design-system.md`
- Shared implementation: `packages/ui/src/index.tsx`
- Shared tokens/styles: `packages/ui/styles.css`

For each sprint:

1. Read the sprint plan for scope and acceptance.
2. Read the matching UI spec for screens, states and components.
3. Reuse `@evcp/ui` components and tokens before creating feature-specific UI.
4. Capture screenshot evidence for the acceptance criteria.
5. Update the UI spec if implementation changes behavior.

## 4. Design Completion Status

| Area | Status |
| --- | --- |
| Sprint 0-8 screen-level UX/UI specs | Complete |
| Sprint 9-11 production extension UI specs | Complete |
| Shared component baseline | Complete for MVP |
| User flows | Complete for MVP |
| Responsive rules | Complete for MVP |
| Accessibility requirements | Complete for MVP |
| High-fidelity visual mockups | Not required for MVP start; optional before pilot |
| Design tokens and reusable UI primitives | Implemented in `@evcp/ui` |
