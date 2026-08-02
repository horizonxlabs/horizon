# Spec-Driven Vibe Coding — Design

**Status:** Approved for Phase A; Phase B outlined for a follow-up spec.
**Date:** 2026-07-21
**Branch:** `codex/spec-driven-vibe-coding`

## Goal

Make the workspace generation loop ("vibe coding") build against the project's
approved PRD (the spec), so generated changes stay grounded in the agreed
product intent instead of being driven only by the latest ad-hoc chat prompt.

Two phases:

- **Phase A (this spec, implement now):** the confirmed PRD baseline is injected
  into the generation system prompt as governed context, so the AI builds toward
  it — a lightweight extension of the skill/knowledge injection already shipped.
- **Phase B (outlined; own spec later):** a spec-first gated flow (plan → human
  approve → implement → validate against acceptance criteria).

## Background — current state

The platform already has both pieces, but they are disconnected:

- **PRD lifecycle exists.** `PrdService` (`apps/platform-api/src/platform-services.ts`)
  generates PRDs, versions them, and confirms a baseline (`confirmBaseline`,
  document `status: "baseline_confirmed"`, `baselineVersionId`). A `PrdVersion`
  holds `sections: PrdSection[]`, where `PrdSection = { id, key, title, body, order }`.
- **Generation loop exists.** `generation-loop/generation-service.ts` streams
  edit/file/shell actions, validates the build (with self-heal), and commits.
  It already injects **governed context** — assigned skills + retrieved knowledge —
  into the system prompt via `generation-loop/governed-context.ts`
  (`createGovernedContextResolver`) and `system-prompt.ts` (`buildSystemPrompt`,
  which renders `<available_skills>` and an `## Organizational knowledge` section).

**Gap:** the generation loop never reads the PRD. A Creator can confirm a PRD
baseline and then vibe-code an app that ignores it. Phase A closes this gap by
reusing the exact governed-context path.

## Phase A — Spec-grounded generation (implement now)

### Architecture

Add the project's confirmed PRD baseline to the existing `GovernedContext` and
render it as a `## Product spec` section in the build system prompt. No new
subsystem — three focused edits plus one thin PRD read method.

### Components

1. **PRD read method** — `PrdService` gains a public
   `getBaselineSpec(actor, projectId): string | null` that returns the confirmed
   baseline version's sections rendered to Markdown (sorted by `order`, each as
   `## {title}\n{body}`), or `null` when there is no `baseline_confirmed` version.
   It reuses the existing private `getDocumentForActor` for auth/scoping. This
   lives with the other PRD read methods; `platform-services.ts` is at its
   line-count ceiling, so extract a small `prd/baseline-spec.ts` helper that
   takes the document and returns the Markdown, and have the method delegate to
   it (keeps the composition file from growing).

2. **`governed-context.ts`** — `createGovernedContextResolver` accepts
   `Pick<PlatformApiServices, "skills" | "knowledge" | "prds">` and, inside a
   `try/catch`, calls `getBaselineSpec` for the project, adding `productSpec`
   (string | undefined) to the returned `GovernedContext`. A failure or missing
   baseline leaves `productSpec` undefined — generation proceeds unchanged.

3. **`generation-stream-helpers.ts`** — extend the `GovernedContext` interface
   with `productSpec?: string`.

4. **`system-prompt.ts`** — `buildSystemPrompt` accepts `productSpec?: string`
   and, when present, renders this section alongside the other governed sections
   (after `## Organizational knowledge`, before `## Current project files`):

   ```
   ## Product spec (the approved PRD — build toward it)
   <productSpec>
   ```

   The spec is clipped to **8000 chars** (matching the knowledge-excerpt cap) so
   a large PRD cannot blow the context; a `… (spec truncated)` note is appended
   when clipped.

5. **`generation-service.ts`** — pass `productSpec: governed?.productSpec` into
   the existing `promptInput` object (one line; the object already carries
   `availableSkills` and `knowledgeExcerpts`).

### Data flow

Creator prompt → `runTurn` → `resolveGovernedContext({ actor, projectId, scenario })`
→ `{ availableSkills, skillInstructions, knowledgeExcerpts, productSpec }` →
`buildSystemPrompt` renders `## Product spec` + `<available_skills>` +
`## Organizational knowledge` → LLM generates grounded in the spec →
build/self-heal/commit (unchanged).

### Behavior rules

- Injected on **every build-mode turn** (plan mode is unaffected), so every
  change is grounded in the spec.
- The spec is **context, not a hard constraint**: the Creator's prompt still
  drives the specific change; the spec section instructs the model to "build
  toward the approved product spec" and preserve intent, not to regenerate the
  whole app.
- No PRD baseline confirmed → no `## Product spec` section → behaves exactly as
  today (pure prompt + skills + knowledge).

### Error handling

- Missing baseline or a PRD read error → `productSpec` undefined → section
  omitted. Generation never fails because of the spec lookup (`try/catch` in the
  resolver, matching how skills/knowledge already fail soft).

### Testing

- **Unit — `system-prompt`:** `buildSystemPrompt` renders `## Product spec` with
  the given text when `productSpec` is provided; omits the section when it is
  absent; truncates + notes when over the cap.
- **Unit — `prd/baseline-spec` helper:** renders a confirmed baseline's sections
  to ordered Markdown; returns null when the document has no confirmed baseline.
- **Unit — resolver:** `createGovernedContextResolver` returns `productSpec` from
  the baseline and returns it undefined (without throwing) when the PRD read
  throws.
- Existing generation-service tests continue to pass (the new field is optional).

### Acceptance criteria

- With a confirmed PRD baseline, a workspace prompt produces a system prompt that
  contains the `## Product spec` section with the baseline content.
- With no baseline, the system prompt has no spec section and generation output
  is unchanged from today.
- `pnpm check` (typecheck, lint, design-system, unit tests) passes;
  `generation-service.ts` stays ≤ 400 lines.

## Phase B — Spec-first gated flow (follow-up; own spec)

Outlined only, to keep Phase A a single implementable slice.

Turn the vibe-coding turn into: **prompt → AI drafts a plan / spec-delta →
Creator approves → AI implements → validate against acceptance criteria**, per
backlog §6.2. Building blocks that already exist to reuse:

- Plan mode (`buildPlanSystemPrompt`, `agentMode: "plan"`) already produces a
  read-only plan without applying changes — the basis for the "draft plan" step.
- PRD versioning (`PrdService`) already supports draft → confirm — the basis for
  a "spec-delta" the Creator approves, which then becomes the new baseline that
  Phase A grounds the implementation on.

Phase B adds: an explicit approval gate between plan and implementation, a
"spec-delta" representation, and validation of the result against the PRD's
acceptance criteria. It gets its own brainstorming + spec before implementation.

## Out of scope (YAGNI)

- Semantic PRD retrieval / embeddings (the full baseline is small enough to
  inject directly).
- Bidirectional spec↔code sync (Phase C idea, not planned).
- Changing the PRD generation UX or authoring flow.
