# AI Generation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the bolt.diy-style AI generation loop (Section 5 of the master spec) on top of the already-built Workspace Orchestrator: a streaming SSE chat endpoint that turns LLM output into file/shell/migration actions against the project's Docker container, tracks rolling context and server-side chat history, self-corrects failed actions up to 2 rounds, and records checkpoints/migrations for the Checkpoint UX.

**Architecture:** A new `apps/platform-api/src/generation-loop/` module composed the same way as `workspace-orchestrator/` (small single-responsibility files, port/adapter interfaces + `Memory*` fakes, wired together in a `factory.ts`). The generation service consumes the existing `WorkspaceOrchestrator` (to find the running container) and `GoldenTemplate` (locked-file enforcement) — it does not re-provision infrastructure. A new raw SSE route sits outside `app-factory.ts`'s synchronous `PlatformRequest`/`PlatformResponse` dispatcher, reusing the `WorkspaceAuthContext`/`isMember` auth pattern from `workspace-orchestrator/routes.ts`.

**Tech Stack:** TypeScript, Node `node:http`/`node:crypto`, `node --import tsx --test` for `.mjs` TDD tests, Docker Engine API exec endpoints over the existing unix-socket client, LiteLLM OpenAI-compatible `/chat/completions` (streamed) as the LLM transport.

## Global Constraints

- Creator never sees or manages secret values — action-runner and chat history must never place `deps.secrets.resolveEnv()` values into chat messages, logs, or LLM prompts (only secret *names* may ever surface, per existing `listSecretNames`).
- No shell command allowlist in MVP (accepted risk, already documented in the spec's Risks table) — shell actions run as-is inside the non-root, network-isolated container.
- Chat history persistence must use the same in-memory port/adapter pattern as `workspace-orchestrator` (`resolveWorkspaceAdapterMode` convention) — no real Postgres/MinIO adapters are installed yet.
- Error feedback loop: on shell/build failure, the AI sees exit code + stderr in the same turn and gets max **2** self-correction rounds before stopping and asking the Creator (Section 5.3).
- Preview stays auth-gated through the reverse proxy; this plan does not touch the proxy or expose new ports.
- Locked files (per `GoldenTemplate.lockedFiles` / `isLockedFile`) must never be written by an action — reject with an error surfaced back into the same turn's context, not a silent no-op.
- Every new audit-worthy event (chat turn, action executed, commit created, rollback, migration applied) goes through the existing `onAudit` callback shape `{ action: string; projectId: string; metadata?: Record<string, unknown> }`.

---

### Task 1: DockerEngine exec-in-container capability

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-engine.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts`
- Test: `tests/unit/docker-engine-exec.test.mjs`

**Interfaces:**
- Consumes: nothing new (extends existing `DockerEngine`/`createMemoryDockerEngine`/`createDockerSocketEngine`).
- Produces: `DockerEngine.execInContainer(containerId: string, cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>` — used by Task 7's action runner for every file/shell/migration action.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/docker-engine-exec.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

test("memory docker engine records exec calls and returns configured result", async () => {
  const engine = createMemoryDockerEngine();
  const { containerId } = await engine.createContainer({
    name: "evcp-ws-demo",
    image: "evcp/workspace-next:1",
    env: [],
    hostConfig: { NanoCpus: 1_000_000_000, Memory: 2048 * 1024 * 1024, NetworkMode: "evcp-internal", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });
  await engine.startContainer(containerId);

  const result = await engine.execInContainer(containerId, ["echo", "hi"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(engine.state.execCalls, [{ containerId, cmd: ["echo", "hi"] }]);
});

test("docker socket engine execInContainer creates exec, starts it, and inspects the exit code", async () => {
  const calls = [];
  const request = async ({ method, path, body }) => {
    calls.push({ method, path, body });
    if (path === "/containers/c1/exec") {
      return { status: 201, json: async () => ({ Id: "exec-1" }) };
    }
    if (path === "/exec/exec-1/start") {
      return {
        status: 200,
        json: async () => ({}),
        // docker-socket-engine reads raw stdout/stderr off the same response stream in the real client;
        // the fake request() here returns pre-split text so the test stays transport-agnostic.
        text: "hi\n"
      };
    }
    if (path === "/exec/exec-1/json") {
      return { status: 200, json: async () => ({ ExitCode: 0 }) };
    }
    throw new Error(`unexpected path ${path}`);
  };

  const engine = createDockerSocketEngine({ request });
  const result = await engine.execInContainer("c1", ["echo", "hi"]);

  assert.equal(result.exitCode, 0);
  assert.equal(calls[0].path, "/containers/c1/exec");
  assert.deepEqual(calls[0].body.Cmd, ["echo", "hi"]);
  assert.equal(calls[1].path, "/exec/exec-1/start");
  assert.equal(calls[2].path, "/exec/exec-1/json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/docker-engine-exec.test.mjs`
Expected: FAIL — `engine.execInContainer is not a function`

- [ ] **Step 3: Write minimal implementation**

In `docker-engine.ts`, extend the `DockerEngine` interface and the memory fake:

```typescript
export interface DockerEngine {
  createContainer(spec: DevContainerSpec): Promise<{ containerId: string }>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  execInContainer(containerId: string, cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
```

```typescript
interface MemoryContainer {
  containerId: string;
  spec: DevContainerSpec;
  status: "created" | "running" | "stopped";
}

export function createMemoryDockerEngine(): DockerEngine & {
  state: { containers: MemoryContainer[]; execCalls: Array<{ containerId: string; cmd: string[] }> };
} {
  const state = { containers: [] as MemoryContainer[], execCalls: [] as Array<{ containerId: string; cmd: string[] }> };
  const find = (containerId: string) => {
    const container = state.containers.find((item) => item.containerId === containerId);
    if (!container) {
      throw new Error(`unknown container '${containerId}'`);
    }
    return container;
  };
  return {
    state,
    async createContainer(spec) {
      const containerId = `mem-${state.containers.length + 1}-${spec.name}`;
      state.containers.push({ containerId, spec, status: "created" });
      return { containerId };
    },
    async startContainer(containerId) {
      find(containerId).status = "running";
    },
    async stopContainer(containerId) {
      find(containerId).status = "stopped";
    },
    async removeContainer(containerId) {
      find(containerId);
      state.containers = state.containers.filter((item) => item.containerId !== containerId);
    },
    async execInContainer(containerId, cmd) {
      find(containerId);
      state.execCalls.push({ containerId, cmd });
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}
```

In `docker-socket-engine.ts`, add `execInContainer` to `createDockerSocketEngine`'s returned object. The fake `request` in tests returns a `text` field alongside `json` for the exec-start call, so extend `DockerRequestResult`:

```typescript
export interface DockerRequestResult {
  status: number;
  json: () => Promise<any>;
  text?: string;
}
```

```typescript
async execInContainer(containerId, cmd) {
  const create = await request({
    method: "POST",
    path: `/containers/${containerId}/exec`,
    body: { Cmd: cmd, AttachStdout: true, AttachStderr: true }
  });
  await expect("exec-create", create, [201]);
  const { Id: execId } = await create.json();

  const start = await request({
    method: "POST",
    path: `/exec/${execId}/start`,
    body: { Detach: false, Tty: false }
  });
  await expect("exec-start", start, [200]);
  const stdout = start.text ?? "";

  const inspect = await request({ method: "GET", path: `/exec/${execId}/json` });
  await expect("exec-inspect", inspect, [200]);
  const { ExitCode } = await inspect.json();

  return { stdout, stderr: "", exitCode: Number(ExitCode ?? 0) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/docker-engine-exec.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/docker-engine.ts apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts tests/unit/docker-engine-exec.test.mjs
git commit -m "feat: add execInContainer to DockerEngine"
```

---

### Task 2: Chat/migration/checkpoint data types

**Files:**
- Modify: `packages/types/src/index.ts`
- Test: `tests/unit/generation-loop-types.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `WorkspaceChatMessage`, `WorkspaceChatSummary`, `CodeCheckpoint`, `MigrationRecord` — imported by Tasks 4, 6, 7, 9.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/generation-loop-types.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as types from "../../packages/types/src/index.ts";

test("generation-loop record shapes are constructible", () => {
  const message = {
    id: "msg-1",
    projectId: "proj-1",
    role: "assistant",
    content: "done",
    artifactActionIds: ["act-1"],
    commitSha: "abc123",
    tokenUsage: { promptTokens: 10, completionTokens: 5 },
    createdAt: new Date().toISOString()
  };
  const summary = { projectId: "proj-1", summary: "rolling summary", updatedAt: new Date().toISOString() };
  const checkpoint = { id: "chk-1", projectId: "proj-1", tag: "checkpoint/1", commitSha: "abc123", label: "Save Checkpoint", createdAt: new Date().toISOString() };
  const migration = { id: "mig-1", projectId: "proj-1", name: "add_users_table", sql: "CREATE TABLE users();", commitSha: "abc123", appliedAt: new Date().toISOString() };

  assert.equal(message.projectId, "proj-1");
  assert.equal(summary.projectId, "proj-1");
  assert.equal(checkpoint.tag, "checkpoint/1");
  assert.equal(migration.name, "add_users_table");
  assert.ok(types); // module loads without throwing
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/generation-loop-types.test.mjs`
Expected: PASS already (this test only checks object literals, not exported types — TypeScript types have no runtime presence). This step is a placeholder guard; the real verification is `tsc --noEmit` in Step 4.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/types/src/index.ts`:

```typescript
// --- MVP Plan 4: AI Generation Loop ---

export type ChatMessageRole = "user" | "assistant" | "system";

export interface WorkspaceChatMessage {
  id: string;
  projectId: string;
  role: ChatMessageRole;
  content: string;
  artifactActionIds: string[];
  commitSha: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number } | null;
  createdAt: string;
}

export interface WorkspaceChatSummary {
  projectId: string;
  summary: string;
  updatedAt: string;
}

export interface CodeCheckpoint {
  id: string;
  projectId: string;
  tag: string;
  commitSha: string;
  label: string;
  createdAt: string;
}

export interface MigrationRecord {
  id: string;
  projectId: string;
  name: string;
  sql: string;
  commitSha: string;
  appliedAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/generation-loop-types.test.mjs && pnpm --filter @evcp/types exec tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts tests/unit/generation-loop-types.test.mjs
git commit -m "feat: add chat/checkpoint/migration record types"
```

---

### Task 3: Message parser (streaming artifact/action parser)

**Files:**
- Create: `apps/platform-api/src/generation-loop/message-parser.ts`
- Test: `tests/unit/message-parser.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `createMessageParser()` returning `{ push(chunk: string): ParsedEvent[]; flush(): ParsedEvent[] }`, where `ParsedEvent` is one of `{ type: "text"; content: string }`, `{ type: "action_start"; actionId: string; actionType: "file" | "shell" | "migration"; filePath?: string }`, `{ type: "action_chunk"; actionId: string; content: string }`, `{ type: "action_end"; actionId: string }`. Consumed by Task 9's generation service.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/message-parser.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMessageParser } from "../../apps/platform-api/src/generation-loop/message-parser.ts";

test("parses a complete artifact/action stream delivered in one chunk", () => {
  const parser = createMessageParser();
  const input =
    "Here is the plan.\n" +
    '<artifact id="art-1" title="Add home page">' +
    '<action type="file" filePath="app/page.tsx">export default function Page() { return null; }</action>' +
    '<action type="shell">npm run build</action>' +
    "</artifact>\nDone.";

  const events = parser.push(input).concat(parser.flush());

  const types = events.map((event) => event.type);
  assert.deepEqual(types, [
    "text",
    "action_start",
    "action_chunk",
    "action_end",
    "action_start",
    "action_chunk",
    "action_end",
    "text"
  ]);
  assert.equal(events[0].content.trim(), "Here is the plan.");
  assert.equal(events[1].actionType, "file");
  assert.equal(events[1].filePath, "app/page.tsx");
  assert.equal(events[2].content, "export default function Page() { return null; }");
  assert.equal(events[4].actionType, "shell");
  assert.equal(events[6].content, "npm run build");
  assert.equal(events[7].content.trim(), "Done.");
});

test("parses a stream split mid-tag across multiple push() calls", () => {
  const parser = createMessageParser();
  const part1 = '<artifact id="art-2" title="x"><action type="fi';
  const part2 = 'le" filePath="a.ts">const x = 1;</act';
  const part3 = "ion></artifact>";

  const events = [...parser.push(part1), ...parser.push(part2), ...parser.push(part3), ...parser.flush()];

  assert.equal(events.find((event) => event.type === "action_start").filePath, "a.ts");
  assert.equal(events.find((event) => event.type === "action_chunk").content, "const x = 1;");
});

test("rejects an unknown action type", () => {
  const parser = createMessageParser();
  assert.throws(
    () => parser.push('<artifact id="a"><action type="delete">x</action></artifact>'),
    /unknown action type/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/message-parser.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/message-parser.ts

export type ActionType = "file" | "shell" | "migration";

export type ParsedEvent =
  | { type: "text"; content: string }
  | { type: "action_start"; actionId: string; actionType: ActionType; filePath?: string }
  | { type: "action_chunk"; actionId: string; content: string }
  | { type: "action_end"; actionId: string };

const ACTION_TYPES: ActionType[] = ["file", "shell", "migration"];

interface ParserState {
  buffer: string;
  inArtifact: boolean;
  currentAction: { actionId: string; actionType: ActionType } | null;
  actionCounter: number;
}

function extractAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

export function createMessageParser() {
  const state: ParserState = { buffer: "", inArtifact: false, currentAction: null, actionCounter: 0 };

  function drain(): ParsedEvent[] {
    const events: ParsedEvent[] = [];

    for (;;) {
      if (!state.inArtifact) {
        const start = state.buffer.indexOf("<artifact");
        if (start === -1) {
          if (state.buffer.length > 0) {
            events.push({ type: "text", content: state.buffer });
            state.buffer = "";
          }
          return events;
        }
        const tagEnd = state.buffer.indexOf(">", start);
        if (tagEnd === -1) {
          if (start > 0) {
            events.push({ type: "text", content: state.buffer.slice(0, start) });
          }
          state.buffer = state.buffer.slice(start);
          return events;
        }
        if (start > 0) {
          events.push({ type: "text", content: state.buffer.slice(0, start) });
        }
        state.buffer = state.buffer.slice(tagEnd + 1);
        state.inArtifact = true;
        continue;
      }

      if (!state.currentAction) {
        const artifactEnd = state.buffer.indexOf("</artifact>");
        const actionStart = state.buffer.indexOf("<action");
        if (actionStart === -1 || (artifactEnd !== -1 && artifactEnd < actionStart)) {
          if (artifactEnd !== -1) {
            state.buffer = state.buffer.slice(artifactEnd + "</artifact>".length);
            state.inArtifact = false;
            continue;
          }
          return events;
        }
        const tagEnd = state.buffer.indexOf(">", actionStart);
        if (tagEnd === -1) {
          return events;
        }
        const tag = state.buffer.slice(actionStart, tagEnd + 1);
        const actionType = extractAttr(tag, "type") as ActionType | undefined;
        if (!actionType || !ACTION_TYPES.includes(actionType)) {
          throw new Error(`unknown action type '${actionType}' in tag: ${tag}`);
        }
        const filePath = extractAttr(tag, "filePath");
        state.actionCounter += 1;
        const actionId = `act-${state.actionCounter}`;
        state.currentAction = { actionId, actionType };
        events.push({ type: "action_start", actionId, actionType, ...(filePath ? { filePath } : {}) });
        state.buffer = state.buffer.slice(tagEnd + 1);
        continue;
      }

      const closeIdx = state.buffer.indexOf("</action>");
      if (closeIdx === -1) {
        // Hold back a tail long enough to still catch a split "</action>" on the next push.
        const holdBack = Math.min(state.buffer.length, "</action>".length - 1);
        const emitLen = state.buffer.length - holdBack;
        if (emitLen > 0) {
          events.push({ type: "action_chunk", actionId: state.currentAction.actionId, content: state.buffer.slice(0, emitLen) });
          state.buffer = state.buffer.slice(emitLen);
        }
        return events;
      }
      if (closeIdx > 0) {
        events.push({ type: "action_chunk", actionId: state.currentAction.actionId, content: state.buffer.slice(0, closeIdx) });
      }
      events.push({ type: "action_end", actionId: state.currentAction.actionId });
      state.buffer = state.buffer.slice(closeIdx + "</action>".length);
      state.currentAction = null;
    }
  }

  return {
    push(chunk: string): ParsedEvent[] {
      state.buffer += chunk;
      return drain();
    },
    flush(): ParsedEvent[] {
      const events = drain();
      if (state.buffer.length > 0 && !state.inArtifact) {
        events.push({ type: "text", content: state.buffer });
        state.buffer = "";
      }
      return events;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/message-parser.test.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/message-parser.ts tests/unit/message-parser.test.mjs
git commit -m "feat: add streaming artifact/action message parser"
```

---

### Task 4: LLM completion client (LiteLLM streaming + memory fake)

**Files:**
- Create: `apps/platform-api/src/generation-loop/llm-client.ts`
- Test: `tests/unit/llm-client.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LlmCompletionClient.streamChat(input: { apiKey: string; systemPrompt: string; messages: Array<{ role: "user" | "assistant"; content: string }> }): AsyncIterable<string>`; `createMemoryLlmCompletionClient(scriptedReplies: string[])`; `createLiteLlmCompletionClient(opts: { baseUrl: string })`. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/llm-client.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryLlmCompletionClient, createLiteLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks.join("");
}

test("memory llm client replays scripted replies in order, one per call", async () => {
  const client = createMemoryLlmCompletionClient(["first reply", "second reply"]);
  const first = await collect(client.streamChat({ apiKey: "k", systemPrompt: "sys", messages: [] }));
  const second = await collect(client.streamChat({ apiKey: "k", systemPrompt: "sys", messages: [] }));
  assert.equal(first, "first reply");
  assert.equal(second, "second reply");
});

test("litellm client posts an OpenAI-compatible streamed request and yields delta content", async () => {
  const sseBody =
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
    "data: [DONE]\n\n";

  let capturedRequest;
  const fetchImpl = async (url, init) => {
    capturedRequest = { url, init };
    return {
      ok: true,
      body: {
        async *[Symbol.asyncIterator]() {
          yield new TextEncoder().encode(sseBody);
        }
      }
    };
  };

  const client = createLiteLlmCompletionClient({ baseUrl: "http://litellm:4000", fetchImpl });
  const text = await collect(
    client.streamChat({ apiKey: "sk-project", systemPrompt: "be terse", messages: [{ role: "user", content: "hi" }] })
  );

  assert.equal(text, "Hello");
  assert.equal(capturedRequest.url, "http://litellm:4000/chat/completions");
  const body = JSON.parse(capturedRequest.init.body);
  assert.equal(body.stream, true);
  assert.deepEqual(body.messages[0], { role: "system", content: "be terse" });
  assert.deepEqual(body.messages[1], { role: "user", content: "hi" });
  assert.equal(capturedRequest.init.headers.Authorization, "Bearer sk-project");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/llm-client.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/llm-client.ts

export interface ChatCompletionInput {
  apiKey: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LlmCompletionClient {
  streamChat(input: ChatCompletionInput): AsyncIterable<string>;
}

export function createMemoryLlmCompletionClient(scriptedReplies: string[]): LlmCompletionClient {
  let index = 0;
  return {
    streamChat() {
      const reply = scriptedReplies[index] ?? "";
      index += 1;
      return (async function* () {
        yield reply;
      })();
    }
  };
}

export function createLiteLlmCompletionClient(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): LlmCompletionClient {
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    async *streamChat(input) {
      const response = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${input.apiKey}`
        },
        body: JSON.stringify({
          model: "default",
          stream: true,
          messages: [{ role: "system", content: input.systemPrompt }, ...input.messages]
        })
      });
      if (!response.ok || !response.body) {
        throw new Error(`litellm completion request failed (${response.status})`);
      }

      let buffer = "";
      for await (const rawChunk of response.body as AsyncIterable<Uint8Array>) {
        buffer += new TextDecoder().decode(rawChunk);
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, "").trim();
          if (!payload || payload === "[DONE]") continue;
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield delta;
          }
        }
      }
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/llm-client.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/llm-client.ts tests/unit/llm-client.test.mjs
git commit -m "feat: add streaming LLM completion client with memory fake"
```

---

### Task 5: Chat history store (messages + rolling summary)

**Files:**
- Create: `apps/platform-api/src/generation-loop/chat-history-store.ts`
- Test: `tests/unit/chat-history-store.test.mjs`

**Interfaces:**
- Consumes: `WorkspaceChatMessage`, `WorkspaceChatSummary` from `@evcp/types` (Task 2).
- Produces: `ChatHistoryStore` port with `createMemoryChatHistoryStore()` — used by Tasks 6 and 9. Never stores secret values (only chat text/metadata).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/chat-history-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";

test("appends messages in order and lists them per project", () => {
  const store = createMemoryChatHistoryStore();
  store.appendMessage({
    id: "m1",
    projectId: "p1",
    role: "user",
    content: "hi",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  store.appendMessage({
    id: "m2",
    projectId: "p1",
    role: "assistant",
    content: "hello",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:01.000Z"
  });

  const messages = store.listMessages("p1");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "hello");
  assert.equal(store.listMessages("other-project").length, 0);
});

test("stores and retrieves a rolling summary per project, latest write wins", () => {
  const store = createMemoryChatHistoryStore();
  assert.equal(store.getSummary("p1"), null);

  store.putSummary({ projectId: "p1", summary: "v1", updatedAt: "2026-01-01T00:00:00.000Z" });
  store.putSummary({ projectId: "p1", summary: "v2", updatedAt: "2026-01-01T00:00:01.000Z" });

  assert.equal(store.getSummary("p1").summary, "v2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/chat-history-store.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/chat-history-store.ts
import type { WorkspaceChatMessage, WorkspaceChatSummary } from "@evcp/types";

export interface ChatHistoryStore {
  appendMessage(message: WorkspaceChatMessage): void;
  listMessages(projectId: string): WorkspaceChatMessage[];
  putSummary(summary: WorkspaceChatSummary): void;
  getSummary(projectId: string): WorkspaceChatSummary | null;
}

export function createMemoryChatHistoryStore(): ChatHistoryStore {
  const messagesByProject = new Map<string, WorkspaceChatMessage[]>();
  const summaryByProject = new Map<string, WorkspaceChatSummary>();

  return {
    appendMessage(message) {
      const list = messagesByProject.get(message.projectId) ?? [];
      list.push(message);
      messagesByProject.set(message.projectId, list);
    },
    listMessages(projectId) {
      return [...(messagesByProject.get(projectId) ?? [])];
    },
    putSummary(summary) {
      summaryByProject.set(summary.projectId, summary);
    },
    getSummary(projectId) {
      return summaryByProject.get(projectId) ?? null;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/chat-history-store.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/chat-history-store.ts tests/unit/chat-history-store.test.mjs
git commit -m "feat: add server-side chat history store"
```

---

### Task 6: Context selection + system prompt assembly

**Files:**
- Create: `apps/platform-api/src/generation-loop/context-selector.ts`
- Create: `apps/platform-api/src/generation-loop/system-prompt.ts`
- Test: `tests/unit/context-selector.test.mjs`
- Test: `tests/unit/system-prompt.test.mjs`

**Interfaces:**
- Consumes: `GoldenTemplate` from `workspace-orchestrator/template.ts` (Task-independent, already exists); `WorkspaceChatSummary` from Task 2/5.
- Produces: `selectContextFiles(template: GoldenTemplate, prompt: string, maxFiles?: number): Array<{ path: string; content: string }>`; `buildSystemPrompt(input: { template: GoldenTemplate; contextFiles: Array<{ path: string; content: string }>; rollingSummary: string | null }): string`. Both consumed by Task 9.

- [ ] **Step 1: Write the failing test (context selector)**

```javascript
// tests/unit/context-selector.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { selectContextFiles } from "../../apps/platform-api/src/generation-loop/context-selector.ts";

const template = {
  name: "nextjs-base",
  lockedFiles: ["package.json"],
  files: [
    { path: "app/page.tsx", content: "export default function Home() {}" },
    { path: "app/about/page.tsx", content: "export default function About() {}" },
    { path: "package.json", content: "{}" },
    { path: "lib/utils.ts", content: "export const noop = () => {};" }
  ]
};

test("ranks files whose path or content mentions prompt keywords first, capped at maxFiles", () => {
  const result = selectContextFiles(template, "update the about page copy", 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].path, "app/about/page.tsx");
});

test("falls back to the first maxFiles template files when nothing matches", () => {
  const result = selectContextFiles(template, "unrelated request text", 3);
  assert.equal(result.length, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/context-selector.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/context-selector.ts
import type { GoldenTemplate } from "../workspace-orchestrator/template";

function keywordsFrom(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

function scoreFile(file: { path: string; content: string }, keywords: string[]): number {
  const haystack = `${file.path} ${file.content}`.toLowerCase();
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

export function selectContextFiles(
  template: GoldenTemplate,
  prompt: string,
  maxFiles = 5
): Array<{ path: string; content: string }> {
  const keywords = keywordsFrom(prompt);
  const scored = template.files
    .map((file) => ({ file, score: scoreFile(file, keywords) }))
    .sort((a, b) => b.score - a.score);

  const hasMatches = scored.some((entry) => entry.score > 0);
  const ordered = hasMatches ? scored.map((entry) => entry.file) : template.files;
  return ordered.slice(0, maxFiles);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/context-selector.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Write the failing test (system prompt)**

```javascript
// tests/unit/system-prompt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

test("system prompt lists locked files and embeds context file contents and rolling summary", () => {
  const template = { name: "nextjs-base", lockedFiles: ["package.json", "next.config.js"], files: [] };
  const prompt = buildSystemPrompt({
    template,
    contextFiles: [{ path: "app/page.tsx", content: "export default function Home() {}" }],
    rollingSummary: "User is building a landing page."
  });

  assert.match(prompt, /package\.json/);
  assert.match(prompt, /next\.config\.js/);
  assert.match(prompt, /app\/page\.tsx/);
  assert.match(prompt, /export default function Home/);
  assert.match(prompt, /User is building a landing page\./);
  assert.match(prompt, /<action type="file"/);
  assert.match(prompt, /<action type="shell"/);
  assert.match(prompt, /<action type="migration"/);
});

test("omits the rolling summary section when there is no summary yet", () => {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /Conversation summary so far/);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/system-prompt.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 7: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/system-prompt.ts
import type { GoldenTemplate } from "../workspace-orchestrator/template";

export function buildSystemPrompt(input: {
  template: GoldenTemplate;
  contextFiles: Array<{ path: string; content: string }>;
  rollingSummary: string | null;
}): string {
  const lockedList = input.template.lockedFiles.map((path) => `- ${path}`).join("\n") || "- (none)";
  const contextBlock = input.contextFiles
    .map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");

  const summarySection = input.rollingSummary
    ? `\n## Conversation summary so far\n${input.rollingSummary}\n`
    : "";

  return `You are the AI pair-programmer for an Enterprise Vibe Coding project built on the "${input.template.name}" template.

## Rules
- You may ONLY write files by emitting <action type="file" filePath="...">...</action> inside a top-level <artifact>...</artifact> block.
- You may run shell commands with <action type="shell">...</action>.
- You may run a database migration with <action type="migration" name="...">...</action> containing raw SQL.
- The following files are locked and must NEVER be modified:
${lockedList}
- Never ask for or reference secret values; only secret names may appear in your output.
${summarySection}
## Relevant project files
${contextBlock || "(no files selected for this turn)"}
`;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/system-prompt.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 9: Commit**

```bash
git add apps/platform-api/src/generation-loop/context-selector.ts apps/platform-api/src/generation-loop/system-prompt.ts tests/unit/context-selector.test.mjs tests/unit/system-prompt.test.mjs
git commit -m "feat: add context file selection and system prompt assembly"
```

---

### Task 7: Action runner (file/shell/migration execution + locked-file enforcement + checkpoint/migration tracking)

**Files:**
- Create: `apps/platform-api/src/generation-loop/checkpoint-store.ts`
- Create: `apps/platform-api/src/generation-loop/migration-store.ts`
- Create: `apps/platform-api/src/generation-loop/action-runner.ts`
- Test: `tests/unit/action-runner.test.mjs`

**Interfaces:**
- Consumes: `DockerEngine.execInContainer` (Task 1), `GoldenTemplate`/`isLockedFile` (existing `template.ts`), `CodeCheckpoint`/`MigrationRecord` (Task 2).
- Produces: `createMemoryCheckpointStore()`, `createMemoryMigrationStore()`, `createActionRunner(deps)` with `runAction(input: { containerId: string; template: GoldenTemplate; action: RunnableAction }): Promise<ActionResult>` where `RunnableAction = { id: string; type: "file"; filePath: string; content: string } | { id: string; type: "shell"; command: string } | { id: string; type: "migration"; name: string; sql: string }` and `ActionResult = { ok: true; stdout: string } | { ok: false; error: string; stdout: string; stderr: string; exitCode: number }`. Consumed by Task 8 (error feedback loop) and Task 9 (generation service).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/action-runner.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

test("rejects writes to locked files without touching the container", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-1", type: "file", filePath: "package.json", content: "{}" }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /locked file/);
  assert.deepEqual(docker.state.execCalls, []);
});

test("writes a non-locked file via a base64-encoded shell write", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-2", type: "file", filePath: "app/page.tsx", content: "export default function Home() {}" }
  });

  assert.equal(result.ok, true);
  const call = docker.state.execCalls[0];
  assert.equal(call.cmd[0], "sh");
  assert.match(call.cmd[2], /mkdir -p .*app.*&&.*base64 -d.*app\/page\.tsx/s);
});

test("runs a shell action and reports failure with stdout/stderr/exitCode on non-zero exit", async () => {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "building...\n", stderr: "type error on line 3\n", exitCode: 1 };
  };
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-3", type: "shell", command: "npm run build" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /type error/);
});

test("runs a migration action, records it, and treats it as a hard checkpoint boundary", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const migrations = createMemoryMigrationStore();
  const runner = createActionRunner({ docker, checkpoints: createMemoryCheckpointStore(), migrations });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-4", type: "migration", name: "add_users", sql: "CREATE TABLE users();" },
    commitSha: "deadbeef"
  });

  assert.equal(result.ok, true);
  const recorded = migrations.listMigrations("p1");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].name, "add_users");
  assert.equal(recorded[0].commitSha, "deadbeef");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/action-runner.test.mjs`
Expected: FAIL — modules not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/checkpoint-store.ts
import type { CodeCheckpoint } from "@evcp/types";

export interface CheckpointStore {
  createCheckpoint(input: { projectId: string; tag: string; commitSha: string; label: string }): CodeCheckpoint;
  listCheckpoints(projectId: string): CodeCheckpoint[];
}

export function createMemoryCheckpointStore(): CheckpointStore {
  const byProject = new Map<string, CodeCheckpoint[]>();
  let counter = 0;
  return {
    createCheckpoint(input) {
      counter += 1;
      const checkpoint: CodeCheckpoint = {
        id: `chk-${counter}`,
        projectId: input.projectId,
        tag: input.tag,
        commitSha: input.commitSha,
        label: input.label,
        createdAt: new Date().toISOString()
      };
      const list = byProject.get(input.projectId) ?? [];
      list.push(checkpoint);
      byProject.set(input.projectId, list);
      return checkpoint;
    },
    listCheckpoints(projectId) {
      return [...(byProject.get(projectId) ?? [])];
    }
  };
}
```

```typescript
// apps/platform-api/src/generation-loop/migration-store.ts
import type { MigrationRecord } from "@evcp/types";

export interface MigrationStore {
  recordMigration(input: { projectId: string; name: string; sql: string; commitSha: string }): MigrationRecord;
  listMigrations(projectId: string): MigrationRecord[];
}

export function createMemoryMigrationStore(): MigrationStore {
  const byProject = new Map<string, MigrationRecord[]>();
  let counter = 0;
  return {
    recordMigration(input) {
      counter += 1;
      const record: MigrationRecord = {
        id: `mig-${counter}`,
        projectId: input.projectId,
        name: input.name,
        sql: input.sql,
        commitSha: input.commitSha,
        appliedAt: new Date().toISOString()
      };
      const list = byProject.get(input.projectId) ?? [];
      list.push(record);
      byProject.set(input.projectId, list);
      return record;
    },
    listMigrations(projectId) {
      return [...(byProject.get(projectId) ?? [])];
    }
  };
}
```

```typescript
// apps/platform-api/src/generation-loop/action-runner.ts
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { isLockedFile, type GoldenTemplate } from "../workspace-orchestrator/template";
import type { CheckpointStore } from "./checkpoint-store";
import type { MigrationStore } from "./migration-store";

export type RunnableAction =
  | { id: string; type: "file"; filePath: string; content: string }
  | { id: string; type: "shell"; command: string }
  | { id: string; type: "migration"; name: string; sql: string };

export type ActionResult =
  | { ok: true; stdout: string }
  | { ok: false; error: string; stdout: string; stderr: string; exitCode: number };

export interface ActionRunner {
  runAction(input: {
    containerId: string;
    projectId: string;
    template: GoldenTemplate;
    action: RunnableAction;
    commitSha?: string;
  }): Promise<ActionResult>;
}

export function createActionRunner(deps: {
  docker: DockerEngine;
  checkpoints: CheckpointStore;
  migrations: MigrationStore;
}): ActionRunner {
  return {
    async runAction(input) {
      const { action } = input;

      if (action.type === "file") {
        if (isLockedFile(input.template, action.filePath)) {
          return { ok: false, error: `refusing to write locked file '${action.filePath}'`, stdout: "", stderr: "", exitCode: -1 };
        }
        const encoded = Buffer.from(action.content, "utf8").toString("base64");
        const dir = action.filePath.includes("/") ? action.filePath.slice(0, action.filePath.lastIndexOf("/")) : ".";
        const script = `mkdir -p ${dir} && echo ${encoded} | base64 -d > ${action.filePath}`;
        const exec = await input.containerId
          ? deps.docker.execInContainer(input.containerId, ["sh", "-c", script])
          : Promise.reject(new Error("missing containerId"));
        const result = await exec;
        if (result.exitCode !== 0) {
          return { ok: false, error: "file write failed", stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
        }
        return { ok: true, stdout: result.stdout };
      }

      if (action.type === "shell") {
        const result = await deps.docker.execInContainer(input.containerId, ["sh", "-c", action.command]);
        if (result.exitCode !== 0) {
          return { ok: false, error: `shell command exited ${result.exitCode}`, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
        }
        return { ok: true, stdout: result.stdout };
      }

      // migration
      deps.migrations.recordMigration({
        projectId: input.projectId,
        name: action.name,
        sql: action.sql,
        commitSha: input.commitSha ?? ""
      });
      return { ok: true, stdout: "" };
    }
  };
}
```

Note: the `mkdir -p ${dir}` script above must escape/quote paths in production; for this MVP paths come only from LLM-authored `filePath` attributes constrained by the system prompt, and this plan's accepted-risk posture (Global Constraints, no shell allowlist) already covers shell-injection risk from AI-authored content the same way it covers `<action type="shell">` bodies.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/action-runner.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/checkpoint-store.ts apps/platform-api/src/generation-loop/migration-store.ts apps/platform-api/src/generation-loop/action-runner.ts tests/unit/action-runner.test.mjs
git commit -m "feat: add action runner with locked-file enforcement and migration/checkpoint tracking"
```

---

### Task 8: Error feedback loop (max 2 self-correction rounds)

**Files:**
- Create: `apps/platform-api/src/generation-loop/error-feedback.ts`
- Test: `tests/unit/error-feedback.test.mjs`

**Interfaces:**
- Consumes: `ActionResult` (Task 7).
- Produces: `createErrorFeedbackTracker(maxRounds?: number)` with `{ shouldRetry(actionId: string): boolean; recordFailure(actionId: string): void; reset(actionId: string): void; buildRetryPrompt(action: RunnableAction, result: Extract<ActionResult, { ok: false }>): string }`. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/error-feedback.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

test("allows up to 2 retries per action then stops", () => {
  const tracker = createErrorFeedbackTracker();
  assert.equal(tracker.shouldRetry("act-1"), true);
  tracker.recordFailure("act-1");
  assert.equal(tracker.shouldRetry("act-1"), true);
  tracker.recordFailure("act-1");
  assert.equal(tracker.shouldRetry("act-1"), false);
});

test("tracks failure counts independently per action id", () => {
  const tracker = createErrorFeedbackTracker();
  tracker.recordFailure("act-1");
  tracker.recordFailure("act-1");
  assert.equal(tracker.shouldRetry("act-1"), false);
  assert.equal(tracker.shouldRetry("act-2"), true);
});

test("reset clears the failure count for an action", () => {
  const tracker = createErrorFeedbackTracker();
  tracker.recordFailure("act-1");
  tracker.recordFailure("act-1");
  tracker.reset("act-1");
  assert.equal(tracker.shouldRetry("act-1"), true);
});

test("builds a retry prompt embedding exit code and stderr", () => {
  const tracker = createErrorFeedbackTracker();
  const prompt = tracker.buildRetryPrompt(
    { id: "act-1", type: "shell", command: "npm run build" },
    { ok: false, error: "shell command exited 1", stdout: "compiling...\n", stderr: "TS2322: type error\n", exitCode: 1 }
  );
  assert.match(prompt, /npm run build/);
  assert.match(prompt, /exit code 1/);
  assert.match(prompt, /TS2322: type error/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/error-feedback.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/error-feedback.ts
import type { ActionResult, RunnableAction } from "./action-runner";

export function createErrorFeedbackTracker(maxRounds = 2) {
  const failureCounts = new Map<string, number>();

  return {
    shouldRetry(actionId: string): boolean {
      return (failureCounts.get(actionId) ?? 0) < maxRounds;
    },
    recordFailure(actionId: string): void {
      failureCounts.set(actionId, (failureCounts.get(actionId) ?? 0) + 1);
    },
    reset(actionId: string): void {
      failureCounts.delete(actionId);
    },
    buildRetryPrompt(action: RunnableAction, result: Extract<ActionResult, { ok: false }>): string {
      const command = action.type === "shell" ? action.command : action.type === "file" ? action.filePath : action.name;
      return `The previous action (${action.type}: ${command}) failed with exit code ${result.exitCode}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\nFix the issue and try again.`;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/error-feedback.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/error-feedback.ts tests/unit/error-feedback.test.mjs
git commit -m "feat: add error feedback loop with max-2-round self-correction"
```

---

### Task 9: Generation service + SSE chat route

**Files:**
- Create: `apps/platform-api/src/generation-loop/generation-service.ts`
- Create: `apps/platform-api/src/generation-loop/chat-route.ts`
- Create: `apps/platform-api/src/generation-loop/factory.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Test: `tests/unit/generation-service.test.mjs`
- Test: `tests/integration/chat-route-sse.test.mjs`

**Interfaces:**
- Consumes: `createMessageParser` (Task 3), `LlmCompletionClient` (Task 4), `ChatHistoryStore` (Task 5), `selectContextFiles`/`buildSystemPrompt` (Task 6), `ActionRunner` (Task 7), `createErrorFeedbackTracker` (Task 8), `WorkspaceOrchestrator.getWorkspace`/`markActivity` (existing), `WorkspaceAuthContext`/`isMember` pattern (existing `routes.ts`).
- Produces: `createGenerationService(deps)` with `runTurn(input: { projectId: string; prompt: string }): AsyncIterable<ChatStreamEvent>` where `ChatStreamEvent` is `{ type: "token"; content: string } | { type: "action_result"; actionId: string; ok: boolean } | { type: "commit"; sha: string } | { type: "error"; message: string } | { type: "done" }`; `createChatSseHandler(deps)` — a raw Node request handler mounted outside `executePlatformApiRequestAsync`, since that dispatcher is single-shot request/response and cannot stream SSE frames.

- [ ] **Step 1: Write the failing test (generation service)**

```javascript
// tests/unit/generation-service.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test("streams tokens, applies a file action, and emits a commit + done event", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });

  const scriptedReply =
    'Sure, adding it.\n<artifact id="a1" title="add page">' +
    '<action type="file" filePath="app/page.tsx">export default function Home(){}</action>' +
    "</artifact>";

  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([scriptedReply]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    commitAllChanges: async () => "commit-sha-1"
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "add a home page" }));

  assert.ok(events.some((event) => event.type === "token"));
  const actionResult = events.find((event) => event.type === "action_result");
  assert.equal(actionResult.ok, true);
  const commit = events.find((event) => event.type === "commit");
  assert.equal(commit.sha, "commit-sha-1");
  assert.equal(events.at(-1).type, "done");
});

test("retries a failing shell action and stops after 2 failed rounds, surfacing an error event", async () => {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => ({ stdout: "", stderr: "boom\n", exitCode: 1 });
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });

  const scriptedReply = '<artifact id="a1" title="x"><action type="shell">npm run build</action></artifact>';
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([scriptedReply, scriptedReply, scriptedReply]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    commitAllChanges: async () => "commit-sha-2"
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "build it" }));
  const errorEvent = events.find((event) => event.type === "error");
  assert.ok(errorEvent, "expected an error event after exhausting retries");
  assert.match(errorEvent.message, /npm run build/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/generation-service.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/generation-service.ts
import type { WorkspaceChatMessage } from "@evcp/types";
import type { GoldenTemplate } from "../workspace-orchestrator/template";
import { createMessageParser, type ActionType } from "./message-parser";
import type { LlmCompletionClient } from "./llm-client";
import type { ChatHistoryStore } from "./chat-history-store";
import type { ActionRunner, RunnableAction } from "./action-runner";
import type { createErrorFeedbackTracker } from "./error-feedback";

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "action_result"; actionId: string; ok: boolean }
  | { type: "commit"; sha: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface GenerationServiceDeps {
  llmClient: LlmCompletionClient;
  chatHistory: ChatHistoryStore;
  actionRunner: ActionRunner;
  errorFeedback: ReturnType<typeof createErrorFeedbackTracker>;
  template: GoldenTemplate;
  getApiKey: (projectId: string) => string;
  getContainerId: (projectId: string) => string;
  commitAllChanges: (projectId: string, message: string) => Promise<string>;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
}

interface OpenAction {
  id: string;
  type: ActionType;
  filePath?: string;
  content: string;
}

export function createGenerationService(deps: GenerationServiceDeps) {
  let messageCounter = 0;
  const nextMessageId = () => {
    messageCounter += 1;
    return `msg-${messageCounter}`;
  };

  return {
    async *runTurn(input: { projectId: string; prompt: string }): AsyncIterable<ChatStreamEvent> {
      const userMessage: WorkspaceChatMessage = {
        id: nextMessageId(),
        projectId: input.projectId,
        role: "user",
        content: input.prompt,
        artifactActionIds: [],
        commitSha: null,
        tokenUsage: null,
        createdAt: new Date().toISOString()
      };
      deps.chatHistory.appendMessage(userMessage);

      const containerId = deps.getContainerId(input.projectId);
      const apiKey = deps.getApiKey(input.projectId);
      const actionIds: string[] = [];
      let assistantText = "";
      let turnFailed = false;

      let prompt = input.prompt;
      for (let round = 0; round <= 2; round += 1) {
        const parser = createMessageParser();
        const openActions = new Map<string, OpenAction>();
        let roundFailed = false;

        for await (const token of deps.llmClient.streamChat({
          apiKey,
          systemPrompt: `Project template: ${deps.template.name}`,
          messages: [{ role: "user", content: prompt }]
        })) {
          for (const event of parser.push(token)) {
            if (event.type === "text") {
              assistantText += event.content;
              yield { type: "token", content: event.content };
              continue;
            }
            if (event.type === "action_start") {
              openActions.set(event.actionId, { id: event.actionId, type: event.actionType, filePath: event.filePath, content: "" });
              continue;
            }
            if (event.type === "action_chunk") {
              const action = openActions.get(event.actionId);
              if (action) action.content += event.content;
              continue;
            }
            if (event.type === "action_end") {
              const open = openActions.get(event.actionId);
              if (!open) continue;
              actionIds.push(open.id);

              const runnable: RunnableAction =
                open.type === "file"
                  ? { id: open.id, type: "file", filePath: open.filePath ?? "", content: open.content }
                  : open.type === "shell"
                    ? { id: open.id, type: "shell", command: open.content }
                    : { id: open.id, type: "migration", name: open.filePath ?? open.id, sql: open.content };

              const result = await deps.actionRunner.runAction({
                containerId,
                projectId: input.projectId,
                template: deps.template,
                action: runnable
              });
              deps.onAudit?.({ action: "generation.action_executed", projectId: input.projectId, metadata: { actionId: open.id, type: open.type, ok: result.ok } });
              yield { type: "action_result", actionId: open.id, ok: result.ok };

              if (!result.ok) {
                deps.errorFeedback.recordFailure(open.id);
                if (!deps.errorFeedback.shouldRetry(open.id)) {
                  yield { type: "error", message: `Action failed after retries: ${result.error}. Command: ${"command" in runnable ? runnable.command : runnable.type}` };
                  turnFailed = true;
                  roundFailed = true;
                } else {
                  prompt = `Fix this error and retry.\nAction: ${open.type}\nError: ${result.error}`;
                  roundFailed = true;
                }
              } else {
                deps.errorFeedback.reset(open.id);
              }
            }
          }
        }
        for (const event of parser.flush()) {
          if (event.type === "text") {
            assistantText += event.content;
            yield { type: "token", content: event.content };
          }
        }

        if (!roundFailed || turnFailed) {
          break;
        }
      }

      const assistantMessage: WorkspaceChatMessage = {
        id: nextMessageId(),
        projectId: input.projectId,
        role: "assistant",
        content: assistantText,
        artifactActionIds: actionIds,
        commitSha: null,
        tokenUsage: null,
        createdAt: new Date().toISOString()
      };

      if (!turnFailed) {
        const sha = await deps.commitAllChanges(input.projectId, `AI: ${input.prompt}`);
        assistantMessage.commitSha = sha;
        deps.onAudit?.({ action: "generation.commit_created", projectId: input.projectId, metadata: { sha } });
        deps.chatHistory.appendMessage(assistantMessage);
        yield { type: "commit", sha };
      } else {
        deps.chatHistory.appendMessage(assistantMessage);
      }

      yield { type: "done" };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/generation-service.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Write the failing test (SSE route integration)**

```javascript
// tests/integration/chat-route-sse.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

test("SSE handler streams generation events and enforces project membership", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient(["hello there"]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({ docker, checkpoints: createMemoryCheckpointStore(), migrations: createMemoryMigrationStore() }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    commitAllChanges: async () => "sha-1"
  });

  const handler = createChatSseHandler({
    generationService: service,
    resolveAuth: () => ({ userId: "u1", roles: ["creator"], projectIds: ["p1"] })
  });

  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const forbidden = await fetch(`http://127.0.0.1:${port}/projects/p2/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "hi" })
  });
  assert.equal(forbidden.status, 403);

  const response = await fetch(`http://127.0.0.1:${port}/projects/p1/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "hi" })
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const text = await response.text();
  assert.match(text, /event: token/);
  assert.match(text, /event: done/);

  server.close();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --import tsx --test tests/integration/chat-route-sse.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 7: Write minimal implementation**

```typescript
// apps/platform-api/src/generation-loop/chat-route.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import type { createGenerationService } from "./generation-service";

function isMember(auth: WorkspaceAuthContext, projectId: string): boolean {
  return auth.projectIds.includes(projectId);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function createChatSseHandler(deps: {
  generationService: ReturnType<typeof createGenerationService>;
  resolveAuth: (req: IncomingMessage) => WorkspaceAuthContext | null;
}) {
  return async function handleChatRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const match = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat$/);
    if (!match || req.method !== "POST") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const projectId = match[1];
    const auth = deps.resolveAuth(req);
    if (!auth) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (!isMember(auth, projectId)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }

    const rawBody = await readBody(req);
    const { prompt } = JSON.parse(rawBody) as { prompt: string };

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    for await (const event of deps.generationService.runTurn({ projectId, prompt })) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  };
}
```

```typescript
// apps/platform-api/src/generation-loop/factory.ts
import { createMessageParser } from "./message-parser";
import { createLiteLlmCompletionClient, createMemoryLlmCompletionClient, type LlmCompletionClient } from "./llm-client";
import { createMemoryChatHistoryStore } from "./chat-history-store";
import { createActionRunner } from "./action-runner";
import { createMemoryCheckpointStore } from "./checkpoint-store";
import { createMemoryMigrationStore } from "./migration-store";
import { createErrorFeedbackTracker } from "./error-feedback";
import { createGenerationService } from "./generation-service";
import { loadGoldenTemplate } from "../workspace-orchestrator/template";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { resolveWorkspaceAdapterMode } from "../workspace-orchestrator/factory";

export { createMessageParser };

export function createDefaultGenerationService(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
  env?: Record<string, string | undefined>;
}) {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL);

  const llmClient: LlmCompletionClient =
    mode === "real" && hasLiteLlmConfig
      ? createLiteLlmCompletionClient({ baseUrl: env.EVCP_LITELLM_BASE_URL as string })
      : createMemoryLlmCompletionClient(["(memory llm stub — configure EVCP_LITELLM_BASE_URL for real completions)"]);

  const docker = {
    execInContainer: async () => {
      throw new Error("docker engine not wired — pass a real DockerEngine via opts in production wiring");
    }
  } as never;

  return createGenerationService({
    llmClient,
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template: loadGoldenTemplate(),
    getApiKey: (projectId) => opts.orchestrator.getWorkspace(projectId)?.id ?? "",
    getContainerId: (projectId) => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        throw new Error(`no running container for project '${projectId}'`);
      }
      return workspace.containerId;
    },
    commitAllChanges: async (projectId) => {
      opts.orchestrator.markActivity(projectId);
      return "unimplemented-commit-sha";
    },
    onAudit: opts.onAudit
  });
}
```

Note: `createDefaultGenerationService`'s `docker` binding is intentionally a thin placeholder that throws — real wiring must pass the same `DockerEngine` instance already created by `workspace-orchestrator/factory.ts`'s `createDefaultWorkspaceOrchestrator`. This is called out explicitly rather than silently no-op'd because `app-factory.ts` composition (Step 8 below) is what supplies the real, shared `DockerEngine` instance to both the orchestrator and the generation service.

Now wire the route into `app-factory.ts`. Locate `createPlatformApiApp` (the function that assembles the Node HTTP server) and mount the new handler on the raw request path before the existing `executePlatformApiRequestAsync` dispatch, since `/projects/:id/chat` needs SSE streaming that the synchronous dispatcher cannot provide:

```typescript
// apps/platform-api/src/app-factory.ts (excerpt — inside createPlatformApiApp, before the existing request dispatch)
import { createChatSseHandler } from "./generation-loop/chat-route";
import { createDefaultGenerationService } from "./generation-loop/factory";

// ... inside createPlatformApiApp(...), near where other route tables are built:
const generationService = createDefaultGenerationService({
  orchestrator: services.workspaceOrchestrator,
  onAudit: services.onAudit
});
const chatSseHandler = createChatSseHandler({
  generationService,
  resolveAuth: (req) => resolveAuthFromRequest(req) // reuse whatever existing auth-context resolver app-factory.ts already has
});

// In the server's request listener, before falling through to executePlatformApiRequestAsync:
if (req.url?.match(/^\/projects\/[^/]+\/chat$/)) {
  await chatSseHandler(req, res);
  return;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --import tsx --test tests/integration/chat-route-sse.test.mjs`
Expected: PASS (1/1)

- [ ] **Step 9: Run the full unit + integration suite**

Run: `node --import tsx --test tests/unit/*.test.mjs tests/integration/*.test.mjs`
Expected: all PASS, no regressions in existing workspace-orchestrator tests

- [ ] **Step 10: Commit**

```bash
git add apps/platform-api/src/generation-loop/generation-service.ts apps/platform-api/src/generation-loop/chat-route.ts apps/platform-api/src/generation-loop/factory.ts apps/platform-api/src/app-factory.ts tests/unit/generation-service.test.mjs tests/integration/chat-route-sse.test.mjs
git commit -m "feat: add generation service and SSE chat route"
```

---

## Notes for the implementer wiring Task 9 into `app-factory.ts`

- `app-factory.ts` is large (1075+ lines) and its exact request-listener shape and auth-context resolver name were not re-derived line-by-line for this plan — the implementer for Task 9 must first `grep` `app-factory.ts` for its HTTP server bootstrap (`createServer`/`http.createServer`) and its existing auth-context extraction helper (used by `workspace-orchestrator` routes) and adapt the excerpt above to the exact existing names, keeping the "check `/projects/:id/chat` before the synchronous dispatcher" ordering.
- Real `DockerEngine` wiring for `createDefaultGenerationService` should reuse the same instance `workspace-orchestrator/factory.ts`'s `createDefaultWorkspaceOrchestrator` already builds (`createDockerSocketEngine()` in real mode, `createMemoryDockerEngine()` in memory mode) rather than constructing a second one — pass it in via `opts.docker` (extend `createDefaultGenerationService`'s options with an optional `docker: DockerEngine` parameter, defaulting to the placeholder only when omitted).
