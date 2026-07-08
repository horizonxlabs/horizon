# creator-web modularization — Phase A

**Goal:** Break `apps/creator-web/src/main.tsx` (3499 lines, one file) into focused, testable modules WITHOUT changing any runtime behavior, and add a repo quality gate that flags large files.

**Hard constraint — behavior preservation:** This is a pure *move code + wire imports* refactor. Do NOT rewrite logic, rename exported behavior, change JSX output, or "improve while you're there". Every symbol keeps its exact implementation; you only relocate it and add `export` + `import`. After the refactor the app must render and behave identically. `main.tsx` shrinks; the `CreatorApp` component and its 6 page sections STAY in `main.tsx` for this phase (Phase B will split those).

## Target module structure (all under `apps/creator-web/src/`)

Create these files and MOVE the listed symbols out of `main.tsx` into them (add `export`), then `import` them back into `main.tsx`. Keep each new file ≤ 400 lines.

1. **`types.ts`** — shared type/interface declarations that are used across modules:
   `CreatorProjectView`, `CreatorBootstrapState`, `CreateProjectFormState`, `CreatorPage`, `NativeLoginResult`. (Leave types that are only used inside `CreatorApp` where they are if moving them is awkward.)

2. **`lib/routing.ts`** — pure routing/URL helpers:
   `creatorPageFromPath`, `projectRouteSegmentFromPath`, `slugifyProjectName`, `createCreatorNavigation`, `creatorPageCopy`, `apiBaseUrl`.

3. **`lib/session.ts`** — session/auth helpers:
   `platformSessionToken`, `persistLoginSession`, `needsPasswordChange`, `clearLoginSession`, `hasValidSession`, `vibeAuthHeaders`. (These already exist as standalone functions.)

4. **`lib/vibe-actions.ts`** — vibe action presentation model:
   `VibeAction` (type), `VIBE_ACTION_VERBS`, `vibeActionVerb`, `vibeActionIcon`.

5. **`lib/vibe-stream.ts`** — the ONE piece that needs a real (behavior-preserving) extraction. Inside `CreatorApp` there is an SSE handler that folds `token` / `action_start` / `action_result` / `commit` / `error` events into the assistant message + its `actions` (the code that calls `patchAssistant(...)`). Extract the PURE state-transition as a testable reducer:
   ```ts
   // one SSE frame applied to an assistant message
   export function applyVibeEvent(
     message: VibeMessage,
     type: string,
     data: Record<string, unknown>
   ): VibeMessage { ... }
   ```
   Then in `CreatorApp`, replace the inline per-event object-building with `patchAssistant((m) => applyVibeEvent(m, type, data))`. The reducer must produce byte-identical results to the current inline logic (same action_start→running, action_result→done/failed upsert-by-id, token append, commit sha, error text). If `VibeMessage` is defined inside `CreatorApp`, promote it to `types.ts` or `lib/vibe-stream.ts` so the reducer can be typed. Do NOT change what the UI renders.

6. **`lib/creator-client.ts`** — API client + mappers:
   `createCreatorPlatformClient`, `projectToView`, `clearCreatorSessionBridge`.

7. **`data/mock-data.ts`** — the static/mock/sample data consts (they are placeholder UI data):
   `fallbackSelectedProject`, `initialCreatorBootstrap`, `initialCreateProjectForm`, `creatorSessionBridgeProfile`, `wizardSteps`, `prdSections`, `versionRows`, `fallbackPreview`, `fallbackTaskSteps`, `usageRows`, `databaseTables`, `sampleRecords`, `migrationRows`, `checkpointRows`, `appMembers`, `pendingInvites`, `accessRequests`, `appRoles`, `publishChecklist`, `creatorTickets`, `prdChangeRows`, `traceRows`, `mvpDemoSteps`. If this exceeds 400 lines, split into `data/mock-data.ts` + `data/publish-data.ts` (publish/store/tickets-related) so each stays ≤400.

8. **`components/VibeActionRow.tsx`**, **`components/LoginScreen.tsx`**, **`components/ChangePasswordScreen.tsx`** — move each component out verbatim. `CreatorAuthGate` may stay in `main.tsx` (it wires the top-level auth flow) or move to `components/` — your call, but keep `main.tsx`'s entry (`createRoot(...).render`) intact.

`main.tsx` keeps: the imports, `CreatorApp` + its 6 page render sections, `CreatorAuthGate`/render entry.

## Tests (this is the point — must be genuinely testable)

The repo has NO DOM/testing-library; tests are `node:test` `.mjs` run via `node --import tsx --test`, importing `.ts` modules directly. Add REAL unit tests (not source-inspection) for the pure logic, in `tests/unit/`:

- `tests/unit/creator-web-routing.test.mjs` — `creatorPageFromPath` (each path → page), `projectRouteSegmentFromPath`, `slugifyProjectName` (spaces/caps/symbols → slug), `createCreatorNavigation` (builds routes from project.id).
- `tests/unit/creator-web-session.test.mjs` — `needsPasswordChange`, `hasValidSession` (with a stubbed localStorage/global), `vibeAuthHeaders` (Bearer prefixing). Stub `globalThis.localStorage` / `window` as needed.
- `tests/unit/creator-web-vibe-actions.test.mjs` — `vibeActionVerb` (file/edit/shell/migration × running/done/failed), `vibeActionIcon`.
- `tests/unit/creator-web-vibe-stream.test.mjs` — `applyVibeEvent`: token appends text; action_start adds a running action; action_result upserts the same actionId to done/failed and attaches find/replace/body/error; commit sets commitSha; unknown event is a no-op. This is the highest-value test.

Follow the existing `.mjs` test style (see `tests/unit/find-replace.test.mjs`, `tests/unit/api-client-runtime.test.mjs`). Import the `.ts` modules directly.

## Large-file quality gate

Add a "large file" check to `scripts/quality/check-changed.mjs` (it already runs conflict-marker + oxlint + prettier on changed files; add a step there so it runs the same way):

- For each CHANGED `.ts`/`.tsx`/`.mjs` file, fail if it exceeds **400** lines.
- **Grandfather** the files that are already over 400 via an allowlist constant so pre-existing large files don't block unrelated work. Seed the allowlist with EXACTLY these current offenders:
  `apps/platform-api/src/platform-services.ts`, `apps/admin-web/src/main.tsx`, `apps/platform-api/src/app-factory.ts`, `apps/creator-web/src/main.tsx`, `apps/platform-api/prisma/seed.ts`, `apps/platform-api/src/persistence/publish-store-repositories.ts`, `packages/api-client/src/index.ts`, `apps/app-store-pwa/src/main.tsx`, `apps/platform-api/src/persistence/core-repositories.ts`, `apps/platform-api/src/persistence/generated-runtime-repositories.ts`, `apps/platform-api/src/persistence/ai-governance-repositories.ts`, `apps/platform-api/src/persistence/workspace-repositories.ts`, `packages/ui/src/index.tsx`.
- Emit a clear message on failure: `<file> is <N> lines (limit 400) — split it into focused modules`. Print the allowlisted-but-oversized files as an informational note (so the debt is visible) without failing.
- The NEW extracted modules and NEW test files must all be ≤400 lines (that's the design target).

## Verification (all must pass before you report done)

1. `cd apps/creator-web && npx tsc --noEmit` → 0 errors.
2. `cd apps/creator-web && npx vite build` (or `npm run build`) → succeeds (proves the app still compiles/bundles).
3. `node --import tsx --test tests/unit/creator-web-*.test.mjs` → all pass.
4. Full suite: `node --import tsx --test tests/unit/*.test.mjs tests/integration/*.test.mjs` → `fail 0` (same pass count as before + your new tests; if a pre-existing source-inspection test asserts something now moved out of main.tsx, update that test to read the new module path — note any such change).
5. `npx prettier --write` on every file you created/changed; `--check` clean.
6. `main.tsx` is substantially smaller (report before/after line counts) and every new file is ≤400 lines.
7. The large-file check: create a temp 401-line file, run the check, confirm it FAILS; delete the temp file; confirm the check passes on the real changed set.

Do NOT commit. Report: before/after main.tsx line count, the list of new files with line counts, the new test counts, and confirmation of each verification step.
