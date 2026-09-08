# Pi Context Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce wasted Pi model rounds and context growth while preserving Horizon's existing workspace transaction safety.

**Architecture:** Build a deterministic context pack from the workspace tree before opening the Pi session, hydrate only a bounded recent conversation, and persist a compact structured handoff after each turn. Expose counters from the governed Pi runtime and record one audit event per turn; continue to use the existing per-project lock and per-turn session so rollback state never leaks into a later request.

**Tech Stack:** TypeScript 7, Node.js test runner, Pi coding-agent SDK, Prisma-backed chat history

**Spec:** `docs/superpowers/specs/2026-09-08-pi-context-efficiency.md`

## Global Constraints

- Preserve the single-writer project lock and snapshot/validation/commit/rollback lifecycle.
- Do not retain an in-memory session across independent requests.
- Do not spend an additional LLM round to create summaries.
- Keep initial context deterministic and bounded by file count and total characters.

---

### Task 1: Relevant workspace context pack

**Files:**

- Modify: `apps/platform-api/src/generation-loop/context-selector.ts`
- Modify: `apps/platform-api/src/generation-loop/container-files.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-service-types.ts`
- Modify: `apps/platform-api/src/generation-loop/factory.ts`
- Modify: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Test: `tests/unit/context-selector.test.mjs`
- Test: `tests/unit/container-files-reader.test.mjs`

**Interfaces:**

- Produces: `selectContextPaths(paths, prompt, maxFiles)` and `selectLiveContextFiles(files, prompt, options)`.
- Consumes: the workspace tree already loaded for the system prompt.

- [x] **Step 1: Write failing selector tests** for explicit paths, core-file fallback, stable ordering, file-count cap, and total-character cap.
- [x] **Step 2: Run the focused tests** with `node --import tsx --test tests/unit/context-selector.test.mjs tests/unit/container-files-reader.test.mjs` and verify the new assertions fail because the APIs or behavior do not exist.
- [x] **Step 3: Implement path selection and targeted container reads** with validated paths sourced only from the workspace tree.
- [x] **Step 4: Wire the context pack into generation** so live files are selected, bounded, and used before template fallback.
- [x] **Step 5: Run the focused tests** and verify they pass.

### Task 2: Bounded history and persisted handoff summary

**Files:**

- Create: `apps/platform-api/src/generation-loop/pi-context-memory.ts`
- Modify: `apps/platform-api/src/generation-loop/pi-session-context.ts`
- Modify: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Test: `tests/unit/pi-context-memory.test.mjs`
- Test: `tests/unit/pi-session-context.test.mjs`
- Test: `tests/unit/pi-generation-service.test.mjs`

**Interfaces:**

- Produces: `selectRecentPiHistory(messages, currentMessageId, maxMessages)` and `refreshRollingSummary(store, projectId)`.
- Consumes: `ChatHistoryStore.listRecentMessages`, `getSummary`, and `putSummary`.

- [x] **Step 1: Write failing history and summary tests** proving old messages are omitted, current/system messages are excluded, recent order is retained, and summaries remain bounded.
- [x] **Step 2: Run the focused tests** and verify failure for missing behavior.
- [x] **Step 3: Implement deterministic recent-history selection and structured summary refresh** without a model call.
- [x] **Step 4: Wire summary refresh after success and error persistence** without changing commit or rollback ordering.
- [x] **Step 5: Run the focused tests** and verify they pass.

### Task 3: Round, compaction, and outcome telemetry

**Files:**

- Modify: `apps/platform-api/src/generation-loop/pi-provider.ts`
- Modify: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Test: `tests/unit/pi-provider.test.mjs`
- Test: `tests/unit/pi-generation-service.test.mjs`

**Interfaces:**

- Produces: runtime counters for completed/started model rounds and one `pi_turn` audit record per request.
- Consumes: the existing `onAudit` callback and Pi session lifecycle events.

- [x] **Step 1: Write failing telemetry tests** for round counters and success/failure audit metadata.
- [x] **Step 2: Run the focused tests** and verify the missing counters/audit fail.
- [x] **Step 3: Expose runtime counters and collect compaction events** without logging prompt or tool payload contents.
- [x] **Step 4: Emit one audit record in `finally`** with outcome, rounds, tool calls, token usage, and compaction count.
- [x] **Step 5: Run the focused tests** and verify they pass.

### Task 4: Prompt efficiency and regression verification

**Files:**

- Modify: `apps/platform-api/src/generation-loop/system-prompt.ts`
- Test: `tests/unit/pi-session-context.test.mjs`

**Interfaces:**

- Consumes: the bounded context pack embedded under `Current project files`.
- Produces: a prompt contract that avoids redundant reads and duplicate pre-validation.

- [x] **Step 1: Write failing prompt behavior assertions** that supplied files count as inspected and Horizon owns final validation.
- [x] **Step 2: Run the focused test** and verify the old prompt fails the assertions.
- [x] **Step 3: Update Build and Auto prompt guidance** while retaining mutation-authority and tool-safety rules.
- [x] **Step 4: Run all generation-loop unit tests**, then platform API typecheck, lint for changed files, and platform API build.
- [x] **Step 5: Review the final diff** for unrelated changes and record any pre-existing suite failures separately.

## Verification note

- `pnpm test:unit`: 1,665 passed, 1 skipped, 0 failed.
- Focused workspace persistence integration: 5 passed.
- Pi workspace flow integration: 3 passed.
- `pnpm typecheck`, Platform API build, and `pnpm check:changed`: passed.
- The repo-wide `pnpm test` remains blocked by the pre-existing `frontend-api-bootstrap-contract` expectation for the removed Admin `services` page; the Pi integration regression found during this work was updated and passes.
