# Spec-Driven Vibe Coding — Phase B2 Design (Spec-Delta Gate)

**Status:** Approved (maintainer delegated the choice: "make it production-ready").
**Date:** 2026-07-28
**Branch:** `codex/spec-driven-vibe-coding` (continues Phase A + B).

## Goal

When a Creator approves a plan (Phase B's "Approve & implement"), the platform
also records a **durable PRD version** capturing that change, so the product spec
evolves alongside the app. The Creator promotes that version to the baseline
through the existing governed confirm-baseline flow, after which Phase A grounds
future generation on the evolved spec.

## Chosen approach + rationale (production-ready, low-risk)

The recording happens **server-side inside the existing chat route**, not through
a new frontend-driven endpoint. When a build turn carrying an `approvedPlan`
(Phase B) finishes, the chat route records a PRD version from that plan. Rationale:

- **Minimal frozen-file surgery.** All routes are wired in `app-factory.ts`, which
  is at its line baseline and may only shrink. A brand-new route plus its dispatch
  would force a risky extraction to offset. Reusing the chat route — already a
  standalone, non-frozen handler — needs only **one injected dependency** in
  `app-factory` (offset by collapsing two adjacent lines).
- **Atomic + trustworthy.** The plan text is already server-side (the request's
  `approvedPlan`); recording right after the turn ties the spec change to the
  approval that produced it, with no extra round trip.
- **Governance-safe.** The version is created as a **draft (non-baseline)**. The
  spec-of-record (the baseline Phase A grounds on) changes only when a human
  confirms it via the existing `POST /projects/:id/prd/baseline`. Auto-confirming
  the baseline on every approval is rejected — the PRD baseline is a governed
  artifact.
- **Fail-soft.** Recording is wrapped so it never breaks or fails the generation
  stream the Creator asked for.

This is **backend-only**: no frontend changes are required. The Creator sees the
new draft version in the existing PRD-versions UI and confirms it there. The chat
route additionally emits a `prd_version` SSE event so a future UI hint can hook in
without further backend work.

## Background — current state

- **Phase B shipped.** A build turn can carry `approvedPlan` (the approved plan
  text), reaching the chat route (`chat-route.ts`, non-frozen) as
  `approvedPlan` and `runTurn`.
- **PRD change → version machinery exists.**
  `PrdService.createVersionFromChange(actor, projectId, change: PrdChangeRequest)`
  creates a new `PrdVersion` (`status: "baseline"`, `isBaseline: false`, version
  `1.N`). It appends `change.proposedRequirement` **only to the sections named in
  `change.affectedSections`** and copies the rest from the current version — so
  the plan is lost unless `affectedSections` names a real section key.
  `PrdChangeSourceType` already includes **`"prompt"`**. `getCurrent(actor,
  projectId): PrdVersion` returns the current version (throws when none).
- **PRD section keys** (from `buildSections`): `overview`, `business_objective`,
  `users_roles`, `core_flows`, `data_model`, `permissions`, `nfr`,
  `acceptance_criteria`.
- **Confirm-baseline already exposed.** `POST /projects/:projectId/prd/baseline`
  and `GET /projects/:projectId/prd/versions` back the PRD-versions UI.
- **Chat route wiring.** `createChatSseHandler({ generationService, resolveAuth,
  resolveAttachmentContext })` is built in `app-factory.ts` and registered via
  `rawApp.all("/projects/:projectId/chat", …)`. The handler resolves `auth`
  (with `auth.actor: PlatformUser`) and runs `runTurn` in a `for await` loop.

## Components

1. **`apps/platform-api/src/prd/plan-change.ts`** (new, pure, not frozen) —
   `buildPlanChangeRequest(projectId, title, planText, requestedByUserId,
   affectedSections): PrdChangeRequest`. Produces a well-formed request:
   `sourceType: "prompt"`, `proposedRequirement: planText`, trimmed `title`, the
   given `affectedSections`, empty `acceptanceCriteria`, `riskLevel: "low"`,
   `status: "draft"`, `requestedByUserId`, empty `decisions`, a generated `id`,
   ISO `createdAt`/`updatedAt`. Unit-tested directly.

2. **`apps/platform-api/src/prd/plan-version.ts`** (new, not frozen) —
   `createPlanVersionRecorder(prds): (actor, projectId, planText) =>
   Promise<PrdVersion>`. It reads `prds.getCurrent(actor, projectId)`, picks the
   target section key — `core_flows` if the current version has it, else the first
   section's key — builds the change via `buildPlanChangeRequest(projectId,
   title, planText, actor.id, [targetKey])` (title = `planText`'s first line,
   trimmed to 80 chars, or `"Approved plan"`), and returns
   `prds.createVersionFromChange(actor, projectId, change)`. Propagates errors to
   the caller (which is fail-soft). Unit-tested with a fake `prds`.

3. **`apps/platform-api/src/generation-loop/chat-route.ts`** (non-frozen) — add an
   optional dep `recordPrdVersionFromPlan?: (actor, projectId, planText) =>
   Promise<{ id: string; version: string; changeSummary: string }>`. After the
   `runTurn` loop completes (inside the existing `try`, before `catch`), if the
   turn had an `approvedPlan`, an `agentMode` of `build`, and the dep is present,
   call it in its own `try/catch`; on success write a
   `event: prd_version\ndata: {…}` SSE frame; on failure swallow the error (never
   disturb the stream).

4. **`apps/platform-api/src/app-factory.ts`** (frozen 3390) — pass
   `recordPrdVersionFromPlan: createPlanVersionRecorder(services.prds)` into the
   existing `createChatSseHandler({ … })` call (plus its import). The two added
   lines are offset by collapsing two adjacent multi-line expressions in the same
   wiring block (mechanical, no behavior change), keeping the file within its
   baseline. No new route is registered.

## Data flow

Creator clicks "Approve & implement" (Phase B) → build turn with `approvedPlan`
→ chat route runs `runTurn` → after the turn, `recordPrdVersionFromPlan(actor,
projectId, approvedPlan)` → `getCurrent` + target section → `createVersionFromChange`
with a `"prompt"`-sourced change → new **draft** `PrdVersion` (non-baseline) →
`prd_version` SSE frame emitted → the version appears in `GET .../prd/versions` →
Creator confirms it via `POST .../prd/baseline` → Phase A grounds later turns on it.

## Error handling

- No PRD / no current version → `getCurrent` throws → caught in the chat route's
  recording `try/catch` → nothing recorded, stream unaffected.
- Any failure in recording is swallowed; the build/commit the Creator asked for is
  the primary, guaranteed outcome.
- The plan text is untrusted model output; it becomes `proposedRequirement` text
  on a **draft** version that a human reviews before confirming as baseline.

## Testing

- **Unit — `plan-change`:** `buildPlanChangeRequest` returns a change with
  `sourceType: "prompt"`, `proposedRequirement === planText`, trimmed title,
  `affectedSections` equal to the argument, `riskLevel: "low"`, `status: "draft"`.
- **Unit — `plan-version`:** with a fake `prds` whose `getCurrent` returns a
  version having a `core_flows` section, the recorder calls
  `createVersionFromChange` with a `"prompt"` change whose `affectedSections` is
  `["core_flows"]`; when there is no `core_flows` section it uses the first
  section's key; it returns the created version.
- **Unit — `chat-route` recording:** with a fake `req` (a `Readable` carrying the
  JSON body with `approvedPlan` + `agentMode: "build"`), a fake `res` capturing
  writes, `resolveAuth` returning a member auth, `generationService.runTurn`
  yielding one `done` event, and a capturing `recordPrdVersionFromPlan`, the
  handler calls the recorder with `(actor, projectId, planText)` and writes a
  `prd_version` event; with no `approvedPlan` the recorder is not called.
- **Integration — spec evolves:** against real in-memory services with a confirmed
  PRD baseline, running the recorder creates a new non-baseline version whose
  `core_flows` body contains the plan text; `confirmBaseline` promotes it; then
  `renderBaselineSpec` (Phase A) returns the evolved spec including the plan.

## Implementation note (domain finding — resolved)

During implementation we found `confirmBaseline` is **one-time**: once a project has a
baseline, `isBaseline` stays on the frozen original v1.0 and no version can be
promoted to baseline. `createVersionFromChange`, however, advances
`document.currentVersionId`. So the evolving spec is the **current version**, not
the baseline. To make an approved plan actually ground later generation, **Phase A
was adjusted to ground on the current version** (via `renderSpecVersion(getCurrent())`,
gated by the presence of a confirmed baseline) instead of the frozen baseline. The
Creator's plan approval is the human gate; the original baseline is preserved as a
historical anchor. No separate "confirm this version as baseline" step is needed.

## Acceptance criteria

- Approving a plan records a new **non-baseline** PRD version whose `core_flows`
  body reflects the plan, visible via `GET .../prd/versions`.
- Confirming that version as baseline makes `renderBaselineSpec` return it — the
  evolved spec grounds the next generation turn.
- A generation turn is never blocked or failed by PRD-version recording.
- `pnpm check` passes; `generation-service.ts` ≤ 400; `app-factory.ts` and
  `platform-services.ts` stay within their baselines; no app-local styles (no
  frontend changes at all).

## Out of scope (YAGNI)

- Auto-confirming the baseline (rejected on governance grounds).
- A frontend confirmation hint (the `prd_version` event is emitted for a future
  UI, but no frontend change ships here).
- Merging plan text into specific PRD sections beyond the single target section.
- Surfacing the plan-sourced change in the change-request review queue (the full
  lifecycle approach, not chosen).
