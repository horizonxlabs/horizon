# Sprint 4 Plan - Creator Workspace: Prompt + Live Preview

Version: 0.1
Date: 2026-07-03
Status: Draft for Sprint Planning Review
Sprint dates: 2026-08-03 to 2026-08-07
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

สร้าง Creator Workspace แบบ Lovable-like ที่ Creator สามารถ prompt, เห็น AI task progress, เห็น token remaining และดู live preview ของแอปได้

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 4 Scope |
| --- | --- |
| S4.1 Workspace layout | Prompt, task, preview layout |
| S4.2 Chat/prompt panel | Prompt compose and history |
| S4.3 AI task progress component | Step progress and status |
| S4.4 Token remaining UI | Remaining quota/token display |
| S4.5 Live preview panel | Preview frame with refresh |
| S4.6 Mock app generator | Generate mock Leave Management preview |
| S4.7 Preview refresh API | Refresh latest generated preview |
| S4.8 Prompt API with guardrail check | Prompt endpoint calls guardrail first |
| S4.9 AI usage log | Persist usage event |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 3 project and PRD baseline |
| Preview scope | Mock generated UI, not production container yet |
| Guardrail scope | Reuse Sprint 2 rules and mock classifier |
| Usage scope | Record usage metadata even when AI response is mocked |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S4.1 | P3-WS-001 | Build workspace layout | Frontend Engineer |
| P0 | S4.2 | P3-WS-001 | Build chat/prompt panel | Frontend Engineer |
| P0 | S4.3 | P3-WS-001 | Build AI task progress component | Frontend Engineer |
| P0 | S4.4 | P2-AI-005, P3-WS-001 | Build token remaining UI | Full-stack Engineer |
| P0 | S4.5 | P3-WS-002 | Build live preview panel | Frontend Engineer |
| P0 | S4.6 | P4-GEN-002 early mock | Add mock app generator | Full-stack Engineer |
| P0 | S4.7 | P3-WS-002 | Add preview refresh API | Platform Engineer |
| P0 | S4.8 | P2-GRD-003, P3-WS-001 | Add guarded prompt API | Platform Engineer |
| P0 | S4.9 | P2-AI-005 | Add AI usage log | Platform Engineer |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| Workspace | Creator opens workspace for PRD baseline project | UI test |
| Prompt | Safe prompt creates task and usage log | API/UI test |
| Guardrail | Blocked prompt does not generate preview | API test |
| Progress | Task progress moves through expected statuses | UI/unit test |
| Preview | Preview refresh shows latest mock generated state | UI/API test |
| Token | Token remaining decreases after accepted prompt | Unit/API test |

## 6. Definition of Done

- [ ] Creator sends prompt from workspace.
- [ ] Guardrail checks prompt before AI/mock generation.
- [ ] Token remaining decreases for accepted prompt.
- [ ] AI task progress displays.
- [ ] Preview updates after generation.
- [ ] Sprint 5 can use preview/version output for frontend restore.

## 7. Demo Script

1. Open Leave Management project workspace.
2. Show PRD context loaded.
3. Prompt "Add WFH leave type".
4. Show guardrail check and task progress.
5. Show token remaining changed.
6. Refresh live preview and show updated mock app.
