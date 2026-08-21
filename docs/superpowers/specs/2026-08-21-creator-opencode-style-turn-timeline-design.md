# Creator OpenCode-Style Turn Timeline

## Goal

Make a Creator chat turn behave like a durable coding-agent timeline: a user can see concise
reasoning, tool activity, progress, results, and errors while Pi runs; refreshing the browser
reconstructs the same turn without losing its state.

This borrows the interaction model from OpenCode, not its runtime. Horizon continues to own Pi
execution, custom workspace tools, LiteLLM governance, quotas, audit, and project isolation.

## Scope

- Normalize Pi stream events into ordered, durable turn parts.
- Replay a running or completed turn through the existing active-turn API and chat history.
- Replace the current assistant action list with an accessible timeline UI.
- Keep final assistant Markdown as the concise outcome of a turn.
- Preserve explicit cancellation, project-member authorization, and current restore/commit flows.

Out of scope: replacing Pi, importing OpenCode packages, exposing raw model chain-of-thought,
multi-device collaboration, or changing workspace tool permissions.

## Data model

Each assistant turn owns an ordered list of `TurnPart` records:

| Part | Required data | UI behavior |
| --- | --- | --- |
| `reasoning` | summary text, state | Collapsed by default; never display raw private chain-of-thought beyond the current governed Pi reasoning stream. |
| `tool` | call ID, tool kind, human label, input summary, status, progress/result/error, start/end times | One timeline row per call; live row stays open, completed rows collapse to a one-line summary. |
| `text` | assistant Markdown | Render as the final answer section. |
| `commit` | SHA | Render as a compact success chip. |
| `error` | safe message, recoverability | Render as an actionable error card. |

`sequence` is monotonically increasing within a turn. Pi `tool_execution_update` is represented as
the latest progress snapshot on its tool part, not appended text, preventing duplicated output.

## Server flow

```text
Pi AgentSession events
  -> Pi event adapter
  -> TurnPart reducer (upsert by tool call ID, append ordered parts)
  -> active turn replay buffer + persisted assistant message parts
  -> POST chat SSE / GET chat active / GET chat history
```

The active turn continues independently from a disconnected browser. A refresh reads the active
turn snapshot, hydrates its parts, and resumes presentation by polling until the final persisted
turn is available.

The server records only governed, user-safe data. Tool input and output are summarized and clipped
at the adapter boundary before persistence; no credentials, unrestricted shell output, or internal
model context are stored for the UI.

## Client flow

```text
TurnTimeline
  ├── Prompt header
  ├── Agent status header (Planning / Building / Validating / Complete)
  ├── ReasoningDisclosure
  ├── ToolTimeline (live row open, completed groups collapsed)
  ├── FinalResponseMarkdown
  └── Commit / error / preview actions
```

The client uses the same reducer for live SSE events and active/history replay. This avoids a
separate "refresh UI" rendering path and makes the active-turn feature deterministic.

## Compatibility and migration

- Existing `actions` in historical messages remain supported and render as completed timeline rows.
- Existing `text`, `reasoning`, and `commitSha` fields remain valid during migration.
- New `parts` are optional in API payloads until the platform is deployed everywhere.
- The active-turn endpoint continues to return legacy event buffers while adding normalized parts.

## Verification

1. A Pi event sequence creates one tool row per call, with progress updates replacing rather than
   duplicating output.
2. A browser disconnect does not abort the turn; the active endpoint returns its ordered parts.
3. Reloading Creator hydrates an in-progress timeline and transitions to persisted history on done.
4. Completed legacy history still renders.
5. Platform API and Creator typechecks, focused unit/integration tests, and Creator production build pass.

## Files expected to change

- `apps/platform-api/src/generation-loop/pi-event-adapter.ts`
- `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- `apps/platform-api/src/generation-loop/chat-route.ts`
- `apps/creator-web/src/features/workspace/vibe-stream.ts`
- `apps/creator-web/src/features/workspace/use-vibe-chat.ts`
- `apps/creator-web/src/features/workspace/WorkspacePage.tsx` and focused timeline components
- persistence/type definitions and focused tests
