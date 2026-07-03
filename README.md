# Enterprise Vibe Coding Platform

Private AI application builder for organizations.

## Current Implementation State

Sprint 0 foundation through Sprint 8 Ticket-to-PRD, Domain and MVP Hardening are implemented on top of the validated requirements baseline.

## Commands

```bash
pnpm install
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
```

Start frontend shells:

```bash
pnpm dev
```

Start Platform API:

```bash
pnpm dev:api
```

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
