# Sprint 7 Plan - End User App Store PWA + Ticket

Version: 0.1
Date: 2026-07-03
Status: Implemented and accepted
Sprint dates: 2026-08-24 to 2026-08-28
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

ให้ End User ใช้ App Store แบบ PWA เพื่อดู My Apps/Available Apps, ขอ access และส่ง ticket ให้ Creator ได้

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 7 Scope |
| --- | --- |
| S7.1 PWA manifest | Installable App Store PWA metadata |
| S7.2 Mobile-first App Store home | Responsive home |
| S7.3 My Apps / Available Apps | Visibility by membership/access policy |
| S7.4 App detail page | App detail, owner, status, request/open actions |
| S7.5 Request access flow | Access request form and status |
| S7.6 Submit ticket UI | Bug/feedback/feature ticket form |
| S7.7 Ticket APIs | Ticket create/list/update APIs |
| S7.8 Ticket status page | End User ticket tracking |
| S7.9 Creator ticket inbox | Creator receives routed tickets |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 6 published app registry and access APIs |
| PWA scope | MVP install metadata and responsive shell |
| Ticket scope | Bug, feedback and feature request types |
| Routing | Tickets route to Creator/App Owner by app |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S7.1 | P5-STORE-001 | Add PWA manifest | Frontend Engineer |
| P0 | S7.2 | P5-STORE-001 | Build mobile-first App Store home | Frontend Engineer |
| P0 | S7.3 | P5-STORE-002 | Build My Apps / Available Apps | Full-stack Engineer |
| P0 | S7.4 | P5-STORE-002 | Build app detail page | Frontend Engineer |
| P0 | S7.5 | P5-ACCESS-001 | Build request access flow | Full-stack Engineer |
| P0 | S7.6 | P5-TKT-001 | Build submit ticket UI | Frontend Engineer |
| P0 | S7.7 | P5-TKT-001 | Implement ticket APIs | Platform Engineer |
| P0 | S7.8 | P5-TKT-002 | Build ticket status page | Full-stack Engineer |
| P0 | S7.9 | P5-TKT-002 | Build Creator ticket inbox | Full-stack Engineer |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| PWA | Manifest loads and app shell is mobile-ready | Browser/manual test |
| Visibility | My Apps and Available Apps match access policy | API/UI test |
| App detail | User sees correct app metadata and actions | UI test |
| Access | End User can request access and see status | UI/API test |
| Ticket | End User can submit ticket | UI/API test |
| Routing | Creator sees ticket in inbox | UI/API test |
| Permission | User cannot submit ticket for invisible app | API test |

## 6. Definition of Done

- [x] End User sees accessible apps.
- [x] End User sees available apps and request access flow.
- [x] End User opens app detail.
- [x] End User submits ticket.
- [x] End User can track ticket status.
- [x] Creator sees routed ticket in inbox.
- [x] Sprint 8 can convert ticket into PRD change request.

## 7. Demo Script

1. Open App Store PWA as End User.
2. Show My Apps and Available Apps.
3. Open Leave Management detail page.
4. Request access if not already granted.
5. Submit bug ticket.
6. Track ticket status.
7. Login as Creator and show ticket inbox.
