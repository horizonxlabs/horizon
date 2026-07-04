# Enterprise Vibe Coding Platform

Private AI application builder for organizations.

## Current Implementation State

Sprint 0 foundation through Sprint 14 Security Release Readiness are implemented on top of the validated requirements baseline.

## Commands

```bash
pnpm install
pnpm install:preflight:example
pnpm verify:install
pnpm typecheck
pnpm build
pnpm test
pnpm verify:sprint0
pnpm verify:sprint1
pnpm verify:sprint2
pnpm verify:sprint3
pnpm verify:sprint4
pnpm verify:sprint5
pnpm verify:sprint6
pnpm verify:sprint7
pnpm verify:sprint8
pnpm verify:sprint9
pnpm verify:sprint10
pnpm verify:sprint11
pnpm verify:sprint12
pnpm verify:sprint13
pnpm verify:sprint14
```

Start frontend shells:

```bash
pnpm dev
```

Start Platform API:

```bash
pnpm dev:api
```

## Phase 2 Real MVP Install Foundation

The current `main` branch contains an integrated mock-first MVP prototype. Phase 2 starts the mock-to-real conversion by making private-server installation reproducible and testable.

Create a local environment file:

```bash
cp .env.example .env
```

Replace every example secret in `.env`, then run:

```bash
pnpm install:preflight
```

To verify the checked-in install contract without using real secrets:

```bash
pnpm verify:install
```

Start the private-server dependency/platform stack:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

The compose contract declares PostgreSQL, Redis, MinIO, Keycloak, Platform API, Admin Web, Creator Web, App Store PWA and Caddy. See `docs/operations/real-mvp-install.md` for the current install steps and the remaining mock-to-real gaps.

## Phase 2 Real MVP Auth Session Foundation

The Platform API now supports signed `Authorization: Bearer evcp_session...` tokens for protected routes. `/auth/me` returns auth evidence (`platform_session` or legacy `mock_header`) so the transition away from Sprint 0-14 mock headers is explicit and testable.

See `docs/operations/real-mvp-auth-session.md` for the current guarantees and remaining SSO persistence work.

## Sprint 1 Database

Start PostgreSQL:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

Apply migration and seed:

```bash
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

## Sprint 0 Scope

- Monorepo workspace
- Shared UI package
- Admin, Creator and App Store shells
- Mock auth provider
- Shared API client
- Leave Management mock fixtures
- Unit, integration and E2E smoke tests

## Sprint 1 Scope

- NestJS-backed Platform API
- `/health`, `/auth/me`, `/projects` and `/audit-logs`
- Mock auth guard behavior for admin, creator and end user
- Prisma PostgreSQL schema and first migration
- Idempotent seed users, roles, Leave Management project/app and audit event
- Docker Compose PostgreSQL verification path

## Sprint 2 Scope

- Admin AI Providers and API Keys governance screen
- External provider adapter configuration contract
- Masked API key response with encryption-ready storage fields
- Scenario routing and fallback configuration
- Token quota hard-stop checks before provider calls
- Guardrail keyword/policy prompt test with allow, warn and block decisions
- Guardrail event log and audit records
- Prisma migration and seed data for AI governance tables

## Sprint 3 Scope

- Creator project wizard and PRD generation flow
- Governed PRD generation through AI route, quota and guardrail checks
- Immutable PRD Baseline v1.0 confirmation
- PRD version history and baseline audit event
- Prisma migration and seed data for PRD documents, versions and sections

## Sprint 4 Scope

- Creator Workspace with prompt composer, task progress, token remaining and live preview
- Guarded prompt API that checks PRD baseline and guardrails before generation
- Workspace tasks, task steps, preview versions and AI usage logs
- Frontend checkpoint creation source for later restore
- Prisma migration and seed data for workspace/preview/usage tables

## Sprint 5 Scope

- Read-only Creator Database View with schema, tables, relationships, sample records and migration history
- Raw SQL/destructive database action denial
- Frontend checkpoint timeline, compare and restore API
- Frontend-only restore boundary with audit event
- Prisma migration and seed data for database metadata and frontend checkpoints

## Sprint 6 Scope

- Creator App Users, App Roles, Pending Invites and Access Requests workspace
- App invitation API with external approval-required policy warning
- Access request API with approve/reject decision and membership update
- App manifest generation from PRD baseline, active frontend checkpoint, auth, roles and database metadata
- Publish readiness checklist with blocked publish explanation
- Publish API creating deployment record and App Store registry entry
- Prisma migration and seed data for app access, manifest, publish, deployment and registry records

## Sprint 7 Scope

- End User App Store PWA manifest, icon and offline fallback
- Storefront APIs for My Apps, Available Apps, app detail and notifications
- Store-origin request access flow with duplicate pending request handling
- Support ticket API with type, priority, device info and status timeline
- Submitter-scoped ticket status view and Creator project ticket inbox
- Creator Ticket Inbox UI with Convert to PRD Change, Convert to AI Prompt and Resolve actions
- Prisma migration and seed data for support tickets, timeline entries and in-app notifications

## Sprint 8 Scope

- Ticket-to-PRD change request API with duplicate conversion protection
- PRD change approval/rejection with linked PRD version creation
- Domain settings and public domain request approval flow
- Deployment traceability linking ticket, PRD change, PRD version, frontend checkpoint, manifest, deployment, domain and audit evidence
- MVP Monitoring dashboard with service health, ticket counts, domain requests, provider calls, guardrail events and recent audit data
- Audit log filters by actor, action, project/app, severity and date
- Creator UI for Ticket-to-PRD, PRD Change Requests, Domain Settings, Deployment Traceability and MVP Demo Checklist
- Admin UI for MVP Monitoring, Service Health, Ticket Counts, Domain Requests and Audit Filters
- Prisma migration and seed data for PRD change, domain and traceability records

## Sprint 9 Scope

- OIDC provider configuration API with masked client secret, secret fingerprint and audit event
- SAML provider configuration API with certificate fingerprint and audit event
- Bundled Keycloak default broker contract for realm, clients, redirect URIs and platform groups
- Direct external IdP constraints that preserve the Platform Auth session and claims boundary
- Simulated SSO login producing normalized Platform Auth claims with platform roles and app roles
- Generated app session validation that denies invalid tokens and missing app roles
- Local break-glass admin session with required reason, 15-minute TTL and critical audit event
- Public/Internal/Confidential/Restricted policy templates for reviewers, checks and exposure defaults
- Admin Auth / SSO Production Readiness UI
- Prisma migration and seed data for auth provider config, auth sessions, break-glass sessions and policy templates

## Sprint 10 Scope

- Generated app runtime overview service linked to published app manifest and deployment record
- Admin runtime API routes for overview, schema access check, health/readiness/metrics/log evidence, OpenAPI and migration dry-run
- Separate generated app container contract with artifact root, required paths, container name, image tag, route and probe endpoints
- Schema-per-app isolation evidence with assigned DB user, allowed schema and cross-schema denial reason
- Health/readiness/log/metrics, OpenAPI and migration dry-run evidence for published generated apps

## Sprint 11 Scope

- Knowledge source metadata with owner, source type, scope, upload and index status
- Immutable knowledge versions with changelog, approval status, active/superseded lifecycle and retrieval logs
- Permission-filtered knowledge retrieval by actor, project, app, department, agent role and AI scenario
- Skill library with draft, active and disabled lifecycle
- Skill versions with instruction, input/output schema, required knowledge and allowed tools
- Skill approval and assignment by role, scenario, project/app/department scope
- Workspace prompt metadata with selected `skillVersionId` and `knowledgeVersionIds`
- Admin Knowledge and Skill Governance UI
- Prisma migration and seed data for knowledge/skill governance records

## Sprint 12 Scope

- Installer preflight service with CPU, RAM, disk, OS, Docker, Compose, ports, DNS/TLS and network checks
- Install report with actionable failed checks and Docker Compose readiness contract
- Local Web Setup Wizard config capture for domain, database, storage, auth, AI, guardrail, backup and first admin
- Secret redaction for setup responses and audit metadata
- Backup policy configuration with storage target, retention, encryption mode/key reference, schedule and enabled state
- Backup run artifact metadata with encrypted artifact URI, checksum, size and timestamps
- Storage-neutral MinIO and S3-compatible backup artifact contract
- PostgreSQL PITR metadata with WAL retention, base backup, target timestamp and RPO/RTO
- Restore drill report with pass/fail validation checks and critical audit on failed recovery
- Admin Installer, Backup and Restore UI
- Prisma migration and seed data for installer, setup, backup, PITR and restore drill evidence

## Sprint 13 Scope

- Production observability dashboard service with core service health, generated app health, queue backpressure, retention and telemetry export state
- Admin production API routes for observability, upgrade compatibility checks, rollback reports and production overview
- Signed license install and validation with fingerprint-only storage, edition, seats, app limit, AI entitlement, expiry, warning/grace windows and offline cache
- License enforcement API for publish, AI generation, new app, external invite and user activation actions
- Existing app continuity behavior that allows `run_existing_app` and preserves data when license enforcement blocks privileged actions
- Prisma migration and seed data for service health, telemetry export, upgrade report, rollback report, license record, validation log and enforcement event evidence
- Admin Observability and License UI

## Sprint 14 Scope

- Admin Security Release Readiness service for TLS enforcement, session policy, secret redaction, upload policy, public/external release checklist and RTM regression evidence
- Admin-only API routes for readiness overview, upload validation, release checklist evaluation and sensitive redaction preview
- Upload validation that allows supported clean files, blocks unsupported/oversize files and quarantines pending or failed malware scan states
- Public/external checklist that blocks unsafe exposure until auth, permissions, domain, TLS, data classification and audit checks pass
- Sensitive prompt, ticket and request payload redaction with rule evidence and no raw secret return
- Prisma migration and seed data for security readiness reports, readiness checks, upload scan events, release checklist reports and redaction evidence
- Admin Security Release Readiness UI using shared design system dashboard patterns
