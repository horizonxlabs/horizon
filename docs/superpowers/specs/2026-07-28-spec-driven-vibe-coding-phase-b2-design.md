# Spec-Driven Vibe Coding — Phase B2 Design (Spec-Delta Gate)

**Status:** Approved (approach chosen by the maintainer: production-ready path).
**Date:** 2026-07-28
**Branch:** `codex/spec-driven-vibe-coding` (continues Phase A + B).

## Goal

When a Creator approves a plan (Phase B's "Approve & implement"), also record a
**durable PRD version** capturing that change, so the product spec evolves
alongside the app. The Creator promotes it to the baseline through the existing
governed confirm-baseline flow, after which Phase A grounds future generation on
the evolved spec. This makes the spec a living, governed record of what the app
became — not just the initial PRD.

## Chosen approach + rationale (production-ready)

Three approaches were considered: (1) full change-request lifecycle
(create change → review → decide → version), (2) direct version creation, (3)
defer/tag-only. **Approach 2 is chosen** because it is the production-ready
balance:

- It produces a **durable, audited PRD version** (reusing `createVersionFromChange`).
- It is **governance-safe**: the version is created as a **draft (non-baseline)**;
  the spec-of-record (the baseline Phase A grounds on) only changes when a human
  explicitly confirms it — the platform treats the PRD baseline as a governed
  artifact, so auto-rewriting it on every plan approval is not acceptable.
- It **reuses the existing confirm-baseline route and PRD-versions UI**, so no
  new approval UI is needed.
- It is **fail-soft**: recording the PRD version must never block the build the
  Creator asked for.

The full lifecycle (1) adds a redundant human decision step (the Creator already
approved the plan) and heavier frozen-file surgery; the defer option (3) does not
achieve a durable, groundable spec. Auto-confirming the baseline (option "b") is
rejected for the governance reason above.

## Background — current state

- **Phase B shipped.** `approveAndImplement(sourcePrompt, planText)` (in
  `use-vibe-chat.ts`) sends a build turn carrying the approved plan.
- **PRD change → version machinery exists.**
  `PrdService.createVersionFromChange(actor, projectId, change: PrdChangeRequest)`
  creates a new `PrdVersion` (`status: "baseline"`, `isBaseline: false`, version
  `1.N`) from a change. `PrdChangeSourceType` already includes **`"prompt"`** —
  the correct source type for plan/prompt-originated changes; no enum change.
- **Confirm-baseline already exposed.** `POST /projects/:projectId/prd/baseline`
  (→ `services.prds.confirmBaseline`) and `GET /projects/:projectId/prd/versions`
  already back the PRD-versions UI, where the Creator confirms a version as the
  baseline.
- **Standalone route pattern exists.** `chat-route.ts` is a standalone handler
  registered in `app-factory.ts` via `rawApp.all("/projects/:projectId/chat", …)`
  and resolves auth through `deps.resolveAuth(req)` + `isMember(auth, projectId)`.
  Phase B2 adds one more standalone route the same way (avoids the big
  `executePlatformApiRequest` dispatch switch).

## Components

1. **`apps/platform-api/src/prd/plan-change.ts`** (new, pure, not frozen) —
   `buildPlanChangeRequest(projectId: string, title: string, planText: string):
   PrdChangeRequest`. Synthesizes a well-formed `PrdChangeRequest` with
   `sourceType: "prompt"`, `proposedRequirement: planText`, a trimmed `title`,
   empty `affectedSections`/`acceptanceCriteria`, a generated `id`, `status`
   (`"pending"`), empty `decisions`, and ISO timestamps — everything
   `createVersionFromChange` reads. Unit-tested directly.

2. **`apps/platform-api/src/prd/plan-version-route.ts`** (new standalone handler,
   not frozen) — `createPlanVersionHandler({ resolveAuth, prds })` returns an HTTP
   handler for `POST /projects/:projectId/prd/versions/from-plan`. It resolves
   auth, checks `isMember`, parses `{ title, planText }` from the body, calls
   `prds.createVersionFromChange(actor, projectId, buildPlanChangeRequest(...))`,
   and responds `200 { version: { id, version, changeSummary } }`. Invalid body →
   `400`; non-member → `403`; missing PRD (no current version) → `409` with the
   service error message. Mirrors `chat-route.ts`'s auth + membership guards.

3. **`apps/platform-api/src/app-factory.ts`** (frozen 3390) — register the route:
   `rawApp.all("/projects/:projectId/prd/versions/from-plan", planVersionHandler)`
   and build `planVersionHandler` from the same `resolveAuth` used for the chat
   route plus `services.prds`. The few added lines are offset by a small
   boy-scout extraction of an adjacent cohesive block into a focused module, so
   the file does not grow past its baseline.

4. **`apps/creator-web/src/features/workspace/api.ts`** — add
   `recordPrdVersionFromPlan(projectId, title, planText): Promise<void>` that
   POSTs to the new route (reusing `apiBaseUrl()` + `vibeAuthHeaders()`), returning
   quietly on failure (best-effort). The request body is built by a pure
   `planVersionBody(title, planText)` helper (unit-tested, mirrors `vibeChatBody`).

5. **`apps/creator-web/src/features/workspace/use-vibe-chat.ts`** —
   `approveAndImplement` additionally fires `recordPrdVersionFromPlan(projectId,
   title, planText)` — where `title` is `sourcePrompt` trimmed to its first 80
   characters, or `"Approved plan"` when empty — as a best-effort side effect and
   sets a status hint (`"Plan approved → PRD draft updated; confirm baseline in
   the PRD tab"`) on success. A failure to record the PRD version never blocks or
   fails the build turn.

## Data flow

Creator clicks "Approve & implement" → `approveAndImplement` → (a) build turn
with the approved plan (Phase B, primary) **and** (b) `recordPrdVersionFromPlan`
→ `POST /projects/:id/prd/versions/from-plan` → `createVersionFromChange` with a
`"prompt"`-sourced change → new **draft** `PrdVersion` (non-baseline) → appears in
the PRD-versions UI → Creator confirms it as baseline via the existing
`POST /projects/:id/prd/baseline` → Phase A grounds subsequent turns on it.

## Error handling

- No PRD document / no current version → the route returns `409`; the frontend
  swallows it (a project with no PRD simply records nothing). The build is
  unaffected.
- Any network/auth failure recording the version is caught in
  `recordPrdVersionFromPlan` and ignored — the approve/build path is primary.
- The plan text is untrusted model output; it becomes `proposedRequirement` text
  on a draft version that a human reviews before confirming as baseline.

## Testing

- **Unit — `plan-change`:** `buildPlanChangeRequest` returns a change with
  `sourceType: "prompt"`, `proposedRequirement === planText`, a trimmed title,
  and empty `affectedSections`/`acceptanceCriteria`.
- **Unit — `plan-version-route`:** with a fake `prds`/`resolveAuth`, a POST with
  `{ title, planText }` calls `createVersionFromChange` with a `"prompt"` change
  and returns the version; a non-member gets `403`; an invalid body gets `400`.
- **Unit — `planVersionBody`:** returns `{ title, planText }`.
- **Integration — PRD version from plan:** against real in-memory services, a
  project with a confirmed PRD baseline, calling the flow creates a new
  non-baseline version that then appears in `listVersions`, and `confirmBaseline`
  can promote it (so Phase A would ground on it).
- **Render smoke:** creator page still renders (the status hint is plain text).

## Acceptance criteria

- Approving a plan creates a new **non-baseline** PRD version whose
  `proposedRequirement`/summary reflects the plan, visible via `GET .../prd/versions`.
- Confirming that version as baseline makes `renderBaselineSpec` (Phase A) return
  it — i.e., the evolved spec grounds the next generation turn.
- A build turn is never blocked or failed by PRD-version recording.
- `pnpm check` passes; `generation-service.ts` ≤ 400; `app-factory.ts` and
  `platform-services.ts` do not exceed their baselines; no app-local styles.

## Out of scope (YAGNI)

- Auto-confirming the baseline (rejected on governance grounds).
- Editing/merging plan text into specific PRD sections (the change is recorded as
  a whole; section-level editing stays in the existing PRD UI).
- Surfacing the plan-sourced change in the change-request review queue (that is
  the full-lifecycle approach, not chosen).
