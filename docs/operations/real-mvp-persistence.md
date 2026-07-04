# Real MVP Core Persistence Foundation

Status: Phase 2 implementation in progress  
Issues: #34, #36, #38

## Purpose

This phase starts replacing mock-only Platform API state with a Prisma-backed persistence contract. It focuses on the core records every real MVP flow depends on:

- platform users, roles and permissions
- creator projects
- audit logs

The implementation is intentionally additive. It creates a repository layer, a repository-backed service harness and an async core API execution path without claiming every existing sprint service has already been migrated away from in-memory state.

## Current Data Flow

```mermaid
flowchart LR
  A["Core API route"] --> B["executePlatformApiRequestAsync"]
  B --> C["CoreRepositoryBackedService"]
  C --> D["PlatformUserRepository"]
  C --> E["ProjectRepository"]
  C --> F["AuditLogRepository"]
  D --> G["CorePersistenceClient"]
  E --> G
  F --> G
  G --> H["PrismaClient in production"]
  G --> I["MemoryCorePersistenceClient in tests"]
```

## Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `GET /auth/me` | Resolves current user from the repository by header email and writes `auth.me` audit evidence |
| `GET /projects` | Lists admin-visible or creator-owned projects through the repository |
| `POST /projects` | Creates/upserts project through the repository and writes `project.created` audit evidence |
| `GET /audit-logs` | Lists repository-backed audit events for admins |
| `POST /audit-logs/filter` | Filters repository-backed audit events by actor, action, severity, project/app and date range |

The legacy synchronous executor remains available for existing sprint regression tests and for services that have not yet moved to repositories.

## Runtime Mode

Platform API startup reads `EVCP_CORE_PERSISTENCE` through `createRuntimePlatformApiServices`.

| Mode | Use case | Behavior |
| --- | --- | --- |
| `legacy` | Existing sprint regression runs | Starts the mock-first in-memory services and does not create a core persistence service |
| `memory` | Deterministic local/API tests | Starts repository-backed core routes with `MemoryCorePersistenceClient` and no database requirement |
| `prisma` | Online private server | Starts repository-backed core routes with Prisma through `DATABASE_URL` |

Private-server `.env` should set:

```bash
EVCP_CORE_PERSISTENCE=prisma
DATABASE_URL=postgresql://...
```

`prisma` mode creates the Prisma-backed core repository service lazily during Platform API startup. Existing sprint-specific services still keep their legacy in-memory state until they are migrated in later slices.

## Repository Coverage

| Repository | Prisma model | Real MVP behavior covered |
| --- | --- | --- |
| `PlatformUserRepository` | `PlatformUser`, `PlatformUserRole`, `PlatformRole` | Resolve user by email with status, role and permissions |
| `ProjectRepository` | `Project` | Create/upsert project, list all projects for admin, list owned projects for creator |
| `AuditLogRepository` | `AuditLog` | Record audit events, filter by actor, action, severity, project/app resource and date range |

## Test Coverage

```bash
node --import tsx --test \
  tests/unit/platform-core-persistence.test.mjs \
  tests/unit/platform-core-api-persistence.test.mjs \
  tests/integration/platform-core-persistence-contract.test.mjs \
  tests/integration/platform-core-api-persistence-contract.test.mjs \
  tests/e2e/platform-core-persistence-flow.test.mjs \
  tests/e2e/platform-core-api-persistence-smoke.test.mjs
```

The tests prove:

- Prisma-shaped user records hydrate platform roles and permissions.
- Creator project creation uses the repository contract and can be upserted.
- Creator project listing is actor-scoped and admin listing is unrestricted.
- End users cannot create projects.
- Audit events are written and filtered through the repository layer.
- The repository-backed core flow can be returned through the shared API success envelope.
- The core API async executor can run `/auth/me`, `/projects`, `/audit-logs` and `/audit-logs/filter` against repository-backed state.
- The repository source remains aligned with the Prisma schema and seed records.

## Remaining Mock-to-Real Work

- Add PostgreSQL-backed integration tests that run `prisma migrate deploy`, seed and route-level API calls against a real database.
- Move auth session lookup from mock headers to Platform Auth/Keycloak-backed identities.
- Move AI provider, PRD generation, workspace and publish/runtime services onto repository-backed state.
- Add data migration/rollback notes when replacing each in-memory service.
