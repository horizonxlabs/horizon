# Authoritative Workspace Secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make encrypted per-project workspace secrets durable and authoritative before any container is created or recreated.

**Architecture:** Replace the current best-effort write-behind secret persistence with awaited storage operations. The orchestrator receives asynchronous secret reads/writes, so provisioning, recovery, project-database access, and publish each fail closed when the encrypted secret record is unavailable. The database stores ciphertext only; plaintext exists only while injecting a container environment.

**Tech Stack:** TypeScript, Node AES-256-GCM, PostgreSQL, Platform API, Docker workspace engine, Node test runner.

## Global Constraints

- Production workspace mode requires `EVCP_WORKSPACE_SECRET_KEY`; it must not use a development fallback.
- Never log, return, fixture, or persist plaintext workspace credentials.
- Secrets must be persisted successfully before a workspace container is started.
- A restart or re-created container must load only persisted ciphertext and fail closed if it is unavailable.

---

### Task 1: Make ProjectSecretStore persistence awaited

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/secret-store.ts`
- Test: `tests/unit/workspace-secret-store.test.mjs`

**Interfaces:**
- Consumes: `SecretPersistence.upsert`, `loadAll`, and `deleteAll`.
- Produces: `put`, `rotate`, `removeAll`, `listNames`, and `resolveEnv` returning `Promise`; a rejected persistence call leaves no successful in-memory mutation.

- [ ] **Step 1: Write failing tests** that use a persistence adapter whose `upsert` rejects and assert `await store.put(...)` rejects and `await store.resolveEnv(projectId)` is empty.
- [ ] **Step 2: Run** `CI=true pnpm exec tsx --test tests/unit/workspace-secret-store.test.mjs`; expected failure because `put` is synchronous and the value remains in the map.
- [ ] **Step 3: Implement** `async put(projectId, name, value)` by encrypting, awaiting `persistence.upsert`, then placing ciphertext in `byProject`; implement `rotate` the same way and await `deleteAll` before deleting a project bucket.
- [ ] **Step 4: Make reads asynchronous**: `async listNames(projectId)` and `async resolveEnv(projectId)` must read the encrypted map and decrypt only after the persisted write completed.
- [ ] **Step 5: Re-run** the focused test; expected all tests pass with no plaintext in `JSON.stringify(store)`.

### Task 2: Await secrets during workspace lifecycle

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`
- Test: `tests/unit/workspace-orchestrator.test.mjs`
- Test: `tests/unit/workspace-delete.test.mjs`

**Interfaces:**
- Consumes: asynchronous `ProjectSecretStore` methods from Task 1.
- Produces: `async listSecretNames`, `async getProjectDatabaseUrl`, and `async resolveEnv`; every `provisionWorkspace`, recovery, and deletion path awaits secret storage.

- [ ] **Step 1: Write a failing provisioning test** with a rejecting secret persistence adapter and assert no Docker container is created after `provisionWorkspace` rejects.
- [ ] **Step 2: Run** `CI=true pnpm exec tsx --test tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-delete.test.mjs`; expected failure because the current fire-and-forget `put` still starts Docker.
- [ ] **Step 3: Implement** asynchronous `buildWorkspaceSpec`, `recoverExistingWorkspace`, secret reattach writes, and all six provisioning writes with `await`; push `async () => deps.secrets.removeAll(projectId)` to the rollback stack.
- [ ] **Step 4: Implement** awaited deletion and awaited public accessor methods; update test assertions to use `await`.
- [ ] **Step 5: Re-run** the focused tests; expected provisioning fails before Docker when ciphertext cannot be committed and normal rollback remains green.

### Task 3: Propagate asynchronous secret resolution to API and publish

**Files:**
- Modify: `apps/platform-api/src/project-database.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `apps/platform-api/src/publish/publish-service.ts`
- Modify: `apps/platform-api/src/publish/factory.ts`
- Test: `tests/unit/publish-service.test.mjs`
- Test: `tests/unit/workspace-service-wiring.test.mjs`

**Interfaces:**
- Consumes: asynchronous orchestrator `getProjectDatabaseUrl(projectId): Promise<string | undefined>` and `resolveEnv(projectId): Promise<Record<string,string>>`.
- Produces: request handlers and publish flows that await the secret lookup before opening a project database connection or starting a deployment container.

- [ ] **Step 1: Write failing tests** where `resolveEnv` rejects and assert `publish` rejects before `docker.createContainer` is called.
- [ ] **Step 2: Run** `CI=true pnpm exec tsx --test tests/unit/publish-service.test.mjs tests/unit/workspace-service-wiring.test.mjs`; expected type/runtime failure because publish currently resolves env synchronously.
- [ ] **Step 3: Implement** `Promise<Record<string,string>>` in publish dependencies and `env: await deps.resolveEnv(...)`; update `getDatabaseUrl` dependency to return a promise and await it in `withDb`.
- [ ] **Step 4: Update app wiring** so callbacks return the orchestrator promises directly.
- [ ] **Step 5: Re-run** both tests; expected no container is started and no DB query occurs after an unavailable secret lookup.

### Task 4: Verify production guard and regression suite

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/factory.ts`
- Test: `tests/unit/workspace-real-adapter-factory.test.mjs`
- Modify: `docs/MVP_PENDING_TASKS.md`

**Interfaces:**
- Consumes: real adapter environment and the asynchronous secret store.
- Produces: a fail-closed real adapter and an evidence-backed Phase 7 checklist note.

- [ ] **Step 1: Keep the failing test** that `EVCP_WORKSPACE_REAL_ADAPTERS=1` without `EVCP_WORKSPACE_SECRET_KEY` throws before any adapter construction.
- [ ] **Step 2: Run** `CI=true pnpm exec tsx --test tests/unit/workspace-real-adapter-factory.test.mjs`; expected pass after the guard already added in this branch.
- [ ] **Step 3: Record** in `docs/MVP_PENDING_TASKS.md` that ciphertext persistence is code-complete only after Tasks 1–3, while clean-pilot provision/restart proof remains pending.
- [ ] **Step 4: Run** `CI=true pnpm exec tsx --test tests/unit/workspace-secret-store.test.mjs tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-delete.test.mjs tests/unit/publish-service.test.mjs tests/unit/workspace-real-adapter-factory.test.mjs`.
- [ ] **Step 5: Run** `CI=true pnpm check:changed --base origin/main`; expected changed-file checks pass.

## Self-review

- Secret durability and fail-closed behavior are handled by Tasks 1–2.
- Project database and publish consumers are handled by Task 3.
- The existing real-mode key guard and full regression evidence are handled by Task 4.
- The plan deliberately does not claim a clean-pilot, provider, backup, or rollback result because those require operator-owned infrastructure.
