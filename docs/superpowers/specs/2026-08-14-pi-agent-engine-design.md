# Pi Agent Engine Design

Date: 2026-08-14
Status: Approved for implementation planning

## Objective

Replace Horizon's custom Coding AI agent loop with `@earendil-works/pi-coding-agent` as the only production agent engine. The migration does not introduce a legacy/Pi runtime switch or `EVCP_AGENT_ENGINE`. Horizon continues to own enterprise governance, project isolation, persistence, validation, migrations, checkpoints, preview, publishing, and the Creator-facing API.

## Decision

Pi runs inside the `platform-api` process. All Pi built-in tools are disabled. Pi receives only Horizon-defined custom tools whose implementations delegate to the existing Docker-backed workspace action layer. Pi never receives direct access to the Platform API filesystem, shell, Docker socket, database credentials, project-local extensions, or project-local resource discovery.

Horizon remains the outer transaction coordinator around every Pi build turn:

```text
Creator prompt
  -> Horizon authentication and authorization
  -> PRD, knowledge, skill, guardrail, quota, and provider resolution
  -> Pi AgentSession in platform-api
  -> Horizon custom tools
  -> Docker ActionRunner
  -> isolated project workspace container
  -> validate
  -> commit source
  -> apply migration batch transaction
  -> create immutable checkpoint
  -> refresh preview
```

## Scope

This design preserves the established boundaries in ADR-002 (provider-neutral governance), ADR-003 (container/schema isolation), ADR-007 (workspace task and usage evidence), and ADR-013 (restart-safe workspace runtime records). Pi is a trusted internal library behind those boundaries, not a provider plugin exposed to generated applications.

### Pi owns

- Model/tool interaction and follow-up turns.
- Native structured tool calls and tool-result feedback.
- Assistant text and thinking event emission.
- Per-run agent state, compaction, retry behavior, and termination.
- The model/provider protocol surface used by the embedded agent.

### Horizon owns

- Keycloak identity, tenant membership, project authorization, and role checks.
- Scenario routing, provider secrets, guardrails, token quota, fallback, latency, cost, and AI execution evidence.
- PRD baseline, approved plan, governed knowledge excerpts, and governed skills.
- Prisma chat history and audit records as the authoritative enterprise record.
- Per-project Docker workspace lifecycle and isolation.
- Locked-file rules, path validation, restricted shell execution, file changes, and migration policy.
- Build validation, Git prepare/commit/restore, transactional migration application, and immutable checkpoints.
- SSE/API compatibility, Creator UI state, preview readiness, publishing, and Store lifecycle.

## Runtime Components

### `pi-generation-service.ts`

This is the only generation-service implementation wired by `generation-loop/factory.ts`. It preserves the existing public contract:

```ts
type GenerationService = {
  history(projectId: string): Promise<WorkspaceChatMessage[]>;
  listWorkspaceFiles(projectId: string): Promise<Array<{ path: string; content: string }>>;
  runTurn(input: {
    projectId: string;
    prompt: string;
    agentMode?: WorkspaceAgentMode;
    actor?: PlatformUser;
    approvedPlan?: string;
  }): AsyncIterable<ChatStreamEvent>;
};
```

It acquires the existing per-project turn lock, appends the user message to Prisma, prepares the Git base commit for Build mode, creates a governed Pi session, streams adapted events, coordinates post-agent validation/migrations/commit/checkpoint, appends the final assistant record, and releases the lock.

Plan mode has no mutating custom tools and never prepares, validates, commits, migrates, or checkpoints. Build mode receives the controlled Horizon tool set.

### `pi-provider.ts`

Pi model requests must not call LiteLLM outside Horizon governance. A Horizon-owned Pi provider adapter invokes a new structured-agent execution method on `GovernedAiExecutor` for every Pi LLM round. The adapter captures the authenticated actor, project ID, and AI scenario when the session is created, and creates a unique request ID for each model round.

The existing `GovernedAiExecutor.execute()` text-completion contract remains available for PRD generation, provider tests, and other non-agent scenarios. The new `executeAgentRound()` contract accepts Pi's structured model messages and tools, streams Pi-compatible text/thinking/tool-call events, and returns the authoritative assistant message plus provider usage. It reuses the same provider resolution, guardrail, quota, fallback, redaction, reconciliation, and evidence store as `execute()`. The implementation must not flatten a Pi tool call into generated text or the legacy Horizon action-markup format.

Each model round therefore performs the existing sequence:

```text
resolve provider plan
  -> evaluate guardrail
  -> reserve quota
  -> invoke provider through LiteLLM/provider adapter
  -> reconcile actual usage
  -> persist evidence
```

Tool-result follow-up calls, retries, and compaction calls are also governed executions. A single Creator prompt may create multiple evidence records, one for each provider invocation. No provider key is persisted by Pi or exposed to the Creator or workspace container.

### `pi-tools.ts`

Pi is created with all built-in tools disabled. Build sessions receive only these Horizon custom tools:

- `read_workspace_file`: read one validated project-relative file through the Docker engine.
- `list_workspace_files`: list the bounded project tree through the existing workspace reader.
- `write_workspace_file`: write a new or safely replaceable file through `ActionRunner`.
- `edit_workspace_file`: apply a targeted find/replace edit through `ActionRunner`.
- `run_workspace_command`: execute a command inside the project container through the restricted shell policy and stream bounded output.
- `propose_database_migration`: validate and buffer a named SQL migration; it does not execute SQL during the Pi loop.
- `load_governed_skill`: return only a skill instruction already selected by Horizon governance for the current project and scenario.

Every tool validates its TypeBox schema, project-relative path, locked-file policy, size/output limit, and current session identity before delegation. Tool results contain only bounded stdout, stderr, diff/preview, and sanitized error data.

Pi's default resource discovery is not used. Generated workspaces cannot load `.pi/extensions`, `.pi/skills`, `.pi/prompts`, `AGENTS.md`, `CLAUDE.md`, or arbitrary package extensions into the Platform API process.

### `pi-event-adapter.ts`

The adapter preserves the existing Creator SSE contract:

| Pi event | Horizon event |
| --- | --- |
| assistant text delta | `token` |
| thinking delta | `reasoning` |
| tool execution start | `action_start` |
| tool execution update | `action_chunk` |
| tool execution end | `action_result` |
| successful outer Git commit | `commit` |
| terminal failure | `error` |
| completed outer transaction | `done` |

Tool call IDs are used as Horizon action IDs. Tool names are mapped to existing action types and user-facing labels. The frontend does not need a protocol rewrite.

### `pi-session-context.ts`

This component creates a controlled Pi `ResourceLoader`, system prompt, model/provider binding, and in-memory `SessionManager` for one Horizon turn. It hydrates conversation context from the authoritative Prisma chat store and includes:

- current project files selected through the workspace reader;
- rolling chat summary;
- confirmed PRD baseline;
- approved plan when entering Build mode from Plan mode;
- governed knowledge excerpts;
- governed skill names and explicit load instructions;
- Horizon tool and lifecycle rules.

Pi's JSONL session files are not the authoritative store and are not required for restart recovery. Horizon persists normalized user/assistant/action records and reconstructs the Pi context for a retry or later turn. Raw chain-of-thought is streamed only as allowed by the existing API and is not stored as an authoritative business record.

## Build Transaction

The outer Build transaction remains ordered and fail-closed:

1. Acquire the per-project FIFO turn lock.
2. Resolve workspace and authenticated governed context.
3. Append the user message.
4. Prepare Git and capture the base commit.
5. Run the Pi session with Horizon custom tools.
6. Buffer migration proposals without applying them.
7. Validate the workspace build.
8. If validation fails and the retry budget remains, feed sanitized validation output back into the same Pi session and repeat tool execution and validation.
9. Commit all source changes.
10. Apply all migrations from the turn in one database transaction and materialize their artifacts.
11. Create the immutable code checkpoint only after source and migrations succeed.
12. Append the final assistant/action record and emit `commit`, then `done`.

If any step after Git preparation fails, Horizon restores the base commit. Failed migration batches roll back the database transaction. No checkpoint is created for a failed turn.

## Cancellation and Limits

The chat route attaches request/response disconnect handling to an `AbortController`. Disconnecting the Creator stream aborts the active Pi session, stops accepting further tool calls, and waits for the current Docker operation to settle or time out before restoring as required.

The implementation enforces configuration-backed hard limits with safe defaults:

- maximum Pi model rounds per Creator turn;
- maximum tool calls per turn;
- maximum shell execution duration;
- maximum stdout/stderr bytes per tool result;
- maximum file read/write bytes;
- maximum total turn duration.

Limit failures are sanitized, audited, emitted as `error`, and follow the same restore rules as other terminal failures.

## Dependency and Deployment Requirements

- Pin `@earendil-works/pi-coding-agent` exactly at `0.84.2`.
- Require Node.js `>=22.19.0` in the repository engine declaration.
- Pin Platform API and workspace Docker base images to `node:22.22.0-alpine`, which satisfies `>=22.19.0`, instead of relying on an unbounded floating patch.
- Retain the Pi MIT license notice in third-party notices or the distributed dependency metadata.
- Keep LiteLLM and existing AI provider administration. Pi does not replace the model gateway.

## Removal of the Legacy Engine

There is no runtime fallback or feature flag. After the Pi implementation and compatibility tests are green:

- `factory.ts` wires only the Pi generation service;
- the custom completion-only `LlmCompletionClient` is removed if no other caller remains;
- the text action `message-parser` and action-markup generation protocol are removed if no other caller remains;
- custom retry/self-heal code replaced by Pi is removed;
- reusable Horizon components such as ActionRunner, governed context, chat store, Docker readers, migration runner/store, Git guard, checkpoint store, and SSE route remain.

Removal is dependency-driven: a file is deleted only after repository search and tests prove no remaining production or test consumer.

## Error Handling

- Authentication or authorization failure occurs before session creation and uses the existing HTTP response behavior.
- Guardrail, quota, provider, or model failure terminates the current Pi model round with a sanitized error and persists evidence.
- Invalid or rejected tool input returns a structured tool error without executing the action. Pi may correct the request within the configured turn budget.
- Docker execution, validation, or migration failure triggers the outer restore path.
- Persistence failure before tool execution stops the turn. Persistence failure after source mutation triggers restore rather than returning an untracked successful change.
- All errors redact provider secrets, credentials, database URLs, host paths, container identifiers, and unrestricted command output.

## Testing Strategy

Implementation follows red-green-refactor. Tests prove behavior at the public boundary rather than merely asserting mocks were called.

### Unit tests

- Pi provider sends every model round through `GovernedAiExecutor`, assigns unique request IDs, forwards text/thinking/tool-call events, and surfaces blocked/failed evidence.
- Pi sessions expose no built-in tools and do not discover project-local resources.
- Custom tool schemas reject traversal, absolute paths, locked files, oversized content, unsafe shell requests, unsafe SQL transaction control, and calls after abort.
- Pi events map exactly to current `ChatStreamEvent` variants.
- Prisma history and governed project context hydrate the Pi session without persisting provider secrets or chain-of-thought.

### Integration tests

- A scripted Pi model performs native read/edit/write/shell tool calls against a memory Docker engine and produces current SSE events.
- A successful Build turn performs prepare, actions, validate, commit, migration batch, and checkpoint in order.
- Validation feedback causes a bounded corrective Pi round.
- Model, tool, validation, persistence, and migration failures restore the base commit and create no checkpoint.
- Two prompts for one project remain FIFO while different projects may run concurrently.
- Aborting the HTTP stream aborts Pi and prevents subsequent tool execution.

### Security tests

- No built-in Pi tool is available.
- A generated project cannot load an extension, skill, prompt, or context file into Platform API.
- One project cannot address another project's container or files.
- Tool errors and audit evidence contain no provider secret, database URL, or host path.

### End-to-end tests

- A real LiteLLM-backed prompt creates a Todo List project and reaches preview-ready state.
- A later prompt modifies the Todo List without losing existing behavior.
- A real prompt creates a Sales Pipeline project with frontend and database migration and reaches preview-ready state.
- Creator Plan and Build modes continue to render text, reasoning, action progress, commit, error, and completion through the existing UI.

## Acceptance Criteria

- Pi is the only wired Coding AI engine; no `EVCP_AGENT_ENGINE` or legacy runtime switch exists.
- Pi has no built-in tools and cannot directly access the host or Docker socket.
- Every Pi provider invocation is governed and produces quota/evidence accounting.
- Existing Creator SSE/API contracts remain compatible.
- Successful turns preserve the Horizon validation, commit, migration, checkpoint, and preview lifecycle.
- Failed and aborted turns restore safely and create no checkpoint.
- Prisma remains the authoritative multi-tenant chat/audit record.
- Todo List and Sales Pipeline real-provider flows reach preview-ready state.

## Non-goals

- Replacing LiteLLM, Keycloak, Prisma, Docker workspace orchestration, or the Creator UI.
- Exposing Pi's terminal UI, RPC server, project extensions, themes, prompt folders, or credential store.
- Supporting a legacy/Pi dual runtime or runtime rollback flag.
- Persisting Pi-local JSONL sessions as an enterprise source of truth.

## Primary References

- [ADR-002: AI Provider Adapter Architecture](../../architecture/ADR-002-ai-provider-adapter-architecture.md)
- [ADR-003: Generated App Container and Schema Isolation](../../architecture/ADR-003-generated-app-container-and-schema-isolation.md)
- [ADR-007: Workspace Task, Preview and Usage Records](../../architecture/ADR-007-workspace-task-preview-usage-records.md)
- [ADR-013: Persist workspace runtime records](../../architecture/ADR-013-workspace-runtime-record-persistence.md)
- [Pi SDK](https://pi.dev/docs/latest/sdk)
- [Pi custom providers](https://pi.dev/docs/latest/custom-provider)
- [Pi security](https://pi.dev/docs/latest/security#no-built-in-sandbox)
- [Pi containerization](https://pi.dev/docs/latest/containerization)
- [Pi package metadata](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/package.json)
- [Pi changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- [Pi MIT license](https://github.com/earendil-works/pi/blob/main/LICENSE)
