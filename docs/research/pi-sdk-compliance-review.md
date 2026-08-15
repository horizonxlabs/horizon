# Pi SDK compliance review

Date: 2026-08-15

## Verdict

Horizon **is using the real Pi SDK correctly at its core**. It creates an `AgentSession`, registers a native provider through `ModelRuntime`, supplies typed custom tools, subscribes to native events before `prompt()`, performs repair prompts on the same session, and cleans up with `abort()`/`dispose()`.

Its main deviations are intentional: Pi built-in tools and automatic extension/resource discovery are disabled, LiteLLM remains behind Horizon governance, and Pi sessions are in-memory while Horizon owns chat persistence. These are sound security/product choices. The integration is not fully production-complete because cancellation does not currently stop an in-flight model round.

## Compliance matrix

| Area | Status | Evidence and assessment |
|---|---|---|
| Package/version | Compliant | `apps/platform-api/package.json` pins `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to `0.84.2`; npm reports `0.84.2` as latest on the review date. |
| `AgentSession` setup | Compliant | `pi-session-context.ts:55-66` calls documented `createAgentSession()` with explicit runtime, model, tools, settings, session manager and resource loader. `AgentSessionRuntime` is unnecessary because Horizon never replaces/forks a live Pi session. |
| Model/provider | Compliant with gap | `pi-provider.ts:55-75` registers a native Pi provider; `:78-315` emits the required start/content/tool-call/done/error stream events. This correctly routes Pi through Horizon governance instead of exposing direct credentials. |
| Custom tools | Compliant | `pi-tools.ts:43-238` supplies seven TypeBox-backed `ToolDefinition`s implementing `execute(id, params, signal, onUpdate)`. The SDK accepts `ToolDefinition[]`; `defineTool()` is optional. |
| Built-in tools | Intentional and safe | `pi-session-context.ts:51-65` allowlists only Horizon custom tools while disabling Pi host tools. Installed 0.84.2 gives the explicit `tools` list precedence; tests confirm only intended tools are active. |
| Extensions/resources | Intentional and safe | `pi-session-context.ts:70-88` uses an empty `ResourceLoader`. This prevents project `.pi/extensions`, skills, prompts and `AGENTS.md` from crossing into the trusted Platform API. Governed skills enter through `load_governed_skill`. |
| Streaming/prompt loop | Compliant | `pi-session-event-queue.ts:8-40` subscribes before prompting and drains until completion. `pi-generation-service.ts:142-176` waits for each prompt before sending repair prompts, so `steer`/`followUp` is not needed. |
| Lifecycle | Compliant with cancellation gap | `pi-generation-service.ts:215-230` attempts abort on failure, unsubscribes, and disposes the session. Cleanup is correct after an error occurs. |
| Persistence/context | Intentional with context loss | `SessionManager.inMemory()` is rebuilt from Horizon user/assistant text. This is supported by Pi, but tool calls/results, reasoning, Pi tree and compaction entries are lost across user turns. |
| Retry/compaction | Compliant | In-memory settings enable compaction and two retries. They work within the current user turn and consume Horizon's model-round budget. |
| Test evidence | Passing | Targeted Pi suite: **26 passed, 0 failed**, covering provider events, tool boundary, tool sets, event mapping, repair flow and generation coordination. |

## Critical gaps

### P1 — Timeout/cancel does not abort the active model request

`pi-generation-service.ts:89-90` creates a combined user/timeout signal, but passes it only to custom tools at `:124`. `createHorizonPiRuntime()` receives no outer signal, and no listener invokes `session.abort()` when that signal fires. A timeout can stop a running tool, but a slow or stuck `executeAgentRound()` can continue indefinitely.

Fix by attaching a one-shot listener from the combined signal to `session.abort()` immediately after session creation, handling the already-aborted case, and removing the listener in `finally`. Add a hanging-executor cancellation test. Pi's documented `PromptOptions` has no `signal` field, so do not invent one.

### P2 — Model limits are hard-coded

`pi-provider.ts:255-267` advertises a 200k context window and 32k output for every governed route, even when LiteLLM selects a different primary/fallback model. Pi uses these values for context management and compaction. Horizon should advertise conservative effective limits for the allowed route or obtain them from governance before creating the session.

### P2 — Cross-turn history is text-only

`pi-session-context.ts:91-108` rehydrates only user and assistant text. Future turns do not receive the causal tool transcript. Either document this as Horizon's stateless-turn contract (relying on live files and summaries), or persist a sanitized, bounded structured transcript of tool calls/results.

### P3 — Successful provider results assume usage exists

`GovernedAiAgentRoundResult.usage` is optional, while `pi-provider.ts:294-303` dereferences it unconditionally. Make usage required for successful/fallback results or validate it before emitting Pi completion.

## Intentional deviations to keep

- Keep Pi built-in filesystem/shell tools disabled; Horizon's Docker-bound tools enforce tenancy, path policy, quota and audit.
- Keep default extension/resource discovery disabled in `platform-api`.
- Keep LiteLLM/API credentials outside Pi credential files and project containers.
- Keep one Pi session per Horizon turn unless exact Pi resume/tree/tool-history behavior becomes a product requirement.

## Primary sources

- [Pi SDK guide](https://pi.dev/docs/latest/sdk)
- [Pi SDK guide source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [First-party coding-agent source](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)
- [npm registry metadata](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent)
- Installed 0.84.2 first-party sources: `apps/platform-api/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js` and the matching `@earendil-works/pi-ai` event-stream implementation.
