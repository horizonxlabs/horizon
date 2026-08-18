# Pi Auto Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Creator's persistent Plan/Build chat switch with one Auto Pi session that answers questions without mutation and runs the existing validated commit lifecycle only when the workspace actually changes.

**Architecture:** Normal Creator turns send `agentMode: "auto"`; legacy `plan` and `build` remain API-compatible for history and approved-plan execution. Auto Pi sessions receive all Horizon custom tools and use an intent-first system prompt, while Horizon decides whether to validate and commit from Git working-tree state rather than selected mode. The UI refreshes preview and the API runs post-build checks only after a real `commit` event.

**Tech Stack:** TypeScript, React 19, Vite, Node.js test runner, Pi Coding Agent 0.84.2, Docker workspace adapter, Git, SSE, pnpm

---

## File Map

- `packages/types/src/index.ts`: shared `WorkspaceAgentMode` union.
- `packages/api-client/src/index.ts`: browser/API `WorkspaceAgentMode` union and prompt contract.
- `apps/platform-api/src/workspace-agent-mode.ts`: authoritative request-mode normalization.
- `apps/creator-web/src/features/workspace/use-vibe-workspace.ts`: remove persisted mode state.
- `apps/creator-web/src/features/workspace/use-vibe-chat.ts`: send normal turns as Auto and refresh preview only after commit.
- `apps/creator-web/src/features/workspace/WorkspacePage.tsx`: remove Plan/Build controls and use neutral Auto copy.
- `apps/creator-web/src/features/workspace/workspace-chrome.ts`: retain tab definitions; remove mode-switch definitions.
- `apps/creator-web/src/features/workspace/workspace-mode.ts`: delete obsolete local-storage mode persistence.
- `apps/creator-web/src/features/workspace/quick-messages.ts`: generate intent-explicit suggestions without selected-mode state.
- `apps/platform-api/src/generation-loop/system-prompt.ts`: add the Auto intent contract.
- `apps/platform-api/src/generation-loop/pi-session-context.ts`: verify the existing rule gives Auto all Horizon tools while Plan remains read-only.
- `apps/platform-api/src/generation-loop/container-git.ts`: report clean/dirty state and prevent empty commits.
- `apps/platform-api/src/generation-loop/generation-service-types.ts`: expose workspace change detection.
- `apps/platform-api/src/generation-loop/factory.ts`: wire Docker Git change detection.
- `apps/platform-api/src/generation-loop/pi-generation-service.ts`: select Auto prompt and condition post-turn mutation lifecycle on Git state.
- `apps/platform-api/src/generation-loop/chat-route.ts`: run post-build work only after a commit event.
- Tests under `tests/unit` and `tests/integration`: public mode, UI, Pi tool, Git, lifecycle, and SSE contracts.

## Dirty Worktree Safety

The branch already contains uncommitted Pi reliability and session-refresh work. For any file that was dirty before this plan (`system-prompt.ts`, `pi-generation-service.ts`, `container-git.ts`, and their existing modified tests), stage only the Auto-agent hunks with `git add -p -- <paths>`, then inspect `git diff --cached --check` and `git diff --cached` before committing. Never stage an entire pre-existing dirty file, revert its unrelated hunks, or include the session-refresh files in an Auto-agent commit.

### Task 1: Add the Backward-Compatible Auto Mode Contract

**Files:**
- Create: `tests/unit/workspace-agent-mode.test.mjs`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `apps/platform-api/src/workspace-agent-mode.ts`

- [ ] **Step 1: Write the failing mode-resolution test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspaceAgentMode } from "../../apps/platform-api/src/workspace-agent-mode.ts";

test("workspace agent mode defaults normal and unknown requests to Auto", () => {
  assert.equal(resolveWorkspaceAgentMode(undefined), "auto");
  assert.equal(resolveWorkspaceAgentMode({}), "auto");
  assert.equal(resolveWorkspaceAgentMode({ agentMode: "unexpected" }), "auto");
});

test("workspace agent mode retains explicit legacy Plan and Build callers", () => {
  assert.equal(resolveWorkspaceAgentMode({ agentMode: "plan" }), "plan");
  assert.equal(resolveWorkspaceAgentMode({ agentMode: "build" }), "build");
});
```

- [ ] **Step 2: Run the test and verify the current Build default fails**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-agent-mode.test.mjs`

Expected: FAIL because missing and unknown values resolve to `build`.

- [ ] **Step 3: Extend both public mode unions and normalize to Auto**

```ts
export type WorkspaceAgentMode = "auto" | "plan" | "build";

export function resolveWorkspaceAgentMode(input: unknown): WorkspaceAgentMode {
  if (!input || typeof input !== "object") return "auto";
  const body = input as { agentMode?: unknown; workspaceMode?: unknown };
  const requested = body.agentMode ?? body.workspaceMode;
  return requested === "plan" || requested === "build" ? requested : "auto";
}
```

- [ ] **Step 4: Run the focused test and typecheck shared consumers**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-agent-mode.test.mjs && pnpm --filter @evcp/types typecheck && pnpm --filter @evcp/api-client typecheck`

Expected: PASS.

- [ ] **Step 5: Commit only the mode contract slice**

```bash
git add packages/types/src/index.ts packages/api-client/src/index.ts apps/platform-api/src/workspace-agent-mode.ts tests/unit/workspace-agent-mode.test.mjs
git commit -m "feat: add automatic workspace agent mode"
```

### Task 2: Replace the Creator Mode Switch with One Auto Composer

**Files:**
- Create: `tests/unit/creator-auto-agent-ui.test.mjs`
- Modify: `apps/creator-web/src/features/workspace/use-vibe-workspace.ts`
- Modify: `apps/creator-web/src/features/workspace/use-vibe-chat.ts`
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx`
- Modify: `apps/creator-web/src/features/workspace/workspace-chrome.ts`
- Modify: `apps/creator-web/src/features/workspace/quick-messages.ts`
- Modify: `tests/unit/creator-workspace-quick-messages.test.mjs`
- Modify: `tests/unit/vibe-prompt-queue.test.mjs`
- Modify: `tests/e2e/sprint4-workspace-smoke.test.mjs`
- Delete: `apps/creator-web/src/features/workspace/workspace-mode.ts`
- Delete: `tests/unit/workspace-mode.test.mjs`

- [ ] **Step 1: Write a failing source/UI contract test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Creator exposes one Auto Pi composer without persistent Plan Build state", async () => {
  const page = await readFile("apps/creator-web/src/features/workspace/WorkspacePage.tsx", "utf8");
  const hook = await readFile("apps/creator-web/src/features/workspace/use-vibe-chat.ts", "utf8");
  const workspace = await readFile("apps/creator-web/src/features/workspace/use-vibe-workspace.ts", "utf8");
  assert.doesNotMatch(page, /MODE_OPTIONS|Workspace mode|Plan with AI|Build with AI/);
  assert.doesNotMatch(workspace, /readWorkspaceMode|persistWorkspaceMode|workspaceMode/);
  assert.match(hook, /mode\s*=\s*overrides\?\.mode\s*\?\?\s*"auto"/);
  assert.match(page, /Ask Pi about the app or describe a change/);
});
```

- [ ] **Step 2: Run the UI contract and verify it fails**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-auto-agent-ui.test.mjs`

Expected: FAIL on the current mode switch and persisted mode state.

- [ ] **Step 3: Remove mode persistence and make normal/queued turns Auto**

In `use-vibe-chat.ts`, remove `workspaceMode` from hook input and use:

```ts
const mode = overrides?.mode ?? "auto";
```

Keep `overrides.mode = "build"` for `buildApproveTurn`. Queue each prompt with the resolved mode so a queued approved compatibility turn retains its explicit authority.

In `use-vibe-workspace.ts`, delete browser storage, mode state, effects, and setters. Stop returning `workspaceMode` and `setWorkspaceMode`.

- [ ] **Step 4: Remove the switch and use neutral Auto copy**

In `WorkspacePage.tsx`:

```tsx
<div className="vibe-live-empty-title">Create and understand your app with Pi</div>
<p>Ask Pi about the app or describe a change. Files change only when your request asks for it.</p>
```

Remove the `MODE_OPTIONS` import/rendering, mode-based Publish disabling, mode-based textarea labels/placeholders, and explicit mode arguments on normal quick-message/question submissions. Retain the Stop and Send buttons.

Remove `MODE_OPTIONS` and its icon imports from `workspace-chrome.ts`. Delete the obsolete `workspace-mode.ts` module and its test.

In `sprint4-workspace-smoke.test.mjs`, replace the legacy `Plan with AI`, `Build with AI`, and `Workspace mode` assertions with `Create and understand your app with Pi` and `Ask Pi about the app or describe a change`; explicitly assert that the removed labels are absent.

- [ ] **Step 5: Make quick messages independent of selected mode**

Remove `mode` from `QuickMessageContext`. Preserve model-authored suggestions. Generate one intent-explicit fallback set: mutation suggestions must say `Build`, `Implement`, `Fix`, or `Improve`; review suggestions must say `without changing files`.

Update quick-message and queue fixtures to use `auto` for normal turns while retaining one `build` approved-plan compatibility case.

- [ ] **Step 6: Run Creator-focused tests and typecheck**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-auto-agent-ui.test.mjs tests/unit/creator-workspace-quick-messages.test.mjs tests/unit/vibe-prompt-queue.test.mjs tests/unit/creator-web-render-smoke.test.mjs tests/e2e/sprint4-workspace-smoke.test.mjs && pnpm --filter @evcp/creator-web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the Creator Auto UI slice**

```bash
git add apps/creator-web/src/features/workspace tests/unit/creator-auto-agent-ui.test.mjs tests/unit/creator-workspace-quick-messages.test.mjs tests/unit/vibe-prompt-queue.test.mjs tests/unit/workspace-mode.test.mjs tests/e2e/sprint4-workspace-smoke.test.mjs
git commit -m "feat: replace workspace modes with auto Pi chat"
```

### Task 3: Give Auto Sessions Direct Pi Tool Choice and an Intent-First Prompt

**Files:**
- Modify: `apps/platform-api/src/generation-loop/system-prompt.ts`
- Modify: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Modify: `tests/unit/system-prompt.test.mjs`
- Modify: `tests/unit/pi-session-context.test.mjs`

- [ ] **Step 1: Write failing Auto prompt and tool tests**

Add to `system-prompt.test.mjs`:

```js
test("Auto prompt answers informational questions without mutation authority", () => {
  const prompt = buildAutoSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.match(prompt, /current message alone grants mutation authority/i);
  assert.match(prompt, /ตอนนี้ดึงข้อมูลมาจากไหน/);
  assert.match(prompt, /do not call.*write_workspace_file.*edit_workspace_file.*run_workspace_command/is);
  assert.match(prompt, /explicitly asks[\s\S]*\b(create|add|change|fix|remove|install|implement)\b/i);
  assert.match(prompt, /สร้าง|เพิ่ม|เปลี่ยน|แก้|ลบ|ติดตั้ง/);
});
```

Add an Auto session case to `pi-session-context.test.mjs` that asserts all seven Horizon tools are active and built-in tools remain disabled.

- [ ] **Step 2: Run tests and verify `buildAutoSystemPrompt` is missing**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/system-prompt.test.mjs tests/unit/pi-session-context.test.mjs`

Expected: FAIL because the Auto prompt does not exist.

- [ ] **Step 3: Implement the Auto system prompt**

Create `buildAutoSystemPrompt(input)` by prepending this contract to the existing controlled build prompt:

```text
## Current-turn intent — decide before tools
Only the current user message grants mutation authority. Prior requests and prior Build turns do not.
For an informational question, inspect only with list_workspace_files, read_workspace_file, and load_governed_skill as needed, then answer. Do not call write_workspace_file, edit_workspace_file, run_workspace_command, or propose_database_migration.
For a request that explicitly asks to create, add, change, fix, remove, install, implement, or equivalent Thai wording, use the minimum Horizon tools necessary and validate the result.
```

Remove any unconditional instruction that tells Pi to continue tool calls after an informational request is already answered.

- [ ] **Step 4: Select Auto prompt while keeping Plan compatibility read-only**

In `pi-generation-service.ts`:

```ts
const mode: WorkspaceAgentMode =
  input.agentMode === "plan" || input.agentMode === "build" ? input.agentMode : "auto";

const systemPrompt =
  mode === "plan"
    ? buildPlanSystemPrompt(systemInput)
    : mode === "auto"
      ? buildAutoSystemPrompt(systemInput)
      : buildSystemPrompt(systemInput);
```

`pi-session-context.ts` already filters only `plan`; assert Auto follows the full custom-tool path.

- [ ] **Step 5: Run prompt/session tests and Platform API typecheck**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/system-prompt.test.mjs tests/unit/pi-session-context.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the Auto Pi contract slice**

```bash
git add tests/unit/pi-session-context.test.mjs
git add -p -- apps/platform-api/src/generation-loop/system-prompt.ts apps/platform-api/src/generation-loop/pi-generation-service.ts tests/unit/system-prompt.test.mjs
git diff --cached --check
git diff --cached
git commit -m "feat: add intent-aware Pi auto sessions"
```

### Task 4: Detect Real Git Mutations and Eliminate Empty AI Commits

**Files:**
- Modify: `apps/platform-api/src/generation-loop/container-git.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-service-types.ts`
- Modify: `apps/platform-api/src/generation-loop/factory.ts`
- Modify: `tests/unit/container-git.test.mjs`

- [ ] **Step 1: Write failing clean/dirty Git tests**

```js
test("hasChanges reports Git porcelain state without mutating the workspace", async () => {
  const cleanDocker = fakeDocker([["status --porcelain", { stdout: "", stderr: "", exitCode: 0 }]]);
  const dirtyDocker = fakeDocker([["status --porcelain", { stdout: " M app/page.tsx\n", stderr: "", exitCode: 0 }]]);
  assert.equal(await createContainerGitCommitter(cleanDocker).hasChanges("c1"), false);
  assert.equal(await createContainerGitCommitter(dirtyDocker).hasChanges("c1"), true);
});

test("normal AI commit does not use allow-empty", async () => {
  const docker = fakeDocker([["rev-parse HEAD", { stdout: "abc123\n", stderr: "", exitCode: 0 }]]);
  await createContainerGitCommitter(docker).commit("c1", "AI: change");
  assert.doesNotMatch(docker.calls[0].cmd.join(" "), /--allow-empty/);
});
```

- [ ] **Step 2: Run the tests and verify the missing method/allow-empty failures**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/container-git.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Add read-only Git change detection**

Extend `ContainerGitCommitter`:

```ts
hasChanges(containerId: string): Promise<boolean>;
```

Implement it with `git -c safe.directory=/workspace status --porcelain --untracked-files=normal`. Return `true` only when trimmed stdout is non-empty. Use the same unprivileged `evcp` runner.

Remove `--allow-empty` from normal `commit`. Keep the initial baseline's `--allow-empty` behavior only inside `prepare`, where an empty repository needs a valid HEAD.

- [ ] **Step 4: Wire `workspaceGuard.hasChanges` through service types and factory**

```ts
workspaceGuard: {
  prepare(projectId: string): Promise<string>;
  hasChanges(projectId: string): Promise<boolean>;
  validate(projectId: string): Promise<void>;
  restore(projectId: string, commitSha: string): Promise<void>;
};
```

Map the project ID to the workspace container in `factory.ts` exactly as `prepare`, `validate`, and `restore` already do.

- [ ] **Step 5: Run Git tests and Platform API typecheck**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/container-git.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS. The generation service does not call `hasChanges` until Task 5, so existing runtime fixtures remain valid at this boundary.

- [ ] **Step 6: Commit the Git port slice**

```bash
git add apps/platform-api/src/generation-loop/generation-service-types.ts apps/platform-api/src/generation-loop/factory.ts
git add -p -- apps/platform-api/src/generation-loop/container-git.ts tests/unit/container-git.test.mjs
git diff --cached --check
git diff --cached
git commit -m "feat: detect workspace mutations before commit"
```

### Task 5: Make Auto Generation Lifecycle Conditional on Actual Mutation

**Files:**
- Modify: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Modify: `tests/unit/pi-generation-service.test.mjs`
- Modify: `tests/unit/pi-generation-atomicity.test.mjs`
- Modify: `tests/unit/pi-generation-service-streaming-lifecycle.test.mjs`

- [ ] **Step 1: Add `hasChanges` to generation test fixtures and write a failing clean Auto test**

```js
test("Auto informational turn skips mutation lifecycle when Git stays clean", async () => {
  const lifecycle = [];
  const deps = baseDeps(textExecutor("The chart uses local mock data."), lifecycle);
  deps.workspaceGuard.hasChanges = async () => false;
  const service = createPiGenerationService(deps);

  const events = await drain(service.runTurn({
    projectId: "p1",
    prompt: "ตอนนี้ดึงข้อมูลมาจากไหน",
    agentMode: "auto",
    actor
  }));

  assert.deepEqual(lifecycle, ["append:user", "prepare:base", "append:assistant"]);
  assert.equal(events.some((event) => event.type === "commit"), false);
  assert.equal((await service.history("p1")).at(-1).commitSha, null);
});
```

- [ ] **Step 2: Run the clean Auto test and verify current build lifecycle fails it**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/pi-generation-service.test.mjs`

Expected: FAIL because Auto currently falls into Build validation/commit behavior.

- [ ] **Step 3: Compute mutation state after Pi finishes**

After tool/event processing and before write checks:

```ts
const mutationCapable = mode !== "plan";
const hasWorkspaceChanges = mutationCapable && (await deps.workspaceGuard.hasChanges(input.projectId));
const hasMutation = hasWorkspaceChanges || migrations.length > 0;
```

Prepare/restore applies to `auto` and `build`. Run write checks, validation repair, migration sync/application, commit, checkpoint, and `commit` event only when `hasMutation` is true. Always append the assistant message.

- [ ] **Step 4: Write and pass the dirty Auto lifecycle test**

Use the existing scripted `write_workspace_file` executor, set `hasChanges` to `true`, and assert this exact order remains:

```js
[
  "append:user",
  "prepare:base",
  "tool:file",
  "git:changes",
  "validate",
  "sync:migrations",
  "commit:candidate",
  "migrate:batch",
  "checkpoint",
  "append:assistant"
]
```

Assert one `commit` event and the assistant `commitSha`.

- [ ] **Step 5: Update atomicity/streaming fixtures and run the lifecycle suite**

Add explicit `hasChanges` behavior to every `workspaceGuard` fixture: `true` for mutation tests and `false` for Plan/clean Auto tests. Preserve rollback assertions for timeout, cancellation, validation failure, and failed tool calls.

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/pi-generation-service.test.mjs tests/unit/pi-generation-atomicity.test.mjs tests/unit/pi-generation-service-streaming-lifecycle.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the conditional transaction slice**

```bash
git add -p -- apps/platform-api/src/generation-loop/pi-generation-service.ts tests/unit/pi-generation-service.test.mjs tests/unit/pi-generation-atomicity.test.mjs tests/unit/pi-generation-service-streaming-lifecycle.test.mjs
git diff --cached --check
git diff --cached
git commit -m "fix: commit Pi turns only after real mutations"
```

### Task 6: Drive Preview and Post-Build Checks from Commit Evidence

**Files:**
- Modify: `apps/creator-web/src/features/workspace/use-vibe-chat.ts`
- Modify: `apps/platform-api/src/generation-loop/chat-route.ts`
- Modify: `tests/integration/chat-route-sse.test.mjs`
- Modify: `tests/unit/creator-web-vibe-stream-transport.test.mjs`
- Modify: `tests/unit/creator-auto-agent-ui.test.mjs`

- [ ] **Step 1: Write a failing clean Auto SSE test**

Extend `chat-route-sse.test.mjs` with a service that streams `token` then `done` for `agentMode: "auto"`. Assert the response contains no `commit` and the post-turn runtime probe/bug collector is not called.

```js
assert.equal(events.some((event) => event.type === "commit"), false);
assert.equal(postTurnScans, 0);
```

- [ ] **Step 2: Run the SSE test and verify mode-based post-turn scanning fails**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/integration/chat-route-sse.test.mjs`

Expected: FAIL because non-Plan mode currently triggers post-turn tag collection.

- [ ] **Step 3: Track commit evidence in the route**

Inside the generation loop:

```ts
let committed = false;
for await (const event of deps.generationService.runTurn(...)) {
  if (event.type === "commit") committed = true;
  // existing SSE handling
}
```

Run PRD-from-plan recording and post-turn bug collection only when `committed` is true. Preserve the terminal `done` ordering.

- [ ] **Step 4: Refresh Creator preview only on `commit`**

In `use-vibe-chat.ts`, increment `vibePreviewKey` in the `commit` event branch and remove the unconditional mode-based increment from the `done` branch. Set normal Auto status to `Thinking…`, then `AI is working…` only when an action begins.

- [ ] **Step 5: Run route and Creator transport tests**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/integration/chat-route-sse.test.mjs tests/unit/creator-web-vibe-stream-transport.test.mjs tests/unit/creator-auto-agent-ui.test.mjs`

Expected: PASS with `done` terminal and preview refresh tied to `commit`.

- [ ] **Step 6: Commit the evidence-driven UI/route slice**

```bash
git add apps/creator-web/src/features/workspace/use-vibe-chat.ts apps/platform-api/src/generation-loop/chat-route.ts tests/integration/chat-route-sse.test.mjs tests/unit/creator-web-vibe-stream-transport.test.mjs tests/unit/creator-auto-agent-ui.test.mjs
git commit -m "fix: drive post-build behavior from commit evidence"
```

### Task 7: Integration, Live Gemma Verification, and Final Quality Gate

**Files:**
- Modify: `tests/integration/pi-agent-workspace-flow.test.mjs`

- [ ] **Step 1: Add a scripted Auto informational integration case**

The scripted model may call `read_workspace_file` and then return an explanation. Assert:

```js
assert.equal(events.some((event) => event.type === "commit"), false);
assert.equal(workspaceGuard.validateCalls, 0);
assert.equal(commitCalls, 0);
assert.equal(checkpointCalls, 0);
```

- [ ] **Step 2: Add a scripted Auto mutation integration case**

Use `write_workspace_file`, report dirty Git state, and assert validation, one commit, one checkpoint, and terminal `done`.

- [ ] **Step 3: Run the new integration cases and verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/integration/pi-agent-workspace-flow.test.mjs`

Expected: PASS with the informational case clean and the mutation case committed once.

- [ ] **Step 4: Commit the integration contract**

```bash
git add tests/integration/pi-agent-workspace-flow.test.mjs
git commit -m "test: verify Pi auto agent behavior"
```

- [ ] **Step 5: Run all focused Auto-agent tests**

Run:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test \
  tests/unit/workspace-agent-mode.test.mjs \
  tests/unit/creator-auto-agent-ui.test.mjs \
  tests/unit/system-prompt.test.mjs \
  tests/unit/pi-session-context.test.mjs \
  tests/unit/container-git.test.mjs \
  tests/unit/pi-generation-service.test.mjs \
  tests/unit/pi-generation-atomicity.test.mjs \
  tests/unit/pi-generation-service-streaming-lifecycle.test.mjs \
  tests/integration/chat-route-sse.test.mjs \
  tests/integration/pi-agent-workspace-flow.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run the full repository quality gate**

Run: `pnpm check:ci`

Expected: repository hygiene, lint, typecheck, unit, build, integration, and E2E all pass.

If it fails, stop at the first failure, identify the exact production/test contract responsible, and append a numbered red-green regression task naming the concrete files and assertion before editing them. Do not make opportunistic cleanup changes during this gate.

- [ ] **Step 7: Verify the informational question with local Gemma**

Record workspace HEAD, send `ตอนนี้ดึงข้อมูลมาจากไหน`, and verify:

- the answer describes the current data source;
- no `write_workspace_file`, `edit_workspace_file`, `run_workspace_command`, or migration action appears;
- no `commit` event appears;
- workspace HEAD and status remain unchanged.

- [ ] **Step 8: Verify an explicit mutation with local Gemma**

Send one bounded visible change. Verify one validated commit, clean workspace, changed HEAD, and refreshed preview. Restore that verification commit afterward only if it was explicitly described as disposable.

- [ ] **Step 9: Review the final branch diff**

Run: `git diff --check && git status --short --branch && git diff --stat`

Expected: no unstaged Auto-agent implementation files, no whitespace errors, and no unrelated files included in the feature commits. Keep the pre-existing uncommitted Pi reliability and session-refresh work outside Auto-agent commits unless an overlapping hunk is required by this plan.

- [ ] **Step 10: Report completion without reverting historical app commits**

Report focused and full quality results, the local Gemma read-only HEAD evidence, and the explicit mutation commit. State that workspace commit `b2d4bba` remains until the user separately authorizes a rollback to `d15896f0`.
