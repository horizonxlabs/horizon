# Changelog

## Unreleased

### Added

- Phase 2 Real MVP AI governance runtime persistence with repository-backed provider/key/route/quota/guardrail routes, memory and Prisma runtime wiring, masked API key responses, guardrail event persistence and integration/E2E coverage.
- Phase 2 Real MVP Admin AI governance API-backed actions with typed provider/key/route/quota/guardrail client methods, Admin Web Create Provider, Save Masked Key, Configure Route, Configure Quota and Add Guardrail Rule controls, safe secret clearing and unit/integration/E2E coverage.
- Phase 2 Real MVP Admin AI provider test-call workflow with admin-only API route, shared client method, dry-run gateway validation, sanitized provider evidence, Admin Web panel and unit/integration/E2E coverage.
- Phase 2 Real MVP live OpenAI-compatible AI Provider Adapter path with injected provider fetcher, normalized `/chat/completions` response parsing, sanitized provider error mapping and unit/integration/E2E coverage.
- Phase 2 Real MVP Admin First-run Installation Journey with explicit prepare/configure/preflight/setup/deploy/migrate/health/login steps, owner/evidence/next-action cards, responsive styling, docs and unit/integration/E2E coverage.
- Phase 2 Real MVP Creator app users and publish API actions with shared app-access/publish client methods, invitation, access approval, publish registry evidence, deterministic local fallback and unit/integration/E2E coverage.
- Phase 2 Real MVP Creator workspace API actions with shared workspace client methods, prompt submission, preview refresh, visible task/token evidence, deterministic local fallback and unit/integration/E2E coverage.
- Phase 2 Real MVP App Store PWA API actions with shared Storefront client methods, request-access submission, ticket submission/status timeline, local fallback evidence and unit/integration/E2E coverage.
- Phase 2 Real MVP API-backed Admin installer step wizard with shared installer API client methods, Back/Next step controls, editable setup save, masked setup evidence, report retrieval and unit/integration/E2E coverage.
- Phase 2 Real MVP frontend Platform Auth session controls with shared session storage helpers, simulated SSO login bridge, Admin/Creator/Store sign-in/logout actions and unit/integration/E2E coverage.
- Phase 2 Real MVP frontend API bootstrap with shared `PlatformApiClient`, bearer/legacy migration auth headers, Admin/Creator/Store bootstrap wiring, local fallback state, docs and unit/integration/E2E coverage.
- Phase 2 Real MVP Admin first-run install wizard with preflight actions, blocked-install state, masked setup evidence, responsive EVCP UI styling and unit/integration/E2E coverage.
- Phase 2 Real MVP platform auth session runtime integration with signed `evcp_session` bearer tokens, SSO user provisioning, auth evidence on `/auth/me`, runtime persistence route support and unit/integration/E2E coverage.
- Phase 2 Real MVP runtime core persistence configuration with explicit `legacy`, `memory` and `prisma` modes, private-server env contract and Platform API startup wiring.
- Phase 2 Real MVP core API persistence mode for `/auth/me`, `/projects`, `/audit-logs` and `/audit-logs/filter`, preserving the legacy mock executor while adding async repository-backed route coverage.
- Phase 2 Real MVP core persistence foundation with Prisma-shaped user/project/audit repositories, an in-memory contract test double, repository-backed core service harness and unit/integration/E2E coverage.
- Phase 2 Real MVP installer flow with ordered install stages, dry-run/execute CLI modes, redacted setup evidence, install report generation, compose readiness checks and unit/integration/E2E coverage.
- Phase 2 Real MVP external AI Provider Adapter foundation with OpenAI-compatible gateway contract, dry-run adapter invocation, guardrail/quota pre-checks, deterministic fallback policy, usage logging and unit/integration/E2E coverage.
- Phase 2 Real MVP install foundation with `.env.example`, private-server Docker Compose services, Caddy routing, install preflight CLI, install documentation and unit/integration/E2E install contract tests.
- Production candidate readiness audit mapping the final roadmap criteria to Sprint 0-14 integrated evidence and the stacked PR merge order.
- PR merge maintenance governance requiring non-author code review approval, fresh verification evidence and stacked merge order before any sprint PR is merged.
- Sprint 14 Security Release Readiness with TLS/session policy overview, secret redaction evidence, upload validation/quarantine, public/external release checklist, sensitive log redaction preview, Prisma security release tables, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 13 Observability and License with production health dashboard, telemetry export contract, upgrade compatibility and rollback reports, signed license validation, offline cache, license enforcement, Prisma production/license tables, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 12 Installer Backup Restore with installer preflight reports, setup wizard config redaction, backup policy/run metadata, PostgreSQL PITR, restore drill reports, Prisma operations tables, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 11 Knowledge and Skill Governance with knowledge source/version approval, scoped retrieval, skill version contracts, role/scenario/scope assignment, workspace context metadata, Prisma governance tables, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 10 Generated App Runtime Hardening with runtime overview service, Admin runtime API routes, schema isolation checks, migration dry-run gate, Prisma runtime evidence tables, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 9 Auth SSO and Policy Hardening with OIDC/SAML provider contracts, Keycloak defaults, direct IdP constraints, Platform Auth session validation, break-glass admin, policy templates, Prisma migration, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 8 Ticket-to-PRD, Domain and MVP Hardening with PRD change requests, approval decisions, linked PRD v1.1 creation, public domain approval, deployment traceability, monitoring dashboard, audit filters, Prisma migration, Creator/Admin UI evidence and unit/integration/E2E coverage.
- Sprint 7 End User App Store PWA and Ticket Loop with storefront access state, app detail, request access, support ticket APIs, ticket status, Creator ticket inbox, Prisma migration, PWA manifest/offline fallback and unit/integration/E2E coverage.
- Sprint 6 App User Management and Publish Registry with app roles, members, invitations, access requests, manifest contract, readiness checklist, deployment record, App Store registry state, Prisma migration, Creator UI evidence and unit/integration/E2E coverage.
- Sprint 5 Creator database view and frontend-only restore with read-only schema/sample/migration metadata, frontend checkpoints, restore audit event, Prisma migration, Creator UI evidence and unit/integration/E2E coverage.
- Sprint 4 Creator workspace with guarded prompt API, deterministic task progress, token usage log, live preview records, Prisma migration, Creator UI evidence and unit/integration/E2E coverage.
- Sprint 3 Creator project/PRD workflow with governed PRD generation, immutable baseline v1.0, Prisma migration, Creator UI evidence and unit/integration/E2E coverage.
- Shared EVCP design system tokens, reusable `@evcp/ui` primitives, documentation and source-contract tests for future sprint UI work.
- Sprint 2 Admin AI governance with provider/key management, route/quota/guardrail services, Prisma migration, Admin UI evidence and unit/integration/E2E coverage.
- Sprint 1 Platform API foundation with NestJS bootstrap, mock auth, audit events, Prisma schema, migration, seed data, Docker PostgreSQL and automated unit/integration/E2E API smoke tests.
