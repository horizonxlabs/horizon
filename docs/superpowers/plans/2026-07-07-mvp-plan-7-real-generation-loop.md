# Real Generation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI chat loop actually work end-to-end — a prompt streams to a real LLM (via LiteLLM), the AI writes files into the project's real dev container, changes are committed to git as a checkpoint, and the result is visible in the preview.

**Architecture:** Replace the three placeholders in `generation-loop/factory.ts` (throwing DockerEngine, fake `getApiKey`, stub `commitAllChanges`) with real wiring: a fresh `createDockerSocketEngine()` in real mode (stateless over the Docker socket, equivalent to the orchestrator's engine), a real git-commit-in-container committer, and `getApiKey` returning the LiteLLM master key (server-side only). Enable the LiteLLM service (config already targets `anthropic/claude-sonnet-5`). Memory mode stays intact for the existing tests. Builds directly on Plan 6 (real provisioning) — a real container must already boot.

**Tech Stack:** TypeScript, the existing Docker-socket engine + `execInContainer`, LiteLLM (`ghcr.io/berriai/litellm`, config `docker/litellm-config.yaml`), git inside the workspace container, `node --import tsx --test` `.mjs` TDD tests. Live infra is up (postgres/minio/redis); LiteLLM must be started with a real provider key.

## Global Constraints

- **Secrets: platform manages entirely; the Creator never sees values.** The LiteLLM master key and any provider API key are used server-side only — NEVER placed into chat messages, SSE frames, audit metadata, API responses, or logs. Only env var NAMES surface in UI.
- **Provider API key is the user's to supply.** LiteLLM proxies to Anthropic/OpenAI; `docker/.env` must contain a real `ANTHROPIC_API_KEY` (and `LITELLM_MASTER_KEY`). This plan NEVER hardcodes, prints, or asks for the key in plaintext — it wires the plumbing and documents the exact keys the user adds themselves.
- **MVP auth-to-LiteLLM uses the master key** (server-side) for all projects; per-project LiteLLM virtual-key budget isolation is a documented follow-up. (All projects share the master key's budget for now.)
- Memory mode (`EVCP_WORKSPACE_REAL_ADAPTERS` unset) must stay intact — the existing unit/integration suite runs through it and must keep passing.
- Workspace containers run non-root, internal network, no host ports (unchanged from Plan 6). git runs INSIDE the container via `execInContainer`.
- Chat history / checkpoints / migrations remain memory-backed in this plan (lost on platform-api restart) — Postgres-backed persistence is a later phase. Note this; do not block chat on it.
- Any step that starts/recreates the user's running services (LiteLLM, platform-api) is **USER-RUN** — surface the exact command; never restart their stack unannounced.
- Live steps are guarded by env flags (`EVCP_*_LIVE=1`) so the default suite skips them.

---

### Task 1: Real git-commit-in-container

**Files:**
- Create: `apps/platform-api/src/generation-loop/container-git.ts`
- Test: `tests/unit/container-git.test.mjs`
- Test: `tests/integration/container-git-live.test.mjs`

**Interfaces:**
- Consumes: `DockerEngine.execInContainer(containerId, cmd): Promise<{ stdout; stderr; exitCode }>` (exists).
- Produces: `createContainerGitCommitter(docker: DockerEngine): { commit(containerId: string, message: string): Promise<string> }` — ensures a git repo exists (init + identity on first use), stages all, commits (allowing an empty commit so a no-file-change turn still yields a checkpoint sha), and returns the HEAD sha. Consumed by Task 2.

- [ ] **Step 1: Write the failing unit test** [pure-unit]

```javascript
// tests/unit/container-git.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";

function fakeDocker(scripted) {
  return {
    calls: [],
    async execInContainer(containerId, cmd) {
      this.calls.push({ containerId, cmd });
      const script = cmd.join(" ");
      for (const [pattern, result] of scripted) {
        if (script.includes(pattern)) return result;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}

test("commit initializes the repo, stages all, commits, and returns the HEAD sha", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "abc123def456\n", stderr: "", exitCode: 0 }]
  ]);
  const committer = createContainerGitCommitter(docker);

  const sha = await committer.commit("container-1", "AI: add a home page");

  assert.equal(sha, "abc123def456");
  // one combined shell invocation into the right container
  assert.equal(docker.calls[0].containerId, "container-1");
  const script = docker.calls.map((c) => c.cmd.join(" ")).join(" | ");
  assert.match(script, /git init/);
  assert.match(script, /git add -A/);
  assert.match(script, /git commit/);
  // commit message is passed (shell-safe)
  assert.match(script, /AI: add a home page/);
});

test("throws if the git command fails hard (non-zero on the rev-parse read)", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }]
  ]);
  const committer = createContainerGitCommitter(docker);
  await assert.rejects(() => committer.commit("c1", "msg"), /git commit failed|rev-parse/i);
});
```

- [ ] **Step 2: Run test to verify it fails** [pure-unit]

Run: `node --import tsx --test tests/unit/container-git.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/platform-api/src/generation-loop/container-git.ts
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

export interface ContainerGitCommitter {
  commit(containerId: string, message: string): Promise<string>;
}

// Single-quote-escape a string for safe embedding inside a `sh -c '...'` double-quoted -m argument.
function shellEscapeDouble(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

export function createContainerGitCommitter(docker: DockerEngine): ContainerGitCommitter {
  return {
    async commit(containerId: string, message: string): Promise<string> {
      const safe = shellEscapeDouble(message);
      // Idempotent init + identity, stage all, allow-empty commit, print HEAD.
      const script = [
        "cd /workspace",
        "git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -q",
        'git config user.email >/dev/null 2>&1 || git config user.email "ai@evcp.local"',
        'git config user.name >/dev/null 2>&1 || git config user.name "EVCP AI"',
        "git add -A",
        `git commit --allow-empty -q -m "${safe}"`,
        "git rev-parse HEAD"
      ].join(" && ");

      const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
      if (result.exitCode !== 0) {
        throw new Error(`git commit failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
      }
      return result.stdout.trim();
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes** [pure-unit]

Run: `node --import tsx --test tests/unit/container-git.test.mjs`
Expected: PASS (2/2).

- [ ] **Step 5: Write the live integration test** [live-infra]

```javascript
// tests/integration/container-git-live.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_GIT_LIVE === "1";

test("commits real changes inside a throwaway container and returns a sha", { skip: !LIVE }, async () => {
  // boot a throwaway workspace container
  const cid = execFileSync("docker", ["run", "-d", "--rm", "evcp/workspace-next:1", "sh", "-c", "sleep 300"]).toString().trim();
  try {
    const committer = createContainerGitCommitter(createDockerSocketEngine());
    const sha1 = await committer.commit(cid, "AI: initial");
    assert.match(sha1, /^[0-9a-f]{7,40}$/, "expected a git sha");

    // write a file then commit again — new sha
    execFileSync("docker", ["exec", cid, "sh", "-c", "echo hello > /workspace/app/generated.txt"]);
    const sha2 = await committer.commit(cid, "AI: add generated.txt");
    assert.match(sha2, /^[0-9a-f]{7,40}$/);
    assert.notEqual(sha1, sha2, "a new commit should have a different sha");
  } finally {
    execFileSync("docker", ["rm", "-f", cid]);
  }
});
```

- [ ] **Step 6: Run the live test** [live-infra]

Run: `EVCP_GIT_LIVE=1 node --import tsx --test tests/integration/container-git-live.test.mjs`
Expected: PASS — two distinct shas from real commits inside a real container. (The `evcp/workspace-next:1` image includes git, per Plan 6 Task 1.)

- [ ] **Step 7: Commit**

```bash
git add apps/platform-api/src/generation-loop/container-git.ts tests/unit/container-git.test.mjs tests/integration/container-git-live.test.mjs
git commit -m "feat: add real git-commit-in-container committer"
```

---

### Task 2: Wire the generation factory to real Docker + git + LiteLLM master key

**Files:**
- Modify: `apps/platform-api/src/generation-loop/factory.ts`
- Test: `tests/unit/generation-factory-real.test.mjs`

**Interfaces:**
- Consumes: `createContainerGitCommitter` (Task 1), `createDockerSocketEngine` (exists), `WorkspaceOrchestrator.getWorkspace`/`markActivity` (exist), env.
- Produces: an updated `createDefaultGenerationService` whose real mode uses a real Docker engine, real git commits, and the LiteLLM master key for `getApiKey`. Memory mode unchanged.

- [ ] **Step 1: Write the failing unit test** [pure-unit]

```javascript
// tests/unit/generation-factory-real.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";

// Minimal orchestrator stub
function orch(containerId) {
  return {
    getWorkspace: (p) => (containerId ? { id: `ws-${p}`, containerId } : null),
    markActivity: () => {}
  };
}

test("memory mode still builds a generation service without real infra", () => {
  const svc = createDefaultGenerationService({ orchestrator: orch("c1"), env: {} });
  assert.equal(typeof svc.runTurn, "function");
});

test("real mode requires no throwing docker placeholder (constructs cleanly)", () => {
  // In real mode with a base URL set, the factory must build a real socket engine
  // internally rather than the throwing placeholder. Constructing must not throw.
  const svc = createDefaultGenerationService({
    orchestrator: orch("c1"),
    env: { EVCP_WORKSPACE_REAL_ADAPTERS: "1", EVCP_LITELLM_BASE_URL: "http://litellm:4000", EVCP_LITELLM_MASTER_KEY: "sk-master" }
  });
  assert.equal(typeof svc.runTurn, "function");
});
```

- [ ] **Step 2: Run test to verify current behavior** [pure-unit]

Run: `node --import tsx --test tests/unit/generation-factory-real.test.mjs`
Expected: the memory-mode test PASSES; the real-mode test PASSES too (construction doesn't execute docker, so even the placeholder constructs) — this is a guard establishing both modes build. It stays green after the change.

- [ ] **Step 3: Modify the factory**

Read `factory.ts` first. Change: (a) import `createDockerSocketEngine` and `createContainerGitCommitter`; (b) in real mode build `const dockerEngine = opts.docker ?? createDockerSocketEngine();` (drop the throwing placeholder for real mode — keep a guarded fallback only for the unreachable case); (c) `getApiKey` returns the LiteLLM master key server-side; (d) `commitAllChanges` uses the committer against the real container.

```typescript
// apps/platform-api/src/generation-loop/factory.ts (key changes)
import { createDockerSocketEngine } from "../workspace-orchestrator/docker-socket-engine";
import { createContainerGitCommitter } from "./container-git";
// ... existing imports ...

export function createDefaultGenerationService(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
  env?: Record<string, string | undefined>;
  docker?: DockerEngine;
}) {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL);

  const llmClient: LlmCompletionClient =
    mode === "real" && hasLiteLlmConfig
      ? createLiteLlmCompletionClient({ baseUrl: env.EVCP_LITELLM_BASE_URL as string })
      : createMemoryLlmCompletionClient(["(memory llm stub — configure EVCP_LITELLM_BASE_URL for real completions)"]);

  // Real mode: a fresh socket engine (stateless over /var/run/docker.sock, equivalent to the
  // orchestrator's). Memory/omitted: a throwing placeholder that never runs in the mem tests.
  const docker: DockerEngine =
    opts.docker ??
    (mode === "real"
      ? createDockerSocketEngine()
      : ({
          execInContainer: async () => {
            throw new Error("docker engine not wired (memory mode)");
          }
        } as unknown as DockerEngine));

  const gitCommitter = createContainerGitCommitter(docker);

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
    // MVP: authenticate to LiteLLM with the master key server-side. Never surfaced to the Creator.
    // Per-project virtual-key budgets are a follow-up.
    getApiKey: () => env.EVCP_LITELLM_MASTER_KEY ?? "",
    getContainerId: (projectId) => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        throw new Error(`no running container for project '${projectId}'`);
      }
      return workspace.containerId;
    },
    commitAllChanges: async (projectId, message) => {
      opts.orchestrator.markActivity(projectId);
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        // No container (e.g. memory tests): return a sentinel so the turn still completes.
        return "no-container-commit";
      }
      return gitCommitter.commit(workspace.containerId, message);
    },
    onAudit: opts.onAudit
  });
}
```

- [ ] **Step 4: Run test to verify it passes + full suite** [pure-unit]

Run: `node --import tsx --test tests/unit/generation-factory-real.test.mjs`
Expected: PASS (2/2).
Then the full default suite: `node --import tsx --test tests/unit/*.test.mjs tests/integration/*.test.mjs 2>&1 | grep -E "^. (tests|pass|fail) "` — no failures (live tests skipped). Then `cd apps/platform-api && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/factory.ts tests/unit/generation-factory-real.test.mjs
git commit -m "feat: wire generation factory to real docker + git + litellm master key"
```

---

### Task 3: Enable LiteLLM (compose env + master key on platform-api)

**Files:**
- Modify: `docker/docker-compose.yml` (platform-api env: add `EVCP_LITELLM_MASTER_KEY`; confirm litellm service passes `OPENAI_API_KEY` too)
- Modify: `docs/runbooks/enable-real-workspace-provisioning.md` (append a "Enable AI generation (LiteLLM)" section)
- Test: none automated (config + doc); verified live in Task 4.

**Interfaces:**
- Consumes: existing `docker/litellm-config.yaml` (already targets `anthropic/claude-sonnet-5` + `openai/gpt-4.1`), the litellm compose service.
- Produces: platform-api reaches LiteLLM authenticated with the master key; the orchestrator's real gateway is enabled.

- [ ] **Step 1: Add the master key to platform-api env**

In `docker/docker-compose.yml`, under `platform-api` → `environment:` (the block Plan 6 Task 4 added to), ensure this line is present (it references the same var the litellm service uses):

```yaml
      EVCP_LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
```

(`EVCP_LITELLM_BASE_URL: http://litellm:4000` is already set.) Stage only this hunk with `git add -p` (the file has other uncommitted changes).

- [ ] **Step 2: Ensure the litellm service passes the OpenAI fallback key**

In `docker/docker-compose.yml` under `litellm` → `environment:`, confirm both provider keys pass through (add the OpenAI line if missing):

```yaml
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
```

- [ ] **Step 3: Append the runbook section**

Append to `docs/runbooks/enable-real-workspace-provisioning.md`:

```markdown
## Enable AI generation (LiteLLM)

The AI chat needs a real LLM provider key. LiteLLM (config `docker/litellm-config.yaml`) targets
`anthropic/claude-sonnet-5` by default. Add these to `docker/.env` (values are YOURS — never commit them):

```
LITELLM_MASTER_KEY=sk-<choose-a-strong-random-master-key>
LITELLM_DATABASE_URL=postgresql://evcp:<POSTGRES_PASSWORD>@postgres:5432/evcp
ANTHROPIC_API_KEY=sk-ant-<your-real-anthropic-key>
# optional fallback:
# OPENAI_API_KEY=sk-<your-openai-key>
```

Then start LiteLLM and recreate platform-api so it picks up the master key:

```
docker compose -f docker/docker-compose.yml up -d litellm
docker compose -f docker/docker-compose.yml up -d --force-recreate platform-api
docker logs evcp-litellm 2>&1 | tail -20      # expect it to bind and load coding-default
```
```

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/enable-real-workspace-provisioning.md
git commit -m "docs+config: enable LiteLLM for AI generation"
# stage the compose hunk separately:
git add -p docker/docker-compose.yml   # select only the EVCP_LITELLM_MASTER_KEY / OPENAI_API_KEY hunks
git commit -m "chore: pass litellm master key to platform-api"
```

---

### Task 4: Live end-to-end vibe-coding smoke (USER-gated)

**Files:**
- Create: `tests/integration/vibe-coding-e2e-live.test.mjs`
- (No production code — this is the acceptance test for the whole flow.)

**Interfaces:**
- Consumes: everything from Plans 6–7 plus a running LiteLLM with a real provider key.
- Produces: proof that a prompt produces a real file + commit in the container.

**PRECONDITION (USER):** `docker/.env` has a real `ANTHROPIC_API_KEY` + `LITELLM_MASTER_KEY`; LiteLLM is up; platform-api recreated (Plan 6 Task 2 + Task 3 runbook). This test is skipped without `EVCP_VIBE_LIVE=1`.

- [ ] **Step 1: Write the guarded e2e test** [live-infra, user-gated]

```javascript
// tests/integration/vibe-coding-e2e-live.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createDefaultWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";

const LIVE = process.env.EVCP_VIBE_LIVE === "1";

async function drain(iterable) {
  const events = [];
  for await (const e of iterable) events.push(e);
  return events;
}

test("prompt -> AI writes a real file into the container and commits", { skip: !LIVE }, async () => {
  const env = { ...process.env, EVCP_WORKSPACE_REAL_ADAPTERS: "1" };
  const orchestrator = createDefaultWorkspaceOrchestrator({ env });
  const gen = createDefaultGenerationService({ orchestrator, env });

  const slug = "vibe" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
  const projectId = `proj-${slug}`;
  const record = await orchestrator.provisionWorkspace({ projectId, slug });

  try {
    const events = await drain(gen.runTurn({
      projectId,
      prompt: "Create a file app/hello.txt containing the text HELLO_FROM_AI. Use an <action type=\"file\" filePath=\"app/hello.txt\"> action."
    }));

    // a commit event with a real sha (not the sentinel)
    const commit = events.find((e) => e.type === "commit");
    assert.ok(commit && /^[0-9a-f]{7,40}$/.test(commit.sha), "expected a real git commit sha");

    // the file exists in the real container
    const cat = execFileSync("docker", ["exec", record.containerId, "sh", "-c", "cat /workspace/app/hello.txt 2>/dev/null || true"]).toString();
    assert.match(cat, /HELLO_FROM_AI/, "expected the AI-written file in the container");
  } finally {
    await orchestrator.deleteWorkspace(projectId);
  }
});
```

- [ ] **Step 2: Run it live (USER-gated)** [live-infra]

Run inside the recreated container (has socket + env + litellm reachable):
`docker exec -e EVCP_VIBE_LIVE=1 -e EVCP_WORKSPACE_REAL_ADAPTERS=1 -e EVCP_TEST_SEED=$RANDOM evcp-platform-api sh -lc 'cd /workspace && node --import tsx --test tests/integration/vibe-coding-e2e-live.test.mjs'`
Expected: PASS — a real commit sha + `HELLO_FROM_AI` present in the container. If the LLM returns prose without a valid `<action type="file">`, the harness/system-prompt may need tuning — capture the streamed text and iterate on `system-prompt.ts` (out of this task's happy path, note it). If LiteLLM auth fails, the provider key in `docker/.env` is missing/invalid (user action).

- [ ] **Step 3: Confirm default suite skips it** [pure-unit]

Run: `node --import tsx --test tests/integration/vibe-coding-e2e-live.test.mjs`
Expected: skipped, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/vibe-coding-e2e-live.test.mjs
git commit -m "test: live end-to-end vibe-coding smoke (guarded)"
```

---

## Notes for the implementer

- **Two things are the USER's and cannot be done in code:** (1) a real `ANTHROPIC_API_KEY` + `LITELLM_MASTER_KEY` in `docker/.env`; (2) starting LiteLLM + recreating platform-api. Tasks 1–3 are fully implementable and (except the guarded live tests) verifiable now. Task 4's live run is user-gated.
- **Do not break the 346+ memory-mode tests.** Only real mode changes in the factory. Run the full default suite after Task 2.
- **Secrets:** `getApiKey` returns the master key for server-side LiteLLM auth ONLY — it must never reach a `ChatStreamEvent`, chat message, audit metadata, or log. The generation-service already keeps `apiKey` out of everything except the `Authorization` header (verified in Plan 4).
- **git in the image:** Plan 6 Task 1's Dockerfile installs `git`; `container-git.ts` relies on it. If a container lacks git, the committer's `git init` will fail loudly — that's correct (surfaces the misconfig).
- **Ordering:** LiteLLM must be up before a chat turn (not before provision, since the master key path doesn't need per-project virtual keys). The runbook sequences it.
