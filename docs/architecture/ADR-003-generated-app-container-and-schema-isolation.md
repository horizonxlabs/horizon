# ADR-003: Generated App Container and Schema Isolation

**Status:** Accepted
**Date:** 2026-07-03  
**Accepted:** 2026-07-04 in Sprint 10
**Deciders:** Product Owner, Software Architect, IT/System Admin, Security Admin, Data Owner

## Context

Generated apps must run in production, be visible in the App Store, enforce Platform Auth, support app-level roles, and remain traceable to PRD, manifest, code, migration, and deployment versions. The baseline selects separate app containers and shared PostgreSQL with schema per app.

Related requirements: `FR-DATA-004`, `FR-DATA-005`, `FR-RUN-001` to `FR-RUN-006`, `FR-CRE-007`, generated app contract, `TC-RUN-001` to `TC-RUN-010`.

## Decision

Published generated apps will run as **separate app containers**. Each app will use a dedicated PostgreSQL schema in a shared PostgreSQL database. Platform metadata will live in a separate platform schema.

Every generated app must include a manifest, health/readiness endpoints, structured logs, OpenAPI spec, migrations, tests, deployment metadata, and Platform Auth SDK integration.

## Options Considered

### Option A: Embedded Runtime in Platform

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Cost | Low |
| Scalability | Low to medium |
| Team familiarity | High |

**Pros:** Simple preview and routing, fewer moving parts.

**Cons:** Weak app isolation, harder rollback per app, app failures may affect platform, weaker production boundary.

### Option B: Separate Container per Generated App + Schema per App

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Medium |
| Scalability | Medium to high |
| Team familiarity | Medium |

**Pros:** Clear runtime isolation, per-app health/deployment/rollback, manageable database operations, strong enough for private server v1.

**Cons:** More orchestration work, requires route registration and per-app DB credential management.

### Option C: Database per App

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Cost | Medium to high |
| Scalability | High isolation |
| Team familiarity | Medium |

**Pros:** Stronger data isolation, easier per-app backup/restore boundaries.

**Cons:** More operational overhead, more connection/database management, too heavy for production v1.

## Trade-off Analysis

Separate containers provide the runtime isolation needed for production without requiring Kubernetes in v1. Schema-per-app balances data isolation and operational simplicity. The trade-off is that database privileges must be designed carefully so one app cannot access another app schema.

## Consequences

- Every app needs a build/deploy pipeline and route registration.
- Health, readiness, logs, metrics, and OpenAPI become mandatory app contracts.
- Database migrations must be dry-runnable and linked to deployment.
- App rollback can be handled independently from platform rollback, subject to database migration safety.
- Future database-per-app support can be added for higher-risk apps if policy requires it.

## Sprint 10 Implementation Notes

Sprint 10 implements the production blueprint contract as deterministic platform evidence:

- `GeneratedAppRuntimeService` exposes artifact root, required paths, container name, image tag, route and probe endpoints for a published app.
- Runtime evidence is available through `/admin/runtime/projects/:projectId`, `/schema/check`, `/health`, `/openapi` and `/migrations/dry-run`.
- Schema isolation reports the assigned app schema and DB user, allows only that schema, and returns `cross_schema_access_denied` for other schemas.
- Prisma tables persist runtime, schema grant, health check, structured log, metric, OpenAPI and migration dry-run records.
- Admin UI exposes Generated App Runtime Hardening using the shared EVCP design system.

## Action Items

1. [x] Define `app.manifest.json` JSON schema.
2. [x] Define generated app folder and package layout in the monorepo.
3. [x] Define app container health/readiness/logging/metrics contract.
4. [x] Define schema-per-app DB user and privilege model.
5. [x] Define migration dry-run and destructive migration approval checks.
