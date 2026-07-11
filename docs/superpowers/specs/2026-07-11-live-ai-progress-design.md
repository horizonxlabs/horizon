# Live AI Progress Design

## Goal

Make every Creator Workspace chat turn visibly active from submission through completion, so users can understand the AI's current work without having to read a raw terminal log.

## Problem

The chat UI creates an empty assistant message as soon as a prompt is sent, but the only visible indication before the first streamed token or action is a cursor. Workspace provisioning and upstream response latency therefore look indistinguishable from a stuck request. A 504 replaces that silence with a bare error and no recovery path.

## Chosen Experience

Use an OpenCode-inspired, collapsible activity trace inside the assistant turn. The trace is the source of truth for the active turn; the header retains a compact status summary.

1. On submit, render a progress card immediately with the current phase, a short explanation, and elapsed time.
2. Display deterministic lifecycle phases: validate request, prepare workspace, load context, generate response, apply changes, build preview, verify, and ready. Plan mode uses only analysis-oriented phases.
3. Nest streamed file, edit, shell, and migration actions under the active phase. The running action is expanded; completed actions collapse to concise summaries with optional detail/diff.
4. When the turn completes, collapse the trace into a summary showing the number of changed actions, the commit, and the existing preview/code affordances.
5. If no stream event arrives for 15 seconds, show a non-destructive stalled state. If the stream fails, keep the trace and prompt context, show a recovery banner, and offer retry plus logs instead of treating the build as successful.

## Boundaries

- This does not expose an unrestricted terminal or provider internals.
- Existing preview remains visible on failures.
- The work is limited to Creator Workspace stream state, display, and test coverage. Cancellation is not included until a server-side abort contract exists.

## Architecture

The generation service will emit lifecycle SSE events before and between existing token/action events. A focused frontend stream-state reducer will translate those events and client-side timers into turn progress. Presentational components render the progress card/timeline and reuse `VibeActionRow` for generated actions. Existing `token`, `action_start`, `action_result`, `commit`, `error`, and `done` events remain backward-compatible.

## States and Recovery

| State | User-facing behavior |
| --- | --- |
| queued | `กำลังตรวจสอบคำขอ…` appears immediately after submit. |
| provisioning | `กำลังเตรียม workspace…` is visible while the workspace is ensured. |
| running | Timeline shows the current phase and active action. |
| stalled | After 15 seconds without an event, show `ยังทำงานอยู่ แต่ยังไม่มีข้อมูลใหม่…`; do not clear the turn. |
| complete | Collapse to `เสร็จแล้ว` with action count and commit. |
| failed | Explain the failure, preserve the prompt/action trace, and provide retry/log actions. |

## Accessibility and Visual Rules

- Use the existing design-system status tokens, spacing, and radii; add no app-local styles or raw colors.
- Announce only phase summary changes through `aria-live="polite"`, never each streamed token.
- Use semantic lists for timeline items and accessible labels for expand/retry/log controls.
- Respect reduced motion for the running indicator.
- On narrow screens, show the current phase and completed count; expose detail with expansion rather than crowding the composer.

## Acceptance Criteria

- A user sees a named progress state immediately after sending a prompt, including before the SSE response starts.
- Lifecycle updates and streamed actions are visible in the assistant turn as they occur.
- A turn with no event for 15 seconds visibly becomes stalled without losing context.
- Completion shows a concise summary and retains action details, commit, and preview refresh behavior.
- 504 and other stream failures have actionable recovery UI and preserve the previous preview.
- Plan mode never presents build/apply phases.
- Reducers and API event emission have direct unit coverage, and the workspace render smoke test continues to pass.
