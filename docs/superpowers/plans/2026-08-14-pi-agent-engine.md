# Pi Agent Engine Implementation Plan

Status: Approved for inline execution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Horizon's completion/parser-based Coding AI loop with Pi SDK as the only production agent engine while preserving Horizon governance, Docker isolation, Prisma history, SSE compatibility, and the transactional build lifecycle.

**Architecture:** `platform-api` embeds one in-memory Pi `AgentSession` per Creator turn. A Horizon-owned Pi provider converts Pi contexts into structured governed rounds, while seven TypeBox-defined custom tools delegate only to the existing Docker-backed workspace layer; Horizon remains the outer coordinator for validation, Git, migration batches, checkpoints, persistence, cancellation, and limits.

**Tech Stack:** Node.js 22.22.0, TypeScript, `@earendil-works/pi-coding-agent@0.84.2`, `@earendil-works/pi-ai@0.84.2`, TypeBox schemas, Prisma, Docker workspace adapters, Node test runner, SSE.

**Spec:** `docs/superpowers/specs/2026-08-14-pi-agent-engine-design.md`

## Global Constraints

- `@earendil-works/pi-coding-agent` is pinned exactly to `0.84.2`; `@earendil-works/pi-ai` is also pinned exactly to `0.84.2` because Horizon directly implements Pi's provider event protocol.
- Repository Node engine is `>=22.19.0`; Platform API and generated-workspace images are pinned to `node:22.22.0-alpine`.
- Pi is the sole Coding AI engine. Do not add `EVCP_AGENT_ENGINE`, a dual-runtime branch, or a legacy fallback.
- Pi receives no built-in tools. Sessions use `noTools: "all"`, an explicit Horizon-tool allowlist, `SessionManager.inMemory()`, `SettingsManager.inMemory()`, and a controlled in-memory `ResourceLoader`.
- No generated project path is passed as Pi's `cwd`; use the inert logical cwd `/horizon-workspace` and delegate all project access through the Docker-backed tool context.
- Generated projects cannot load `.pi/extensions`, `.pi/skills`, `.pi/prompts`, `AGENTS.md`, `CLAUDE.md`, themes, prompt packages, credentials, or project-local extensions into Platform API.
- Every Pi provider round, including tool-result follow-ups, retries, and compaction, calls `GovernedAiExecutor.executeAgentRound()` with a unique request ID and creates separate quota/evidence accounting.
- Prisma chat/audit persistence is authoritative; Pi JSONL sessions are disabled and raw thinking is not persisted as business history.
- Plan mode exposes only `read_workspace_file`, `list_workspace_files`, and `load_governed_skill`. Build mode exposes all seven Horizon tools.
- Migration tools validate and buffer proposals; Horizon applies the full turn's migration batch later in one transaction.
- Any failure or abort after Git preparation restores the base commit and creates no checkpoint.
- Existing Creator events remain `token`, `reasoning`, `action_start`, `action_chunk`, `action_result`, `commit`, `error`, and `done`.
- Preserve the unrelated untracked `docs/research/pi-sdk-evaluation.md`; do not stage it in implementation commits.

## File Structure

- `apps/platform-api/src/ai-governance/agent-execution-types.ts`: provider-neutral structured message, tool, stream-event, usage, and agent-round contracts.
- `apps/platform-api/src/ai-governance/execution-service.ts`: shared guardrail/quota/fallback/evidence orchestration for text completions and structured rounds.
- `apps/platform-api/src/ai-governance/execution-runtime.ts`: OpenAI-compatible/LiteLLM and Anthropic structured streaming adapters behind governance.
- `apps/platform-api/src/generation-loop/pi-provider.ts`: converts Pi `Context` and `AssistantMessageEventStream` to/from Horizon's structured governed round.
- `apps/platform-api/src/generation-loop/pi-session-context.ts`: creates the no-discovery in-memory Pi session, hydrates Prisma history, and binds governed context.
- `apps/platform-api/src/generation-loop/pi-tools.ts`: defines the seven schemas and delegates validated operations to the Docker-backed workspace layer.
- `apps/platform-api/src/generation-loop/pi-tool-policy.ts`: path, command, size, output, migration, abort, and per-turn tool-count policy.
- `apps/platform-api/src/generation-loop/pi-event-adapter.ts`: maps Pi session events and tool details to the existing `ChatStreamEvent` union.
- `apps/platform-api/src/generation-loop/pi-generation-service.ts`: project lock and Horizon outer transaction around a Pi session.
- `apps/platform-api/src/generation-loop/pi-limits.ts`: parses bounded environment-backed limits with safe defaults.
- `apps/platform-api/src/generation-loop/generation-service-types.ts`: dependency and public service interfaces shared by factory, route, and Pi implementation.
- `apps/platform-api/src/generation-loop/system-prompt.ts`: tool-native Plan/Build instructions; removes action-markup protocol wording.
- `apps/platform-api/src/generation-loop/action-runner-types.ts` and `action-runner.ts`: direct-argv shell execution, timeout/output bounds, and abort-aware calls inside the project container.
- `apps/platform-api/src/generation-loop/chat-route.ts`: request disconnect cancellation and interface-based service typing.
- `apps/platform-api/src/generation-loop/factory.ts`: the only production wiring, with Pi and governed execution required for real model rounds.
- Legacy-only files deleted after reference audit: `generation-service.ts`, `llm-client.ts`, `message-parser.ts`, `governed-completion.ts`, and `error-feedback.ts`. `generation-action-utils.ts` and `generation-stream-helpers.ts` remain as smaller Pi-native preview/validation helpers.

---

### Task 1: Pin Pi and the Node runtime

**Files:**
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `tests/unit/pi-runtime-contract.test.mjs`
- Modify: `package.json`
- Modify: `apps/platform-api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docker/platform-api.Dockerfile`
- Modify: `docker/workspace-next.Dockerfile`
- Modify: `docker/web-app.Dockerfile`

**Interfaces:**
- Consumes: the repository's existing pnpm workspace and Docker build definitions.
- Produces: exact Pi dependencies available to Platform API and a Node runtime satisfying Pi's `>=22.19.0` engine requirement.

- [ ] **Step 1: Write the failing runtime contract test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const json = (path) => readFile(path, "utf8").then(JSON.parse);

test("Pi and Node versions are pinned for the embedded agent", async () => {
  const root = await json(new URL("../../package.json", import.meta.url));
  const api = await json(new URL("../../apps/platform-api/package.json", import.meta.url));
  assert.equal(root.engines.node, ">=22.19.0");
  assert.equal(api.dependencies["@earendil-works/pi-coding-agent"], "0.84.2");
  assert.equal(api.dependencies["@earendil-works/pi-ai"], "0.84.2");
  for (const path of ["platform-api", "workspace-next", "web-app"]) {
    const dockerfile = await readFile(new URL(`../../docker/${path}.Dockerfile`, import.meta.url), "utf8");
    assert.match(dockerfile, /^FROM node:22\.22\.0-alpine/m);
  }
  const notices = await readFile(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
  assert.match(notices, /@earendil-works\/pi-coding-agent 0\.84\.2/);
  assert.match(notices, /MIT/);
});
```

- [ ] **Step 2: Run the RED test**

Run: `node --test tests/unit/pi-runtime-contract.test.mjs`

Expected: FAIL because the Pi dependencies and exact Node image tags are absent.

- [ ] **Step 3: Pin dependencies, runtime, and notice**

Set the root engine to `">=22.19.0"`, add both exact Pi dependencies under `apps/platform-api`, change each relevant `FROM` line to `node:22.22.0-alpine`, and add this notice:

```md
# Third-Party Notices

## @earendil-works/pi-coding-agent 0.84.2

Copyright (c) Mario Zechner and contributors. Licensed under the MIT License.
Source: https://github.com/earendil-works/pi

## @earendil-works/pi-ai 0.84.2

Copyright (c) Mario Zechner and contributors. Licensed under the MIT License.
Source: https://github.com/earendil-works/pi
```

Run: `pnpm install --lockfile-only`

- [ ] **Step 4: Run the GREEN checks**

Run: `node --test tests/unit/pi-runtime-contract.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/platform-api/package.json pnpm-lock.yaml docker/platform-api.Dockerfile docker/workspace-next.Dockerfile docker/web-app.Dockerfile THIRD_PARTY_NOTICES.md tests/unit/pi-runtime-contract.test.mjs
git commit -m "build: pin Pi agent runtime"
```

### Task 2: Add structured governed model rounds

**Files:**
- Create: `apps/platform-api/src/ai-governance/agent-execution-types.ts`
- Create: `tests/unit/ai-governed-agent-round.test.mjs`
- Modify: `apps/platform-api/src/ai-governance/execution-service.ts`
- Modify: `apps/platform-api/src/ai-governance/execution-runtime.ts`

**Interfaces:**
- Consumes: `PlatformUser`, `AiScenario`, `ResolvedAiProvider`, existing guardrail/quota/fallback/evidence dependencies.
- Produces: `GovernedAiExecutor.executeAgentRound(actor, input, onEvent)` and provider-neutral structured round types.

Define the contract exactly as:

```ts
export type AgentTextBlock = { type: "text"; text: string };
export type AgentThinkingBlock = { type: "thinking"; thinking: string };
export type AgentToolCallBlock = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export type AgentRoundMessage =
  | { role: "user"; content: string | AgentTextBlock[]; timestamp: number }
  | { role: "assistant"; content: Array<AgentTextBlock | AgentThinkingBlock | AgentToolCallBlock>; timestamp: number }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: AgentTextBlock[]; isError: boolean; timestamp: number };
export type AgentRoundTool = { name: string; description: string; parameters: Record<string, unknown> };
export type AgentRoundEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "toolcall_start"; contentIndex: number }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: AgentToolCallBlock };
export type AgentRoundUsage = { input: number; output: number; totalTokens: number; costUsd: number };
export type GovernedAiAgentRoundInput = {
  scenario: AiScenario;
  projectId: string;
  requestId: string;
  systemPrompt?: string;
  messages: AgentRoundMessage[];
  tools: AgentRoundTool[];
  requestedTokens?: number;
  signal?: AbortSignal;
};
export type GovernedAiAgentRoundResult = {
  status: GovernedAiExecutionStatus;
  message?: Extract<AgentRoundMessage, { role: "assistant" }>;
  usage?: AgentRoundUsage;
  evidence: AiExecutionEvidence;
};
```

- [ ] **Step 1: Write failing governance tests**

Test three public behaviors: every round runs guardrail → quota → structured invoke → reconcile → evidence; a primary failure runs the structured fallback without replaying primary partial events; and block/abort results never invoke a provider. The success assertion must include native tool calls, not flattened markup:

```js
const result = await executor.executeAgentRound(actor, {
  scenario: "frontend_coding",
  projectId: "p1",
  requestId: "round-1",
  systemPrompt: "Use tools",
  messages: [{ role: "user", content: "read page", timestamp: 1 }],
  tools: [{ name: "read_workspace_file", description: "Read", parameters: { type: "object" } }]
}, (event) => events.push(event));

assert.equal(result.status, "succeeded");
assert.deepEqual(result.message.content.at(-1), {
  type: "toolCall", id: "call-1", name: "read_workspace_file", arguments: { path: "app/page.tsx" }
});
assert.equal(result.evidence.requestId, "round-1");
assert.deepEqual(order, ["guardrail", "quota", "invoke", "reconcile", "save"]);
```

- [ ] **Step 2: Run the RED test**

Run: `node --import tsx --test tests/unit/ai-governed-agent-round.test.mjs`

Expected: FAIL with `executor.executeAgentRound is not a function`.

- [ ] **Step 3: Add the structured dependency and shared governance path**

Extend `GovernedAiExecutorDependencies` with:

```ts
invokeAgentRound: (input: {
  provider: ResolvedAiProvider;
  systemPrompt?: string;
  messages: AgentRoundMessage[];
  tools: AgentRoundTool[];
  signal?: AbortSignal;
  onEvent?: (event: AgentRoundEvent) => void;
}) => Promise<{ message: Extract<AgentRoundMessage, { role: "assistant" }>; usage: AgentRoundUsage; latencyMs: number; providerId: string; model: string }>;
```

Implement `executeAgentRound()` by extracting common plan/guardrail/quota/reconcile/persist helpers from `execute()`. Build the guardrail input from the system prompt plus user/tool-result text only, estimate quota from serialized structured input, and persist the structured assistant message alongside evidence for request-id idempotency. Forward primary deltas immediately for live streaming; use fallback only when the primary fails before its first emitted delta. If a primary stream fails after emitting data, terminate that round as failed so the client never receives a mixed partial-primary/fallback response. Sanitize failures with both primary and fallback secrets.

- [ ] **Step 4: Implement structured provider streaming in the runtime**

For OpenAI-compatible/LiteLLM providers, POST the native protocol:

```ts
{
  model: provider.model,
  messages: toOpenAiMessages(input.systemPrompt, input.messages),
  tools: input.tools.map((tool) => ({ type: "function", function: tool })),
  tool_choice: input.tools.length ? "auto" : undefined,
  stream: true,
  stream_options: { include_usage: true }
}
```

Accumulate `delta.content`, `delta.reasoning_content`, and indexed `delta.tool_calls[].function.arguments`; emit the structured deltas; parse arguments only at tool-call end; set the assistant stop reason from `finish_reason`; and reject malformed tool JSON as a sanitized provider failure. Convert Anthropic messages/tools to `/messages`, process `content_block_start/delta/stop` for `text`, `thinking`, and `tool_use`, and normalize both adapters into the same Horizon result. Merge `input.signal` with the configured timeout via `AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)])`.

- [ ] **Step 5: Run the GREEN checks**

Run: `node --import tsx --test tests/unit/ai-governed-agent-round.test.mjs tests/unit/ai-governance-lifecycle.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS; the old text `execute()` tests remain green.

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/ai-governance/agent-execution-types.ts apps/platform-api/src/ai-governance/execution-service.ts apps/platform-api/src/ai-governance/execution-runtime.ts tests/unit/ai-governed-agent-round.test.mjs
git commit -m "feat: govern structured agent rounds"
```

### Task 3: Build the governed Pi provider adapter

**Files:**
- Create: `apps/platform-api/src/generation-loop/pi-provider.ts`
- Create: `tests/unit/pi-provider.test.mjs`

**Interfaces:**
- Consumes: `Pick<GovernedAiExecutor, "executeAgentRound">`, Pi `Context`, `SimpleStreamOptions`, and authenticated `{ actor, projectId, scenario, turnId, limits }`.
- Produces: `createHorizonPiRuntime(input): Promise<{ modelRuntime: ModelRuntime; model: Model<string> }>`.

- [ ] **Step 1: Write the failing provider test**

Use Pi's in-memory runtime and assert two calls receive unique IDs, native messages/tools, the caller abort signal, and no real provider secret:

```js
const { modelRuntime, model } = await createHorizonPiRuntime({
  executor,
  actor,
  projectId: "p1",
  scenario: "frontend_coding",
  turnId: "turn-1",
  maxModelRounds: 4
});
for (let index = 0; index < 2; index += 1) {
  const stream = modelRuntime.streamSimple(model, context, { signal: controller.signal });
  for await (const event of stream) received.push(event.type);
}
assert.equal(rounds.length, 2);
assert.notEqual(rounds[0].requestId, rounds[1].requestId);
assert.deepEqual(rounds[0].tools.map((tool) => tool.name), ["read_workspace_file"]);
assert.equal(rounds[0].signal, controller.signal);
assert.deepEqual(received, ["start", "text_start", "text_delta", "text_end", "done", "start", "text_start", "text_delta", "text_end", "done"]);
```

- [ ] **Step 2: Run the RED test**

Run: `node --import tsx --test tests/unit/pi-provider.test.mjs`

Expected: FAIL because `pi-provider.ts` does not exist.

- [ ] **Step 3: Implement the provider bridge**

Create a `ModelRuntime` with `InMemoryCredentialStore`, `modelsPath: null`, `allowModelNetwork: false`, and `refreshOnCreate: false`. Register a single synthetic provider/model named `horizon-governed` whose `streamSimple` immediately returns `createAssistantMessageEventStream()` and asynchronously calls `executeAgentRound()`.

Map Horizon deltas to Pi events in protocol order (`start`, block start/delta/end, then `done`); copy usage into Pi's full `Usage` shape with zero cache values; return `error` with `stopReason: "error"` or `"aborted"` for blocked, failed, over-limit, and aborted rounds. Generate request IDs as `pi_${turnId}_${roundNumber}_${randomUUID()}` and increment before every invocation.

- [ ] **Step 4: Run the GREEN checks**

Run: `node --import tsx --test tests/unit/pi-provider.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/pi-provider.ts tests/unit/pi-provider.test.mjs
git commit -m "feat: bridge Pi through AI governance"
```

### Task 4: Create a discovery-free Pi session context

**Files:**
- Create: `apps/platform-api/src/generation-loop/pi-session-context.ts`
- Create: `tests/unit/pi-session-context.test.mjs`
- Modify: `apps/platform-api/src/generation-loop/system-prompt.ts`
- Modify: `tests/unit/generation-approved-plan.test.mjs`
- Modify: `tests/unit/generation-skill-injection.test.mjs`

**Interfaces:**
- Consumes: `WorkspaceChatMessage[]`, rolling summary, selected current files, governed PRD/knowledge/skills, approved plan, Pi runtime/model, and `ToolDefinition[]`.
- Produces: `createHorizonPiSession(input): Promise<AgentSession>` with no persistent or discovered resources.

- [ ] **Step 1: Write failing no-discovery and hydration tests**

Create a temporary directory containing `.pi/extensions/evil.ts`, `.pi/skills/evil/SKILL.md`, `.pi/prompts/evil.md`, `AGENTS.md`, and `CLAUDE.md`. Pass that directory only as hostile fixture data, not as Pi `cwd`, then assert:

```js
assert.deepEqual(session.resourceLoader.getExtensions().extensions, []);
assert.deepEqual(session.resourceLoader.getSkills().skills, []);
assert.deepEqual(session.resourceLoader.getPrompts().prompts, []);
assert.deepEqual(session.resourceLoader.getAgentsFiles().agentsFiles, []);
assert.equal(session.sessionFile, undefined);
assert.deepEqual(session.getActiveToolNames(), ["read_workspace_file", "list_workspace_files", "load_governed_skill"]);
assert.match(session.systemPrompt, /Confirmed PRD baseline/);
assert.doesNotMatch(session.systemPrompt, /evil extension|CLAUDE\.md/);
assert.deepEqual(session.messages.map((message) => message.role), ["user", "assistant"]);
```

Also assert Build mode includes all seven custom tools and approved-plan text, while Plan mode excludes write/edit/command/migration tools and approved-plan text.

- [ ] **Step 2: Run the RED tests**

Run: `node --import tsx --test tests/unit/pi-session-context.test.mjs tests/unit/generation-approved-plan.test.mjs tests/unit/generation-skill-injection.test.mjs`

Expected: FAIL because the controlled Pi session factory does not exist and the existing prompt still instructs action markup.

- [ ] **Step 3: Implement the controlled resource loader and session**

Use these concrete SDK controls:

```ts
const sessionManager = SessionManager.inMemory("/horizon-workspace", { id: `pi_${turnId}` });
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: true },
  retry: { enabled: true, maxRetries: 2, baseDelayMs: 250 },
  enableAnalytics: false,
  packages: [],
  extensions: [],
  skills: [],
  prompts: [],
  themes: []
});
const { session } = await createAgentSession({
  cwd: "/horizon-workspace",
  modelRuntime,
  model,
  thinkingLevel: "medium",
  noTools: "all",
  tools: customTools.map((tool) => tool.name),
  customTools,
  resourceLoader: createEmptyResourceLoader(systemPrompt),
  sessionManager,
  settingsManager
});
```

Append prior Prisma user/assistant messages to `sessionManager` before creating the session, converting ISO timestamps to epoch milliseconds and excluding the current just-persisted user message by ID. Do not append thinking or provider credentials. The empty resource loader returns no extensions, skills, prompts, themes, agents files, append prompts, or paths; `extendResources()` is a no-op and `reload()` preserves the supplied Horizon system prompt.

Rewrite `buildSystemPrompt()` and `buildPlanSystemPrompt()` to describe native tool names and lifecycle rules. Remove `<artifact>`, `<action>`, SEARCH/REPLACE markup envelopes, Pi resource-discovery instructions, and the claim that arbitrary shell commands are available. Keep the Golden Rule, design/data guidance, PRD, approved plan, governed knowledge, and explicit `load_governed_skill` progressive-disclosure rule.

- [ ] **Step 4: Run the GREEN checks**

Run: `node --import tsx --test tests/unit/pi-session-context.test.mjs tests/unit/generation-approved-plan.test.mjs tests/unit/generation-skill-injection.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/pi-session-context.ts apps/platform-api/src/generation-loop/system-prompt.ts tests/unit/pi-session-context.test.mjs tests/unit/generation-approved-plan.test.mjs tests/unit/generation-skill-injection.test.mjs
git commit -m "feat: create isolated Pi sessions"
```

### Task 5: Implement bounded Horizon custom tools

**Files:**
- Create: `apps/platform-api/src/generation-loop/pi-tool-policy.ts`
- Create: `apps/platform-api/src/generation-loop/pi-tools.ts`
- Create: `tests/unit/pi-tools.test.mjs`
- Create: `tests/unit/pi-tools-security.test.mjs`
- Modify: `apps/platform-api/src/generation-loop/action-runner-types.ts`
- Modify: `apps/platform-api/src/generation-loop/action-runner.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-action-utils.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Consumes: `ActionRunner`, `GoldenTemplate`, container/project identity, bounded workspace reader, governed skill instructions, migration buffer, abort signal, and parsed limits.
- Produces: `createHorizonPiTools(context): ToolDefinition[]` and `HorizonPiToolDetails` for SSE/persistence.

Use this tool context:

```ts
export type HorizonPiToolContext = {
  projectId: string;
  containerId: string;
  template: GoldenTemplate;
  actionRunner: ActionRunner;
  readWorkspaceFiles: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  skillInstructions: Readonly<Record<string, string>>;
  migrationBuffer: Array<Extract<RunnableAction, { type: "migration" }>>;
  signal: AbortSignal;
  limits: PiAgentLimits;
  nextToolCall(): void;
  onAudit?: GenerationServiceDeps["onAudit"];
};
```

- [ ] **Step 1: Write failing behavior and security tests**

Cover all seven tools and assert that traversal (`../x`), absolute paths, locked files, duplicate/nonexistent edits, oversized input/output, control characters, commands outside the allowlist, SQL `BEGIN`/`COMMIT`/`ROLLBACK`, calls after abort, and calls beyond the tool budget return sanitized errors without invoking Docker. Assert one project context never accepts an input `projectId` or `containerId` parameter.

The happy-path migration assertion is:

```js
const result = await migration.execute("call-m1", {
  name: "create_contacts",
  sql: "CREATE TABLE contacts(id text PRIMARY KEY)"
}, signal);
assert.equal(result.details.actionType, "migration");
assert.equal(result.details.ok, true);
assert.equal(migrations.length, 1);
assert.equal(actionRunnerCalls.length, 0);
```

- [ ] **Step 2: Run the RED tests**

Run: `node --import tsx --test tests/unit/pi-tools.test.mjs tests/unit/pi-tools-security.test.mjs`

Expected: FAIL because the custom tools do not exist.

- [ ] **Step 3: Implement schemas and policy**

Define the schemas with `Type.Object(..., { additionalProperties: false })`:

```ts
read_workspace_file: { path: string }
list_workspace_files: { prefix?: string }
write_workspace_file: { path: string; content: string }
edit_workspace_file: { path: string; find: string; replace: string }
run_workspace_command: { command: string; args: string[]; timeoutMs?: number }
propose_database_migration: { name: string; sql: string }
load_governed_skill: { name: string }
```

Normalize project-relative POSIX paths and reject empty paths, backslashes, NUL/control characters, `.`/`..` segments, leading `/`, and paths outside the project roots `app/`, `components/`, `lib/`, and `public/`. Reads/edits require an existing file from the bounded workspace reader; writes may create a new file under those roots. Apply `isLockedFile()` before writes/edits. Allow only direct commands `node`, `npm`, `npx`, `pnpm`, `git`, `ls`, `find`, `rg`, `grep`, `sed`, `head`, `tail`, `wc`, `mkdir`, `cp`, and `mv`; reject shell metacharacters in command names and execute `command + args` directly without `sh -c`. Block environment-dump arguments, absolute host paths, Docker access, and network clients. Reuse `containsTransactionControl()` for SQL and validate migration names with `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`.

Every tool first checks the combined abort signal and `nextToolCall()`. Bound all returned text with a shared UTF-8 byte clipper and use structured details:

```ts
export type HorizonPiToolDetails = {
  actionId: string;
  actionType: "file" | "edit" | "shell" | "migration" | "skill";
  label: string;
  ok: boolean;
  body?: string;
  find?: string;
  replace?: string;
  error?: string;
};
```

For shell streaming, call `onUpdate({ content: [{ type: "text", text: chunk }], details })`. Extend `ActionRunner.runAction()` with `signal?: AbortSignal`, `timeoutMs?: number`, and `maxOutputBytes?: number`; direct-argv execution must stop collecting output at the byte limit and return an error when timed out or aborted. Update `WorkspaceChatAction["type"]` to include `"skill"` so persisted records match the existing SSE union.

- [ ] **Step 4: Run the GREEN checks**

Run: `node --import tsx --test tests/unit/pi-tools.test.mjs tests/unit/pi-tools-security.test.mjs tests/unit/action-runner*.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/pi-tool-policy.ts apps/platform-api/src/generation-loop/pi-tools.ts apps/platform-api/src/generation-loop/action-runner-types.ts apps/platform-api/src/generation-loop/action-runner.ts apps/platform-api/src/generation-loop/generation-action-utils.ts packages/types/src/index.ts tests/unit/pi-tools.test.mjs tests/unit/pi-tools-security.test.mjs
git commit -m "feat: expose bounded Horizon tools to Pi"
```

### Task 6: Adapt Pi events to the Creator SSE contract

**Files:**
- Create: `apps/platform-api/src/generation-loop/pi-event-adapter.ts`
- Create: `tests/unit/pi-event-adapter.test.mjs`
- Modify: `apps/platform-api/src/generation-loop/generation-types.ts`

**Interfaces:**
- Consumes: `AgentSessionEvent` and `HorizonPiToolDetails`.
- Produces: `adaptPiEvent(event): ChatStreamEvent[]` plus `assistantTextDelta(event): string | undefined`.

- [ ] **Step 1: Write the failing exact-mapping test**

Feed synthetic Pi events for text, thinking, and all tool lifecycle phases. Assert exact output, including stable tool call IDs:

```js
assert.deepEqual(adaptPiEvent({
  type: "tool_execution_start",
  toolCallId: "call-7",
  toolName: "edit_workspace_file",
  args: { path: "app/page.tsx" }
}), [{ type: "action_start", actionId: "call-7", actionType: "edit", label: "app/page.tsx" }]);
```

Assert `message_update` with `text_delta` maps only to `token`, `thinking_delta` maps only to `reasoning`, tool updates map to bounded `action_chunk`, and tool end maps to `action_result` with `find`, `replace`, `body`, or sanitized `error` from details.

- [ ] **Step 2: Run the RED test**

Run: `node --import tsx --test tests/unit/pi-event-adapter.test.mjs`

Expected: FAIL because the event adapter does not exist.

- [ ] **Step 3: Implement the pure adapter**

Map tool names as follows:

```ts
const actionTypeByTool = {
  read_workspace_file: "file",
  list_workspace_files: "file",
  write_workspace_file: "file",
  edit_workspace_file: "edit",
  run_workspace_command: "shell",
  propose_database_migration: "migration",
  load_governed_skill: "skill"
} as const;
```

Ignore Pi bookkeeping events (`agent_start`, `turn_start`, `turn_end`, `message_start`, `message_end`, `agent_end`, `agent_settled`, queue, compaction, and retry events) unless a retry/compaction terminal error must be surfaced. Never synthesize `commit` or `done`; the outer generation service owns those.

- [ ] **Step 4: Run the GREEN checks**

Run: `node --import tsx --test tests/unit/pi-event-adapter.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/pi-event-adapter.ts apps/platform-api/src/generation-loop/generation-types.ts tests/unit/pi-event-adapter.test.mjs
git commit -m "feat: adapt Pi events to Creator SSE"
```

### Task 7: Implement the Pi generation service and outer transaction

**Files:**
- Create: `apps/platform-api/src/generation-loop/pi-limits.ts`
- Create: `apps/platform-api/src/generation-loop/pi-generation-service.ts`
- Create: `tests/unit/pi-generation-service.test.mjs`
- Create: `tests/unit/pi-generation-atomicity.test.mjs`
- Modify: `apps/platform-api/src/generation-loop/generation-service-types.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-message-factory.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-stream-helpers.ts`
- Modify: `tests/unit/generation-build-self-heal.test.mjs`
- Modify: `tests/unit/generation-service-concurrency.test.mjs`
- Modify: `tests/unit/generation-service-modes.test.mjs`

**Interfaces:**
- Consumes: `createHorizonPiRuntime`, `createHorizonPiSession`, `createHorizonPiTools`, event adapter, current Horizon stores/readers/guards/runner/checkpoint dependencies.
- Produces: `createPiGenerationService(deps): GenerationService`, preserving `history`, `listWorkspaceFiles`, and `runTurn`; `runTurn` gains optional `signal?: AbortSignal` for route cancellation.

Define:

```ts
export interface GenerationService {
  history(projectId: string): Promise<WorkspaceChatMessage[]>;
  listWorkspaceFiles(projectId: string): Promise<Array<{ path: string; content: string }>>;
  runTurn(input: {
    projectId: string;
    prompt: string;
    agentMode?: WorkspaceAgentMode;
    actor?: PlatformUser;
    approvedPlan?: string;
    signal?: AbortSignal;
  }): AsyncIterable<ChatStreamEvent>;
}
```

Use these defaults, each parsed as a finite positive integer and clamped to a safe maximum:

```ts
maxModelRounds: 12
maxToolCalls: 40
shellTimeoutMs: 120_000
maxToolOutputBytes: 65_536
maxFileBytes: 120_000
turnTimeoutMs: 600_000
validationRetries: 2
```

- [ ] **Step 1: Write failing Plan/Build transaction tests**

Use Pi's faux/scripted provider through the session boundary. Prove Plan mode appends user/assistant history and streams text/reasoning without prepare/mutation/validate/commit/migration/checkpoint. Prove Build mode orders operations exactly:

```js
assert.deepEqual(lifecycle, [
  "append:user", "prepare:base", "tool:write", "validate",
  "sync:migrations", "commit:candidate", "migrate:batch", "checkpoint", "append:assistant"
]);
assert.deepEqual(events.map((event) => event.type), [
  "action_start", "action_result", "commit", "done"
]);
```

Assert the assistant history record contains the final assistant text, tool IDs/actions, commit SHA, and accumulated prompt/completion token usage, but no thinking text or provider key.

- [ ] **Step 2: Run the RED service tests**

Run: `node --import tsx --test tests/unit/pi-generation-service.test.mjs tests/unit/pi-generation-atomicity.test.mjs`

Expected: FAIL because `createPiGenerationService` does not exist.

- [ ] **Step 3: Implement the per-project turn and session lifecycle**

Inside the existing FIFO project lock:

1. Reject missing actor before creating Pi; append the user message and capture prior history separately.
2. Resolve container, live files, rolling summary, governed context, and Plan/Build system prompt.
3. In Build mode only, prepare Git and capture `baseCommit` before creating mutable tools.
4. Combine the route signal with a turn timeout and pass the result through provider and tools.
5. Create the model runtime, tool set, and in-memory session; subscribe before `session.prompt(input.prompt, { expandPromptTemplates: false })`.
6. Queue adapted Pi events from the subscription into the async generator; accumulate final text, tool action details, and usage without persisting reasoning.
7. After Pi settles, validate Build. On validation failure, call `session.prompt(sanitizedBuildFeedback, { expandPromptTemplates: false })` on the same session and revalidate, bounded by `validationRetries` and the global round/tool/turn limits.
8. Sync buffered migration artifacts, commit source, apply the entire migration batch transaction, create the checkpoint, persist assistant history, then emit `commit` and `done`.
9. On any error after prepare, abort the session, await the current Docker call or its timeout, restore `baseCommit`, persist a failed assistant/action record, emit one sanitized `error`, then `done`.
10. Always unsubscribe, dispose the Pi session, remove abort listeners, and release the project lock.

Do not catch governed-context errors into an ungoverned path. Missing optional PRD/knowledge/skill data may still be represented by the resolver's empty result, but a provider/guardrail/quota/evidence error fails closed.

- [ ] **Step 4: Port existing public-boundary tests to Pi fixtures**

Replace imports of `createGenerationService`/memory LLM with `createPiGenerationService` and a scripted governed Pi runtime fixture. Keep the existing assertions for approved plan, Plan/Build separation, self-heal, same-project FIFO, cross-project concurrency, workspace file listing, migration atomicity, rollback, and checkpoint ordering.

- [ ] **Step 5: Run the GREEN service suite**

Run: `node --import tsx --test tests/unit/pi-generation-*.test.mjs tests/unit/generation-build-self-heal.test.mjs tests/unit/generation-service-concurrency.test.mjs tests/unit/generation-service-modes.test.mjs tests/unit/generation-approved-plan.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/generation-loop/pi-limits.ts apps/platform-api/src/generation-loop/pi-generation-service.ts apps/platform-api/src/generation-loop/generation-service-types.ts apps/platform-api/src/generation-loop/generation-message-factory.ts apps/platform-api/src/generation-loop/generation-stream-helpers.ts tests/unit/pi-generation-service.test.mjs tests/unit/pi-generation-atomicity.test.mjs tests/unit/generation-build-self-heal.test.mjs tests/unit/generation-service-concurrency.test.mjs tests/unit/generation-service-modes.test.mjs tests/unit/generation-approved-plan.test.mjs
git commit -m "feat: coordinate Pi build turns"
```

### Task 8: Wire cancellation and Pi-only production factory

**Files:**
- Create: `tests/unit/pi-generation-factory.test.mjs`
- Modify: `apps/platform-api/src/generation-loop/factory.ts`
- Modify: `apps/platform-api/src/generation-loop/chat-route.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `tests/integration/chat-route-sse.test.mjs`
- Modify: `tests/unit/generation-factory-real.test.mjs`
- Modify: `docker/docker-compose.yml`
- Modify: `docker/docker-compose.release.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: full `GovernedAiExecutor` including `executeAgentRound`, `GenerationService`, Docker/orchestrator/stores, and environment limit values.
- Produces: the sole live Pi factory wiring and disconnect-aware chat SSE route.

- [ ] **Step 1: Write failing factory and disconnect tests**

Assert `createDefaultGenerationService()` requires the structured governed executor in real mode, never instantiates a completion-only client, and exposes no engine selector. In the route integration test, open a streaming POST, destroy the client socket after `: open`, and assert the passed signal aborts and no later `action_start`, commit, or checkpoint occurs.

```js
assert.equal(capturedSignal.aborted, true);
assert.equal(toolCallsAfterAbort, 0);
assert.equal(restores.length, 1);
assert.equal(checkpoints.length, 0);
```

- [ ] **Step 2: Run the RED tests**

Run: `node --import tsx --test tests/unit/pi-generation-factory.test.mjs tests/unit/generation-factory-real.test.mjs tests/integration/chat-route-sse.test.mjs`

Expected: FAIL because factory still wires the legacy loop and the route does not pass a disconnect signal.

- [ ] **Step 3: Wire only Pi**

Change the factory to return `createPiGenerationService(...)`, pass `governedAiExecutor` directly, remove LiteLLM master-key and completion-client construction from the generation loop, and keep the Docker readers, ActionRunner, Prisma stores, Git committer, migration runner, checkpoint store, and governed-context resolver.

Type `chat-route.ts` against `GenerationService`, create one `AbortController` per POST, register `req.once("aborted", abort)` and `res.once("close", abort)`, and pass `signal` to `runTurn()`. Remove listeners in `finally`; only abort on `close` when the response has not completed normally.

Expose limits, not an engine flag:

```yaml
EVCP_PI_MAX_MODEL_ROUNDS: ${EVCP_PI_MAX_MODEL_ROUNDS:-12}
EVCP_PI_MAX_TOOL_CALLS: ${EVCP_PI_MAX_TOOL_CALLS:-40}
EVCP_PI_SHELL_TIMEOUT_MS: ${EVCP_PI_SHELL_TIMEOUT_MS:-120000}
EVCP_PI_MAX_TOOL_OUTPUT_BYTES: ${EVCP_PI_MAX_TOOL_OUTPUT_BYTES:-65536}
EVCP_PI_MAX_FILE_BYTES: ${EVCP_PI_MAX_FILE_BYTES:-120000}
EVCP_PI_TURN_TIMEOUT_MS: ${EVCP_PI_TURN_TIMEOUT_MS:-600000}
EVCP_PI_VALIDATION_RETRIES: ${EVCP_PI_VALIDATION_RETRIES:-2}
```

- [ ] **Step 4: Run the GREEN checks**

Run: `node --import tsx --test tests/unit/pi-generation-factory.test.mjs tests/unit/generation-factory-real.test.mjs tests/integration/chat-route-sse.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/factory.ts apps/platform-api/src/generation-loop/chat-route.ts apps/platform-api/src/app-factory.ts tests/unit/pi-generation-factory.test.mjs tests/unit/generation-factory-real.test.mjs tests/integration/chat-route-sse.test.mjs docker/docker-compose.yml docker/docker-compose.release.yml .env.example
git commit -m "feat: wire Pi as the only agent engine"
```

### Task 9: Remove the legacy parser and completion loop

**Files:**
- Delete: `apps/platform-api/src/generation-loop/generation-service.ts`
- Delete: `apps/platform-api/src/generation-loop/llm-client.ts`
- Delete: `apps/platform-api/src/generation-loop/message-parser.ts`
- Delete: `apps/platform-api/src/generation-loop/governed-completion.ts`
- Delete: `apps/platform-api/src/generation-loop/error-feedback.ts`
- Delete: `tests/unit/llm-client.test.mjs`
- Delete: `tests/unit/message-parser.test.mjs`
- Delete: `tests/unit/governed-completion-stream.test.mjs`
- Modify: `apps/platform-api/src/generation-loop/generation-action-utils.ts`
- Modify: `apps/platform-api/src/generation-loop/generation-stream-helpers.ts`
- Modify: `tests/unit/generation-service.test.mjs`
- Modify: `tests/unit/generation-service-atomicity.test.mjs`
- Modify: `tests/unit/generation-skill-injection.test.mjs`
- Modify: `tests/unit/mock-first-generation.test.mjs`
- Modify: `tests/unit/generation-loop-types.test.mjs`

**Interfaces:**
- Consumes: the Pi-only factory/service and ported compatibility tests from Tasks 7–8.
- Produces: no production or test reference to legacy action markup, parser, `LlmCompletionClient`, `governedCompletion`, or custom retry tracker.

- [ ] **Step 1: Add a failing legacy-removal audit test**

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("Coding AI has no legacy engine or markup parser", () => {
  const output = execFileSync("rg", ["-n", "EVCP_AGENT_ENGINE|LlmCompletionClient|createMessageParser|governedCompletion|<action type=", "apps/platform-api/src/generation-loop", "apps/platform-api/src/app-factory.ts"], { encoding: "utf8" });
  assert.equal(output.trim(), "");
});
```

Make the helper tolerate `rg` exit status 1 as the successful no-match case and fail only when matches are returned.

- [ ] **Step 2: Run the RED audit**

Run: `node --test tests/unit/pi-legacy-removal.test.mjs`

Expected: FAIL and list current legacy files/references.

- [ ] **Step 3: Port valuable tests and delete legacy-only code**

Move still-relevant assertions from `generation-service.test.mjs` and `generation-service-atomicity.test.mjs` into Pi fixtures: native file/edit/shell/migration results, chat persistence, no commit on pure Plan turns, final validation, restore, and action preview. Delete parser-tokenization, XML/action-markup, raw LiteLLM completion-client, and completion-to-chunk tests because the Pi provider/session tests now cover those boundaries.

Run the dependency-driven audits before deleting each helper:

```bash
rg -n 'generation-service|llm-client|message-parser|governed-completion|error-feedback' apps packages tests
rg -n 'parseEditBody|asTokenChunks|buildSkillLoadFeedback|runShellStreaming' apps packages tests
```

Delete only helpers with zero remaining production/test consumer; retain `clipActionText`, `buildActionPreview`, and `validateBuild` if Pi tools/service still import them.

- [ ] **Step 4: Run the GREEN audit and generation suite**

Run: `node --import tsx --test tests/unit/pi-*.test.mjs tests/unit/generation-*.test.mjs tests/integration/chat-route-sse.test.mjs && pnpm --filter @evcp/platform-api typecheck`

Expected: PASS and no legacy search matches.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/generation-service.ts apps/platform-api/src/generation-loop/llm-client.ts apps/platform-api/src/generation-loop/message-parser.ts apps/platform-api/src/generation-loop/governed-completion.ts apps/platform-api/src/generation-loop/error-feedback.ts apps/platform-api/src/generation-loop/generation-action-utils.ts apps/platform-api/src/generation-loop/generation-stream-helpers.ts tests/unit/llm-client.test.mjs tests/unit/message-parser.test.mjs tests/unit/governed-completion-stream.test.mjs tests/unit/generation-service.test.mjs tests/unit/generation-service-atomicity.test.mjs tests/unit/generation-skill-injection.test.mjs tests/unit/mock-first-generation.test.mjs tests/unit/generation-loop-types.test.mjs tests/unit/pi-legacy-removal.test.mjs
git commit -m "refactor: remove legacy coding agent loop"
```

Before committing, run `git diff --cached --name-only` and verify `docs/research/pi-sdk-evaluation.md` is not staged.

### Task 10: Verify security, real-provider flows, and release readiness

**Files:**
- Create: `tests/integration/pi-agent-workspace-flow.test.mjs`
- Create: `tests/integration/pi-agent-security-boundary.test.mjs`
- Create: `tests/live/pi-agent-e2e.test.mjs`
- Create: `docs/runbooks/pi-agent-verification.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: fully wired Pi generation service, memory Docker engine, optional live LiteLLM/Platform API environment.
- Produces: reproducible integration, security, and opt-in real-provider verification for Todo List and Sales Pipeline.

- [ ] **Step 1: Write failing integration/security tests**

Script a native Pi sequence that reads, edits, writes, runs a direct command, proposes two migrations, and finishes. Assert current SSE events and outer lifecycle order. Add adversarial generated-workspace files and prompts that attempt to load project-local Pi resources, access another container/project, print secrets, traverse paths, and run after abort; assert all are unavailable or rejected and that returned errors contain none of `provider.secret`, `DATABASE_URL`, host paths, or container IDs.

- [ ] **Step 2: Run the RED integration tests**

Run: `node --import tsx --test tests/integration/pi-agent-workspace-flow.test.mjs tests/integration/pi-agent-security-boundary.test.mjs`

Expected: FAIL on any missing lifecycle/security behavior found by the test.

- [ ] **Step 3: Close only the observed integration gaps**

Make the smallest changes in the Pi provider/tools/service needed for the failing public assertions. Keep errors sanitized through one shared redactor and ensure tool results expose project-relative labels only. Do not add a second engine path or broaden the command allowlist to satisfy an adversarial test.

- [ ] **Step 4: Add the opt-in live test and runbook**

Gate the live test with `EVCP_PI_LIVE_TEST=1`. It must use an authenticated Creator bearer token, create each isolated project with `POST /projects`, start its workspace with `POST /projects/:projectId/workspace/container`, send each prompt to `POST /projects/:projectId/chat`, refresh preview with `POST /projects/:projectId/workspace/preview/refresh`, then poll `GET /projects/:projectId/workspace` until preview status is ready. Wait for SSE `commit` then `done` before checking preview health. Run these prompts:

```text
Create a polished Todo List with add, complete, filter, and delete behavior using mock data.
Add due dates and an overdue filter without removing existing behavior.
Create a Sales Pipeline with lead stages, opportunity values, a kanban view, and a database migration.
```

Document required variables, cleanup IDs, timeout expectations, evidence queries, and commands in `docs/runbooks/pi-agent-verification.md`. Do not put provider keys or Creator tokens in the repository.

- [ ] **Step 5: Run final automated verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:e2e
rg -n 'EVCP_AGENT_ENGINE|LlmCompletionClient|createMessageParser|governedCompletion' apps packages tests docker .env.example
git status --short
```

Expected: all commands PASS; the legacy search has no matches; Git status shows only the intentionally untracked `docs/research/` plus any plan file not yet committed.

- [ ] **Step 6: Run live acceptance when credentials are available**

Run: `EVCP_PI_LIVE_TEST=1 node --import tsx --test tests/live/pi-agent-e2e.test.mjs`

Expected: Todo List create/update and Sales Pipeline + migration each reach preview-ready state, and the evidence store shows one unique governed record per Pi model round.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/pi-agent-workspace-flow.test.mjs tests/integration/pi-agent-security-boundary.test.mjs tests/live/pi-agent-e2e.test.mjs docs/runbooks/pi-agent-verification.md README.md apps/platform-api/src
git commit -m "test: verify Pi agent end to end"
```

## Self-Review Results

- Spec coverage: all runtime components, seven tools, no-discovery session, structured governance, unique evidence, Plan/Build behavior, transactional migrations, validation correction, rollback, cancellation, hard limits, Node/dependency pins, legacy removal, SSE compatibility, Prisma authority, and Todo/Sales live acceptance map to Tasks 1–10.
- Placeholder scan: no deferred implementation markers or unspecified test steps remain; each task includes an exact RED command, implementation contract, GREEN command, and commit boundary.
- Type consistency: `GovernedAiExecutor.executeAgentRound`, `createHorizonPiRuntime`, `createHorizonPiSession`, `createHorizonPiTools`, `HorizonPiToolDetails`, `adaptPiEvent`, `GenerationService`, and `createPiGenerationService` names/signatures are used consistently across producing and consuming tasks.
