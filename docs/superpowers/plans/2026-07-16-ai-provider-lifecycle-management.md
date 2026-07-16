# AI Provider & Credential Lifecycle Management (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the admin AI Providers console real lifecycle management — enable/disable and delete providers, and disable/delete credentials — not just "add". Addresses "หน้านี้มีแต่เพิ่ม ไม่มีจัดการ" (backlog E1.2 + API spec 5.3 which mandate PATCH/DELETE for providers and api-keys).

**Architecture:** Persisted path only (like `/ai/provider-catalog`); memory-mode dispatcher 404s and is not wired. `PlatformRequest.method` is GET/POST only, so mutations are POST endpoints with an action path + body. New mutation logic lives in a dedicated module; the narrowed `AiGovernancePersistenceClient` interface gains `delete`/status support, mirrored in the Prisma factory and the memory client. Boy-scout extraction of `MemoryAiGovernancePersistenceClient` frees the at-ceiling persistence file.

**Tech Stack:** TypeScript, NestJS (platform-api), Prisma, React + Vite (admin-web), `@evcp/ui`, Node test runner via `tsx`.

## Global Constraints

- **Three files are AT their size-ratchet ceiling** — do not grow them; net-shrink via extraction and re-baseline (`node scripts/quality/update-large-file-baseline.mjs`; never hand-raise a ceiling):
  - `apps/platform-api/src/persistence/ai-governance-repositories.ts` (508)
  - `apps/platform-api/src/platform-services.ts` (8429) — DO NOT touch; management is persisted-only, so no in-memory `AiGovernanceService` methods are added.
  - `packages/api-client/src/index.ts` (1066) — free room with a behavior-preserving re-export collapse (verify the collapsed block already re-exports all of its module's exports; `export type *`), then add methods.
- `app-factory.ts` (3576) has headroom; every new route path must be added to the `PlatformRequest.path` union, `isPersistenceAiGovernanceRoute`, AND `aiGovernanceHttpRoutes` (in `ai-governance-route-manifest.ts`), or it 404s over HTTP.
- POST endpoints only (no PATCH/DELETE). Admin-gated. Deleting a provider cascades: delete its api keys and clear (delete) any scenario routes referencing it, then the provider.
- Status values are the Prisma `AiProviderStatus` enum (`active`|`disabled`|`warning`|`error`) for providers and `"active"|"disabled"` for keys. Enable/disable toggles active↔disabled.
- Design system: only `@evcp/ui` token classes. No `window.confirm` for delete — use an inline confirm state in the component.
- Stage only the files each task touches; never `git add -A`. No `--no-verify`. No `git checkout/switch/stash/reset`.

---

### Task 1: Persistence — extraction + interface + mutation service

**Files:**
- Create: `apps/platform-api/src/persistence/ai-governance-memory-client.ts` (moved `MemoryAiGovernancePersistenceClient`)
- Modify: `apps/platform-api/src/persistence/ai-governance-repositories.ts` (extend interface + Prisma factory delete mappings + new service methods; net-shrink via the extraction)
- Modify: `scripts/quality/large-file-baseline.json` (re-baseline lower, via the script)
- Test: `tests/unit/ai-governance-lifecycle.test.mjs`

**Interfaces:**
- Extend `AiGovernancePersistenceClient`:
  - `aiProvider.delete(args: { where: { id: string } }): Promise<void>`
  - `aiApiKey.update(args: { where: { id: string }; data: { status: "active" | "disabled" } }): Promise<AiApiKeyRecord>`
  - `aiApiKey.delete(args: { where: { id: string } }): Promise<void>`
  - `aiScenarioRoute.deleteMany(args: { where: { OR: Array<{ primaryProviderId?: string; fallbackProviderId?: string }> } }): Promise<void>`
- New methods on `AiGovernanceRepositoryBackedService` (all `requireAdmin`):
  - `setProviderStatus(actor, providerId, status): Promise<AiProvider>` — findUnique → `aiProvider.upsert` preserving all fields with new `status`.
  - `deleteProvider(actor, providerId): Promise<void>` — delete keys where providerId, `aiScenarioRoute.deleteMany` for provider, then `aiProvider.delete`.
  - `setApiKeyStatus(actor, keyId, status): Promise<AiApiKey>` — `aiApiKey.update`.
  - `deleteApiKey(actor, keyId): Promise<void>` — `aiApiKey.delete`.

- [ ] **Step 1: Write the failing test** — new `tests/unit/ai-governance-lifecycle.test.mjs` seeding a `MemoryAiGovernancePersistenceClient` (imported from the new module path) with a provider + two keys + a route, then asserting: `setProviderStatus` flips to `disabled`; `setApiKeyStatus` flips a key to `disabled`; `deleteApiKey` removes one key (listApiKeys length drops); `deleteProvider` removes the provider, its remaining keys, and the route referencing it; each rejects for a non-admin actor.

- [ ] **Step 2: Run to verify it fails** — `node --import tsx --test tests/unit/ai-governance-lifecycle.test.mjs` → FAIL (methods/exports absent).

- [ ] **Step 3: Extract `MemoryAiGovernancePersistenceClient`** to `ai-governance-memory-client.ts` (move the class + its record-array state verbatim; import the record types from `./ai-governance-repositories`). Add delete/update handlers to its in-memory delegates (`aiProvider.delete` splices; `aiApiKey.update`/`delete`; `aiScenarioRoute.deleteMany` filters). Re-export it from `ai-governance-repositories.ts` (`export { MemoryAiGovernancePersistenceClient } from "./ai-governance-memory-client"`) so existing imports keep working.

- [ ] **Step 4: Extend the interface + Prisma factory** in `ai-governance-repositories.ts` — add the four interface members above; in `createPrismaAiGovernancePersistence`, map them to the Prisma delegates (`prisma.aiProvider.delete`, `prisma.aiApiKey.update`, `prisma.aiApiKey.delete`, `prisma.aiScenarioRoute.deleteMany`).

- [ ] **Step 5: Add the four service methods** to `AiGovernanceRepositoryBackedService` (signatures above).

- [ ] **Step 6: Run tests + re-baseline** — tests pass; confirm `ai-governance-repositories.ts` net-shrank below 508 (`wc -l`); `node scripts/quality/update-large-file-baseline.mjs`; keep `seed.ts` baseline unchanged (revert if the script touches it). `pnpm typecheck`.

- [ ] **Step 7: Commit** — stage the two persistence files, the new test, and `large-file-baseline.json`.

---

### Task 2: HTTP routes + api-client

**Files:**
- Modify: `apps/platform-api/src/ai-governance/ai-governance-routes.ts` (persisted dispatcher: 4 POST handlers)
- Modify: `apps/platform-api/src/app-factory.ts` (path union + `isPersistenceAiGovernanceRoute` + import), `apps/platform-api/src/ai-governance/ai-governance-route-manifest.ts` (4 entries)
- Modify: `packages/api-client/src/index.ts` (free room via re-export collapse + 4 methods), `packages/api-client/src/ai-governance-types.ts` (input DTOs if needed)
- Test: `tests/unit/api-client-ai-reads.test.mjs` (4 method request-shape tests)

**Routes (persisted dispatcher only):**
- `POST /ai/providers/status` `{ providerId, status }` → `setProviderStatus` → `success(provider)`
- `POST /ai/providers/delete` `{ providerId }` → `deleteProvider` → `success({ id: providerId })`
- `POST /ai/api-keys/status` `{ keyId, status }` → `setApiKeyStatus` → `success(key)`
- `POST /ai/api-keys/delete` `{ keyId }` → `deleteApiKey` → `success({ id: keyId })`

**api-client methods:** `setAiProviderStatus(providerId, status)`, `deleteAiProvider(providerId)`, `setAiApiKeyStatus(keyId, status)`, `deleteAiApiKey(keyId)` — each `this.request("/ai/...", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({...}) })`.

- [ ] **Step 1: Free room in `index.ts`** — collapse one enumerated re-export block whose target module it already re-exports in full (verify like the earlier `ai-governance-types` case) to `export type * from "./<module>"`; confirm `pnpm --filter @evcp/api-client typecheck` clean and the public surface is unchanged.
- [ ] **Step 2: Add api-client methods + the 4 request-shape tests (failing first)**; run `tests/unit/api-client-ai-reads.test.mjs` → the 4 new cases fail, then pass after adding the methods.
- [ ] **Step 3: Add the 4 route handlers** to `handleAiGovernanceRoute` (inside the `aiGovernancePersistence` block), resolving the user via `resolvePersistenceUser` and calling the Task 1 service methods.
- [ ] **Step 4: Wire app-factory** — add the 4 paths to the `PlatformRequest.path` union, to `isPersistenceAiGovernanceRoute`, and to `aiGovernanceHttpRoutes`.
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck`; stage the 5 files + test.

---

### Task 3: Hook + console UI

**Files:**
- Modify: `apps/admin-web/src/features/ai-governance/use-ai-governance.ts` (4 mutations updating the snapshot)
- Modify: `apps/admin-web/src/features/ai-governance/ProviderCard.tsx` (status badge + Enable/Disable + Delete with inline confirm)
- Modify: `apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx` (credentials list: disable/delete actions; pass handlers)
- Test: `tests/unit/admin-web-render-smoke.test.mjs`

**Hook mutations** (mirror `createProvider`'s snapshot-update pattern, `requireReadyClient()`):
- `setProviderStatus(providerId, status)` → update provider in snapshot.
- `removeProvider(providerId)` → drop provider + its keys + routes from snapshot.
- `setCredentialStatus(keyId, status)` → update key in snapshot.
- `removeCredential(keyId)` → drop key from snapshot.

- [ ] **Step 1: Add render-smoke assertions (failing)** — extend the ProviderDrawer/console render probe (or the existing `AiProvidersConsole` stub-hook probe) to assert the card renders an Enable/Disable control and the console renders a credential Delete control; source-scan `ProviderCard.tsx` for `provider.status` usage.
- [ ] **Step 2: Add the 4 hook mutations** + return them; extend the stub hooks in the render probes.
- [ ] **Step 3: ProviderCard** — show `<Badge tone={...}>{provider.status}</Badge>`; add buttons: Enable/Disable (calls `setProviderStatus` with the opposite status) and Delete (two-click inline confirm: first click sets a local `confirming` state, second calls `removeProvider`). Accept the new handlers as props from the console.
- [ ] **Step 4: AiProvidersConsole** — replace the read-only credentials `DataTable` with a small list/table that renders per-row Disable/Enable + Delete (inline confirm) wired to `setCredentialStatus`/`removeCredential`; pass `setProviderStatus`/`removeProvider` to `ProviderCard`.
- [ ] **Step 5: Run tests + gates** — render-smoke pass; `pnpm typecheck`; `pnpm check:design-system`.
- [ ] **Step 6: Commit** — stage the 4 files.

---

## Self-review notes
- Scope: enable/disable + delete for providers and credentials, persisted-only, admin-gated, cascade on provider delete. No PATCH of provider fields (name/baseUrl/models edit) and no tabbed layout — those are follow-ups (S1b / S2).
- Ratchet: persistence file net-shrinks via the memory-client extraction; api-client frees room via a re-export collapse; platform-services.ts untouched (no in-memory service methods).
- Type consistency: status literals match the Prisma enum; api-client method names match the hook call sites; route paths match between api-client, the manifest, the predicate, and the `PlatformRequest.path` union.
