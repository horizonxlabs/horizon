# Phase 5–6 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the code-backed Phase 5 and 6 MVP gates and record reproducible pilot evidence for the infrastructure-dependent gates.

**Architecture:** Make each web surface render server-owned state only, using the existing Platform API client contracts and explicit state-machine UI for loading, empty, denied, stale session, and retry. Run all AI work through the persisted governed execution route; durable jobs are the only path for long-running calls and resolve provider keys through the OpenBao-compatible secret store.

**Tech Stack:** React/TypeScript, Platform API, Prisma/PostgreSQL, Keycloak OIDC, MinIO, Docker Compose, OpenBao-compatible KV v2.

## Global Constraints

- Provider credentials are entered in Admin and stored only in the secret store; never add provider keys to `.env`, logs, API responses, fixtures, or tests.
- Pilot mode uses `EVCP_CORE_PERSISTENCE=prisma` and disables mock-header authentication and demo seeding unless explicitly opted in for local development.
- API failures must render an explicit failure state and must never produce simulated success.
- Evidence requiring DNS/TLS, a provider key, backup storage, or a clean private host is recorded as an operator runbook command and cannot be fabricated from local tests.

---

### Task 1: Establish an API-wiring inventory and remove authoritative frontend fixtures

**Files:**
- Create: `docs/operations/phase-5-api-wiring-matrix.md`
- Modify: `apps/creator-web/src/features/default-dashboard/default/DefaultDatabaseVersionsSection.tsx`
- Modify: `apps/creator-web/src/features/default-dashboard/default/DefaultTicketsTraceSection.tsx`
- Modify: `apps/creator-web/src/features/users/UsersPage.tsx`
- Modify: `apps/app-store-pwa/src/**`
- Test: `tests/unit/creator-web-render-smoke.test.mjs`

**Interfaces:**
- Consumes: authenticated `PlatformApiClient` methods and current-session headers.
- Produces: only server responses or explicit UI states on every Phase 5 surface.

- [ ] **Step 1: Write failing surface tests** that render an empty response and a rejected response, then assert no fixture label or action success is shown.
- [ ] **Step 2: Run the focused tests** with `pnpm test -- creator-web-render-smoke` and confirm they fail against fixture rendering.
- [ ] **Step 3: Replace fixture reads** with client calls that expose `{status: "loading" | "ready" | "empty" | "denied" | "error" | "stale"}` and use the existing retry action for error states.
- [ ] **Step 4: Write the matrix** mapping each Admin, Creator, and App Store page to route, persistent source, empty state, denied state, and test.
- [ ] **Step 5: Re-run focused tests** and confirm no local fallback produces a success state.

### Task 2: Close Admin and App Store API coverage

**Files:**
- Modify: `apps/admin-web/src/features/admin-console/AdminConsole.tsx`
- Modify: `apps/admin-web/src/shared/platform-client.ts`
- Modify: `apps/app-store-pwa/src/**`
- Modify: `packages/api-client/src/index.ts`
- Test: `tests/unit/admin-login-screen.test.mjs`
- Test: `tests/integration/platform-ai-governance-persistence-contract.test.mjs`

**Interfaces:**
- Consumes: persisted monitoring, audit, auth/domain/operations, app registry, ticket, install, and access routes.
- Produces: admin and App Store mutations that refresh from API state after success and show server errors without local mutation.

- [ ] **Step 1: Add failing contract tests** for a denied App Store access request and a failed Admin mutation.
- [ ] **Step 2: Run the contract tests** and confirm missing routes/client calls fail.
- [ ] **Step 3: Add typed client methods and connect views**; after each mutation refetch the relevant query instead of updating fixture arrays.
- [ ] **Step 4: Add explicit loading, empty, denied, stale-session, and retry views** for every connected panel.
- [ ] **Step 5: Run unit and integration contracts** and confirm persisted response data is rendered after reload.

### Task 3: Complete governed AI execution safeguards

**Files:**
- Modify: `apps/platform-api/src/ai-governance/execution-runtime.ts`
- Modify: `apps/platform-api/src/ai-governance/durable-job-worker.ts`
- Modify: `apps/platform-api/src/persistence/ai-governance-repositories.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Test: `tests/unit/persisted-ai-execution-runtime.test.mjs`
- Test: `tests/unit/durable-ai-job-worker.test.mjs`
- Test: `tests/unit/ai-secret-store.test.mjs`

**Interfaces:**
- Consumes: `resolveProvider`, persisted route/quota repositories, and `SecretStore`.
- Produces: one execution record per idempotency key with sanitized evidence, bounded retry/circuit state, and organization/project/app quota enforcement before invocation.

- [ ] **Step 1: Write failing tests** for all six scenarios, quota exhaustion at each scope, retry idempotency, provider timeout/circuit open, fallback, and secret redaction.
- [ ] **Step 2: Run focused AI tests** with `pnpm test -- persisted-ai-execution-runtime durable-ai-job-worker ai-secret-store`.
- [ ] **Step 3: Implement only the missing runtime/repository behavior** so every scenario calls the same governed executor and persists route/provider/actor/project plus token, latency, cost, status, and sanitized failure data.
- [ ] **Step 4: Run focused AI tests again** and verify jobs retried after a lease expiry do not create duplicate usage/artifacts.

### Task 4: Verify clean-stack, restart, and operator-dependent gates

**Files:**
- Create: `docs/operations/phase-5-6-pilot-evidence.md`
- Modify: `docs/MVP_PENDING_TASKS.md`
- Test: `tests/integration/workspace-compose-contract.test.mjs`

**Interfaces:**
- Consumes: Compose services, Keycloak login, Prisma migrations, MinIO, OpenBao, and a real Admin-provisioned provider credential.
- Produces: dated, reproducible evidence for fresh install, reload/restart persistence, real AI test call, provider outage/fallback, backup/restore, rollback, and no-secret leak checks.

- [ ] **Step 1: Run the clean local stack and contracts** with `docker compose down -v`, `docker compose up -d --build`, and the integration suite; record exact commands and results.
- [ ] **Step 2: Exercise browser flows** for Admin, Creator, and App Store: sign in, create/read state, revoke/refresh session, reload, and restart the stack.
- [ ] **Step 3: Run a real provider call using an Admin-stored OpenBao secret**; record only secret reference/version and redacted response metadata.
- [ ] **Step 4: Run backup/restore, rollback, and outage recovery** using the configured external backup destination; record recovery time and data assertions.
- [ ] **Step 5: Mark only evidence-backed checklist rows complete**; leave any environment-owned prerequisite unchecked with the exact required operator input.
