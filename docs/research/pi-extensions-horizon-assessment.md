# Pi Extensions Assessment for Horizon

Date: 2026-08-15

## Verdict

Pi extensions are executable TypeScript plug-ins for changing Pi itself; they are not prompt-only skills. They are powerful for a trusted local coding agent, but Horizon **should not enable extension auto-discovery or load project-supplied extensions in `platform-api`**. An extension runs with the full permissions of the Pi process and can execute arbitrary code. In Horizon that would move tenant-controlled code across the existing Docker/governance boundary into the multi-tenant control plane.

Keep the current design: Pi runs in `platform-api`, all built-ins and discovered resources stay disabled, and only Horizon-owned tools cross into the project container through `ActionRunner`. If extensions become necessary, allow only version-pinned, reviewed, first-party modules for non-authoritative concerns such as telemetry. Project-authored extensions should run only with an entire Pi worker inside a per-project sandbox/container, never be imported back into `platform-api`.

## What an extension is and can do

An extension exports a synchronous or asynchronous factory that receives Pi's `ExtensionAPI`. Pi loads TypeScript directly, and the module may use npm dependencies and Node built-ins. It can:

- register LLM-callable tools, commands, shortcuts, flags, renderers, providers, and custom UI;
- intercept lifecycle events, inject messages or replace the system prompt, filter LLM context, and customize compaction;
- inspect or rewrite provider headers/payloads;
- block or mutate tool calls, and alter tool results before they return to the model;
- execute processes, persist custom session entries, change active tools/models, and manage long-lived resources.

This is materially different from a Horizon governed skill: a skill contributes approved instructions, while an extension executes code and can change agent control flow. See Pi's [Extensions overview](https://pi.dev/docs/latest/extensions), [Extension API](https://pi.dev/docs/latest/extensions#extensionapi-methods), [events](https://pi.dev/docs/latest/extensions#events), and [custom tools](https://pi.dev/docs/latest/extensions#custom-tools).

## Lifecycle

The relevant lifecycle is:

1. Pi loads global/CLI extensions, resolves project trust, then loads trusted project-local extensions.
2. It awaits asynchronous factories before `session_start` and `resources_discover`.
3. For an agent run, hooks can act before agent start, around turns/messages, before each model request, around provider requests, and before/after tool execution.
4. `tool_call` can block execution or mutate arguments. Pi explicitly says it does **not** revalidate after an extension mutates tool input.
5. `agent_settled` marks the end of automatic retry/continuation; `session_shutdown` is the cleanup point for processes, sockets, watchers, and timers.

Extensions in global or project auto-discovery locations can be hot-reloaded. See [lifecycle events](https://pi.dev/docs/latest/extensions#lifecycle-overview), [`tool_call`](https://pi.dev/docs/latest/extensions#tool-call), and [long-lived resources and shutdown](https://pi.dev/docs/latest/extensions#long-lived-resources-and-shutdown).

## Potential value to Horizon

The useful parts are real, but most already have safer Horizon-owned equivalents:

| Extension capability | Possible value | Existing Horizon boundary |
| --- | --- | --- |
| Tool registration and dynamic activation | Add integrations without changing the core loop; reduce active tool schemas | Horizon already passes seven explicit typed tools and uses an explicit Plan-mode allowlist (`pi-tools.ts`, `pi-session-context.ts`) |
| Tool interception | Central audit, approval gates, policy checks | Each Horizon tool performs path/command/size/abort checks and emits audit evidence inside its own execution boundary |
| Context/system hooks | Add project or role context | `governed-context.ts` resolves only assigned, approved skills and permission-filtered knowledge |
| Provider hooks | Tracing, headers, alternate providers | Horizon's governed provider path owns secrets, guardrails, quota, fallback, and evidence |
| Session/compaction hooks | Better summaries or durable plug-in state | Horizon treats Prisma chat/audit as authoritative and Pi sessions as per-turn in-memory state |
| Custom TUI/UI | Rich interactive local-agent experience | Mostly irrelevant because Creator Web consumes Horizon SSE rather than Pi's terminal UI |

The best future use would be a small first-party observability extension or a governed tool-catalog loader. It should remain advisory: authorization, policy enforcement, audit, transactions, and secret handling must stay in Horizon code even if a hook also observes them.

## Risks in Horizon

- **Arbitrary code with full process privileges.** Pi's security documentation states that extensions run with the same permissions as the Pi process and that Pi has no built-in sandbox. Node filesystem/process APIs and installed dependencies are available. See [Extension locations/security](https://pi.dev/docs/latest/extensions#extension-locations) and [No Built-in Sandbox](https://pi.dev/docs/latest/security#no-built-in-sandbox).
- **Control-plane compromise.** In `platform-api`, such code would be inside the process responsible for provider governance, tenant routing, audit and Docker-backed actions. A malicious or vulnerable project extension could bypass the intended project-container boundary, read process-accessible secrets, or affect other tenants.
- **Governance bypass.** Extensions can replace system context, modify provider payloads, register providers/tools, change active tools, and mutate tool arguments after Pi validation. Horizon's defense remains sound only because validation and authorization are repeated inside the custom tool implementations.
- **Supply-chain and reload risk.** Extensions can import npm dependencies and be installed from packages; hot reload introduces runtime code replacement. Pinning Pi itself does not pin arbitrary extension dependency graphs.
- **Project trust is not isolation.** Pi says trust only controls whether project resources are loaded; it is not a sandbox and does not make prompts, model output, build output, or repository content safe. For unattended/untrusted work Pi recommends OS/container/VM isolation with minimal files, credentials, and network access. See [Project Trust](https://pi.dev/docs/latest/security#project-trust) and [Running Untrusted or Unmonitored Work](https://pi.dev/docs/latest/security#running-untrusted-or-unmonitored-work).
- **Operational complexity.** Async initialization, resource cleanup, event ordering, reload, and session replacement add failure modes. An extension can also start outbound connections or long-lived processes unless constrained externally.

## Fit with the current implementation

Horizon currently enforces the correct boundary:

- `pi-session-context.ts` uses in-memory settings with empty package/extension/skill/prompt/theme lists, disables all Pi built-in tools, supplies only explicit Horizon tools, and returns an empty `ResourceLoader` for extensions and local context.
- `pi-tools.ts` exposes only Docker-backed project operations, buffers migrations for the outer transaction, checks abort and budgets, and audits every tool call.
- `pi-tool-policy.ts` confines paths to approved project roots, allowlists direct commands, blocks unsafe shell metacharacters/host paths/network remotes, bounds inputs/outputs, and redacts secrets and host/container identifiers.
- `governed-context.ts` exposes only admin-resolved skill instructions and permission-filtered knowledge; the system prompt explicitly says never to discover or trust local Pi resources.

These controls implement the approved architectural rule that Pi is a trusted inner library, while Horizon remains the enterprise policy and transaction boundary. See the local [Pi agent engine design](../superpowers/specs/2026-08-14-pi-agent-engine-design.md) and the implementation files cited above.

## Concrete recommendation

1. **Now — no extensions in production generation.** Preserve `extensions: []`, the empty extension runtime/resource loader, `noTools: "all"`, and Horizon's explicit custom tools. Do not mount or scan generated `.pi/extensions` from `platform-api`.
2. **Platform API — first-party only if a clear gap appears.** Use a compile-time/static allowlist, exact versions and review; prohibit filesystem/package auto-discovery and hot reload. Keep every security decision enforced again in Horizon-owned services/tools. Prefer ordinary modules over extensions when no Pi lifecycle interception is required.
3. **Project container — only with Pi inside the same sandbox.** A `.pi/extensions` file in today's project container should not be loaded by the host Pi session. If customers eventually need extensions, run a separate per-project Pi worker inside the container/VM with non-root identity, minimal mounts/short-lived credentials, restricted egress, resource limits, signed/admin-approved packages, and isolated audit transport.
4. **Do not replace governed skills with extensions.** Skills remain the appropriate progressive-disclosure mechanism for tenant-specific instructions. Extensions should never be the tenant customization format in the control plane.

Net: extensions are useful technology, but not useful enough today to justify weakening Horizon's strongest security property. Revisit only for a specific lifecycle feature that cannot be expressed through the existing custom-tool, governed-context, provider-adapter, and SSE layers.

## Primary sources

- [Pi Extensions documentation](https://pi.dev/docs/latest/extensions) and its [first-party Markdown source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi Security documentation](https://pi.dev/docs/latest/security) and its [first-party Markdown source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
- [Pi extension examples](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions)
- Horizon: `apps/platform-api/src/generation-loop/pi-session-context.ts`, `pi-tools.ts`, `pi-tool-policy.ts`, `governed-context.ts`, and `system-prompt.ts`
