# Creator OpenCode-Style Turn Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Pi coding turns as durable, refresh-safe OpenCode-style timelines of reasoning, tool work, outcomes, and errors.

**Architecture:** Normalize `ChatStreamEvent` values into ordered `WorkspaceChatTurnPart` records at the shared type boundary. Pi emits events as today; a reducer preserves one part per tool call and replaces progress snapshots. The platform persists parts with the assistant message and includes them in active/history replay. Creator applies the same reducer for live, refreshed, and historical data before rendering focused timeline components.

**Tech Stack:** TypeScript, Pi coding-agent events, Platform API SSE/Prisma history, React, existing `@evcp/ui` styles, Node test runner.

---

## File map

| File | Responsibility |
| --- | --- |
| `packages/types/src/index.ts` | Shared turn-part wire type on `WorkspaceChatMessage`. |
| `apps/platform-api/src/generation-loop/turn-parts.ts` | Pure server reducer for stream event → ordered durable parts. |
| `apps/platform-api/src/generation-loop/pi-generation-service.ts` | Builds and persists assistant parts while consuming Pi events. |
| `apps/platform-api/src/generation-loop/chat-route.ts` | Exposes normalized active-turn parts in addition to event compatibility replay. |
| `apps/creator-web/src/features/workspace/vibe-stream.ts` | Client turn-part reducer and legacy action compatibility adapter. |
| `apps/creator-web/src/features/workspace/chat-history.ts` | Maps parts returned by history and active endpoints. |
| `apps/creator-web/src/features/workspace/TurnTimeline.tsx` | Renders the compact turn header, reasoning disclosure, tool timeline, result and error. |
| `apps/creator-web/src/features/workspace/WorkspacePage.tsx` | Replaces direct action summary rendering with `TurnTimeline`. |
| `packages/ui/styles.css` | Creator timeline visuals and responsive behavior. |

### Task 1: Define the durable part contract

**Files:**
- Modify: `packages/types/src/index.ts`
- Test: `tests/unit/workspace-turn-parts.test.mjs`

- [ ] **Step 1: Write the failing shared-contract test**

```js
assert.deepEqual(toSerializableParts([toolPart]), [{
  id: "tool-call-1",
  type: "tool",
  sequence: 1,
  tool: { actionType: "file", label: "app/page.tsx", status: "running" }
}])
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec tsx --test tests/unit/workspace-turn-parts.test.mjs`

Expected: FAIL because `WorkspaceChatTurnPart` and the reducer do not exist.

- [ ] **Step 3: Add serializable shared types**

```ts
export type WorkspaceChatTurnPart =
  | { id: string; type: "reasoning"; sequence: number; text: string }
  | { id: string; type: "text"; sequence: number; text: string }
  | { id: string; type: "tool"; sequence: number; tool: WorkspaceChatToolPart }
  | { id: string; type: "commit"; sequence: number; sha: string }
  | { id: string; type: "error"; sequence: number; message: string };

export interface WorkspaceChatToolPart {
  actionType: ActionActionType;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  progress?: string;
  result?: string;
  error?: string;
}
```

Add `parts?: WorkspaceChatTurnPart[]` to `WorkspaceChatMessage`.

- [ ] **Step 4: Run the contract test and typecheck**

Run: `pnpm exec tsx --test tests/unit/workspace-turn-parts.test.mjs && pnpm --filter @evcp/types typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts tests/unit/workspace-turn-parts.test.mjs
git commit -m "feat: add durable workspace turn parts"
```

### Task 2: Normalize streaming events without duplicated progress

**Files:**
- Create: `apps/platform-api/src/generation-loop/turn-parts.ts`
- Test: `tests/unit/workspace-turn-parts.test.mjs`

- [ ] **Step 1: Add failing reducer cases**

```js
const afterUpdate = reduceTurnPart(afterStart, {
  type: "action_chunk", actionId: "tool-1", content: "40%"
});
const afterSecondUpdate = reduceTurnPart(afterUpdate, {
  type: "action_chunk", actionId: "tool-1", content: "80%"
});
assert.equal(afterSecondUpdate[0].tool.progress, "80%");
assert.equal(afterSecondUpdate.length, 1);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec tsx --test tests/unit/workspace-turn-parts.test.mjs`

Expected: FAIL because no reducer replaces progress by tool call ID.

- [ ] **Step 3: Implement a pure reducer**

```ts
export function reduceTurnPart(
  parts: WorkspaceChatTurnPart[],
  event: ChatStreamEvent
): WorkspaceChatTurnPart[] {
  // `action_start` appends one tool part; `action_chunk` updates its `progress`;
  // `action_result` updates the same part to done/failed; every other event appends a part.
}
```

Use `actionId` as the tool part ID and `parts.length + 1` only for newly appended parts. Clip
progress and result strings with the existing safe output policy before adding them.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec tsx --test tests/unit/workspace-turn-parts.test.mjs tests/unit/pi-event-adapter.test.mjs`

Expected: PASS, including multiple tool updates producing one tool row.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/turn-parts.ts tests/unit/workspace-turn-parts.test.mjs
git commit -m "feat: normalize Pi events into ordered turn parts"
```

### Task 3: Persist and replay assistant turn parts

**Files:**
- Modify: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-message-factory.ts`
- Modify: `apps/platform-api/src/persistence/chat-history-repository.ts`
- Modify: `apps/platform-api/src/generation-loop/chat-route.ts`
- Test: `tests/integration/chat-route-sse.test.mjs`
- Test: `tests/unit/pi-generation-service-streaming-lifecycle.test.mjs`

- [ ] **Step 1: Add a failing persistence/replay test**

```js
assert.deepEqual(history[1].parts?.map((part) => part.type), ["text", "tool", "commit"]);
assert.equal(active.body.parts[1].tool.status, "running");
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec tsx --test tests/integration/chat-route-sse.test.mjs tests/unit/pi-generation-service-streaming-lifecycle.test.mjs`

Expected: FAIL because history and active replay expose only summary actions/events.

- [ ] **Step 3: Accumulate parts during Pi consumption**

```ts
let parts: WorkspaceChatTurnPart[] = [];
for await (const event of queue.prompt(input.prompt)) {
  for (const adapted of adaptPiEvent(event)) {
    parts = reduceTurnPart(parts, adapted);
    yield adapted;
  }
}
```

Pass `parts` to `createAssistantChatMessage`; preserve `actions` for legacy callers. Extend the
Prisma repository record mapping to read/write the existing JSON `actions` payload only after
adding a dedicated nullable `parts` JSON column through the project migration mechanism.

- [ ] **Step 4: Add active replay parts**

Have the active-turn coordinator keep its current reduced parts and return:

```ts
{ active: true, prompt: turn.prompt, agentMode: turn.agentMode, parts: turn.parts, events: turn.events }
```

Do not remove `events` in this release; it supports deployed legacy clients.

- [ ] **Step 5: Run server tests and typecheck**

Run: `pnpm exec tsx --test tests/integration/chat-route-sse.test.mjs tests/unit/pi-generation-service-streaming-lifecycle.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/generation-loop apps/platform-api/src/persistence apps/platform-api/prisma tests/integration/chat-route-sse.test.mjs tests/unit/pi-generation-service-streaming-lifecycle.test.mjs
git commit -m "feat: persist and replay Pi turn parts"
```

### Task 4: Hydrate the same part model in Creator

**Files:**
- Modify: `apps/creator-web/src/features/workspace/vibe-stream.ts`
- Modify: `apps/creator-web/src/features/workspace/chat-history.ts`
- Modify: `apps/creator-web/src/features/workspace/use-vibe-chat.ts`
- Test: `tests/unit/creator-chat-history.test.mjs`
- Test: `tests/unit/creator-turn-timeline.test.mjs`

- [ ] **Step 1: Add failing history and active hydration tests**

```js
assert.equal(message.parts?.[0].type, "tool");
assert.equal(message.parts?.[0].tool.progress, "80%");
assert.equal(message.parts?.length, 1);
```

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm exec tsx --tsconfig apps/creator-web/tsconfig.json --test tests/unit/creator-chat-history.test.mjs tests/unit/creator-turn-timeline.test.mjs`

Expected: FAIL because `VibeMessage` has no parts and active replay only reduces raw events.

- [ ] **Step 3: Add client types and compatibility reducer**

```ts
export type VibeMessage = {
  // existing fields
  parts?: WorkspaceChatTurnPart[];
};

export function applyVibeEvent(message: VibeMessage, type: string, data: Record<string, unknown>) {
  const parts = reduceVibeTurnParts(message.parts ?? legacyActionsToParts(message.actions), { type, ...data });
  return { ...message, parts };
}
```

Use returned `parts` directly when present; convert legacy actions only when parts are absent.

- [ ] **Step 4: Use active parts preferentially**

When `GET /chat/active` supplies `parts`, hydrate the live assistant message with them. Retain raw
event replay only for an older platform response without `parts`.

- [ ] **Step 5: Run Creator unit tests and typecheck**

Run: `pnpm exec tsx --tsconfig apps/creator-web/tsconfig.json --test tests/unit/creator-chat-history.test.mjs tests/unit/creator-turn-timeline.test.mjs && pnpm --filter @evcp/creator-web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/creator-web/src/features/workspace tests/unit/creator-chat-history.test.mjs tests/unit/creator-turn-timeline.test.mjs
git commit -m "feat: hydrate Creator chat turn parts"
```

### Task 5: Render the OpenCode-style timeline

**Files:**
- Create: `apps/creator-web/src/features/workspace/TurnTimeline.tsx`
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx`
- Modify: `packages/ui/styles.css`
- Test: `tests/unit/creator-turn-timeline.test.mjs`

- [ ] **Step 1: Add failing rendering tests**

```js
assert.match(html, /Building · 1 file updated/);
assert.match(html, /app\/page\.tsx/);
assert.doesNotMatch(html, /raw private reasoning/);
```

- [ ] **Step 2: Run and confirm the test fails**

Run: `pnpm exec tsx --tsconfig apps/creator-web/tsconfig.json --test tests/unit/creator-turn-timeline.test.mjs`

Expected: FAIL because no timeline component exists.

- [ ] **Step 3: Implement focused timeline components**

```tsx
export function TurnTimeline({ message, isActive }: { message: VibeMessage; isActive: boolean }) {
  return <section className="vibe-turn-timeline" aria-label="AI work timeline">
    <TurnStatus parts={message.parts ?? []} isActive={isActive} />
    <ReasoningDisclosure parts={message.parts ?? []} />
    <ToolTimeline parts={message.parts ?? []} />
    <TurnOutcome parts={message.parts ?? []} text={message.text} />
  </section>;
}
```

Completed tools render as a compact summary. Only the active tool opens by default. Error parts
render a safe error card with the existing `Fix bug` flow; the component does not invoke tools.

- [ ] **Step 4: Replace the existing assistant action block**

Render `TurnTimeline` in `WorkspacePage` for every assistant message. Keep `VibeActionSummary`
only as the legacy fallback until a follow-up cleanup after production migration.

- [ ] **Step 5: Add styles and run visual-safe verification**

Run: `pnpm exec tsx --tsconfig apps/creator-web/tsconfig.json --test tests/unit/creator-turn-timeline.test.mjs && pnpm --filter @evcp/creator-web build`

Expected: PASS. Confirm responsive rules keep the active row readable at narrow widths and apply
`prefers-reduced-motion` to every new progress transition.

- [ ] **Step 6: Commit**

```bash
git add apps/creator-web/src/features/workspace/TurnTimeline.tsx apps/creator-web/src/features/workspace/WorkspacePage.tsx packages/ui/styles.css tests/unit/creator-turn-timeline.test.mjs
git commit -m "feat: render Creator coding turn timeline"
```

### Task 6: End-to-end refresh and regression verification

**Files:**
- Modify: `tests/integration/chat-route-sse.test.mjs`
- Modify: `tests/unit/creator-web-project-files-ui.test.mjs`

- [ ] **Step 1: Add the refresh regression test**

```js
assert.equal(active.body.active, true);
assert.equal(active.body.parts.find((part) => part.type === "tool").tool.status, "running");
// Finish the server turn, then assert history returns the same tool as done.
```

- [ ] **Step 2: Run it and confirm it fails before the completed-part assertion exists**

Run: `pnpm exec tsx --test tests/integration/chat-route-sse.test.mjs`

Expected: FAIL until active and persisted part states converge.

- [ ] **Step 3: Complete the minimal server/client wiring required by the test**

Keep active event-buffer replay and legacy `actions` unchanged for compatibility; only add normalized
parts to the same public payloads.

- [ ] **Step 4: Run the full focused suite**

Run: `pnpm exec tsx --test tests/integration/chat-route-sse.test.mjs tests/unit/pi-event-adapter.test.mjs && pnpm exec tsx --tsconfig apps/creator-web/tsconfig.json --test tests/unit/creator-chat-history.test.mjs tests/unit/creator-turn-timeline.test.mjs && pnpm --filter @evcp/platform-api typecheck && pnpm --filter @evcp/creator-web typecheck && pnpm --filter @evcp/creator-web build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/chat-route-sse.test.mjs tests/unit/creator-web-project-files-ui.test.mjs
git commit -m "test: cover refresh-safe Creator turn timelines"
```
