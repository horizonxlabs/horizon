# Sprint 0 Plan - Foundation and Design System

Version: 0.1  
Date: 2026-07-03  
Status: Draft for Sprint Planning Review  
Sprint dates: 2026-07-06 to 2026-07-10  
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

เตรียม monorepo, shared design system, mock data, app shells และ mock auth skeleton เพื่อให้ Admin, Creator และ App Store surfaces เริ่มพัฒนาในแนวทางเดียวกัน

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 0 Scope |
| --- | --- |
| S0.1 Generate monorepo structure | Create workspace folders and root package setup |
| S0.2 Create shared UI package | Create shared UI package and base components |
| S0.3 Create app shell for Admin / Creator / Store | Create three frontend shells |
| S0.4 Create mock auth provider | Add mock login and role context |
| S0.5 Create shared API client | Add shared API client with response envelope |
| S0.6 Create mock data fixtures | Add admin/creator/end-user fixtures |
| S0.7 Create base layout components | Add sidebar, topbar, cards, tables, tabs basics |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Team model | 1-3 developers + AI coding assistant |
| Primary outcome | Three runnable app shells with shared UI and mock auth |
| Backend scope | No real backend logic in Sprint 0 |
| UI language | Thai primary with technical terms in English |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S0.1 | P0-FND-001 | Generate monorepo structure | Platform Engineer |
| P0 | S0.2 | P0-FND-003 | Create shared UI package | Frontend Engineer |
| P0 | S0.3 | P0-FND-003 | Create Admin, Creator and App Store app shells | Frontend Engineer |
| P0 | S0.4 | early P1-AUTH-001 mock | Create mock auth provider and role guard | Frontend Engineer |
| P0 | S0.5 | P0-FND-003, P0-FND-005 | Create shared API client | Platform Engineer |
| P0 | S0.6 | P0-FND-003 | Create mock data fixtures | Frontend Engineer |
| P0 | S0.7 | P0-FND-003 | Create base layout components | Frontend Engineer |
| P1 | Docs | P0-FND-007 | Add docs index and local setup notes | QA / Product Reviewer |

## 5. Task Breakdown

### S0.1 - Generate Monorepo Structure

**Tasks:**
- Create root workspace config.
- Create `apps/admin-web`, `apps/creator-web`, `apps/app-store-pwa`, `apps/platform-api`.
- Create `packages/ui`, `packages/types`, `packages/config`, `packages/api-client`, `packages/auth-sdk`.
- Create `generated-apps/.gitkeep`, `docker/`, and `docs/` index structure.

**Acceptance:** Repository folders match the MVP and ADR-003 boundaries.

### S0.2 - Create Shared UI Package

**Tasks:**
- Add base theme tokens.
- Add Button, Input, Select, Card, Table, Badge, Tabs, Modal, Drawer, Toast, Sidebar, Topbar, StatusPill, MetricCard, EmptyState, Timeline exports.
- Keep components simple and mock-data friendly.

**Acceptance:** All three app shells can import shared UI components.

### S0.3 - Create App Shells

**Tasks:**
- Create Admin Console shell.
- Create Creator App shell.
- Create App Store PWA shell.
- Use shared sidebar/topbar/layout components.

**Acceptance:** Each shell renders with role-appropriate navigation.

### S0.4 - Create Mock Auth Provider

**Tasks:**
- Add mock users: admin, creator, end_user.
- Add login/logout flow.
- Add role-based route guard.
- Add current user context.

**Acceptance:** Switching mock roles changes accessible surface.

### S0.5 - Create Shared API Client

**Tasks:**
- Define success and error response envelopes.
- Add mock fetch/client wrapper.
- Add typed API result helpers.

**Acceptance:** App shells can consume mock API responses through shared client.

### S0.6 - Create Mock Data Fixtures

**Tasks:**
- Add mock AI providers, guardrails, projects, PRDs, apps, tickets and users.
- Keep fixtures close to MVP Leave Management demo.

**Acceptance:** App shells render realistic demo states without backend logic.

### S0.7 - Create Base Layout Components

**Tasks:**
- Add base dashboard layout.
- Add app workspace layout skeleton.
- Add mobile-first App Store shell layout.

**Acceptance:** UI follows MVP wireframes at shell level.

## 6. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| Workspace | Install dependencies and discover workspaces | Command output |
| App shells | Admin, Creator and Store render | Screenshots or dev server output |
| Shared UI | Components import in all surfaces | Build/typecheck output |
| Mock auth | Role switch changes route access | Manual test or unit test |
| Mock data | Shells render fixtures | UI screenshot |
| API client | Success/error envelopes work | Unit test |

## 7. Definition of Done

- [ ] Admin, Creator and App Store shells run.
- [ ] Shared UI package is imported by all shells.
- [ ] Mock login/logout and role-based routing work.
- [ ] Mock fixtures support Leave Management demo seed state.
- [ ] Root build/typecheck/lint/test commands are introduced or documented.
- [ ] No real secrets are committed.
- [ ] Sprint 1 Platform API work can start without restructuring Sprint 0 output.

## 8. Demo Script

1. Start all three app shells.
2. Login as Admin and show Admin Console shell.
3. Switch to Creator and show Project Picker shell.
4. Switch to End User and show App Store PWA shell.
5. Show shared UI components reused across surfaces.
6. Show mock Leave Management data rendered from fixtures.
