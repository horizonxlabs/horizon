# Sprint 2 Plan - Admin Console: AI Keys and Guardrails

Version: 0.1
Date: 2026-07-03
Status: Draft for Sprint Planning Review
Sprint dates: 2026-07-20 to 2026-07-24
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

สร้าง Admin Console สำหรับตั้งค่า AI providers, API keys, routing, quota และ guardrails เพื่อให้ทุก AI call ของแพลตฟอร์มอยู่ภายใต้ governance ตั้งแต่ต้น

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 2 Scope |
| --- | --- |
| S2.1 Build AI provider UI | Provider list/create/edit UI |
| S2.2 Build API key UI | Masked API key create/rotate/delete UI |
| S2.3 Build scenario routing UI | Route scenarios to provider/model |
| S2.4 Build quota UI | Configure org/user/app quota |
| S2.5 Implement AI provider APIs | Provider/model CRUD APIs |
| S2.6 Implement API key APIs with encryption-ready storage | Persist encrypted or encryption-ready key records |
| S2.7 Build guardrail UI | Keyword/regex/policy guardrail UI |
| S2.8 Implement rule-based guardrail APIs | Rule CRUD and test API |
| S2.9 Implement AI policy guardrail mock classifier | Mock classifier for allow/warn/block |
| S2.10 Add guardrail event log | Persist guardrail decisions |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 1 Platform API, mock auth, roles, audit |
| Provider scope | External AI providers only |
| Adapter scope | Provider Adapter contract supports adding providers later |
| Secret policy | Secrets are never returned in plaintext after save |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S2.1, S2.5 | P2-AI-001, P2-AI-002 | Build provider UI and provider APIs | Full-stack Engineer |
| P0 | S2.2, S2.6 | P2-AI-002, SEC-002 | Build API key UI and encrypted key APIs | Platform Engineer |
| P0 | S2.3 | P2-AI-003 | Configure scenario routing and fallback | Full-stack Engineer |
| P0 | S2.4 | P2-AI-004 | Configure quota rules | Full-stack Engineer |
| P0 | S2.7, S2.8 | P2-GRD-001 | Build rule-based guardrail management | Full-stack Engineer |
| P0 | S2.9 | P2-GRD-002 | Add AI policy guardrail mock classifier | AI/Platform Engineer |
| P0 | S2.10 | P2-GRD-003, P1-AUD-001 | Add guardrail event log | Platform Engineer |
| P1 | Test Console | P2-GRD-003 | Add prompt test panel for allow/warn/block | Frontend Engineer |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| Provider | Admin can create/update/disable provider | API/UI test |
| API key | Key is masked after save and omitted from responses | API test |
| Routing | Scenario resolves expected provider/model/fallback | Unit test |
| Quota | Quota blocks before provider call | Unit/API test |
| Guardrail | Keyword/regex rule blocks matching prompt | Unit/API test |
| Classifier | Mock classifier returns allow/warn/block | Unit test |
| Audit/event | Guardrail decision is logged | DB query/test |

## 6. Definition of Done

- [ ] Admin can add AI provider and API key without exposing secret after save.
- [ ] Admin can configure scenario routing, fallback and quota.
- [ ] Admin can create banned keyword and AI policy rules.
- [ ] Test prompt returns allow, warn or block.
- [ ] Guardrail decisions are logged and tied to actor/context.
- [ ] Sprint 3 PRD generation can call governed AI/mock AI path.

## 7. Demo Script

1. Login as Admin.
2. Add external AI provider and API key.
3. Configure Creator PRD generation scenario route.
4. Configure quota.
5. Add banned keyword guardrail.
6. Test safe prompt and blocked prompt.
7. Show guardrail event log.
