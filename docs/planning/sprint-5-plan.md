# Sprint 5 Plan - Database View + Frontend Version Restore

Version: 0.1
Date: 2026-07-03
Status: Implemented and accepted
Sprint dates: 2026-08-10 to 2026-08-14
Source backlog: `docs/planning/production-sprint-roadmap.md`

## 1. Sprint Goal

ให้ Creator ดู schema/table/sample records/migration history และ restore frontend-only checkpoint ได้โดยไม่กระทบ backend, database, auth หรือ app roles

## 2. Source Alignment

This sprint maps directly to the source MVP plan:

| Source Task | Sprint 5 Scope |
| --- | --- |
| S5.1 Database schema view UI | Schema and relationship view |
| S5.2 Table view UI | Table list and columns |
| S5.3 Sample records API | Read-only sample records |
| S5.4 Migration history UI | Migration timeline |
| S5.5 Frontend checkpoint data model | Checkpoint/version records |
| S5.6 Frontend version timeline UI | Version timeline |
| S5.7 Compare/preview old version mock | Compare current and old version |
| S5.8 Restore frontend API | Restore frontend checkpoint only |
| S5.9 Restore audit log | Persist restore audit event |

## 3. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 1 week |
| Depends on | Sprint 4 preview and mock generated app state |
| Data access | Creator sees metadata/sample records only |
| Restore boundary | Frontend restore must not mutate backend/database/auth/app roles |
| Audit | Every restore action is audited |

## 4. Sprint Backlog

| Priority | Source Task | Backlog Mapping | Item | Owner Role |
| --- | --- | --- | --- | --- |
| P0 | S5.1 | P3-DB-001 | Build database schema view UI | Frontend Engineer |
| P0 | S5.2 | P3-DB-001 | Build table view UI | Frontend Engineer |
| P0 | S5.3 | P3-DB-001 | Implement sample records API | Platform Engineer |
| P0 | S5.4 | P3-DB-001 | Build migration history UI | Full-stack Engineer |
| P0 | S5.5 | P3-FE-001 | Add frontend checkpoint data model | Platform Engineer |
| P0 | S5.6 | P3-FE-001 | Build frontend version timeline UI | Frontend Engineer |
| P0 | S5.7 | P3-FE-001 | Add compare/preview old version mock | Frontend Engineer |
| P0 | S5.8 | P3-FE-001 | Implement restore frontend API | Platform Engineer |
| P0 | S5.9 | P1-AUD-001, P3-FE-001 | Add restore audit log | Platform Engineer |

## 5. Test Plan

| Area | Check | Evidence |
| --- | --- | --- |
| Schema | Creator sees schema/table/migration metadata | UI/API test |
| Sample data | Sample records are read-only and scoped | API test |
| Permission | Unauthorized user cannot view app database metadata | API test |
| Checkpoint | Frontend checkpoint is recorded after generation | Unit/API test |
| Restore | Restore changes active frontend version only | API test |
| Audit | Restore event includes actor, app and version | DB/test |

## 6. Definition of Done

- [x] Creator sees schema, table, sample data and migration history.
- [x] Creator sees frontend versions.
- [x] Creator can compare or preview old version.
- [x] Creator restores frontend version.
- [x] Backend, database, auth and app roles are not affected by restore.
- [x] Sprint 6 publish can reference restored/active frontend version.

## 7. Demo Script

1. Open Leave Management database view.
2. Show schema/table/sample records.
3. Show migration history.
4. Open frontend version timeline.
5. Preview an old version.
6. Restore frontend-only checkpoint.
7. Show audit log and unchanged app role/data state.
