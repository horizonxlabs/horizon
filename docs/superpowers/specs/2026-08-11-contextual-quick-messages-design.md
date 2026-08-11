# Contextual Quick Messages Design

**Status:** Approved
**Date:** 2026-08-11

## Goal

Replace the Creator workspace's static Quick Messages with three useful, project-aware next actions. Selecting a suggestion submits it to the AI immediately in the active Plan or Build mode.

## Context Inputs

Suggestions are derived locally and deterministically from data already loaded by Creator:

- selected project name and app type;
- active Plan or Build mode;
- current PRD version and sections;
- current preview availability;
- recent user and assistant messages, including action success or failure;
- attached project files.

No additional AI request is used to generate suggestions. This keeps suggestions instant, avoids extra token usage, and makes behavior predictable and testable.

## Architecture

Add a focused, pure context engine under the workspace feature. Its public contract accepts a normalized context object and returns exactly three `QuickMessage` values. Each value contains a stable identifier, short visible label, full prompt, and semantic intent.

The engine applies rules in priority order:

1. Recover or continue an incomplete or failed recent action.
2. Advance the current project according to preview and PRD state.
3. Offer a quality, responsive-design, data, or release-readiness improvement appropriate to the active mode.

Duplicate prompts are removed before the final three are selected. Safe contextual fallbacks are used when PRD or chat history is unavailable.

`WorkspacePage` remains responsible only for rendering suggestions and submitting the chosen prompt through the existing `handleVibeChat` path. The context engine does not perform network requests or mutate React state.

## Interaction

- Display exactly three suggestions while the workspace is idle.
- Plan mode suggestions ask for review, prioritization, trade-offs, and risks without changing files.
- Build mode suggestions request concrete implementation or repair work.
- Selecting a suggestion submits its full prompt immediately using the active mode.
- Suggestions are disabled while an AI turn is running to prevent duplicate submissions.
- The manual composer remains unchanged and available for custom prompts.
- Submission failures continue to use the existing workspace chat error handling.

Example Build suggestions for a Sales KPI dashboard may include:

- `Add sales-rep filters`
- `Improve KPI loading states`
- `Check the mobile dashboard layout`

The full submitted prompts include the project name and enough context to be unambiguous, while the visible labels stay concise.

## Visual Design

The section is labeled `Suggested next` and sits directly above the composer. It uses a restrained blue-violet brand accent and compact controls rather than the current oversized generic buttons.

- Chips are 34–38 px high with concise single-line labels.
- The first ranked suggestion receives a subtle tinted surface; the remaining suggestions use neutral surfaces.
- Hover and keyboard focus increase border contrast without layout movement.
- Disabled state remains readable and clearly non-interactive.
- Desktop lays suggestions out in a single row where space permits.
- Narrow screens use horizontal overflow with scroll snapping rather than wrapping into a tall block.
- Reduced-motion preferences remove nonessential transitions.

The signature element is the ranked first suggestion: it is visually distinct because it represents the context engine's recommended next action, not merely decoration.

## Accessibility

- Render suggestions as native buttons.
- Provide an accessible group label for the section.
- Keep a minimum 34 px pointer target and visible `:focus-visible` treatment.
- Expose disabled state through the native `disabled` attribute.
- Do not rely on color alone to communicate the recommended suggestion.

## Testing

Use test-driven development for both behavior and rendering.

- Unit-test deterministic suggestions for empty, Plan, Build, failed-action, and preview-ready contexts.
- Verify the engine returns three unique suggestions with short labels and non-empty prompts.
- Render-test that selecting a suggestion calls the real workspace submit boundary with the selected prompt and active mode.
- Verify suggestions are disabled while an AI turn is running.
- Preserve existing Creator render-smoke, typecheck, architecture, and build checks.

## Scope

This change does not add an AI suggestion endpoint, persist suggestion history, personalize suggestions across users, or change the manual prompt composer. Those capabilities can be revisited if deterministic project-aware suggestions prove insufficient.
