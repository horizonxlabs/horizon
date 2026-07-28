# Spec-Driven Vibe Coding — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in plan-approval gate to vibe coding: after a plan-mode turn, the Creator clicks "Approve & implement" and the AI implements exactly that approved plan.

**Architecture:** Reuse the existing plan mode. The approved plan text is passed back on a normal build turn as an `approvedPlan` field, injected into the build system prompt as a `## Approved plan` section (same mechanism as Phase A's `## Product spec`). No new persistence, no structured parsing; the gate is purely additive.

**Tech Stack:** TypeScript (NodeNext ESM), NestJS platform-api, React + Vite creator-web, `@evcp/ui` design system. Tests: Node built-in runner via `node --import tsx --test tests/unit/<file>.test.mjs`.

## Global Constraints

- `apps/platform-api/src/generation-loop/generation-service.ts` must stay **≤ 400 lines** (it is at 400 now; compress one comment line to offset added fields, as done in Phase A).
- Do **not** modify `apps/platform-api/src/platform-services.ts`.
- No app-local stylesheets, inline visual styles, or hardcoded colors outside `packages/ui` — compose `@evcp/ui` primitives (enforced by `pnpm check:design-system`).
- The `## Approved plan` section is clipped to **8000 characters**; append `\n… (plan truncated)` when clipped (matches the Phase A `## Product spec` cap).
- The gate is additive and fail-soft: a build turn with no `approvedPlan` behaves exactly as today.
- `pnpm check` must pass at the end.

Current shapes to build on (already in the repo):

```ts
// generation-loop/system-prompt.ts — buildSystemPrompt input already has:
//   availableSkills?, knowledgeExcerpts?, productSpec?
// Build-prompt template already ends with: ${knowledgeSection}${productSpecSection}\n## Current project files ...

// generation-loop/generation-service.ts runTurn input (line ~84):
//   { projectId?: string; prompt: string; agentMode?: WorkspaceAgentMode; actor?: PlatformUser }
// promptInput (line ~131) already carries: availableSkills, knowledgeExcerpts, productSpec

// generation-loop/chat-route.ts parses parsed.prompt / parsed.agentMode / parsed.attachmentIds
//   then calls runTurn({ projectId, prompt, agentMode, actor })

// creator-web/src/features/workspace/vibe-stream.ts:3
export type VibeMessage = { id: string; role: "user" | "assistant"; text: string; actions: VibeAction[] };
// creator-web/src/features/workspace/api.ts
//   streamVibeChat(projectId, prompt, attachmentIds, agentMode, onEvent) — body { prompt, attachmentIds, agentMode }
```

---

### Task 1: Render a `## Approved plan` section in the build system prompt

**Files:**
- Modify: `apps/platform-api/src/generation-loop/system-prompt.ts`
- Test: `tests/unit/system-prompt-approved-plan.test.mjs`

**Interfaces:**
- Produces: `buildSystemPrompt` accepts `approvedPlan?: string`; renders `## Approved plan (the user approved this plan — implement exactly it, nothing more)` after `## Product spec` and before `## Current project files`, clipped to 8000 chars with a `\n… (plan truncated)` suffix.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/system-prompt-approved-plan.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const template = { name: "Web App", lockedFiles: [] };

test("renders the approved plan section when provided, before the project files", () => {
  const prompt = buildSystemPrompt({
    template, contextFiles: [], rollingSummary: null,
    approvedPlan: "1. Add a Header component.\n2. Wire it into app/page.tsx."
  });
  assert.match(prompt, /## Approved plan \(the user approved this plan — implement exactly it, nothing more\)/);
  assert.match(prompt, /Add a Header component\./);
  assert.ok(prompt.indexOf("## Approved plan") < prompt.indexOf("## Current project files"));
});

test("omits the approved plan section when not provided", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /## Approved plan/);
});

test("clips an oversized plan and appends a truncation note", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null, approvedPlan: "y".repeat(9000) });
  assert.match(prompt, /… \(plan truncated\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/system-prompt-approved-plan.test.mjs`
Expected: FAIL — no `## Approved plan` heading.

- [ ] **Step 3: Write minimal implementation**

In `apps/platform-api/src/generation-loop/system-prompt.ts`, add the field to the `buildSystemPrompt` input type (right after `productSpec?: string;`):

```ts
  productSpec?: string;
  approvedPlan?: string;
```

Add the section builder right after the existing `productSpecSection` block:

```ts
  const approvedPlanText = input.approvedPlan && input.approvedPlan.length > 8000
    ? `${input.approvedPlan.slice(0, 8000)}\n… (plan truncated)`
    : input.approvedPlan;
  const approvedPlanSection = approvedPlanText
    ? `\n## Approved plan (the user approved this plan — implement exactly it, nothing more)\n${approvedPlanText}\n`
    : "";
```

In the build-prompt return template, change the governed-sections line from:

```
${summarySection}${skillsSection}${knowledgeSection}${productSpecSection}
## Current project files (the app's LIVE current state — edit these in place, keep existing features)
```

to:

```
${summarySection}${skillsSection}${knowledgeSection}${productSpecSection}${approvedPlanSection}
## Current project files (the app's LIVE current state — edit these in place, keep existing features)
```

(Leave `buildPlanSystemPrompt` untouched — the gate applies to build mode only.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/system-prompt-approved-plan.test.mjs tests/unit/system-prompt-product-spec.test.mjs tests/unit/system-prompt.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/system-prompt.ts tests/unit/system-prompt-approved-plan.test.mjs
git commit -m "feat: render an Approved plan section in the build system prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Thread `approvedPlan` through the generation loop and chat route

**Files:**
- Modify: `apps/platform-api/src/generation-loop/generation-service.ts`
- Modify: `apps/platform-api/src/generation-loop/chat-route.ts`
- Test: `tests/unit/generation-approved-plan.test.mjs`

**Interfaces:**
- Consumes: `buildSystemPrompt`'s `approvedPlan?` (Task 1).
- Produces: `runTurn` input gains `approvedPlan?: string`, passed into `promptInput` (build path only); `chat-route` parses `approvedPlan` from the POST body and forwards it to `runTurn`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/generation-approved-plan.test.mjs` (models the deps on `tests/unit/generation-service-modes.test.mjs`, but with a capturing llmClient):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };
const workspaceGuard = { prepare: async () => "sha", validate: async () => {}, restore: async () => {} };

function serviceWith(captured) {
  return createGenerationService({
    llmClient: {
      streamChat(input) {
        captured.prompts.push(input.systemPrompt);
        return (async function* () { yield "Done."; })();
      }
    },
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: { runAction: async () => ({ ok: true, stdout: "" }) },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    workspaceGuard,
    readContextFiles: async () => [{ path: "app/page.tsx", content: "export default function Home(){ return null; }" }],
    commitAllChanges: async () => "commit-sha"
  });
}

async function drain(iterable) { for await (const _ of iterable) { /* consume */ } }

test("a build turn with approvedPlan injects the Approved plan section", async () => {
  const captured = { prompts: [] };
  await drain(serviceWith(captured).runTurn({
    projectId: "p1", prompt: "do it", agentMode: "build", approvedPlan: "Step 1: add a Header."
  }));
  assert.ok(captured.prompts.some((p) => p.includes("## Approved plan") && p.includes("Step 1: add a Header.")));
});

test("a plan-mode turn ignores approvedPlan (no Approved plan section)", async () => {
  const captured = { prompts: [] };
  await drain(serviceWith(captured).runTurn({
    projectId: "p1", prompt: "plan it", agentMode: "plan", approvedPlan: "Step 1: add a Header."
  }));
  assert.ok(captured.prompts.every((p) => !p.includes("## Approved plan")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/generation-approved-plan.test.mjs`
Expected: FAIL — the first test finds no `## Approved plan` (runTurn does not forward `approvedPlan` yet).

- [ ] **Step 3: Add the field to `runTurn` and `promptInput`**

In `apps/platform-api/src/generation-loop/generation-service.ts`, add to the `runTurn` input type (right after the `actor?: PlatformUser;` line):

```ts
      actor?: PlatformUser;
      approvedPlan?: string;
```

Add the field to the `promptInput` object (right after `productSpec: governed?.productSpec`):

```ts
            productSpec: governed?.productSpec,
            approvedPlan: input.approvedPlan
          };
```

- [ ] **Step 4: Keep the file within its line ceiling**

Run: `wc -l apps/platform-api/src/generation-loop/generation-service.ts`
Expected: **≤ 400**. If it reports 401 or 402, shorten adjacent comment line(s) by the overage — for example collapse the two-line `// Build-error self-heal:` comment near the round-end block into one line — then re-run until ≤ 400. Do not extract or restructure.

- [ ] **Step 5: Parse `approvedPlan` in the chat route**

In `apps/platform-api/src/generation-loop/chat-route.ts`, add a declaration beside `let prompt = "";`:

```ts
    let prompt = "";
    let approvedPlan: string | undefined;
```

Inside the `try` that parses the body, after `prompt = String(parsed?.prompt ?? "");`, add:

```ts
      prompt = String(parsed?.prompt ?? "");
      approvedPlan = parsed?.approvedPlan ? String(parsed.approvedPlan) : undefined;
```

In the `runTurn({ ... })` call, add `approvedPlan`:

```ts
      for await (const event of deps.generationService.runTurn({
        projectId,
        prompt,
        agentMode,
        actor: auth.actor,
        approvedPlan
      })) {
```

- [ ] **Step 6: Run tests + typecheck to verify**

Run:
```bash
node --import tsx --test tests/unit/generation-approved-plan.test.mjs
pnpm --filter @evcp/platform-api typecheck
```
Expected: 2 tests PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/platform-api/src/generation-loop/generation-service.ts apps/platform-api/src/generation-loop/chat-route.ts tests/unit/generation-approved-plan.test.mjs
git commit -m "feat: thread the approved plan from the chat route into the build prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Send `approvedPlan` from the creator chat client

**Files:**
- Modify: `apps/creator-web/src/features/workspace/api.ts`
- Test: `tests/unit/creator-web-vibe-approved-plan.test.mjs`

**Interfaces:**
- Produces: `streamVibeChat(projectId, prompt, attachmentIds, agentMode, onEvent, approvedPlan?)` — an optional 6th param included in the request body as `approvedPlan`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/creator-web-vibe-approved-plan.test.mjs` (mocks `global.fetch` to capture the request body, then aborts by returning a non-ok response so the stream loop exits):

```js
import test from "node:test";
import assert from "node:assert/strict";

const { streamVibeChat } = await import("../../apps/creator-web/src/features/workspace/api.ts");

function mockFetch(captured) {
  return async (_url, init) => {
    captured.body = JSON.parse(init.body);
    return { ok: false, body: null, status: 500 };
  };
}

test("streamVibeChat includes approvedPlan in the request body when given", async () => {
  const captured = {};
  const original = global.fetch;
  global.fetch = mockFetch(captured);
  try {
    await streamVibeChat("p1", "do it", [], "build", () => {}, "Step 1: add a Header.").catch(() => {});
  } finally {
    global.fetch = original;
  }
  assert.equal(captured.body.approvedPlan, "Step 1: add a Header.");
  assert.equal(captured.body.agentMode, "build");
});

test("streamVibeChat omits approvedPlan when not given", async () => {
  const captured = {};
  const original = global.fetch;
  global.fetch = mockFetch(captured);
  try {
    await streamVibeChat("p1", "do it", [], "build", () => {}).catch(() => {});
  } finally {
    global.fetch = original;
  }
  assert.equal("approvedPlan" in captured.body, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/creator-web-vibe-approved-plan.test.mjs`
Expected: FAIL — `captured.body.approvedPlan` is undefined (param not sent yet).

- [ ] **Step 3: Add the param + body field**

In `apps/creator-web/src/features/workspace/api.ts`, change the `streamVibeChat` signature to add the optional param after `onEvent`:

```ts
export async function streamVibeChat(
  projectId: string,
  prompt: string,
  attachmentIds: string[],
  agentMode: WorkspaceAgentMode,
  onEvent: (type: string, data: unknown) => void,
  approvedPlan?: string
): Promise<void> {
```

Change the request body to include `approvedPlan` only when present:

```ts
    body: JSON.stringify({ prompt, attachmentIds, agentMode, ...(approvedPlan ? { approvedPlan } : {}) })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/creator-web-vibe-approved-plan.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/creator-web/src/features/workspace/api.ts tests/unit/creator-web-vibe-approved-plan.test.mjs
git commit -m "feat: send the approved plan on the creator chat request

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tag plan messages and add `approveAndImplement` to the vibe-chat hook

**Files:**
- Modify: `apps/creator-web/src/features/workspace/vibe-stream.ts` (VibeMessage fields + pure `buildApproveTurn`)
- Modify: `apps/creator-web/src/features/workspace/use-vibe-chat.ts` (tag plan messages, thread approvedPlan, expose `approveAndImplement`)
- Test: `tests/unit/creator-web-approve-turn.test.mjs`

**Interfaces:**
- Consumes: `streamVibeChat(..., approvedPlan?)` (Task 3).
- Produces: `VibeMessage` gains `isPlan?: boolean` and `sourcePrompt?: string`; `buildApproveTurn(sourcePrompt: string, planText: string): { prompt: string; mode: "build"; approvedPlan: string }`; the hook returns `approveAndImplement(sourcePrompt: string, planText: string): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/creator-web-approve-turn.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

const { buildApproveTurn } = await import("../../apps/creator-web/src/features/workspace/vibe-stream.ts");

test("buildApproveTurn builds a build-mode turn carrying the plan text as approvedPlan", () => {
  const turn = buildApproveTurn("add a header", "1. Create Header.\n2. Use it.");
  assert.deepEqual(turn, { prompt: "add a header", mode: "build", approvedPlan: "1. Create Header.\n2. Use it." });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/creator-web-approve-turn.test.mjs`
Expected: FAIL — `buildApproveTurn` is not exported.

- [ ] **Step 3: Add the fields + pure helper**

In `apps/creator-web/src/features/workspace/vibe-stream.ts`, extend the `VibeMessage` type:

```ts
export type VibeMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: VibeAction[];
  isPlan?: boolean;
  sourcePrompt?: string;
};
```

Add the pure helper (below the type):

```ts
// The build turn produced when a Creator approves a plan-mode plan: re-send the original request in
// build mode, carrying the approved plan text so the AI implements exactly it.
export function buildApproveTurn(sourcePrompt: string, planText: string): {
  prompt: string;
  mode: "build";
  approvedPlan: string;
} {
  return { prompt: sourcePrompt, mode: "build", approvedPlan: planText };
}
```

- [ ] **Step 4: Thread it through the hook**

In `apps/creator-web/src/features/workspace/use-vibe-chat.ts`:

1. Import `buildApproveTurn`:

```ts
import { applyVibeEvent, buildApproveTurn, type VibeMessage } from "./vibe-stream";
```

2. Widen the `handleVibeChat` overrides type to accept `approvedPlan`:

```ts
  async function handleVibeChat(overrides?: {
    prompt?: string;
    projectId?: string;
    mode?: WorkspaceAgentMode;
    approvedPlan?: string;
  }) {
```

3. In the assistant message the hook appends, tag it when planning by replacing the assistant-message object literal:

```ts
      { id: assistantId, role: "assistant", text: "", actions: [], isPlan: mode === "plan", sourcePrompt: prompt }
```

4. Pass `approvedPlan` to `streamVibeChat` (add the 6th argument to the existing call):

```ts
      await streamVibeChat(projectId, prompt, attachmentIds, mode, (type, data) => {
```

becomes — keep the callback, add the trailing argument after it:

```ts
      await streamVibeChat(
        projectId,
        prompt,
        attachmentIds,
        mode,
        (type, data) => {
          const field = (key: string): string =>
            data && typeof data === "object" && key in data
              ? String((data as Record<string, unknown>)[key])
              : typeof data === "string"
                ? data
                : "";
          patchAssistant((message) => applyVibeEvent(message, type, data as Record<string, unknown>));
          if (type === "action_start") {
            setVibeStatus(`${vibeActionVerb(field("actionType") || "file", "running")}…`);
          } else if (type === "commit") {
            setVibeStatus(`Committed ${field("sha").slice(0, 8)}`);
          } else if (type === "done") {
            setVibeStatus((previous) =>
              mode === "plan" ? "Plan ready" : previous.startsWith("Committed") ? previous : "Done"
            );
            if (mode === "build") setVibePreviewKey((key) => key + 1);
          }
        },
        overrides?.approvedPlan
      );
```

5. Add an `approveAndImplement` function above the `return {` and include it in the returned object:

```ts
  function approveAndImplement(sourcePrompt: string, planText: string) {
    void handleVibeChat(buildApproveTurn(sourcePrompt, planText));
  }
```

Add `approveAndImplement,` to the returned object (alongside `vibeMessages`, `vibeStatus`, etc.).

- [ ] **Step 5: Run test + typecheck**

Run:
```bash
node --import tsx --test tests/unit/creator-web-approve-turn.test.mjs tests/unit/creator-web-vibe-stream.test.mjs
pnpm --filter @evcp/creator-web typecheck
```
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/creator-web/src/features/workspace/vibe-stream.ts apps/creator-web/src/features/workspace/use-vibe-chat.ts tests/unit/creator-web-approve-turn.test.mjs
git commit -m "feat: tag plan messages and add approveAndImplement to the vibe-chat hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: "Approve & implement" button + render smoke + full gate

**Files:**
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx`
- Test: `tests/unit/creator-web-render-smoke.test.mjs` (already renders the page; confirm still green)

**Interfaces:**
- Consumes: `approveAndImplement` from the hook (Task 4); `VibeMessage.isPlan` / `.sourcePrompt` (Task 4).

- [ ] **Step 1: Add the button to the assistant plan message**

In `apps/creator-web/src/features/workspace/WorkspacePage.tsx`, destructure `approveAndImplement` from the hook alongside `vibeMessages` (near line 53). Then, inside the assistant-message render block (the `vibeMessages.map(...)` around line 190, where `message.text` renders via `VibeMarkdown`), add — after the message text, gated on a completed plan message and not currently streaming:

```tsx
{message.role === "assistant" && message.isPlan && message.text && !isVibing && (
  <Button
    variant="secondary"
    onClick={() => approveAndImplement(message.sourcePrompt ?? "", message.text)}
  >
    Approve &amp; implement
  </Button>
)}
```

Ensure `Button` is imported from `@evcp/ui` at the top of the file (add it to the existing `@evcp/ui` import if not already present). Do not add any local CSS — use the `@evcp/ui` `Button` primitive.

- [ ] **Step 2: Run the render smoke test**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`
Expected: PASS — the page renders (with no plan messages in the default state the button simply does not appear; the JSX must not throw).

- [ ] **Step 3: Typecheck creator-web**

Run: `pnpm --filter @evcp/creator-web typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/creator-web/src/features/workspace/WorkspacePage.tsx
git commit -m "feat: add an Approve & implement button to plan-mode chat messages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Run the full quality gate**

Run: `pnpm check`
Expected: repo hygiene, design-system, oxlint, typecheck, and unit tests pass. (Two pre-existing/flaky failures are known and unrelated to this work: `POST /setup/initialize …` and `idle sweep …` — confirm no *new* failures appear.)

- [ ] **Step 6: Confirm constraints**

Run: `wc -l apps/platform-api/src/generation-loop/generation-service.ts && git diff --name-only $(git merge-base main HEAD)..HEAD | grep -c platform-services.ts`
Expected: `generation-service.ts` ≤ 400; `platform-services.ts` count `0`.

- [ ] **Step 7: Commit any gate fixups** (only if the gate required a change)

```bash
git add -A
git commit -m "chore: satisfy quality gate for spec-driven vibe coding phase B"
```

---

## Self-Review

**Spec coverage:**
- `## Approved plan` section, 8000 cap, after `## Product spec` / before project files, build-mode only → Task 1.
- `runTurn` gains `approvedPlan?`, passed to promptInput; chat-route parses `approvedPlan` → Task 2.
- `api.ts` sends `approvedPlan` in the body → Task 3.
- `use-vibe-chat` `approveAndImplement`; plan messages tagged (`isPlan`, `sourcePrompt`) → Task 4.
- `WorkspacePage` "Approve & implement" button (@evcp/ui) → Task 5.
- Testing: system-prompt render/omit/truncate (Task 1); generation build-vs-plan injection (Task 2); request body carries/omits approvedPlan (Task 3); buildApproveTurn shape (Task 4); render smoke (Task 5).
- Acceptance criteria (approved plan reaches the build prompt; plain build unchanged; ≤400; platform-services untouched; design-system) → Tasks 1–2, 5–6.

**Placeholder scan:** none — every code/test step is concrete.

**Type consistency:** `approvedPlan?: string` is used identically across `buildSystemPrompt` (Task 1), `runTurn` input + `promptInput` (Task 2), chat-route parse (Task 2), `streamVibeChat` param + body (Task 3), and `buildApproveTurn` return `{ prompt; mode: "build"; approvedPlan }` (Task 4) consumed by `approveAndImplement` → `handleVibeChat` overrides `{ prompt?; mode?; approvedPlan? }`. `VibeMessage.isPlan` / `.sourcePrompt` defined in Task 4 and read in Task 5. Consistent.
