# Spec-Driven Vibe Coding — Phase B Design (Plan-Approval Gate)

**Status:** Approved for implementation.
**Date:** 2026-07-28
**Branch:** `codex/spec-driven-vibe-coding` (continues Phase A).

## Goal

Let a Creator have the AI draft a plan first, approve it, and then have the AI
implement exactly that approved plan — an opt-in gate between planning and code,
per backlog §6.2 (AI plans → human approves → AI scaffolds). This closes the
current gap where plan mode and build mode are disconnected: today a Creator
reads a plan, then has to manually switch to build mode and re-prompt, with no
link between the plan and what gets built.

## Background — current state

- **Plan mode already exists.** `resolveWorkspaceAgentMode` maps a request's
  `agentMode: "plan"` (or `workspaceMode: "plan"`) to plan mode; the generation
  loop then uses `buildPlanSystemPrompt` to produce a **read-only** plan (no
  actions applied). Build mode uses `buildSystemPrompt`.
- **No gate.** After a plan, nothing carries it into implementation. The Creator
  switches to build mode and re-prompts from scratch.
- **Phase A shipped.** The confirmed PRD baseline is injected into
  `buildSystemPrompt` as a `## Product spec` governed-context section. Phase B
  reuses that exact injection mechanism for the approved plan.
- **Request chain.** `chat-route.ts` parses `parsed.prompt`, `parsed.agentMode`,
  `parsed.attachmentIds` from the POST body and calls
  `deps.generationService.runTurn({ projectId, prompt, agentMode, actor })`. The
  creator frontend (`features/workspace/api.ts`) sends
  `{ prompt, attachmentIds, agentMode }`.

## Approach

**Opt-in via the existing plan mode.** The Creator uses plan mode when they want
the AI to plan first. When the plan-mode turn finishes, the plan's assistant
message shows an **"Approve & implement"** action. Clicking it sends a normal
**build** turn whose user prompt is the original request and which carries the
approved plan text as an `approvedPlan` field. The build system prompt renders
that plan as a `## Approved plan` section, so the AI implements exactly what was
approved. "Revise" is simply re-prompting in plan mode — no new mechanism.

There is **no new persistence and no structured plan parsing**: the approved
plan is the plan-mode assistant message's text, passed back on the approve
request. Chosen approach for what the approve action sends: **the original
request as the prompt, plus the plan text as `approvedPlan` context** (the AI
sees both the ask and the approved plan), not the plan text as the prompt.

## Components

1. **`generation-loop/system-prompt.ts`** — `buildSystemPrompt` accepts
   `approvedPlan?: string` and, when present, renders (build mode only — this
   function is the build prompt; `buildPlanSystemPrompt` is untouched):

   ```
   ## Approved plan (the user approved this plan — implement exactly it, nothing more)
   <approvedPlan>
   ```

   Rendered with the other governed sections, immediately after `## Product
   spec` and before `## Current project files`; clipped to **8000 chars** with a
   `\n… (plan truncated)` note when over, matching the Phase A cap.

2. **`generation-loop/generation-service.ts`** — the `runTurn` input type gains
   `approvedPlan?: string`; it is passed into the existing `promptInput` object
   as `approvedPlan: input.approvedPlan` (build path only — plan-mode path is
   unchanged). This file is at its 400-line ceiling, so a one-line comment must
   be compressed to offset the added field (as in Phase A).

3. **`generation-loop/chat-route.ts`** — parse `approvedPlan` from the body
   (`String(parsed?.approvedPlan ?? "")`, empty → undefined) and pass it into
   `runTurn({ projectId, prompt, agentMode, actor, approvedPlan })`.

4. **`features/workspace/api.ts`** — the send function accepts an optional
   `approvedPlan` and includes it in the request body
   (`{ prompt, attachmentIds, agentMode, approvedPlan }`).

5. **`features/workspace/use-vibe-chat.ts`** — after a plan-mode turn completes,
   expose the plan message's text and an `approveAndImplement(originalPrompt,
   planText)` action that sends a build turn with
   `{ prompt: originalPrompt, agentMode: "build", approvedPlan: planText }`.

6. **`features/workspace/WorkspacePage.tsx`** (presentational) — render an
   "Approve & implement" button on a completed plan-mode assistant message that
   calls the hook action. Uses `@evcp/ui` primitives (no local styles).

## Data flow

Creator selects plan mode → prompts → `chat-route` → `runTurn(agentMode:"plan")`
→ AI streams a read-only plan → frontend marks that assistant message as an
approvable plan → Creator clicks "Approve & implement" → frontend sends a build
turn `{ prompt: <original>, agentMode: "build", approvedPlan: <plan text> }` →
`chat-route` parses `approvedPlan` → `runTurn` → `buildSystemPrompt` renders
`## Approved plan` → AI implements → build validation + self-heal (Phase A).

## Error handling

- Missing/empty `approvedPlan` → undefined → no `## Approved plan` section →
  behaves as a normal build turn (today's behavior). The gate is purely additive.
- A plan-mode turn that produced no usable text → the approve action falls back
  to sending just the original prompt (approvedPlan omitted).
- The plan text is untrusted model output already inside the org's own loop; it
  is injected as context (like the rolling summary), not executed directly.

## Testing

- **Unit — `system-prompt`:** `buildSystemPrompt` renders `## Approved plan` when
  `approvedPlan` is given; omits it when absent; truncates + notes when over
  8000 chars.
- **Unit — `chat-route`:** a body with `approvedPlan` reaches `runTurn` with that
  value; a body without it passes `approvedPlan` undefined. (Follow the existing
  chat-route unit test's fake `generationService` capture pattern.)
- **Unit — `use-vibe-chat`:** `approveAndImplement` builds a build-mode request
  carrying the plan text as `approvedPlan`.
- **Render smoke:** extend the creator render-smoke harness so the plan message
  with the "Approve & implement" button renders without throwing.

## Acceptance criteria

- A plan-mode turn followed by "Approve & implement" produces a build turn whose
  system prompt contains the `## Approved plan` section with the plan text, and
  the AI applies changes (build mode).
- A plain build turn (no approved plan) is unchanged from today.
- `pnpm check` passes; `generation-service.ts` stays ≤ 400 lines;
  `platform-services.ts` untouched; no app-local styles (design-system check).

## Out of scope (YAGNI)

- Structured/file-level plan parsing or an editable plan checklist.
- Persisting plans as records or as PRD versions (that is Phase B2 / the
  spec-delta gate — a separate spec).
- Validating the result against PRD acceptance criteria (a later phase; build
  compilation via Phase A self-heal is the only automated check here).
- Forcing every build through a plan-first gate.
