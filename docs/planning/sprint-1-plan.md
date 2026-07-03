# Sprint 1 Plan - Monorepo and API Foundation

Version: 0.1  
Date: 2026-07-03  
Status: Draft for Sprint Planning Review  
Sprint dates: 2026-07-06 to 2026-07-17  
Source backlog: `docs/planning/production-implementation-backlog.md`

## 1. Sprint Goal

Establish a runnable repository foundation and platform API skeleton so future work can build on shared contracts, packages, and quality gates instead of ad hoc setup.

## 2. Planning Assumptions

| Assumption | Value |
| --- | --- |
| Sprint length | 2 weeks |
| Start date | 2026-07-06 |
| End date | 2026-07-17 |
| Team model | Small AI-assisted engineering team |
| Capacity model | Story points |
| Planning buffer | 25% reserved for unknowns, review, and setup friction |
| Primary outcome | Repo can build/test/typecheck and run minimal platform API foundation |

## 3. Capacity

This is a planning assumption until real team assignments are known.

| Role | Available Days | Allocation | Notes |
| --- | --- | --- | --- |
| Platform Engineer | 8 of 10 | 13 points | Repo, API, Docker, shared contracts |
| Frontend Engineer | 8 of 10 | 10 points | App shells, shared UI/package integration |
| QA / Product Reviewer | 4 of 10 | 4 points | Acceptance checks, docs review, RTM alignment |
| **Total** | **20 person-days** | **27 points** | Planned load should stay near 70-80% |

## 4. Sprint Backlog

| Priority | Backlog ID | Item | Estimate | Owner Role | Dependencies |
| --- | --- | --- | --- | --- | --- |
| P0 | P0-FND-001 | Create monorepo structure for platform apps and packages | 5 pts | Platform Engineer | None |
| P0 | P0-FND-002 | Configure TypeScript, package manager, lint, test, build scripts | 5 pts | Platform Engineer | P0-FND-001 |
| P0 | P0-FND-003 | Create shared `types`, `config`, `api-client`, `auth-sdk`, `ui` packages | 5 pts | Frontend Engineer | P0-FND-001, P0-FND-002 |
| P0 | P0-FND-005 | Define API response envelope and platform error codes | 3 pts | Platform Engineer | P0-FND-003 |
| P0 | P1-CORE-001 | Scaffold `platform-api` service with health endpoint | 5 pts | Platform Engineer | P0-FND-002, P0-FND-005 |
| P1 | P0-FND-004 | Create initial Docker Compose skeleton | 3 pts | Platform Engineer | P1-CORE-001 |
| P1 | P0-FND-006 | Add CI-ready quality gates | 3 pts | Platform Engineer | P0-FND-002 |
| P1 | P0-FND-007 | Add docs index and contribution guide | 2 pts | QA / Product Reviewer | P0-FND-001 |

Planned capacity: 27 points  
Sprint load: 31 points  
Committed P0 load: 23 points  
Stretch P1 load: 8 points

The committed sprint scope is the P0 set. P1 items are stretch and should be cut in this order if delivery risk rises: `P0-FND-007`, `P0-FND-006`, `P0-FND-004`.

## 5. Task Breakdown

### P0-FND-001 - Monorepo Structure

**Objective:** Create deterministic repository boundaries for platform apps, generated apps, packages, Docker, and docs.

**Tasks:**
- Create root package/workspace configuration.
- Create `apps/admin-web`, `apps/creator-web`, `apps/app-store-pwa`, `apps/platform-api`.
- Create `packages/types`, `packages/config`, `packages/api-client`, `packages/auth-sdk`, `packages/ui`.
- Create `generated-apps/.gitkeep` as the future generated app boundary.
- Create `docker/` for Compose and deployment assets.
- Add README notes describing the workspace layout.

**Acceptance:** Repository contains the expected folders from ADR-003 and backlog P0-FND-001.

### P0-FND-002 - Tooling and Quality Scripts

**Objective:** Establish one root workflow for build, test, lint, and typecheck.

**Tasks:**
- Select package manager and workspace strategy.
- Configure TypeScript base config.
- Configure lint and formatting conventions.
- Configure unit test runner.
- Add root scripts for `build`, `test`, `lint`, `typecheck`.
- Verify commands run on empty/minimal packages.

**Acceptance:** Root commands run successfully and are documented.

### P0-FND-003 - Shared Packages

**Objective:** Create shared packages that future surfaces and generated apps will import.

**Tasks:**
- Add shared response/error types in `packages/types`.
- Add environment/config helpers in `packages/config`.
- Add initial API client envelope handling in `packages/api-client`.
- Add Platform Auth SDK interface stubs in `packages/auth-sdk`.
- Add minimal shared UI exports in `packages/ui`.

**Acceptance:** At least one app/service imports from shared packages without path hacks.

### P0-FND-005 - API Response Envelope and Error Codes

**Objective:** Make API responses consistent with the requirements baseline.

**Tasks:**
- Define success envelope type.
- Define error envelope type.
- Define platform error code enum or literal union.
- Add tests for success and error envelope builders.
- Document examples in the package README or docs index.

**Acceptance:** Shared package exposes response envelope helpers and tests pass.

### P1-CORE-001 - Platform API Skeleton

**Objective:** Create minimal platform API service that proves backend structure and shared contracts work.

**Tasks:**
- Scaffold `apps/platform-api`.
- Add health endpoint.
- Use shared response envelope.
- Add unit test for health response.
- Add basic service start command.

**Acceptance:** Platform API starts locally and `/health` returns a success envelope.

### P0-FND-004 - Docker Compose Skeleton

**Objective:** Provide early private-server deployment shape without full production behavior.

**Tasks:**
- Add Compose services for platform API and required infrastructure service stubs or images.
- Add environment file template.
- Add healthcheck for platform API.
- Document start/stop commands.

**Acceptance:** Compose starts minimal platform services and exposes the API health endpoint.

### P0-FND-006 - CI-Ready Quality Gates

**Objective:** Ensure repo quality commands can run in automation.

**Tasks:**
- Add CI command documentation.
- Ensure `build`, `test`, `lint`, `typecheck` are deterministic.
- Add a simple CI workflow file if CI provider is decided.
- Document local verification sequence.

**Acceptance:** A clean checkout can run the quality gate commands without manual setup beyond dependency install.

### P0-FND-007 - Docs Index and Contribution Guide

**Objective:** Make current requirements, RTM, ADRs, backlog, and setup docs discoverable.

**Tasks:**
- Add docs index.
- Link requirements baseline, RTM, ADRs, and backlog.
- Add contribution guide for requirement/ADR/backlog changes.
- Document branch and commit conventions.

**Acceptance:** A new contributor can find planning docs and know how to update them.

## 6. Test Plan

| Area | Required Tests / Checks | Evidence |
| --- | --- | --- |
| Workspace | Package manager install, workspace discovery | Command output |
| Build | Root `build` command succeeds | Command output |
| Typecheck | Root `typecheck` command succeeds | Command output |
| Lint | Root `lint` command succeeds | Command output |
| Unit tests | Root `test` command succeeds | Test output |
| API health | `/health` returns success envelope | HTTP response and unit test |
| Shared contracts | Response envelope helpers tested | Unit test output |
| Docker | Compose starts minimal services | Compose status and health response |
| Docs | Links resolve to current docs | Manual review |

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Package manager choice changes later | Rework workspace scripts | Decide and document in Sprint 1 before scaffolding many packages |
| Too much app scaffolding too early | Sprint slips before foundation is stable | Keep app shells minimal; do not implement product UI in Sprint 1 |
| Docker Compose scope grows into production installer | Overbuilds Phase 0 | Keep Compose skeleton minimal; production installer remains Phase 6 |
| Shared packages become speculative | Unused abstractions | Add only contracts already required by requirements/ADR |
| CI provider not selected | CI workflow may be blocked | Ensure local quality commands exist even if CI file is deferred |

## 8. Definition of Done

- [ ] P0 backlog items are implemented or explicitly deferred with reason.
- [ ] Root install/build/test/lint/typecheck commands are documented.
- [ ] Platform API health endpoint returns the standard success envelope.
- [ ] Shared response envelope and error code contracts have tests.
- [ ] Workspace structure matches requirements and ADR boundaries.
- [ ] No secrets or real credentials are committed.
- [ ] Docs index links to requirements baseline, RTM, ADRs, and implementation backlog.
- [ ] RTM is updated if Sprint 1 scope changes test coverage.

## 9. Key Dates

| Date | Event |
| --- | --- |
| 2026-07-06 | Sprint start / scope confirmation |
| 2026-07-10 | Mid-sprint check-in |
| 2026-07-16 | Code freeze for Sprint 1 demo |
| 2026-07-17 | Sprint demo, review, retrospective |

## 10. Sprint Demo Script

1. Show repository structure.
2. Run dependency install.
3. Run root `build`, `test`, `lint`, and `typecheck`.
4. Start platform API locally.
5. Call `/health` and show standard response envelope.
6. If stretch completed, start Docker Compose and show health through Compose.
7. Walk through docs index and link back to requirements, RTM, ADRs, and backlog.

## 11. Carryover Rules

If Sprint 1 does not complete all P0 items:

- Carry over unfinished P0 items before starting Auth/RBAC work.
- Do not start Phase 1 feature implementation until response envelope, shared packages, and platform API health endpoint are stable.
- P1 items can move to Sprint 2 only if they do not block Auth/RBAC work.
