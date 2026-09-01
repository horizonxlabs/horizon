# Can Horizon Pi deliver an OpenCode-like web-agent UX?

Date: 2026-08-21

## Conclusion

**Yes.** The current Pi agent exposes the live text, reasoning, tool lifecycle, tool-output, retry, compaction, and turn lifecycle signals needed for an OpenCode-like agent timeline. Horizon already forwards the essential text/reasoning/tool start/update/end events to its web client. Achieving the experience is therefore a Horizon event-model, persistence, and UI project; it does **not** require replacing Pi or running OpenCode.

The important qualification is refresh/replay: Horizon creates an in-memory Pi session for each turn and persists a deliberately reduced final summary. A detailed live timeline disappears after refresh. The data model must retain an ordered turn-part projection (or an equivalent durable event log) before the UI can match OpenCode's durable part-based history.

## What Pi provides

Horizon pins `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` at `0.84.2` in [`apps/platform-api/package.json`](../../apps/platform-api/package.json). Pi's SDK documents a subscribable session with:

- `message_update` text and thinking deltas;
- `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`, correlated with `toolCallId`, including tool name, arguments, output, and terminal error state;
- `message_*`, `agent_*`, and `turn_*` lifecycle events.

The SDK specifically says tool update `partialResult` is the **accumulated output so far**, so clients should replace the displayed output on update rather than append it. Sources: [Pi SDK events](https://pi.dev/docs/latest/sdk#events), local package [`docs/sdk.md`](../../node_modules/.pnpm/@earendil-works+pi-coding-agent@0.84.2_ws@8.21.3/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md) (events and tool lifecycle), and [Pi JSON event reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md).

Pi also has session-manager persistence and branching primitives, but they are optional application infrastructure—not a requirement for the live UX. See [Pi SDK session management](https://pi.dev/docs/latest/sdk#session-management) and local [`session-manager.d.ts`](../../node_modules/.pnpm/@earendil-works+pi-coding-agent@0.84.2_ws@8.21.3/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts).

## What Horizon already has

The adapter translates Pi text/thinking and tool start/update/end events into SSE `token`, `reasoning`, `action_start`, `action_chunk`, and `action_result`: [`pi-event-adapter.ts`](../../apps/platform-api/src/generation-loop/pi-event-adapter.ts). The Creator stream reducer turns these into live text, a separate reasoning field, and running/done/failed actions: [`vibe-stream.ts`](../../apps/creator-web/src/features/workspace/vibe-stream.ts).

The present UI already follows part of the intended pattern: reasoning is a separate collapsible block and actions are roll-ups with an expandable detail view: [`WorkspacePage.tsx`](../../apps/creator-web/src/features/workspace/WorkspacePage.tsx) and [`VibeActionSummary.tsx`](../../apps/creator-web/src/features/workspace/VibeActionSummary.tsx).

Horizon correctly restricts Pi to its governed custom tools (`noTools: "all"` plus an explicit mode-dependent allowlist): [`pi-session-context.ts`](../../apps/platform-api/src/generation-loop/pi-session-context.ts). This limits the available visual tool types, but does not limit the quality of the agent UX and preserves the existing security boundary.

## Gaps relative to OpenCode's UX architecture

OpenCode represents a turn as an ordered collection of typed parts. Its durable event schema includes text/reasoning start/end, tool input, called, bounded progress, success, and failure. Its live-only deltas are paired with durable full-value boundaries: [`/var/folders/wf/3nvq5gy57z31hwj51px7ynpm0000gn/T/tmp.oWyMw1yA2t/opencode/packages/schema/src/session-event.ts`](/var/folders/wf/3nvq5gy57z31hwj51px7ynpm0000gn/T/tmp.oWyMw1yA2t/opencode/packages/schema/src/session-event.ts). The app renders and groups those parts into a chronological timeline, including compact grouped context reads: [`packages/app/src/pages/session/timeline/rows.ts`](/var/folders/wf/3nvq5gy57z31hwj51px7ynpm0000gn/T/tmp.oWyMw1yA2t/opencode/packages/app/src/pages/session/timeline/rows.ts) and [`packages/session-ui/src/components/message-part.tsx`](/var/folders/wf/3nvq5gy57z31hwj51px7ynpm0000gn/T/tmp.oWyMw1yA2t/opencode/packages/session-ui/src/components/message-part.tsx).

Horizon instead persists only completed `WorkspaceChatAction` fields (`id`, `type`, `label`, `ok`) alongside assistant text, commit, and token totals: [`packages/types/src/index.ts`](../../packages/types/src/index.ts). It does not persist reasoning, tool input/output, action order/timing, progress, retries, compaction, or a Pi session reference. In addition, it creates `SessionManager.inMemory(...)` per turn and rebuilds context from saved chat text: [`pi-session-context.ts`](../../apps/platform-api/src/generation-loop/pi-session-context.ts). Consequently an active or historical detailed timeline cannot be restored faithfully after refresh.

There is also one streaming correctness item to address while enriching the timeline: Pi update payloads are accumulated output, whereas Horizon currently turns each update into `action_chunk` and the client appends it. If a governed tool sends more than one update, this can repeat prior output. The richer protocol should use an `action_progress`/replace semantic or carry a monotonic sequence number.

## Recommended Horizon shape

1. Add a turn-part/event projection owned by Horizon, keyed by project, chat message, ordinal, and stable Pi `toolCallId`. Persist bounded tool input/progress/result plus start/end times and statuses; retain the existing chat message as the final summary.
2. Expand the SSE contract to express part start, replace-progress, terminal result, retry/compaction, and turn status. Keep sensitive command output and arguments redacted/bounded by the existing policy layer.
3. Render parts chronologically: a compact automatically grouped “Gathering context” section for reads/lists; an open current action; collapsed completed tool detail; an optional collapsed reasoning section; then clean final Markdown, diff/commit, and failure/retry affordances.
4. Restore the persisted projection on page load, then merge live SSE events by `toolCallId` and sequence. Do not rely on Pi JSONL as the product record: Horizon's Prisma/audit store remains the tenant-safe authority.

This copies OpenCode's interaction model—not its code, its local-machine permission model, or its unrestricted tool set.

## Primary sources

- Horizon Pi adapter/session/UI and type files linked above.
- [Pi SDK documentation](https://pi.dev/docs/latest/sdk) and [Pi coding-agent source](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).
- [OpenCode repository](https://github.com/anomalyco/opencode), specifically its checked-out `packages/schema`, `packages/app`, and `packages/session-ui` sources linked above.
