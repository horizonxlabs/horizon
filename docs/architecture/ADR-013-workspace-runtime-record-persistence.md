# ADR-013: Persist workspace runtime records

**Status:** Accepted
**Date:** 2026-07-13
**Deciders:** Platform Engineering

## Context

The workspace orchestrator retains `WorkspaceContainerRecord` and LiteLLM key ids in process
maps. Encrypted per-project secrets already survive restart, and the orchestrator can inspect a
managed Docker container to reattach opportunistically. That recovery is not authoritative: idle
state, failure evidence, archive state, resource limits, and a stopped container's identity are
lost before an explicit provision/recovery request.

The private-server pilot needs restart-safe lifecycle state without exposing workspace credentials
outside the server or changing the synchronous read contract used by existing routes.

## Decision

Add a PostgreSQL `workspace_runtime_records` table and a focused repository. In Prisma mode the
orchestrator will hydrate its read map before routes are registered and write-through every state
transition. Docker inspection remains the authority for process liveness; PostgreSQL is the
authority for intended lifecycle state and audit/recovery metadata.

## Options considered

### Option A: Keep Docker inspection as the only restart recovery mechanism

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Restart fidelity | Partial |
| Failure/audit evidence | Lost |
| API compatibility | Unchanged |

**Pros:** no migration.
**Cons:** cannot distinguish intentional idle/archive from an interrupted process; every restart
needs a side-effecting recovery request.

### Option B: PostgreSQL write-through record plus startup hydration

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Restart fidelity | High |
| Failure/audit evidence | Durable |
| API compatibility | Preserved after hydration |

**Pros:** explicit lifecycle transitions survive restart and remain queryable.
**Cons:** requires one migration and compensating behavior when Docker has drifted.

### Option C: External workflow engine

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Restart fidelity | High |
| Operational cost | High |

**Pros:** durable retries and leases.
**Cons:** exceeds the private-server MVP boundary.

## Trade-off analysis

Option B provides enough durability for the current single Platform API process while keeping
Docker as the source of execution truth. A future worker/lease architecture can consume the same
table without changing resource names or browser contracts.

## Consequences

- Restarted APIs restore lifecycle records before accepting workspace routes.
- A record may say `running` while Docker has stopped; recovery must inspect/restart rather than
  trust the database blindly.
- No secret value or LiteLLM key is persisted in this table; encrypted secret persistence remains
  the only secret authority.

## Action items

1. [x] Add schema/migration and repository.
2. [x] Hydrate and write-through orchestrator transitions in Prisma mode.
3. [~] Add restart and Docker-drift integration coverage (deterministic restart test exists; clean-stack proof remains).
