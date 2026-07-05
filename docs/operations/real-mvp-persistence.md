# Real MVP Core Persistence Foundation

Status: Phase 2 implementation in progress  
Issues: #34, #36, #38, #65, #67, #69, #71, #73, #75

## Purpose

This phase starts replacing mock-only Platform API state with a Prisma-backed persistence contract. It focuses first on the core records every real MVP flow depends on:

- platform users, roles and permissions
- creator projects
- audit logs
- AI governance providers, masked API keys, route policy, quota policy and guardrail evidence
- PRD documents, versions and sections for Sprint 3 baseline flow
- workspace tasks, task steps, preview versions and AI usage evidence for Sprint 4 prompt flow
- app roles, members, invitations, access requests, publish requests, manifests, deployments, App Store registry entries, notifications and support tickets for Sprint 6/7 publish and feedback flow
- app installation records that separate end-user install/disable lifecycle from app membership/access lifecycle
- generated app runtime artifact, container, schema grant, health, logs, metrics, OpenAPI and migration dry-run evidence for Sprint 10 admin runtime flow

The implementation is intentionally additive. It creates a repository layer, a repository-backed service harness and an async core API execution path without claiming every existing sprint service has already been migrated away from in-memory state.

## Current Data Flow

```mermaid
flowchart LR
  A["Repository-backed API route"] --> B["executePlatformApiRequestAsync"]
  B --> C["CoreRepositoryBackedService"]
  B --> J["AiGovernanceRepositoryBackedService"]
  B --> N["PrdRepositoryBackedService"]
  B --> R["WorkspaceRepositoryBackedService"]
  B --> V["PublishStoreRepositoryBackedService"]
  B --> Z["GeneratedRuntimeRepositoryBackedService"]
  C --> D["PlatformUserRepository"]
  C --> E["ProjectRepository"]
  C --> F["AuditLogRepository"]
  J --> K["AI governance delegates"]
  N --> O["PRD delegates"]
  R --> S["Workspace delegates"]
  V --> W["Publish, store and ticket delegates"]
  Z --> AA["Generated runtime delegates"]
  D --> G["CorePersistenceClient"]
  E --> G
  F --> G
  K --> L["AiGovernancePersistenceClient"]
  O --> P["PrdPersistenceClient"]
  S --> T["WorkspacePersistenceClient"]
  W --> X["PublishStorePersistenceClient"]
  AA --> AB["GeneratedRuntimePersistenceClient"]
  G --> H["PrismaClient in production"]
  G --> I["MemoryCorePersistenceClient in tests"]
  L --> H
  L --> M["MemoryAiGovernancePersistenceClient in tests"]
  P --> H
  P --> Q["MemoryPrdPersistenceClient in tests"]
  T --> H
  T --> U["MemoryWorkspacePersistenceClient in tests"]
  X --> H
  X --> Y["MemoryPublishStorePersistenceClient in tests"]
  AB --> H
  AB --> AC["MemoryGeneratedRuntimePersistenceClient in tests"]
```

## Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `GET /auth/me` | Resolves current user from the repository by header email and writes `auth.me` audit evidence |
| `GET /projects` | Lists admin-visible or creator-owned projects through the repository |
| `POST /projects` | Creates/upserts project through the repository and writes `project.created` audit evidence |
| `GET /audit-logs` | Lists repository-backed audit events for admins |
| `POST /audit-logs/filter` | Filters repository-backed audit events by actor, action, severity, project/app and date range |

## AI Governance Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `GET /ai/providers` | Lists admin-visible AI providers through the AI governance repository |
| `POST /ai/providers` | Creates/upserts an AI provider with adapter, base URL, model list and active status |
| `GET /ai/api-keys` | Lists API key metadata with fingerprint and masked value only |
| `POST /ai/api-keys` | Stores API key metadata with fingerprint, masked value and local envelope ciphertext without returning the raw secret |
| `POST /ai/routes` | Upserts scenario routing policy for primary and optional fallback provider/model |
| `POST /ai/quotas` | Upserts AI usage quota policy by scope |
| `POST /guardrails/rules` | Creates/upserts active guardrail rule metadata |
| `POST /guardrails/test` | Evaluates active guardrail rules and writes guardrail event evidence |
| `GET /guardrails/events` | Lists persisted guardrail evaluation events |

## PRD Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `POST /projects/:projectId/prd/generate` | Resolves project ownership through core persistence, runs the existing governed AI gateway path and persists draft PRD version with sections |
| `POST /projects/:projectId/prd/baseline` | Confirms immutable baseline v1.0 through PRD persistence and writes audit evidence |
| `GET /projects/:projectId/prd/versions` | Lists persisted PRD draft and baseline versions with ordered sections |
| `GET /projects/:projectId/prd` | Returns the persisted current PRD version after service recreation |

## Workspace Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `GET /projects/:projectId/workspace` | Resolves project and persisted PRD baseline, then returns persisted latest preview, tasks, usage and token budget |
| `POST /projects/:projectId/workspace/prompts` | Persists safe prompt task, ordered steps, preview version and AI usage evidence after guardrail/quota checks |
| `POST /projects/:projectId/workspace/prompts` blocked | Persists blocked task evidence without replacing latest preview or creating usage |
| `POST /projects/:projectId/workspace/preview/refresh` | Returns persisted latest preview after service recreation |

## Publish and App Store Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `GET /projects/:projectId/app/users` | Resolves project ownership and returns persisted app roles, members, invitations and access requests |
| `POST /projects/:projectId/app/roles` | Upserts a persisted app role and writes audit evidence |
| `POST /projects/:projectId/app/invitations` | Persists internal or external invitation metadata without granting external access automatically |
| `POST /projects/:projectId/app/access-requests` | Persists creator-side access requests for app roles |
| `POST /projects/:projectId/app/access-requests/decision` | Persists access request decision and activates approved member access where possible |
| `GET /projects/:projectId/publish/review` | Builds publish manifest/readiness from persisted project, PRD baseline and latest workspace preview |
| `POST /projects/:projectId/publish` | Persists publish request, manifest, deployment record and App Store registry entry |
| `GET /app-store/registry` | Lists persisted published registry entries |
| `GET /store/apps` | Lists App Store cards from persisted registry, member, pending request and installation state |
| `GET /store/apps/:slug` | Returns persisted app detail, install status and action availability |
| `POST /store/apps/:slug/access-requests` | Persists end-user access request and returns existing pending request on duplicate |
| `POST /store/apps/:slug/tickets` | Requires active app access and persists support ticket with submitted timeline entry |
| `GET /store/tickets/:ticketId` | Returns persisted ticket status for the submitter, creator or admin |
| `GET /creator/projects/:projectId/tickets` | Returns persisted creator ticket inbox for the project |

## App Installation Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `POST /store/apps/:slug/install` | Requires active app membership, upserts an active app installation and writes `store.app.installed` audit evidence |
| `POST /store/apps/:slug/uninstall` | Disables the app installation without deleting membership/access and writes `store.app.uninstalled` audit evidence |
| `GET /store/apps` | Places active installations in `myApps`; visible but not installed apps stay in `availableApps` with install status |
| `GET /store/apps/:slug` | Exposes `installStatus`, installation metadata and `install`/`uninstall` actions |

## App Install Journey

The App Store PWA does not hide install behind a single opaque button. The detail panel now renders a user-visible install journey whose step status is derived from the same access and installation state returned by the Platform API.

```mermaid
flowchart LR
  A["Access Check"] --> B["Manifest Validation"]
  B --> C["Install Record"]
  C --> D["My Apps Ready"]
```

| Step | Evidence source | Done when |
| --- | --- | --- |
| Access Check | `accessStatus` from `GET /store/apps` or `GET /store/apps/:slug` | End user has active app membership |
| Manifest Validation | persisted registry and manifest metadata | App is installable from the private registry |
| Install Record | `POST /store/apps/:slug/install` response and `app_installations` row | Installation status is active and audited |
| My Apps Ready | refreshed `GET /store/apps` home payload | Installed app appears in `myApps` with `installStatus=installed` |

## Generated Runtime Route-Level Coverage

| Route | Persistence-backed behavior |
| --- | --- |
| `GET /admin/runtime/projects/:projectId` | Resolves persisted project, manifest and latest deployment, then stores and returns generated app artifact, container, schema isolation, health, readiness, log, metrics, OpenAPI and latest migration evidence |
| `POST /admin/runtime/projects/:projectId/schema/check` | Checks attempted schema access against the persisted schema grant and writes allow/deny audit evidence |
| `GET /admin/runtime/projects/:projectId/health` | Returns persisted health, readiness, metric and log evidence after service recreation |
| `GET /admin/runtime/projects/:projectId/openapi` | Returns the persisted OpenAPI contract for the generated app runtime |
| `POST /admin/runtime/projects/:projectId/migrations/dry-run` | Persists migration dry-run reports, blocks destructive changes without approval and writes audit evidence |

The legacy synchronous executor remains available for existing sprint regression tests and for services that have not yet moved to repositories.

## Runtime Mode

Platform API startup reads `EVCP_CORE_PERSISTENCE` through `createRuntimePlatformApiServices`.

| Mode | Use case | Behavior |
| --- | --- | --- |
| `legacy` | Existing sprint regression runs | Starts the mock-first in-memory services and does not create a core persistence service |
| `memory` | Deterministic local/API tests | Starts repository-backed core, AI governance, PRD, workspace, publish, App Store, ticket, app installation and generated runtime routes with memory persistence clients and no database requirement |
| `prisma` | Online private server | Starts repository-backed core, AI governance, PRD, workspace, publish, App Store, ticket, app installation and generated runtime routes with Prisma through `DATABASE_URL` |

Private-server `.env` should set:

```bash
EVCP_CORE_PERSISTENCE=prisma
DATABASE_URL=postgresql://...
```

`prisma` mode creates the Prisma-backed core, AI governance, PRD, workspace, publish/App Store, ticket, app installation and generated runtime repository services lazily during Platform API startup. Existing sprint-specific services outside this route set still keep their legacy in-memory state until they are migrated in later slices.

## Repository Coverage

| Repository | Prisma model | Real MVP behavior covered |
| --- | --- | --- |
| `PlatformUserRepository` | `PlatformUser`, `PlatformUserRole`, `PlatformRole` | Resolve user by email with status, role and permissions |
| `ProjectRepository` | `Project` | Create/upsert project, list all projects for admin, list owned projects for creator |
| `AuditLogRepository` | `AuditLog` | Record audit events, filter by actor, action, severity, project/app resource and date range |
| `AiGovernanceRepositoryBackedService` | `AiProvider`, `AiApiKey`, `AiScenarioRoute`, `AiQuota`, `GuardrailRule`, `GuardrailEvent` | Persist AI governance setup, keep API secrets masked in responses and preserve guardrail event evidence |
| `PrdRepositoryBackedService` | `PrdDocument`, `PrdVersion`, `PrdSection` | Persist PRD draft, baseline and ordered section evidence for creator-owned projects |
| `WorkspaceRepositoryBackedService` | `WorkspaceTask`, `WorkspaceTaskStep`, `PreviewVersion`, `AiUsageLog` | Persist workspace prompt task progress, preview versions and AI usage evidence |
| `PublishStoreRepositoryBackedService` | `App`, `AppRole`, `AppMember`, `AppInstallation`, `AppInvitation`, `AppAccessRequest`, `AppManifest`, `PublishRequest`, `DeploymentRecord`, `AppStoreRegistryEntry`, `SupportTicket`, `SupportTicketTimelineEntry`, `InAppNotification` | Persist app access defaults, explicit app install/disable lifecycle, publish manifest/deployment/registry records, App Store access requests, ticket status and creator inbox evidence |
| `GeneratedRuntimeRepositoryBackedService` | `GeneratedAppRuntime`, `GeneratedAppSchemaGrant`, `GeneratedAppHealthCheck`, `GeneratedAppRuntimeLog`, `GeneratedAppRuntimeMetric`, `GeneratedAppOpenApiContract`, `GeneratedAppMigrationReport` | Persist generated app runtime evidence after publish and keep admin runtime routes available across service recreation |

## Test Coverage

```bash
node --import tsx --test \
  tests/unit/platform-core-persistence.test.mjs \
  tests/unit/platform-core-api-persistence.test.mjs \
  tests/integration/platform-core-persistence-contract.test.mjs \
  tests/integration/platform-core-api-persistence-contract.test.mjs \
  tests/integration/platform-ai-governance-persistence-contract.test.mjs \
  tests/integration/platform-prd-persistence-contract.test.mjs \
  tests/integration/platform-workspace-persistence-contract.test.mjs \
  tests/integration/platform-publish-store-persistence-contract.test.mjs \
  tests/integration/platform-app-install-persistence-contract.test.mjs \
  tests/integration/platform-generated-runtime-persistence-contract.test.mjs \
  tests/e2e/platform-core-persistence-flow.test.mjs \
  tests/e2e/platform-core-api-persistence-smoke.test.mjs \
  tests/e2e/platform-ai-governance-persistence-flow.test.mjs \
  tests/e2e/platform-prd-persistence-flow.test.mjs \
  tests/e2e/platform-workspace-persistence-flow.test.mjs \
  tests/e2e/platform-publish-store-persistence-flow.test.mjs \
  tests/e2e/platform-app-install-persistence-flow.test.mjs \
  tests/e2e/platform-generated-runtime-persistence-flow.test.mjs
```

The tests prove:

- Prisma-shaped user records hydrate platform roles and permissions.
- Creator project creation uses the repository contract and can be upserted.
- Creator project listing is actor-scoped and admin listing is unrestricted.
- End users cannot create projects.
- Audit events are written and filtered through the repository layer.
- The repository-backed core flow can be returned through the shared API success envelope.
- The core API async executor can run `/auth/me`, `/projects`, `/audit-logs` and `/audit-logs/filter` against repository-backed state.
- The AI governance persistence service can create/list providers, masked API keys, routes, quotas, guardrail rules and guardrail events.
- Runtime memory persistence keeps AI governance state across service object recreation with the same persistence client.
- The PRD persistence service can generate a draft, confirm baseline, list versions and return current PRD state from repository-backed data.
- Runtime memory persistence keeps PRD draft and baseline state across service object recreation with the same persistence client.
- The workspace persistence service can persist prompt tasks, ordered task steps, preview versions, AI usage logs and blocked prompt evidence.
- Runtime memory persistence keeps workspace preview/task/usage state across service object recreation with the same persistence client.
- The publish/store persistence service can persist app access defaults, invitations, publish manifest/deployment/registry, App Store access requests and support tickets.
- Runtime memory persistence keeps published registry, app access request and ticket state across service object recreation with the same persistence client.
- The App Store install persistence flow keeps explicit installed/disabled app state separate from active app membership and pending access requests.
- Runtime memory persistence keeps installed app state across service object recreation with the same persistence client.
- The generated runtime persistence service can persist artifact, container, schema, health, log, metric, OpenAPI and migration dry-run evidence.
- Runtime memory persistence keeps generated runtime overview, health, OpenAPI and blocked migration report state across service object recreation with the same persistence client.
- The repository source remains aligned with the Prisma schema and seed records.

## Remaining Mock-to-Real Work

- Add PostgreSQL-backed integration tests that run `prisma migrate deploy`, seed and route-level API calls against a real database.
- Replace simulated SSO login with the real Keycloak/OIDC callback and database-backed Platform Auth session lookup.
- Replace local envelope placeholder encryption with production KMS/secret-store integration before handling real customer provider secrets.
- Add data migration/rollback notes when replacing each in-memory service.
