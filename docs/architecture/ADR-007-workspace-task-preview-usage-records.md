# ADR-007: Workspace Task, Preview and Usage Records

**Status:** Accepted  
**Date:** 2026-07-03  
**Deciders:** Product Owner, Software Architect, Creator, Security Admin

## Context

Sprint 4 introduces the Creator Workspace where a prompt creates an AI task, updates a live preview and consumes governed AI quota. Sprint 5 will use preview output for frontend version restore, and Sprint 8 will need traceability from ticket or prompt through PRD, preview and deployment.

The product direction for vibe coding is a Bolt-like browser workspace: Creator/Developer should be able to prompt, inspect generated files, view AI diffs, see terminal/build/test output, preview the running app and hand off to publish without a local development setup. Unlike a consumer self-serve coding workspace, Enterprise Vibe Coding Platform must keep infrastructure, database, user directory, authentication, secrets, routes and deployment policy as IT-controlled boundaries.

## Decision

Workspace prompt execution is stored as separate records:

- `WorkspaceTask` stores prompt, status and guardrail decision.
- `WorkspaceTaskStep` stores deterministic progress steps.
- `PreviewVersion` stores the latest mock generated preview.
- `AiUsageLog` stores prompt, route/model and token usage.

The prompt pipeline requires a confirmed PRD baseline before any workspace task can be accepted.

The workspace may expose code, diff, terminal and preview affordances, but generation and edit actions must consume a platform-provided app contract:

- Platform Auth SDK and app-role claims are mandatory; generated apps must not create independent password stores or user directories.
- PostgreSQL database server and schema-per-app boundary are provisioned by the platform; workspace edits must not create unmanaged database infrastructure.
- Secrets, AI provider keys, runtime env vars, routes, TLS and storage are referenced through platform-managed identifiers and never exposed to Creator clients.
- Artifact validation must block or require approval for code that attempts to bypass auth, mutate global infrastructure, access another app schema, exfiltrate secrets or self-provision external services.

```mermaid
sequenceDiagram
    participant C as Creator
    participant API as Platform API
    participant W as Workspace Service
    participant PRD as PRD Service
    participant GR as Guardrail Service
    participant GOV as AI Governance
    participant VAL as Artifact Validator
    C->>API: Submit prompt
    API->>W: submitPrompt(projectId, prompt)
    W->>PRD: Require baseline v1.0
    W->>GR: Guardrail pre-check
    alt block
        W-->>API: blocked task, no preview, no usage
    else allow/warn
        W->>GOV: Resolve frontend_coding route + quota
        W->>VAL: Validate generated artifact against platform contract
        W-->>API: task progress + preview + usage log
    end
```

## Alternatives Considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Keep workspace state only in frontend mock data | Fast UI build | No API contract, no usage/audit trail, Sprint 5 cannot consume output | Rejected |
| Store one JSON blob per workspace | Simple schema | Harder query and traceability, weak version boundary | Rejected |
| Store task, step, preview and usage records | Clear flow evidence, supports restore/traceability, testable deny paths | More tables and service code | Accepted |

## Consequences

- Prompt block path is explicit: guardrail event and blocked task exist, but preview/usage do not update.
- Accepted prompt path creates task progress, preview version and usage log.
- Sprint 5 can build frontend checkpoint/restore on top of `PreviewVersion`.
- Token usage and route/model metadata are available for audit and reporting.
- Future Bolt-like code/diff/terminal features must reuse the same task/audit/validation boundary rather than giving Creator direct infrastructure, auth, database or secret control.
