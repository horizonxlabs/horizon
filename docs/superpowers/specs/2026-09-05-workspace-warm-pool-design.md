# Workspace Warm Pool Design

**Date:** 2026-09-05  
**Status:** Approved  
**Owner:** Platform API / Workspace Orchestrator

## Summary

New projects currently wait for the complete workspace provisioning path: PostgreSQL schema and
role creation, MinIO bucket and identity creation, LiteLLM virtual-key creation, Docker volume
creation, container creation, template hydration, process startup, and preview readiness. The
independent infrastructure operations already run concurrently, but the user still pays their
combined critical-path latency on the first visit to the Creator workspace.

Add a global pool of fully prepared workspace slots. The platform keeps three ready slots by
default, claims one atomically when a project first provisions its workspace, and refills the pool
in the background. If no ready slot exists, provisioning immediately follows the existing cold
path; project creation never waits for pool replenishment.

The pool size is configured with `EVCP_WORKSPACE_WARM_POOL_SIZE`, defaults to `3`, and can be set to
`0` to disable the feature.

## Goals

- Remove infrastructure provisioning and first-volume initialization from the normal new-project
  critical path.
- Preserve strict database, object-storage, filesystem, and LLM credential isolation between
  projects.
- Guarantee that a ready slot is assigned to at most one project, including with concurrent API
  requests or platform replicas.
- Keep the existing cold provisioning path as an immediate capacity and recovery fallback.
- Reconcile safely after API or Docker restarts and clean up partially prepared or failed slots.
- Preserve existing workspace recovery, idle-stop, archive, deletion, preview, generation, and
  publish behavior.

## Non-goals

- Reusing a workspace after it has contained project data.
- Keeping every idle project container running.
- Autoscaling the pool from demand forecasts in the first version.
- Eliminating the short project-specific container restart required to apply immutable Docker
  environment and naming.
- Pooling published application containers.

## Chosen Approach

Use **pre-provisioned resource slots with a fast project-specific container handoff**.

Each ready slot owns:

- an anonymous physical resource key;
- a PostgreSQL schema and role;
- a MinIO bucket and scoped credentials;
- a LiteLLM virtual key;
- an encrypted secret bundle;
- an initialized Docker volume; and
- a healthy warm workspace container.

Docker cannot change a container's environment or mounts in place. On claim, the platform removes
the anonymous warm container and creates the final project-named container with the same initialized
volume and prepared credentials. Only container create/start and preview readiness remain on the
foreground path. This is safer and substantially smaller than adding a mutable in-container claim
protocol, while capturing most of the latency reduction.

Alternatives rejected:

1. **Image/cache warming only:** smaller change, but PostgreSQL, MinIO, LiteLLM, volume, hydration,
   and container startup remain on the foreground path.
2. **Mutate a running container without restart:** potentially fastest, but requires a supervisor,
   dynamic secret injection, preview base-path mutation, and stronger revocation guarantees. It
   significantly expands the security boundary.

## Configuration

Add a pure configuration resolver:

```text
EVCP_WORKSPACE_WARM_POOL_SIZE=3
```

Rules:

- Missing value: `3` in real-adapter mode.
- `0`: pool disabled; all provisions use the existing cold path.
- Positive integer: desired count of `ready` plus actively `preparing` slots.
- Invalid, negative, non-integer, or unreasonably large values: reject startup with an actionable
  configuration error. The initial hard maximum is `20` to prevent accidental host exhaustion.
- Memory/test mode defaults to `0` unless explicitly injected by a test, so ordinary unit suites do
  not create background work.

The release and development Compose definitions expose the variable with a default of `3` when real
workspace adapters are enabled. Operators must budget host capacity for the configured number of
warm Next.js processes; Docker's existing workspace CPU and memory limits apply to warm containers.

## Data Model

### `WorkspaceWarmSlot`

Persist pool lifecycle independently from projects:

| Field | Purpose |
|---|---|
| `id` | Stable slot identifier |
| `resourceKey` | Unique physical key for schema, bucket, volume, and warm container |
| `state` | `preparing`, `ready`, `claiming`, or `failed` |
| `containerId` | Current anonymous warm container, when present |
| `llmGatewayKeyId` | Administrative key ID required for revocation |
| `secretPayload` | Authenticated encrypted prepared credential bundle |
| `claimProjectId` | Project selected by the atomic claim, when claiming |
| `lastError` | Sanitized operational failure detail |
| timestamps | Creation, update, readiness, and claim timing |

The secret payload uses the existing workspace encryption-key material and never appears in API
responses, logs, audit metadata, or labels. The table does not require a project foreign key while a
slot is anonymous. `resourceKey` and a uniqueness constraint on `claimProjectId` prevent duplicate
physical ownership.

### `WorkspaceRuntimeRecord`

Add `resourceKey`. Existing rows are interpreted as `resourceKeyForProject(projectId)` during the
migration/backward-compatible read path. New cold workspaces keep that derived key; warm claims use
the slot's anonymous physical key.

The logical project key still determines the final container name and public preview path. The
physical resource key determines the volume, schema, bucket, and deletion targets. Separating these
identities is necessary because prepared infrastructure exists before a project ID is known.

## Components and Public Seams

Introduce a `WorkspaceWarmPool` abstraction with these primary operations:

- `ensureCapacity()`: reconcile current slots and prepare up to the configured target without
  blocking project traffic.
- `claim(projectId)`: atomically reserve one ready slot and return its prepared allocation, or
  return `null` immediately when none is ready.
- `completeClaim(slotId, runtime)`: mark handoff complete after the project runtime record is durable.
- `failClaim(slotId, error)`: quarantine the slot and schedule best-effort cleanup.
- `reconcile()`: recover valid ready slots and clean stale partial state after restarts.

`provisionWorkspace()` remains the caller-facing orchestration seam. It tries a warm claim before
starting the existing cold resource path. Existing recovery paths for already persisted project
workspaces remain higher priority than the pool.

## Slot Preparation

`ensureCapacity()` is single-flight inside a process and uses database coordination across
processes. It counts `preparing` and `ready` slots against the target, reserves missing slot rows,
and prepares each reserved slot independently.

For each slot:

1. Generate a collision-resistant key such as `warm-<random-id>` that satisfies all existing
   resource naming constraints.
2. Persist a `preparing` row before creating external resources.
3. Provision PostgreSQL, MinIO, LiteLLM, and the Docker volume concurrently with the same rollback
   discipline as cold provisioning.
4. Persist the encrypted credential bundle and administrative LiteLLM key ID.
5. Create and start an anonymous warm container using the slot volume and prepared credentials.
6. Wait for the preview health endpoint.
7. Transition the slot to `ready` only after every dependency is usable.

Preparation failure records a sanitized error, performs idempotent best-effort cleanup, and marks
the slot `failed`. Failed slots do not count toward ready capacity and are replaced on the next
reconcile pass. Repeated failures use bounded retry/backoff to avoid a tight infrastructure loop.

## Atomic Claim and Handoff

Claiming follows this sequence:

1. In a short database transaction, select the oldest `ready` slot with row locking and
   skip-locked semantics, then update it to `claiming` with `claimProjectId`. If none exists, return
   `null` immediately.
2. Decrypt the slot credential bundle and inspect the warm container/volume.
3. Stop and remove the anonymous container. The volume and external resources remain intact.
4. Create `evcp-ws-<logical-project-key>` using:
   - project-specific labels;
   - `EVCP_PREVIEW_BASE=/preview/<logical-project-key>`;
   - the slot's prepared credentials; and
   - the slot's initialized physical volume.
5. Start the container and wait for preview readiness.
6. Persist project secrets under the project ID.
7. Persist the workspace runtime record with the slot `resourceKey`, final container ID, and
   LiteLLM administrative key ID.
8. Complete the claim transaction and remove or terminally mark the slot record.
9. Trigger non-blocking replenishment.

The project is not exposed as `running` until both the final container and runtime record are ready.
Audit events record slot IDs and timing but never credential values.

## Fallback and Failure Behavior

- **No ready slot:** execute cold provisioning immediately.
- **Claim lost to another request:** retry selection once, then cold provision.
- **Claimed slot is unhealthy or incomplete:** quarantine and clean it, then execute cold
  provisioning for the project.
- **Final project container fails to start:** remove the partial final container, clean all claimed
  slot resources, then attempt the cold path. If the cold path also fails, preserve the existing
  `failed` workspace behavior and error response.
- **Runtime persistence fails after container start:** stop/remove the final container and clean the
  allocation; never return an untracked running workspace.
- **Pool refill fails:** log/audit the operational failure and retry with backoff; do not fail user
  requests.

Only one provisioning promise per project may run inside a process. Database uniqueness on the
runtime project ID and claim project ID provides the cross-process safety net.

## Startup and Periodic Reconciliation

After workspace runtime hydration and before ordinary orphan cleanup:

1. Load warm-slot records.
2. Reconcile each slot with Docker and external-resource state.
3. Recover healthy `ready` containers.
4. Resume or roll back stale `preparing` and `claiming` rows based on durable ownership evidence.
5. Teach orphan cleanup to recognize `evcp.kind=workspace-warm` containers and volumes so they are
   owned by the pool rather than mistaken for deleted-project resources.
6. Run `ensureCapacity()` asynchronously.

A lightweight periodic reconciler maintains the target after claims and failures. Timers are
unreferenced and stopped during service shutdown where the application lifecycle exposes a shutdown
hook. Concurrent reconcile calls collapse into one active pass per process.

## Existing Lifecycle Changes

- Workspace recovery locates the final container by logical project key and uses persisted
  `resourceKey` for physical storage/resources.
- Preview routing remains unchanged: `evcp-ws-<logical-project-key>:3000` and
  `/preview/<logical-project-key>`.
- Idle sweep applies only to assigned project runtime records, not anonymous warm slots.
- Archive and deletion remove the physical volume, schema, bucket, and LiteLLM key using the
  persisted `resourceKey`.
- Orphan cleanup treats a slot as active when a durable warm-slot row owns it.
- A claimed allocation is never returned to the pool, even if the project is deleted without user
  changes; deletion destroys it to preserve isolation.

## Observability

Add structured audit/log events:

- `workspace.pool_prepare_started`
- `workspace.pool_ready`
- `workspace.pool_prepare_failed`
- `workspace.pool_claimed`
- `workspace.pool_claim_failed`
- `workspace.pool_cold_fallback`
- `workspace.pool_reconciled`

Useful fields include slot ID, logical project ID when assigned, preparation duration, claim
duration, ready count, target size, and sanitized failure category. A health summary may expose
counts by state, but never resource credentials.

## Security

- A slot is anonymous and exclusive before claim, and exclusively owned by one project afterward.
- Claimed resources are destroyed rather than recycled.
- Prepared credentials are encrypted at rest and excluded from logs, responses, labels, and audit
  metadata.
- Project-specific container labels and preview base path are applied only during handoff.
- Failure cleanup revokes the LiteLLM key and removes schema, bucket identity, bucket, volume, and
  container.
- Database locking and uniqueness constraints prevent double assignment.
- Pool operations use the existing least-privilege project credentials after claim; administrative
  credentials remain inside the platform API.

## Test Contract

Implementation follows test-driven development against these agreed public seams:

1. Configuration defaults to `3` in real mode, accepts `0`, accepts bounded positive integers, and
   rejects invalid values.
2. `ensureCapacity()` creates exactly the missing number of slots and is idempotent/single-flight.
3. A slot becomes `ready` only after resources, encrypted secrets, container startup, and health
   readiness succeed.
4. Concurrent `claim()` calls never return the same slot.
5. `provisionWorkspace()` prefers a ready slot and records its physical `resourceKey`.
6. With no ready slot, provisioning immediately invokes the existing cold path.
7. A broken claimed slot is cleaned and falls back cold without exposing partial ownership.
8. A successful claim triggers asynchronous replenishment.
9. Restart reconciliation recovers valid ready slots and removes stale partial slots.
10. Orphan cleanup preserves durable warm slots and removes orphaned warm resources.
11. Workspace delete/archive/recovery use the persisted physical resource key.
12. Existing cold provisioning, preview, idle, generation, publish, and project-deletion tests remain
    green.
13. A live integration test verifies that the second of two workspace provisions consumes a ready
    slot and reaches health without provisioning new external resources on its request path.

## Rollout

1. Ship schema migration, pool code, and configuration with the pool disabled in tests.
2. Deploy with `EVCP_WORKSPACE_WARM_POOL_SIZE=3` on the single-node production stack.
3. Observe preparation success, host memory/CPU, ready count, claim latency, and cold-fallback rate.
4. Exercise new-project creation, generation, preview, publish, idle wake, and deletion end to end.
5. If capacity pressure or failures occur, set the size to `0` and redeploy; the existing cold path
   remains available and assigned projects remain valid.

## Success Criteria

- Under normal capacity, a new project's workspace uses a ready slot rather than provisioning
  external resources synchronously.
- Pool exhaustion does not increase latency beyond today's cold path.
- No slot can be assigned twice and no claimed project resources can be reused by another project.
- Reconciliation leaves no untracked warm containers, volumes, database roles/schemas, buckets, or
  LLM keys.
- Production maintains three ready slots by default and can change the target through configuration.
