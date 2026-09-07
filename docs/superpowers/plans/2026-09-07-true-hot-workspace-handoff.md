# True Hot Workspace Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign an already-running warm workspace to a new project without recreating its container, reaching a usable Creator preview in one to three seconds under normal host load.

**Architecture:** A workspace runtime record maps the logical project ID to an immutable physical resource key. Warm containers start once with `/preview/<physical-key>` and retain their physical name, environment, volume, and historical warm labels after claim; database ownership and runtime records supersede those labels. Preview authorization returns the physical key to Creator, and every development-workspace lifecycle operation resolves the container from the runtime record.

**Tech Stack:** TypeScript, Node.js, Fastify/Express-compatible routes, React, Docker Engine API, PostgreSQL/Prisma, Node test runner, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-07-true-hot-workspace-handoff-design.md`

## Global Constraints

- Keep `EVCP_WORKSPACE_WARM_POOL_SIZE=3` as the real-adapter default and `0` as the disable switch.
- A successful healthy warm claim must not stop, remove, create, or start a container.
- Logical project IDs remain the authorization and API identity; physical keys are runtime locators only.
- A claimed allocation is never returned to the pool or assigned to another project.
- Cold provisioning remains the immediate fallback when no healthy matching-image slot exists.
- Existing database, object-storage, volume, LLM-key, project-lease, and cleanup fencing must remain intact.
- Preview cookies remain `HttpOnly`, `SameSite=Strict`, secure in production, and scoped to the authorized physical preview path.
- No credential, secret payload, or provider key may appear in a response, URL, label, log, audit event, or test snapshot.
- Existing published-app subdomain and route contracts remain unchanged.
- Implementation follows red-green-refactor TDD, and each task commits only its scoped files.

---

### Task 1: Centralize Physical Workspace Location

**Files:**
- Create: `apps/platform-api/src/workspace-orchestrator/runtime-location.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/runtime-cache.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`
- Test: `tests/unit/workspace-runtime-location.test.mjs`
- Test: `tests/unit/workspace-runtime-cache.test.mjs`

**Interfaces:**
- Consumes: `WorkspaceContainerRecord` and existing `resourceKeyForProject(projectId)`.
- Produces: `workspacePhysicalKey(record): string`, `workspaceContainerName(record): string`, `workspacePreviewBase(record): string`, and `WorkspaceOrchestrator.findWorkspaceByResourceKey(resourceKey)`.

- [ ] **Step 1: Write failing tests for cold and warm physical locations**

```js
test("runtime location uses the persisted physical key for a warm claim", () => {
  const record = { projectId: "prj_alpha", resourceKey: "warm-resource-1" };
  assert.equal(workspacePhysicalKey(record), "warm-resource-1");
  assert.equal(workspaceContainerName(record), "evcp-ws-warm-resource-1");
  assert.equal(workspacePreviewBase(record), "/preview/warm-resource-1");
});

test("runtime location falls back to the logical key for legacy rows", () => {
  const record = { projectId: "prj_alpha" };
  assert.equal(workspacePhysicalKey(record), "prj-alpha");
  assert.equal(workspaceContainerName(record), "evcp-ws-prj-alpha");
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-runtime-location.test.mjs tests/unit/workspace-runtime-cache.test.mjs`

Expected: FAIL because `runtime-location.ts` and resource lookup do not exist.

- [ ] **Step 3: Add the physical-location module and cache lookup**

```ts
import type { WorkspaceContainerRecord } from "@evcp/types";
import { resourceKeyForProject } from "./resource-ports";

export function workspacePhysicalKey(record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey">): string {
  return record.resourceKey ?? resourceKeyForProject(record.projectId);
}

export function workspaceContainerName(record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey">): string {
  return `evcp-ws-${workspacePhysicalKey(record)}`;
}

export function workspacePreviewBase(record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey">): string {
  return `/preview/${workspacePhysicalKey(record)}`;
}
```

Add an indexed scan seam to `runtime-cache.ts` without exposing its mutable map:

```ts
findByResourceKey(resourceKey: string): WorkspaceContainerRecord | null {
  for (const record of records.values()) {
    if (workspacePhysicalKey(record) === resourceKey) return record;
  }
  return null;
}
```

Delegate `findWorkspaceByResourceKey()` from the orchestrator to this cache seam. Keep
`physicalResourceKey()` as a compatibility export that delegates to `workspacePhysicalKey()` until
all existing imports migrate.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-runtime-location.test.mjs tests/unit/workspace-runtime-cache.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the physical-location seam**

```bash
git add apps/platform-api/src/workspace-orchestrator/runtime-location.ts apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts apps/platform-api/src/workspace-orchestrator/runtime-cache.ts apps/platform-api/src/workspace-orchestrator/orchestrator.ts tests/unit/workspace-runtime-location.test.mjs tests/unit/workspace-runtime-cache.test.mjs
git commit -m "refactor(workspace): centralize physical runtime location"
```

---

### Task 2: Make Preview Authorization Use the Physical Key

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/routes.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/preview-session-route.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `apps/creator-web/src/features/workspace/use-preview-authorization.ts`
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx`
- Test: `tests/unit/workspace-routes.test.mjs`
- Test: `tests/unit/workspace-preview-proxy.test.mjs`
- Test: `tests/unit/preview-session-route.test.mjs`
- Test: `tests/unit/api-client.test.mjs`
- Test: `tests/unit/creator-workspace-hierarchy.test.mjs`

**Interfaces:**
- Consumes: `WorkspaceOrchestrator.findWorkspaceByResourceKey(resourceKey)` and `workspacePhysicalKey(record)` from Task 1.
- Produces: `authorizeWorkspacePreview(projectId): Promise<{ authorized: true; previewKey: string }>` and Creator preview state containing the authorized physical key.

- [ ] **Step 1: Write failing API and authorization tests**

Add cases proving a creator who owns `prj_alpha` can resolve `warm-resource-1`, an outsider receives
403, and an unknown key receives 404:

```js
const warmRecord = {
  projectId: "prj_alpha",
  resourceKey: "warm-resource-1",
  state: "running"
};

assert.deepEqual(await resolvePreviewTarget(orchestrator, creator, "warm-resource-1"), {
  ok: true,
  upstream: "http://evcp-ws-warm-resource-1:3000"
});
assert.deepEqual(await resolvePreviewTarget(orchestrator, outsider, "warm-resource-1"), {
  ok: false,
  status: 403
});
```

Update the preview-session expectation:

```js
assert.deepEqual(response.body.data, {
  authorized: true,
  previewKey: "warm-resource-1"
});
assert.match(response.headers["Set-Cookie"], /Path=\/preview\/warm-resource-1/);
```

- [ ] **Step 2: Run the route, client, and Creator tests and verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-routes.test.mjs tests/unit/workspace-preview-proxy.test.mjs tests/unit/preview-session-route.test.mjs tests/unit/api-client.test.mjs tests/unit/creator-workspace-hierarchy.test.mjs`

Expected: FAIL because routes and Creator still derive preview keys from project IDs.

- [ ] **Step 3: Route and authorize by physical key**

Change `resolvePreviewTarget()` to locate the record by physical key, then authorize its logical
project ID:

```ts
const record = orchestrator.findWorkspaceByResourceKey(key);
if (!record) return { ok: false, status: 404 };
if (!isMember(auth, record.projectId)) return { ok: false, status: 403 };
if (record.state === "idle") await orchestrator.wakeWorkspace(record.projectId);
else if (record.state !== "running") return { ok: false, status: 503 };
orchestrator.markActivity(record.projectId);
return { ok: true, upstream: `http://${workspaceContainerName(record)}:3000` };
```

In `app-factory.ts`, authorize the project membership first, require an existing runtime record,
and return `workspacePhysicalKey(record)`. In `preview-session-route.ts`, include `previewKey` in the
success envelope while retaining the path-scoped cookie.

- [ ] **Step 4: Consume the returned key in Creator**

Change the API client return type and make `usePreviewAuthorization()` retain the server-provided
key:

```ts
type PreviewAuthorization = {
  state: "loading" | "ready" | "error";
  isAuthorized: boolean;
  previewKey: string;
  retry(): void;
};
```

`WorkspacePage.tsx` must render no iframe until authorization is ready, then use:

```ts
const previewSrc = previewAuth.previewKey
  ? `/preview/${encodeURIComponent(previewAuth.previewKey)}`
  : "";
```

Keep the numeric `vibePreviewKey` only as the iframe refresh/remount trigger. The keepalive call may
ignore the returned key because a runtime's physical key cannot change during its lifetime.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-routes.test.mjs tests/unit/workspace-preview-proxy.test.mjs tests/unit/preview-session-route.test.mjs tests/unit/api-client.test.mjs tests/unit/creator-workspace-hierarchy.test.mjs`

Expected: PASS, including unauthorized physical-key access.

- [ ] **Step 6: Commit physical preview routing**

```bash
git add apps/platform-api/src/workspace-orchestrator/routes.ts apps/platform-api/src/workspace-orchestrator/preview-session-route.ts apps/platform-api/src/app-factory.ts packages/api-client/src/index.ts apps/creator-web/src/features/workspace/use-preview-authorization.ts apps/creator-web/src/features/workspace/WorkspacePage.tsx tests/unit/workspace-routes.test.mjs tests/unit/workspace-preview-proxy.test.mjs tests/unit/preview-session-route.test.mjs tests/unit/api-client.test.mjs tests/unit/creator-workspace-hierarchy.test.mjs
git commit -m "feat(workspace): route previews by physical runtime key"
```

---

### Task 3: Start Warm Containers With Their Immutable Preview Base

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-preparation.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-engine.ts`
- Test: `tests/unit/workspace-docker-engine.test.mjs`
- Test: `tests/unit/workspace-warm-pool.test.mjs`
- Test: `tests/unit/workspace-warm-pool-fixture.mjs`

**Interfaces:**
- Consumes: slot `resourceKey`, `buildWarmContainerSpec()`, and `waitForPreviewReady()`.
- Produces: warm containers whose immutable environment includes `EVCP_PREVIEW_BASE=/preview/<resourceKey>`.

- [ ] **Step 1: Add a failing warm-container environment test**

```js
const spec = buildWarmContainerSpec({
  slotId: "warm_1",
  resourceKey: "warm-resource-1",
  image: "evcp/workspace-next:1",
  env: { DATABASE_URL: "redacted" },
  cpuCores: 1,
  memoryMb: 2048,
  network: "evcp-internal",
  workspaceVolume: "evcp-ws-warm-resource-1-data"
});
assert.ok(spec.env.includes("EVCP_PREVIEW_BASE=/preview/warm-resource-1"));
assert.equal(spec.name, "evcp-ws-warm-resource-1");
```

Add a pool test that asserts readiness probes the physical base path before `markReady()`.

- [ ] **Step 2: Run the warm preparation tests and verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-docker-engine.test.mjs tests/unit/workspace-warm-pool.test.mjs`

Expected: FAIL because warm specs currently omit `EVCP_PREVIEW_BASE`.

- [ ] **Step 3: Inject the immutable base path in one constructor**

In `buildWarmContainerSpec()`, merge rather than mutate caller input:

```ts
env: {
  ...input.env,
  EVCP_PREVIEW_BASE: `/preview/${input.resourceKey}`
}
```

Keep the anonymous warm labels and physical container name unchanged. Do not add logical project
identity to the container.

- [ ] **Step 4: Run the focused warm tests and verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-docker-engine.test.mjs tests/unit/workspace-warm-pool.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit immutable warm preview configuration**

```bash
git add apps/platform-api/src/workspace-orchestrator/warm-pool-preparation.ts apps/platform-api/src/workspace-orchestrator/docker-engine.ts tests/unit/workspace-docker-engine.test.mjs tests/unit/workspace-warm-pool.test.mjs tests/unit/workspace-warm-pool-fixture.mjs
git commit -m "feat(workspace): prepare warm preview processes"
```

---

### Task 4: Replace Restart-Based Claim With Hot Ownership Transfer

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator-provisioning.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts`
- Test: `tests/unit/workspace-orchestrator-warm-pool.test.mjs`
- Test: `tests/unit/workspace-warm-claim-lifecycle.test.mjs`
- Test: `tests/unit/workspace-orchestrator-secret-fencing.test.mjs`
- Test: `tests/unit/workspace-warm-foreground-cleanup.test.mjs`

**Interfaces:**
- Consumes: `WarmWorkspaceAllocation`, the existing per-project lease, prepared encrypted secrets, and Task 1 location helpers.
- Produces: `provisionClaimedWorkspace()` that persists ownership without invoking container lifecycle mutations and emits phase durations without secrets.

- [ ] **Step 1: Change the primary warm-claim test to require zero lifecycle mutations**

Capture Docker calls before provisioning and assert the same running container survives:

```js
const ready = (await fixture.store.list()).find((slot) => slot.state === "ready");
const original = await fixture.docker.inspectContainer(`evcp-ws-${ready.resourceKey}`);
const lifecycleBefore = fixture.dockerLifecycleCalls.length;

const record = await fixture.orchestrator.provisionWorkspace({
  projectId: "prj_new",
  slug: "new"
});

assert.equal(record.resourceKey, ready.resourceKey);
assert.equal(record.containerId, original.containerId);
assert.deepEqual(fixture.dockerLifecycleCalls.slice(lifecycleBefore), []);
```

Add failure cases for a missing/stopped container and for secret/runtime persistence fencing.

- [ ] **Step 2: Run claim and fencing tests and verify restart-based expectations fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-orchestrator-warm-pool.test.mjs tests/unit/workspace-warm-claim-lifecycle.test.mjs tests/unit/workspace-orchestrator-secret-fencing.test.mjs tests/unit/workspace-warm-foreground-cleanup.test.mjs`

Expected: FAIL because the claimed container is currently deleted and replaced.

- [ ] **Step 3: Implement the ordered hot handoff**

Replace the foreground container replacement block with:

```ts
await state.assertOwnership(input.projectId);
const found = await deps.docker.inspectContainer(`evcp-ws-${allocation.resourceKey}`);
if (!found?.running || found.containerId !== allocation.containerId) {
  throw new Error("claimed warm workspace is unavailable");
}
await waitForPreviewReady(deps.docker, found.containerId);
await state.assertOwnership(input.projectId);
await deps.secrets.replaceForProvisioning(input.projectId, allocation.env, attempt);

const record: WorkspaceContainerRecord = {
  id: `ws-${resourceKeyForProject(input.projectId)}`,
  projectId: input.projectId,
  slug: input.slug,
  resourceKey: allocation.resourceKey,
  state: "running",
  containerId: found.containerId,
  cpuCores,
  memoryMb,
  lastActivityAt: now(),
  lastError: undefined,
  createdAt: now(),
  updatedAt: now()
};
state.rememberLlmKey(input.projectId, allocation.llmGatewayKeyId);
await persist(record);
await deps.warmPool!.completeClaim(allocation.slotId);
return save(record);
```

Keep rollback ordered and fenced: remove project secret persistence and the attempted runtime row,
then let `failClaim()` destroy the allocation. Do not delete the container directly from the claim
function because the slot owns it until runtime persistence succeeds.

- [ ] **Step 4: Add sanitized phase timing metadata**

Record monotonic durations for health confirmation, secret persistence, runtime persistence, claim
completion, and total claim time. Use the existing `workspace.pool_claimed` audit event and numeric
millisecond fields only:

```ts
metadata: {
  slotId: allocation.slotId,
  healthMs,
  secretsMs,
  runtimeMs,
  completeMs,
  totalMs
}
```

Do not include environment values or the encrypted payload.

- [ ] **Step 5: Run claim, fencing, and pool tests and verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-orchestrator-warm-pool.test.mjs tests/unit/workspace-warm-claim-lifecycle.test.mjs tests/unit/workspace-orchestrator-secret-fencing.test.mjs tests/unit/workspace-warm-foreground-cleanup.test.mjs tests/unit/workspace-warm-pool.test.mjs`

Expected: PASS with no container lifecycle calls on the healthy path.

- [ ] **Step 6: Commit hot ownership transfer**

```bash
git add apps/platform-api/src/workspace-orchestrator/orchestrator-provisioning.ts apps/platform-api/src/workspace-orchestrator/orchestrator.ts apps/platform-api/src/workspace-orchestrator/warm-pool.ts apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts tests/unit/workspace-orchestrator-warm-pool.test.mjs tests/unit/workspace-warm-claim-lifecycle.test.mjs tests/unit/workspace-orchestrator-secret-fencing.test.mjs tests/unit/workspace-warm-foreground-cleanup.test.mjs
git commit -m "feat(workspace): hand off running warm containers"
```

---

### Task 5: Make Recovery, Idle Wake, Archive, and Delete Physical-Key Safe

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-startup-recovery.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-cleanup.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/workspace-deletion.ts`
- Test: `tests/unit/workspace-orchestrator-resource-identity.test.mjs`
- Test: `tests/unit/workspace-orchestrator-resource-identity-cases.mjs`
- Test: `tests/unit/workspace-warm-startup-recovery.test.mjs`
- Test: `tests/unit/workspace-warm-recovery-publication.test.mjs`
- Test: `tests/unit/workspace-warm-recovery-deletion.test.mjs`
- Test: `tests/unit/workspace-delete.test.mjs`

**Interfaces:**
- Consumes: `workspaceContainerName(record)`, `workspacePreviewBase(record)`, and persisted `resourceKey`.
- Produces: every assigned-workspace lifecycle path locating the physical container consistently.

- [ ] **Step 1: Write failing lifecycle tests using a warm physical key**

For a runtime `{ projectId: "prj_alpha", resourceKey: "warm-resource-1" }`, prove:

```js
await orchestrator.wakeWorkspace("prj_alpha");
assert.equal(lastInspectedName, "evcp-ws-warm-resource-1");

await orchestrator.archiveWorkspace("prj_alpha");
assert.deepEqual(removedContainerIds, [warmContainerId]);

await orchestrator.deleteWorkspace("prj_alpha");
assert.ok(inspectedNames.includes("evcp-ws-warm-resource-1"));
assert.ok(removedVolumes.includes("evcp-ws-warm-resource-1-data"));
```

Update crash recovery to inspect the slot physical container and require its environment to contain
the slot physical preview base.

- [ ] **Step 2: Run lifecycle and recovery tests and verify logical-name assumptions fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-orchestrator-resource-identity.test.mjs tests/unit/workspace-warm-startup-recovery.test.mjs tests/unit/workspace-warm-recovery-publication.test.mjs tests/unit/workspace-warm-recovery-deletion.test.mjs tests/unit/workspace-delete.test.mjs`

Expected: FAIL at lookups for `evcp-ws-prj-alpha`.

- [ ] **Step 3: Replace logical container derivation with runtime location helpers**

Apply `workspaceContainerName(record)` to existing recovery, hydration health checks, wake, archive,
and delete. When recreating a missing assigned container after idle cleanup, preserve its physical
volume and start it with `EVCP_PREVIEW_BASE=workspacePreviewBase(record)`.

In `recoverOwnedWarmClaim()`, inspect `evcp-ws-${slot.resourceKey}`, verify the prepared secret bundle
against its environment, health-check it at the physical base, and persist the same container ID.

In `warm-pool-cleanup.ts`, remove `evcp-ws-${slot.resourceKey}` for claimed and anonymous slots;
never derive the container name from `claimProjectId`.

- [ ] **Step 4: Run lifecycle and recovery tests and verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-orchestrator-resource-identity.test.mjs tests/unit/workspace-warm-startup-recovery.test.mjs tests/unit/workspace-warm-recovery-publication.test.mjs tests/unit/workspace-warm-recovery-deletion.test.mjs tests/unit/workspace-delete.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit physical-key lifecycle support**

```bash
git add apps/platform-api/src/workspace-orchestrator/orchestrator.ts apps/platform-api/src/workspace-orchestrator/warm-pool-startup-recovery.ts apps/platform-api/src/workspace-orchestrator/warm-pool-cleanup.ts apps/platform-api/src/workspace-orchestrator/workspace-deletion.ts tests/unit/workspace-orchestrator-resource-identity.test.mjs tests/unit/workspace-orchestrator-resource-identity-cases.mjs tests/unit/workspace-warm-startup-recovery.test.mjs tests/unit/workspace-warm-recovery-publication.test.mjs tests/unit/workspace-warm-recovery-deletion.test.mjs tests/unit/workspace-delete.test.mjs
git commit -m "fix(workspace): use physical keys across runtime lifecycle"
```

---

### Task 6: Preserve Transferred Containers During Reconciliation

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-reconciliation.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-retirement.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-lifecycle.ts`
- Test: `tests/unit/workspace-orchestrator.test.mjs`
- Test: `tests/unit/workspace-warm-pool-reconciliation.test.mjs`
- Test: `tests/unit/workspace-warm-orphan-generation.test.mjs`
- Test: `tests/unit/workspace-runtime-cache-lifecycle.test.mjs`

**Interfaces:**
- Consumes: active runtime records and their physical resource keys.
- Produces: orphan cleanup where durable runtime ownership takes precedence over historical warm labels.

- [ ] **Step 1: Write failing ownership-precedence tests**

Create a warm-labelled container with no live warm-slot row but with a durable runtime record owning
the same resource key:

```js
const removed = await cleanupOrphanWorkspaceResources({
  docker,
  activeProjectIds: new Set(["prj_alpha"]),
  activeResourceKeys: new Set(["warm-resource-1"]),
  activeWarmSlotIds: new Set(),
  isWarmResourceOwned: async () => false
});
assert.deepEqual(removed, []);
```

Add the inverse case: with neither runtime nor slot ownership, the same warm-labelled container and
volume are removed.

- [ ] **Step 2: Run reconciliation tests and verify the transferred container is wrongly removed**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-orphan-generation.test.mjs tests/unit/workspace-runtime-cache-lifecycle.test.mjs`

Expected: FAIL because warm-label handling currently runs before active runtime-key handling.

- [ ] **Step 3: Make durable runtime ownership the first cleanup guard**

Before interpreting labels, parse the physical key from `evcp-ws-<key>` and preserve the container
when `activeResourceKeys.has(key)`. Apply the same ordering to volumes. Keep warm-slot ownership as
the second guard and remove only when neither owner exists.

During startup, retain the existing ordering:

```text
hydrate runtime records -> reconcile claims -> collect fresh durable runtime keys -> orphan cleanup
```

Ensure retirement treats an existing runtime record for the same resource key as completed transfer
and removes only the stale preparation/slot bookkeeping.

- [ ] **Step 4: Run reconciliation tests and verify both preservation and deletion pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-orphan-generation.test.mjs tests/unit/workspace-runtime-cache-lifecycle.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit reconciliation ownership precedence**

```bash
git add apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts apps/platform-api/src/workspace-orchestrator/warm-pool-reconciliation.ts apps/platform-api/src/workspace-orchestrator/warm-pool-retirement.ts apps/platform-api/src/workspace-orchestrator/warm-pool-lifecycle.ts tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-orphan-generation.test.mjs tests/unit/workspace-runtime-cache-lifecycle.test.mjs
git commit -m "fix(workspace): preserve runtime-owned warm resources"
```

---

### Task 7: Keep Warm Slots on the Active Release Image

**Files:**
- Modify: `apps/platform-api/src/system/system-update-service.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-reconciliation.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts`
- Test: `tests/unit/system-update-service.test.mjs`
- Test: `tests/unit/workspace-warm-pool-reconciliation.test.mjs`
- Test: `tests/unit/workspace-warm-pool-config.test.mjs`

**Interfaces:**
- Consumes: `SwarmServiceEngine.updateServiceEnv(serviceName, patch)`, configured `deps.image`, and Docker container inspection.
- Produces: platform updates that set `EVCP_VERSION` and `EVCP_WORKSPACE_IMAGE` consistently, plus reconciliation that drains only unclaimed mismatched-image slots.

- [ ] **Step 1: Write failing release consistency tests**

Extend the fake engine to capture environment updates and require the platform API update to carry:

```js
assert.deepEqual(engine.envUpdates.at(-1), {
  name: "evcp_platform-api",
  patch: {
    EVCP_VERSION: "v2",
    EVCP_WORKSPACE_IMAGE: "repo/evcp-workspace-next:v2"
  }
});
```

Add a reconciliation test with one ready `v1` container and configured image `v2`; assert the `v1`
slot is cleaned and a replacement `v2` slot is prepared. Add a claimed/runtime-owned `v1` case and
assert it is preserved.

- [ ] **Step 2: Run update and reconciliation tests and verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/system-update-service.test.mjs tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-pool-config.test.mjs`

Expected: FAIL because the updater changes only service images and reconciliation accepts stale warm images.

- [ ] **Step 3: Update platform image and environment in one Docker service version write**

Extend the engine with an atomic method rather than racing two independent updates:

```ts
updateService(
  serviceName: string,
  update: { image?: string; envPatch?: Record<string, string> }
): Promise<void>;
```

Implement it by inspecting the current service version and environment once, applying the image and
merged environment in a single Docker `/services/<id>/update?version=<index>` request. Keep
`updateServiceImage()` and `updateServiceEnv()` as thin wrappers for existing domain-management
callers.

Update platform API last with both its image and:

```ts
{
  EVCP_VERSION: targetTag,
  EVCP_WORKSPACE_IMAGE: `${repo}/evcp-workspace-next:${targetTag}`
}
```

- [ ] **Step 4: Drain stale unclaimed warm images**

During reconcile, inspect every `ready` or recoverable `preparing` container. When
`container.image !== deps.image` and no runtime record owns its resource key, acquire fenced cleanup,
destroy its resources, remove the row, and let `ensureCapacity()` replace it. Never drain `claiming`
or runtime-owned allocations.

Add `staleImage` to internal `WarmPoolStatus` counts so startup logging can report it without
exposing container details. Emit one sanitized warning when configured platform and workspace image
tags differ.

- [ ] **Step 5: Run update, Docker engine, and warm reconciliation tests**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/system-update-service.test.mjs tests/unit/domain-service.test.mjs tests/unit/workspace-docker-socket-engine.test.mjs tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-pool-config.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit active-release warm image handling**

```bash
git add apps/platform-api/src/system/system-update-service.ts apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts apps/platform-api/src/workspace-orchestrator/warm-pool-reconciliation.ts apps/platform-api/src/workspace-orchestrator/warm-pool.ts apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts tests/unit/system-update-service.test.mjs tests/unit/domain-service.test.mjs tests/unit/workspace-docker-socket-engine.test.mjs tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-pool-config.test.mjs
git commit -m "fix(release): align warm workspace image version"
```

---

### Task 8: End-to-End Regression and Live Warm-Claim Verification

**Files:**
- Modify: `tests/integration/workspace-warm-pool-live.test.mjs`
- Modify: `tests/integration/workspace-live-fixture.mjs`
- Modify: `tests/integration/workspace-compose-contract.test.mjs`
- Modify: `docs/runbooks/enable-real-workspace-provisioning.md`
- Modify: `docs/operations/swarm-deploy.md`

**Interfaces:**
- Consumes: all hot-handoff, routing, cleanup, and image-consistency behavior from Tasks 1–7.
- Produces: executable production acceptance coverage and operator verification commands.

- [ ] **Step 1: Write the failing live acceptance case**

Instrument the live fixture's Docker adapter to count foreground lifecycle calls after the slot is
ready:

```js
const prepared = await orchestrator.getWarmPoolStatus();
assert.equal(prepared.ready, 1);
const lifecycleBefore = dockerMetrics.snapshot();
const startedAt = performance.now();

const runtime = await orchestrator.provisionWorkspace({
  projectId: project.id,
  slug: project.slug
});

assert.equal(dockerMetrics.since(lifecycleBefore).createContainer, 0);
assert.equal(dockerMetrics.since(lifecycleBefore).startContainer, 0);
assert.ok(performance.now() - startedAt < 3000);
assert.equal((await docker.inspectContainer(`evcp-ws-${runtime.resourceKey}`))?.running, true);
```

Then authorize `/preview/<runtime.resourceKey>`, request `/api/health`, edit a file, run a workspace
command, stop/wake the runtime, and delete it. Verify each operation uses the same container until
deletion.

- [ ] **Step 2: Run the integration case in contract mode and verify the old lifecycle fails**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/integration/workspace-warm-pool-live.test.mjs tests/integration/workspace-compose-contract.test.mjs`

Expected before the final implementation is complete: FAIL on foreground lifecycle count or physical preview routing. After Tasks 1–7: PASS or explicit environment-gated skip for the real Docker case.

- [ ] **Step 3: Document operational verification and rollback**

Add commands that report only non-secret state:

```bash
docker service inspect evcp_platform-api --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep '^EVCP_WORKSPACE_'
docker ps --filter label=evcp.managed=true --format '{{.Names}} {{.Image}} {{.Status}}'
```

Document acceptance: three ready matching-image slots, one project creation with no new foreground
container, usable preview within three seconds, asynchronous refill back to three, and
`EVCP_WORKSPACE_WARM_POOL_SIZE=0` as rollback.

- [ ] **Step 4: Run the complete local verification suite**

Run: `pnpm check:changed`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

Run: `pnpm test:unit`

Expected: all tests pass with only documented skips.

Run: `pnpm verify:workspace`

Expected: all workspace contract and integration tests pass with live-only tests skipped unless their explicit environment flags are set.

- [ ] **Step 5: Run the real Docker acceptance test**

Run: `EVCP_WARM_POOL_LIVE=1 EVCP_WORKSPACE_REAL_ADAPTERS=1 node --import tsx --test tests/integration/workspace-warm-pool-live.test.mjs`

Expected: PASS with a ready slot claimed, zero foreground container create/start calls, preview healthy in less than 3000 ms, refill observed, and cleanup complete.

- [ ] **Step 6: Commit integration coverage and runbook**

```bash
git add tests/integration/workspace-warm-pool-live.test.mjs tests/integration/workspace-live-fixture.mjs tests/integration/workspace-compose-contract.test.mjs docs/runbooks/enable-real-workspace-provisioning.md docs/operations/swarm-deploy.md
git commit -m "test(workspace): verify true hot handoff end to end"
```

---

## Final Production Acceptance

- [ ] Build and publish a new release tag containing all implementation commits.
- [ ] Update the production Swarm stack so platform API and `EVCP_WORKSPACE_IMAGE` use that tag.
- [ ] Verify three ready slots run the matching workspace image.
- [ ] Create a disposable project through `https://dash.gethorizon.org/creator` and record the time from submit to authorized preview.
- [ ] Verify the claimed container ID existed before project creation and did not restart during claim.
- [ ] Send a Creator prompt, edit a file, run a command, refresh preview, stop/wake the workspace, and publish a test build.
- [ ] Verify asynchronous refill returns the pool to three ready slots.
- [ ] Delete the disposable project and verify its physical container, volume, schema, bucket, identity, and LiteLLM key are removed.
- [ ] Confirm no credentials or encrypted payloads appear in service logs or audit metadata.
