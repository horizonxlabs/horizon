# True Hot Workspace Handoff Design

**Date:** 2026-09-07
**Status:** Draft — awaiting written review
**Owner:** Platform API / Workspace Orchestrator

## Summary

The existing workspace warm pool prepares PostgreSQL, object storage, a LiteLLM key, a Docker
volume, and a healthy Next.js container. Claiming a ready slot nevertheless stops and deletes that
container, creates a project-specific replacement, starts Next.js again, and waits for preview
readiness. Production evidence on 2026-09-07 showed three healthy `ready` slots, but a claimed
workspace still spent about 23 seconds between container creation and the durable `running` state.

Replace that restart-based handoff with a true hot handoff. A warm container starts once with an
immutable, slot-specific physical identity and preview base path. Claiming assigns that running
container and its prepared resources to a project without stopping the process. The project runtime
record becomes the authoritative mapping from logical project identity to the slot's physical
resource key.

The target remains configurable through `EVCP_WORKSPACE_WARM_POOL_SIZE`, with three ready slots by
default and the existing cold path as the immediate fallback.

## Goals

- Remove container create, start, dependency initialization, and preview health waiting from the
  normal warm-claim request path.
- Make a healthy warm claim available to Creator within a target of one to three seconds.
- Preserve per-project isolation for database, object storage, filesystem, and LLM credentials.
- Preserve atomic single-project ownership across concurrent API replicas and restart recovery.
- Keep preview, generation, idle wake, archive, deletion, publish, and orphan cleanup correct when a
  project's logical key differs from its physical workspace key.
- Ensure newly prepared slots use the workspace image that belongs to the active platform release.

## Non-goals

- Reusing any allocation after it has been claimed by a project.
- Keeping assigned projects permanently running after the existing idle timeout.
- Changing the published-app subdomain contract.
- Dynamically resizing the pool from demand forecasts.
- Moving development previews to project-specific DNS names in this change.

## Production Evidence and Root Cause

The production platform reported:

- `EVCP_WORKSPACE_WARM_POOL_SIZE=3`;
- three `workspace_warm_slots` rows in `ready` state;
- three running anonymous warm containers;
- `evcp_platform-api:v0.2.33`, while `EVCP_WORKSPACE_IMAGE` still referenced
  `evcp-workspace-next:v0.2.23`; and
- a newly assigned workspace container created at `13:08:36Z` whose runtime record became running
  at `13:08:59Z`.

The delay is deterministic in `provisionClaimedWorkspace()`: it removes the healthy anonymous
container and waits for a newly created container to become ready. The old design explicitly
accepted this project-specific restart because Docker cannot mutate container environment or labels
in place. The observed latency shows that this compromise no longer meets the product requirement.

## Chosen Approach

Use an immutable **physical workspace identity** for the whole allocation lifetime.

Each warm slot starts with:

- a unique physical resource key;
- a container named `evcp-ws-<physical-key>`;
- a preview base path `/preview/<physical-key>`;
- the prepared database, object-storage, filesystem, and LLM credentials; and
- warm-resource labels containing the slot ID.

On claim, the platform does not modify or restart the container. It atomically binds the slot to the
project, persists the prepared secrets for that project, then persists a runtime record whose
`resourceKey` points to the already-running physical container. Completing the claim retires the
slot row, but the runtime record retains ownership of every physical resource.

Logical project IDs remain the authorization boundary and API identity. Physical keys are internal
runtime locators and may appear only in authenticated preview URLs. They are not credentials.

### Alternatives Considered

1. **Keep restart-based handoff and optimize startup.** This is smaller, but still puts container
   initialization on the user path and cannot reliably meet the one-to-three-second target.
2. **Mutate the running container.** Docker cannot change environment, labels, or mounts in place;
   adding an in-container supervisor and mutable secret protocol would expand the security boundary.
3. **Use a project-specific preview subdomain.** Root-path hosting would avoid base-path concerns,
   but introduces wildcard DNS, TLS, cookie, and routing changes unrelated to workspace allocation.

## Identity and Routing Model

The runtime record is the single mapping:

```text
logical project ID -> physical resource key -> running container
```

Cold workspaces continue using `resourceKeyForProject(projectId)` as their physical key. Warm
claims use the slot's anonymous key.

All code that locates a development container must use `WorkspaceRuntimeRecord.resourceKey`, not
derive its name from the project ID. This includes:

- preview target resolution;
- source-file and command execution;
- idle wake and stop;
- restart reattachment;
- checkpoint and publish source access;
- archive and project deletion; and
- orphan reconciliation.

The workspace API returns an authenticated preview URL using the physical key. Preview authorization
must resolve the requested physical key against runtime records owned by the caller's project set.
It must not reconstruct a project ID from the URL segment.

The platform proxy forwards the unchanged `/preview/<physical-key>` path to
`evcp-ws-<physical-key>:3000`, matching the immutable `EVCP_PREVIEW_BASE` used when the warm Next.js
process started. Existing cold-workspace preview URLs remain unchanged.

## Hot Claim Sequence

1. Acquire the existing per-project provisioning lease.
2. Atomically claim the oldest healthy `ready` slot using the existing database lock and ownership
   fencing.
3. Re-inspect the claimed container and perform a fast health check against its physical preview
   base path. A missing, stopped, or unhealthy container fails the claim.
4. Persist the prepared secret bundle under the logical project ID using the existing fenced secret
   attempt.
5. Persist a `running` workspace runtime record containing the slot's physical `resourceKey`, current
   container ID, and LiteLLM administrative key ID.
6. Complete and retire the slot only after the runtime record is durable.
7. Update the in-memory runtime cache and return the running workspace.
8. Trigger non-blocking pool replenishment.

The claim path must not call `stopContainer`, `removeContainer`, `createContainer`, or
`startContainer` when the prepared container is healthy.

## Ownership Transfer and Cleanup

Docker labels on a running container remain warm-slot labels because they cannot be changed safely
in place. Durable database ownership therefore overrides labels after claim:

- before claim completion, the warm-slot row owns the container and physical resources;
- after claim completion, the workspace runtime record owns them by `resourceKey`;
- orphan cleanup first builds the set of active runtime resource keys, then preserves matching
  containers and volumes regardless of their historical labels;
- a retired slot label without either a live slot row or runtime record is an orphan and is removed;
  and
- deletion destroys the claimed container, volume, schema, bucket, identity, and LiteLLM key. It
  never returns them to the pool.

Startup reconciliation must load durable runtime records before deleting warm-labelled resources.
If both a claiming slot and runtime record exist after a crash, the existing claim recovery flow
finishes the ownership transfer. If neither durable owner exists, fenced cleanup removes the
allocation.

## Failure Handling

- **No ready slot:** enter the existing cold provisioning path immediately.
- **Health check fails before persistence:** quarantine and clean the slot, trigger refill, then use
  the cold path.
- **Secret persistence fails:** retain claim ownership while fenced cleanup destroys the allocation;
  do not expose a runtime record.
- **Runtime persistence fails:** remove project secrets written by that claim, clean the allocation,
  and use the cold path.
- **Process dies after runtime persistence but before slot retirement:** startup recovery treats the
  runtime record as authoritative and retires the stale claim without deleting its resources.
- **Idle workspace wake:** start the same physical container and wait for its existing physical
  preview base path.
- **Pool refill failure:** report sanitized operational evidence and retry with existing backoff;
  never delay the current user request.

## Release Image Consistency

Admin image-tag updates currently update the workspace image service but can leave the
`EVCP_WORKSPACE_IMAGE` environment value of `platform-api` pinned to an older tag. The release update
must set the platform API workspace-image environment to the target release before or with the
platform API rollout. Startup must emit a sanitized warning when the platform release tag and
workspace image tag differ.

Existing ready slots from an older workspace image are not handed to new projects after an upgrade.
Reconciliation drains unclaimed mismatched slots and refills them with the active image. Already
claimed project workspaces keep their existing image until their normal lifecycle or an explicit
workspace upgrade mechanism handles them.

## Observability

Persist structured timing for:

- claim selected;
- health confirmed;
- project secrets persisted;
- runtime record persisted;
- claim completed; and
- total foreground claim duration.

The warm-pool status must distinguish ready slots by matching versus stale image tag. Logs and audit
metadata may include slot IDs, project IDs, physical keys, image tags, durations, and sanitized
failure categories, but never credentials or encrypted secret payloads.

## Test Contract

Implementation follows test-driven development and must prove:

1. Warm preparation starts Next.js with `/preview/<physical-key>`.
2. A successful healthy claim performs no container stop, remove, create, or start operation.
3. The runtime record retains the claimed physical resource key and container ID.
4. Preview resolution authorizes by logical project ownership and routes by physical resource key.
5. An unrelated user cannot reach a preview by guessing a physical key.
6. File, command, generation, idle wake, checkpoint, publish, archive, and deletion flows locate a
   warm-claimed workspace by its physical key.
7. Orphan cleanup preserves a warm-labelled container owned by a runtime record.
8. Orphan cleanup removes a retired warm-labelled container with no durable owner.
9. Crash recovery completes an ownership transfer when the runtime record was persisted first.
10. A failed health check destroys the claimed allocation and follows the cold path.
11. Pool replenishment restores the configured number of matching-image ready slots.
12. A platform release update changes both the workspace image service and
    `EVCP_WORKSPACE_IMAGE` used by platform API.
13. Mismatched unclaimed warm slots are drained after upgrade.
14. Existing cold-provisioning and warm-pool concurrency/fencing tests remain green.
15. A live integration test measures warm claim readiness without a container-create operation on
    the foreground path.

## Rollout

1. Deploy the routing and ownership-transfer code with the existing cold fallback intact.
2. Reconcile and drain unclaimed slots whose image does not match the current release.
3. Refill three slots and verify that every slot reports healthy on its physical preview path.
4. Create a test project and confirm no foreground container create/start event occurs.
5. Verify generation, preview refresh, idle wake, checkpoint, and publish for the claimed project.
6. Monitor claim latency, cold-fallback rate, pool readiness, CPU, memory, and cleanup failures.
7. If an invariant fails, set `EVCP_WORKSPACE_WARM_POOL_SIZE=0`; assigned workspaces and the cold path
   continue to operate.

## Success Criteria

- With at least one healthy matching-image slot, a new project reaches a running workspace in one to
  three seconds under normal host load.
- The warm claim path performs no container replacement or process startup.
- No allocation is assigned twice, exposed to an unauthorized project, recycled after use, or
  deleted while a runtime record owns it.
- Preview and all workspace operations work when logical and physical keys differ.
- Production maintains the configured ready capacity using the active release's workspace image.
- Pool exhaustion and any failed claim safely fall back to the existing cold path.
