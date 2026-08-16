# Pi Auto Agent Design

Date: 2026-08-16
Status: Approved for implementation planning

## Objective

Make Creator chat behave like a direct Pi coding-agent session. The user writes natural-language messages in one composer; Pi decides whether to answer, inspect the project, or change it. A previously selected Build mode must never cause an informational question to mutate files.

Horizon continues to own authentication, provider governance, project isolation, custom tools, locked-file policy, validation, rollback, audit, checkpoints, and preview lifecycle.

## Decision

Creator exposes one Auto chat experience and removes the persistent Plan/Build switch. Normal chat turns use a new `auto` agent mode. Pi receives the full Horizon custom-tool set and selects tools itself, as it does in a direct agent session.

The Auto system contract distinguishes two behaviors:

- Informational request: Pi may list or read files, then answers directly. It must not write or edit files, run package/build commands, propose migrations, validate, or commit.
- Mutation request: Pi inspects the project, uses the necessary Horizon mutation tools, validates the result, and lets Horizon commit and checkpoint the change.

Prior mutation requests in chat history do not grant mutation authority to the current turn. Authority comes from the current user message or an explicitly approved plan.

## Compatibility

`WorkspaceAgentMode` becomes `"auto" | "plan" | "build"` during migration.

- `auto` is the default for normal Creator chat and for missing or unknown API mode values.
- `plan` and `build` remain accepted for persisted history, older clients, tests, and the existing approved-plan transition.
- New Creator UI code does not persist a mode in local storage and does not render the Plan/Build switch.
- Historical Plan messages may still render their existing approval action. Approving one creates an explicit Build turn carrying `approvedPlan`, preserving current behavior.

This avoids rewriting historical chat records or breaking an in-flight browser during a rolling deployment.

## Creator Experience

The workspace composer has one neutral action, “Send”, with an Auto-agent description. Status text no longer claims the workspace is being built before Pi has chosen an action.

Normal turn states are:

1. `Thinking…` while Pi determines intent and inspects context.
2. Read/action progress only for tools Pi actually calls.
3. `Done` for a read-only answer.
4. `Committed <sha>` only after a real source mutation passes validation and is committed.

A read-only answer does not refresh the preview, create an empty Git commit, create a checkpoint, or run the post-build bug scan. A mutation keeps the current action cards, streaming shell output, validation feedback, commit event, preview refresh, and bug report behavior.

Quick messages continue to use explicit wording. Suggestions such as “Build first preview” or “Fix the failed action” naturally authorize mutation; review and explanation suggestions explicitly request read-only analysis.

## API and Mode Resolution

Creator sends `agentMode: "auto"` for normal chat. The API resolver returns `auto` when a request omits the mode or supplies an unknown value. Explicit legacy `plan` and `build` values remain valid.

The selected mode is persisted on each chat message for audit evidence:

- `auto` records the user-facing automatic session contract.
- `plan` records a legacy or explicitly requested read-only plan.
- `build` records an approved plan or compatibility caller that explicitly requested mutation.

The server remains authoritative. It does not trust local-storage mode state, because that state is removed from the normal Creator path.

## Pi Session and Tool Contract

Auto sessions disable all Pi built-in tools, as today, and expose all Horizon custom tools:

- `list_workspace_files`
- `read_workspace_file`
- `write_workspace_file`
- `edit_workspace_file`
- `run_workspace_command`
- `propose_database_migration`
- `load_governed_skill`

Plan compatibility sessions continue to expose only the existing read-only subset. Explicit Build compatibility sessions continue to use the full tool set.

The Auto system prompt begins with an intent rule before implementation guidance. It explicitly names informational examples in English and Thai, including “where does this data come from?” and “ตอนนี้ดึงข้อมูลมาจากไหน”. It also names mutation examples such as create, add, change, fix, remove, install, implement, and their Thai equivalents. Examples clarify the rule but do not replace model reasoning.

The prompt must not tell Pi to continue tool use when the current request is already answered. A successful read-only response is a valid terminal turn.

## Mutation Detection and Transaction Lifecycle

Horizon determines whether an Auto turn actually mutated the workspace from Git state, not from model prose or the selected mode.

`ContainerGitCommitter` gains a read-only working-tree change check. The generation service checks it after the Pi session ends:

- Clean tree: append the assistant answer and finish. Skip write checks, build validation, migration sync/application, commit, checkpoint, preview refresh, and post-build bug scan.
- Dirty tree or queued migration: run the existing write checks and validation-repair loop, materialize migration artifacts, commit source, apply the migration batch, create a checkpoint, and emit `commit`.

The base commit is still prepared before an Auto session so every failed, cancelled, timed-out, or invalid mutation can restore atomically. Preparing Git does not create a new commit when the repository already has a valid baseline.

The commit implementation must stop using `--allow-empty` for normal AI commits. No source change means no commit event.

## Preview and Post-Turn Behavior

Creator increments the preview key only when it receives a `commit` event. It no longer refreshes preview unconditionally when an Auto/Build stream emits `done`.

The chat route runs post-turn bug collection only when the generation result reports an actual committed mutation. Mode alone is insufficient evidence. This may be conveyed through the existing `commit` stream event or explicit turn metadata retained by the route.

Read-only answers therefore remain fast and do not start unnecessary Next.js builds.

## Error Handling

- A read-only tool failure may be reported in the answer without changing or restoring source.
- Any mutation tool failure remains available to Pi for correction within the configured round/tool budgets.
- Failed validation, cancellation, timeout, persistence failure, or migration failure after preparation restores the captured base commit.
- If Pi attempts a mutation while answering an informational request, tests and the prompt contract treat that as a product defect. Horizon's locked-file, shell, Docker, path, quota, and audit policies still constrain the attempted action.
- Existing explicit Plan mode remains server-enforced read-only for compatibility and approved-plan workflows.

## Testing Strategy

Implementation follows red-green development at public seams.

### Unit tests

- Missing/unknown mode resolves to `auto`; explicit legacy values remain unchanged.
- Workspace mode local-storage persistence and the mode-switch contract disappear from normal Creator UI.
- Auto session exposes all Horizon custom tools; Plan compatibility exposes only read tools.
- Auto system prompt terminates informational requests without mutation and ignores prior-turn mutation authority.
- Git change detection distinguishes clean, dirty, and migration-bearing turns.
- Clean Auto turns append an assistant response without validate, commit, checkpoint, or commit event.
- Dirty Auto turns retain validate, repair, commit, migration, checkpoint, and rollback behavior.
- Creator refreshes preview on `commit`, not merely on `done`.

### Integration tests

- An Auto informational question may read project files and produces no workspace commit.
- An Auto mutation request performs the established Docker action and commit lifecycle.
- Chat SSE for a clean Auto turn contains text/reasoning and `done`, but no mutation actions or `commit`.
- Older Plan/Build API callers and historical approval flow remain compatible.

### Live local-model verification

Using the configured Gemma model through LM Studio:

1. Ask “ตอนนี้ดึงข้อมูลมาจากไหน”. Verify Pi answers from the current project, writes no file, runs no `npm`, and leaves Git HEAD unchanged.
2. Ask an explicit small change. Verify Pi edits the requested file, builds successfully, commits once, and refreshes preview.

## Acceptance Criteria

- Creator shows one Auto chat composer with no persistent Plan/Build switch.
- A question cannot inherit Build authority from the previous turn.
- Informational questions produce no file write, shell action, validation build, commit, checkpoint, or preview refresh.
- Explicit mutation requests continue to build real applications through Horizon custom tools.
- Git HEAD changes only when the workspace changed.
- Existing guardrails, quotas, provider evidence, Docker isolation, locked files, rollback, migrations, and audit records remain intact.
- Legacy Plan/Build history and approved-plan implementation remain readable and functional.
- Focused tests and `pnpm check:ci` pass.

## Non-goals

- Exposing Pi built-in shell/file tools or direct host access.
- Removing LiteLLM, Horizon governance, Docker isolation, or outer transaction safety.
- Adding a second intent-classifier model call.
- Automatically reverting historical workspace commits. The accidental `b2d4bba` commit is handled only with explicit user authorization.
- Rewriting existing chat history rows.

