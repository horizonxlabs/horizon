# Sprint 6 Plan - App User Management + Publish

Version: 0.1
Date: 2026-07-03
Status: Draft for Sprint Planning Review
Sprint dates: 2026-08-17 to 2026-08-21
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

ให้ Creator จัดการ app roles, members, invites/access requests และ publish app ไปยัง App Store registry ได้

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 6 Scope |
| --- | --- |
| S6.1 App roles UI | App role list and assignment UI |
| S6.2 App members UI | Member list and role state |
| S6.3 Invite user modal | Invite existing or new user |
| S6.4 Invitations APIs | Invitation create/accept/revoke APIs |
| S6.5 Access requests APIs | Request/approve/reject APIs |
| S6.6 App manifest generation | Manifest from PRD/app/version metadata |
| S6.7 Publish API | Publish request and state transition |
| S6.8 Deployment record | Deployment record for published app |
| S6.9 App registry update | App appears in App Store registry |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 5 active frontend version and app metadata |
| Publish scope | MVP registry publish, not full separate production container |
| Access scope | App-level roles are enforced for store visibility |
| Audit | Invite, role assignment and publish events are audited |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S6.1 | P4-GEN-004 | Build app roles UI | Frontend Engineer |
| P0 | S6.2 | P5-ACCESS-001 | Build app members UI | Frontend Engineer |
| P0 | S6.3 | P5-ACCESS-001 | Build invite user modal | Frontend Engineer |
| P0 | S6.4 | P5-ACCESS-001 | Implement invitation APIs | Platform Engineer |
| P0 | S6.5 | P5-ACCESS-001 | Implement access request APIs | Platform Engineer |
| P0 | S6.6 | P4-GEN-001 | Generate app manifest | Platform Engineer |
| P0 | S6.7 | P4-PUB-001 | Implement publish API | Platform Engineer |
| P0 | S6.8 | P4-PUB-002, P4-DEP-001 | Create deployment record | Platform Engineer |
| P0 | S6.9 | P5-STORE-002 | Update App Store registry | Full-stack Engineer |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| App roles | Creator creates/assigns app role | UI/API test |
| Members | Creator sees member list and role state | UI/API test |
| Invite | Invite creates pending invitation and audit event | API test |
| Access | Access request can be approved/rejected | API test |
| Manifest | Manifest contains app, PRD and active frontend version | Unit/API test |
| Publish | Published app appears in registry | UI/API test |
| Permission | Unauthorized user cannot publish app | API test |

## 6. Definition of Done

- [ ] Creator invites user.
- [ ] Creator assigns app role.
- [ ] App manifest is generated.
- [ ] Creator publishes app.
- [ ] Deployment record is created.
- [ ] Published app appears in App Store registry.
- [ ] Sprint 7 End User App Store can consume registry and access state.

## 7. Demo Script

1. Open Leave Management app settings.
2. Create/inspect Employee app role.
3. Invite End User.
4. Assign End User as Employee.
5. Generate app manifest.
6. Publish Leave Management.
7. Show deployment record and app registry entry.
