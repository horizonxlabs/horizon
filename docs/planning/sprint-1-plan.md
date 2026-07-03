# Sprint 1 Plan - Platform API Foundation

Version: 0.2
Date: 2026-07-03
Status: Draft for Sprint Planning Review
Sprint dates: 2026-07-13 to 2026-07-17
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

สร้าง backend core, database schema เริ่มต้น, auth mock/guard, seed data และ basic audit log ตาม Sprint 1 ในเอกสาร MVP ตั้งต้น

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 1 Scope |
| --- | --- |
| S1.1 Create NestJS platform-api | Scaffold platform API service |
| S1.2 Setup Prisma schema base | Add Prisma base schema and migration |
| S1.3 Add users/groups/roles tables | Add identity tables |
| S1.4 Add projects/apps basic tables | Add project and app tables |
| S1.5 Add audit log service | Add audit log service |
| S1.6 Add seed users: admin, creator, end user | Add seed data |
| S1.7 Add auth guard mock | Add mock auth guard and `/auth/me` |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Team model | 1-3 developers + AI coding assistant |
| Depends on | Sprint 0 app shells, shared API client and workspace structure |
| Primary outcome | Platform API running with PostgreSQL, Prisma, seed data, `/auth/me` and audit |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S1.1 | P1-CORE-001 | Create NestJS platform-api | Platform Engineer |
| P0 | S1.2 | P1-CORE-002 | Setup Prisma schema base | Platform Engineer |
| P0 | S1.3 | P1-CORE-002 | Add users/groups/roles tables | Platform Engineer |
| P0 | S1.4 | P1-CORE-002 | Add projects/apps basic tables | Platform Engineer |
| P0 | S1.5 | P1-AUD-001 | Add audit log service | Platform Engineer |
| P0 | S1.6 | P1-CORE-002 | Add seed users: admin, creator, end user | Platform Engineer |
| P0 | S1.7 | P1-RBAC-001 | Add auth guard mock and `/auth/me` | Platform Engineer |
| P1 | Docker | P0-FND-004 | Connect API and PostgreSQL through Compose | Platform Engineer |

## 5. Task Breakdown

### S1.1 - Create NestJS Platform API

**Tasks:**
- Scaffold `apps/platform-api`.
- Add health endpoint.
- Use shared API response envelope.
- Add local start command.

**Acceptance:** Platform API starts and health endpoint returns success envelope.

### S1.2 - Setup Prisma Schema Base

**Tasks:**
- Configure Prisma.
- Add PostgreSQL connection settings.
- Add first migration.
- Document migration command.

**Acceptance:** Migration runs against local PostgreSQL.

### S1.3 - Add Users, Groups and Roles Tables

**Tasks:**
- Add `platform_users`.
- Add `platform_groups`.
- Add `platform_roles`.
- Add user-group and user-role join tables.

**Acceptance:** Seeded user can be assigned platform role.

### S1.4 - Add Projects and Apps Basic Tables

**Tasks:**
- Add `projects`.
- Add `project_members`.
- Add `apps`.
- Add basic app role/member base records where needed for Sprint 6 compatibility.

**Acceptance:** Seed project and app can be created and queried.

### S1.5 - Add Audit Log Service

**Tasks:**
- Add `audit_logs` table.
- Add audit event service.
- Emit audit event for login/auth guard test and project creation.

**Acceptance:** Audit log records important events with actor, resource and timestamp.

### S1.6 - Add Seed Users

**Tasks:**
- Seed `admin@company.com`.
- Seed `creator@company.com`.
- Seed `user@company.com`.
- Seed roles: admin, creator, end_user.

**Acceptance:** Seed command creates repeatable demo users and roles.

### S1.7 - Add Auth Guard Mock and `/auth/me`

**Tasks:**
- Add mock current-user resolver.
- Add route guard based on mock role.
- Add `GET /auth/me`.
- Return current user profile and permissions.

**Acceptance:** `/auth/me` returns seeded user profile and permissions.

## 6. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| API | Platform API starts | Command output |
| Health | `/health` returns success envelope | HTTP response |
| Prisma | Migration applies | Migration output |
| Seed | Admin, creator and end user exist | Seed output / DB query |
| Auth | `/auth/me` returns current user | API response |
| Guard | Protected route denies missing/invalid mock user | Unit/API test |
| Audit | Audit service records login/project event | DB query / test |

## 7. Definition of Done

- [ ] Platform API runs locally.
- [ ] PostgreSQL connection works.
- [ ] Prisma migration applies cleanly.
- [ ] Seed users exist for admin, creator and end user.
- [ ] `GET /auth/me` returns current user and permissions.
- [ ] Basic audit log records sensitive actions.
- [ ] Basic tests pass.
- [ ] Sprint 2 Admin AI Keys and Guardrails can start without schema rewrite.

## 8. Demo Script

1. Start PostgreSQL and Platform API.
2. Run Prisma migration.
3. Run seed command.
4. Call `/health`.
5. Call `/auth/me` as admin, creator and end user mock contexts.
6. Show audit log records.
