# Pi Agent Verification Runbook

Horizon embeds Pi in Platform API as the only Creator Coding AI engine. Pi receives no built-in tools or project-local resources. Every model round still passes through Horizon guardrails, quota accounting, provider routing, LiteLLM, and persisted execution evidence; all workspace mutations run through project-bound Docker tools.

## Automated release gate

From the repository root, use Node.js 22.19 or newer and pnpm 11.7:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:e2e
rg -n 'EVCP_AGENT_ENGINE|LlmCompletionClient|createMessageParser|governedCompletion' apps packages tests docker .env.example
```

The final search must return no matches. The integration suite verifies native read/edit/write/direct-command/two-migration behavior, transaction ordering, no project-local Pi discovery, project/container binding, traversal and post-abort rejection, environment-dump rejection, and error redaction.

## Live prerequisites

- A running Horizon stack with Platform API, PostgreSQL, OpenBao, LiteLLM, Docker workspace adapters, and preview ingress healthy.
- At least one active AI provider and a `frontend_coding` route configured in Admin.
- A Creator bearer token that can create projects. Keep it only in the invoking shell; never add it to `.env`, shell scripts, test fixtures, logs, or commits.
- Capacity for two isolated workspaces. The default live timeout is 15 minutes per operation.

Set these shell variables:

```bash
export EVCP_PI_LIVE_TEST=1
export EVCP_PI_BASE_URL=http://localhost:9801
export EVCP_PI_CREATOR_TOKEN='<creator bearer token>'
export EVCP_PI_LIVE_TIMEOUT_MS=900000
```

If Platform API is exposed behind Horizon ingress, set `EVCP_PI_BASE_URL` to the API origin or API prefix accepted by that deployment.

## Run live acceptance

```bash
node --import tsx --test tests/live/pi-agent-e2e.test.mjs
```

The test creates a Todo project, builds it, adds due dates and an overdue filter in a second turn, then creates a Sales Pipeline with a database migration. Every turn must emit `commit` followed by `done`; the test refreshes and polls the workspace preview after each commit.

The test prints the two created project IDs as diagnostics. Record those IDs with the verification evidence. Horizon does not currently expose a destructive project-delete endpoint, so archive or remove the test projects through the approved operator workflow after evidence capture. Do not manually delete project rows without accounting for workspace schemas, buckets, volumes, runtime records, migrations, and checkpoints.

## Verify governed evidence

For each printed project ID, query PostgreSQL from an operator-authorized session:

```sql
SELECT request_id, project_id, scenario, provider_id, model, status,
       tokens_used, latency_ms, fallback_used, occurred_at
FROM ai_execution_evidence
WHERE project_id IN ('<todo-project-id>', '<sales-project-id>')
ORDER BY occurred_at;
```

Expected evidence:

- `scenario` is `frontend_coding`.
- Every `request_id` is unique and begins with `pi_`.
- A multi-tool Creator turn normally has multiple rows because each Pi model round is separately governed.
- Rows contain provider/model identifiers and usage, but no provider key, Creator token, raw chain-of-thought, database URL, host path, or container ID.

Verify the Sales Pipeline migration batch and checkpoint ordering:

```sql
SELECT name, commit_sha, applied_at
FROM workspace_migration_records
WHERE project_id = '<sales-project-id>'
ORDER BY applied_at;

SELECT tag, commit_sha, created_at
FROM workspace_code_checkpoints
WHERE project_id IN ('<todo-project-id>', '<sales-project-id>')
ORDER BY created_at;
```

The migration records must reference the committed source revision, and each successful turn must have a checkpoint created after its migration batch. Failed or aborted turns must have no new checkpoint and must restore their base commit.

## Failure triage

- No `commit`: inspect the SSE `error` event, then Platform API audit/evidence by project ID. Do not copy raw provider or container logs into tickets before redaction.
- Guardrail or quota failure: correct the Admin policy/quota; do not bypass governance or call a provider directly.
- Provider failure: verify the active `frontend_coding` route, OpenBao secret reference, LiteLLM health, and fallback evidence.
- Tool rejection: confirm the model used only project-relative paths under `app/`, `components/`, `lib/`, or `public/` and a direct allowlisted command.
- Preview timeout after `commit`: verify the workspace container state and preview health separately; keep the committed checkpoint for diagnosis.
- Migration failure: verify the database transaction rolled back and the source returned to its base commit before retrying.

Never enable Pi built-in tools, point Pi at a generated project as its working directory, expose the Docker socket to Pi, or add a legacy agent fallback as an incident workaround.
