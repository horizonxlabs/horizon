# Workspace Warm Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintain a configurable pool of three fully prepared workspace slots so a new project receives an isolated, healthy workspace without waiting for external resource provisioning.

**Architecture:** A PostgreSQL-backed warm-pool manager prepares anonymous resource bundles and claims them with a cross-process atomic state transition. `provisionWorkspace()` converts a claimed warm container into a project-specific container using the already initialized volume and prepared credentials, while retaining the existing cold path as an immediate fallback. Persisted physical resource keys keep recovery and deletion correct after a warm allocation.

**Tech Stack:** TypeScript, Node.js 22, NestJS, Prisma/PostgreSQL, Docker Engine HTTP API, MinIO, LiteLLM, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-05-workspace-warm-pool-design.md`

## Global Constraints

- `EVCP_WORKSPACE_WARM_POOL_SIZE` defaults to `3` in real-adapter mode, is disabled with `0`, and has a hard maximum of `20`.
- Memory/test mode creates no background pool unless a test explicitly injects a pool.
- A ready slot is claimed at most once across concurrent processes.
- A claimed slot is never recycled for another project; project deletion destroys its resources.
- No ready slot means immediate cold provisioning, with no wait for replenishment.
- Credentials remain encrypted at rest and never enter logs, API responses, Docker labels, or audit metadata.
- Logical project keys continue to drive container names and preview paths; persisted physical resource keys drive schema, bucket, volume, and key cleanup.
- Existing cold provisioning, preview, recovery, idle, archive, generation, publish, and deletion behavior must remain compatible.

## File Structure

- `apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts`: pure environment parsing.
- `apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts`: slot, claim, store, and manager contracts.
- `apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts`: AES-256-GCM slot credential envelope.
- `apps/platform-api/src/persistence/workspace-warm-slot-repository.ts`: Prisma persistence and atomic claim.
- `apps/platform-api/src/workspace-orchestrator/warm-pool.ts`: capacity, preparation, claim completion/failure, cleanup, and reconciliation.
- `apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts`: unreferenced periodic refill timer.
- Existing orchestrator files retain project lifecycle responsibilities and consume the new pool through its public interface.

---

### Task 1: Configuration and Physical Resource Identity

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts`
- Modify: `packages/types/src/index.ts:63-75`
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts:20-390`
- Modify: `apps/platform-api/src/workspace-orchestrator/workspace-deletion.ts:1-70`
- Test: `tests/unit/workspace-warm-pool-config.test.mjs`
- Test: `tests/unit/workspace-orchestrator.test.mjs`
- Test: `tests/unit/workspace-delete.test.mjs`

**Interfaces:**

- Produces: `resolveWorkspaceWarmPoolSize(env, mode): number`.
- Produces: optional `WorkspaceContainerRecord.resourceKey` for wire compatibility, with `physicalResourceKey(record): string` as the internal fallback boundary.

- [ ] **Step 1: Write failing configuration and lifecycle tests**

```js
test("real mode defaults the warm pool to three", () => {
  assert.equal(resolveWorkspaceWarmPoolSize({}, "real"), 3);
});

test("memory mode defaults the warm pool to zero", () => {
  assert.equal(resolveWorkspaceWarmPoolSize({}, "memory"), 0);
});

for (const value of ["-1", "1.5", "twenty-one", "21"]) {
  test(`rejects invalid warm pool size ${value}`, () => {
    assert.throws(
      () => resolveWorkspaceWarmPoolSize({ EVCP_WORKSPACE_WARM_POOL_SIZE: value }, "real"),
      /EVCP_WORKSPACE_WARM_POOL_SIZE/
    );
  });
}

test("delete uses a persisted physical resource key", async () => {
  const record = { ...runningRecord, resourceKey: "warm-slot-abc" };
  await deleteWorkspaceResources({ record, deps, llmGatewayKeyId: "key-1" });
  assert.deepEqual(releasedSchemas, ["warm-slot-abc"]);
  assert.deepEqual(removedVolumes, ["evcp-ws-warm-slot-abc-data"]);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --import tsx --test tests/unit/workspace-warm-pool-config.test.mjs tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-delete.test.mjs`

Expected: FAIL because the config resolver, physical-key helper, and record field do not exist.

- [ ] **Step 3: Implement strict config parsing and the compatibility helper**

```ts
export function resolveWorkspaceWarmPoolSize(
  env: Record<string, string | undefined>,
  mode: "memory" | "real"
): number {
  const raw = env.EVCP_WORKSPACE_WARM_POOL_SIZE;
  if (raw === undefined || raw === "") return mode === "real" ? 3 : 0;
  if (!/^\d+$/.test(raw))
    throw new Error("EVCP_WORKSPACE_WARM_POOL_SIZE must be an integer from 0 to 20");
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size > 20) {
    throw new Error("EVCP_WORKSPACE_WARM_POOL_SIZE must be an integer from 0 to 20");
  }
  return size;
}

export function physicalResourceKey(record: WorkspaceContainerRecord): string {
  return record.resourceKey ?? resourceKeyForProject(record.projectId);
}
```

Add `resourceKey?: string` to the shared record so older clients and fixtures remain source-compatible. Set it on every new orchestrator record and use `physicalResourceKey()` in recovery, archive, and deletion resource operations.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --import tsx --test tests/unit/workspace-warm-pool-config.test.mjs tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-delete.test.mjs && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the configuration and resource identity boundary**

```bash
git add packages/types/src/index.ts apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts apps/platform-api/src/workspace-orchestrator/orchestrator.ts apps/platform-api/src/workspace-orchestrator/workspace-deletion.ts tests/unit/workspace-warm-pool-config.test.mjs tests/unit/workspace-orchestrator.test.mjs tests/unit/workspace-delete.test.mjs
git commit -m "feat(workspace): add warm pool configuration and resource identity"
```

---

### Task 2: Durable Warm-Slot Store and Encrypted Credential Envelope

**Files:**

- Create: `apps/platform-api/prisma/migrations/20260905000000_workspace_warm_pool/migration.sql`
- Modify: `apps/platform-api/prisma/schema.prisma:771-790`
- Create: `apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts`
- Create: `apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts`
- Create: `apps/platform-api/src/persistence/workspace-warm-slot-repository.ts`
- Test: `tests/unit/workspace-warm-slot-repository.test.mjs`
- Test: `tests/unit/workspace-warm-pool-secret-codec.test.mjs`

**Interfaces:**

- Produces: `WarmWorkspaceSlot`, `WarmWorkspaceAllocation`, and `WorkspaceWarmSlotStore`.
- Produces: `createWarmPoolSecretCodec(keyHex)` with `seal(env)` and `open(payload)`.
- Produces: `createPrismaWorkspaceWarmSlotStore(databaseUrl)`.
- Consumes: configuration and physical-key semantics from Task 1.

- [ ] **Step 1: Write failing codec and atomic-store tests**

```js
test("credential envelopes round-trip without plaintext", () => {
  const codec = createWarmPoolSecretCodec("1".repeat(64));
  const payload = codec.seal({ DATABASE_URL: "postgresql://secret", LLM_GATEWAY_KEY: "sk-secret" });
  assert.doesNotMatch(payload, /postgresql|sk-secret/);
  assert.deepEqual(codec.open(payload), {
    DATABASE_URL: "postgresql://secret",
    LLM_GATEWAY_KEY: "sk-secret"
  });
});

test("two concurrent claims cannot acquire the same ready slot", async () => {
  await store.createPreparing(slotFixture);
  await store.markReady(slotFixture.id, readyPatch);
  const claims = await Promise.all([store.claim("prj_a"), store.claim("prj_b")]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(new Set(claims.filter(Boolean).map((slot) => slot.id)).size, 1);
});
```

The repository test uses a deterministic fake persistence client that simulates compare-and-swap contention. Add a Prisma schema contract assertion for the unique `resourceKey` and indexed `state` fields.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/unit/workspace-warm-slot-repository.test.mjs tests/unit/workspace-warm-pool-secret-codec.test.mjs`

Expected: FAIL on missing modules.

- [ ] **Step 3: Add schema, migration, types, and codec**

```prisma
model WorkspaceWarmSlot {
  id              String   @id
  resourceKey     String   @unique @map("resource_key")
  state           String
  containerId     String?  @map("container_id")
  llmGatewayKeyId String?  @map("llm_gateway_key_id")
  secretPayload   String?  @map("secret_payload")
  claimProjectId  String?  @unique @map("claim_project_id")
  lastError       String?  @map("last_error")
  retryAfter      DateTime? @map("retry_after")
  failureCount    Int      @default(0) @map("failure_count")
  readyAt         DateTime? @map("ready_at")
  claimedAt       DateTime? @map("claimed_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([state, createdAt])
  @@map("workspace_warm_slots")
}
```

Also add a non-null `resourceKey` column to `WorkspaceRuntimeRecord`; migration SQL backfills it with `replace(project_id, '_', '-')` before applying `NOT NULL`.

Define the stable store contract:

```ts
export type WarmWorkspaceSlotState = "preparing" | "ready" | "claiming" | "failed";

export interface WarmWorkspaceSlot {
  id: string;
  resourceKey: string;
  state: WarmWorkspaceSlotState;
  containerId: string | null;
  llmGatewayKeyId: string | null;
  secretPayload: string | null;
  claimProjectId: string | null;
  lastError: string | null;
  retryAfter: string | null;
  failureCount: number;
  readyAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceWarmSlotStore {
  list(): Promise<WarmWorkspaceSlot[]>;
  createPreparing(slot: Pick<WarmWorkspaceSlot, "id" | "resourceKey">): Promise<WarmWorkspaceSlot>;
  markReady(
    id: string,
    patch: { containerId: string; llmGatewayKeyId: string; secretPayload: string }
  ): Promise<void>;
  markFailed(
    id: string,
    patch: { lastError: string; retryAfter: string; failureCount: number }
  ): Promise<void>;
  claim(projectId: string): Promise<WarmWorkspaceSlot | null>;
  remove(id: string): Promise<void>;
}
```

Implement `claim()` as a PostgreSQL transaction using `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`, followed by an update to `claiming`. The fake client implementation uses an equivalent atomic compare-and-swap seam for unit tests.

- [ ] **Step 4: Generate Prisma client and run tests**

Run: `pnpm --filter @evcp/platform-api exec prisma generate --schema prisma/schema.prisma && node --import tsx --test tests/unit/workspace-warm-slot-repository.test.mjs tests/unit/workspace-warm-pool-secret-codec.test.mjs && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit persistence and encryption**

```bash
git add apps/platform-api/prisma apps/platform-api/src/persistence/workspace-warm-slot-repository.ts apps/platform-api/src/workspace-orchestrator/warm-pool-types.ts apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts tests/unit/workspace-warm-slot-repository.test.mjs tests/unit/workspace-warm-pool-secret-codec.test.mjs
git commit -m "feat(workspace): persist encrypted warm workspace slots"
```

---

### Task 3: Warm-Slot Preparation and Capacity Management

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/warm-pool.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-engine.ts:4-67`
- Modify: `apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts:1-105`
- Test: `tests/unit/workspace-warm-pool.test.mjs`

**Interfaces:**

- Consumes: `WorkspaceWarmSlotStore`, secret codec, `WorkspaceOrchestratorDeps`, and container-spec helpers.
- Produces: `WorkspaceWarmPool` with `ensureCapacity`, `claim`, `completeClaim`, `failClaim`, and `reconcile`.
- Produces: `buildWarmContainerSpec()` and warm resource/container label helpers.

- [ ] **Step 1: Write failing capacity and preparation tests**

```js
test("ensureCapacity prepares exactly the missing slots", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3, readySlots: 1 });
  await fixture.pool.ensureCapacity();
  assert.equal((await fixture.store.list()).filter((slot) => slot.state === "ready").length, 3);
  assert.equal(
    fixture.docker.state.containers.filter((item) => item.status === "running").length,
    2
  );
});

test("parallel ensureCapacity calls collapse into one preparation pass", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 3 });
  await Promise.all([fixture.pool.ensureCapacity(), fixture.pool.ensureCapacity()]);
  assert.equal((await fixture.store.list()).length, 3);
});

test("a slot is ready only after preview health succeeds", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  assert.equal((await fixture.store.list())[0].state, "failed");
  assert.equal(fixture.revokedKeys.length, 1);
  assert.equal(fixture.releasedSchemas.length, 1);
});

test("preparation failure applies bounded exponential retry", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  await fixture.pool.ensureCapacity();
  assert.equal(fixture.prepareAttempts, 1);
  assert.match((await fixture.store.list())[0].retryAfter, /T/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --import tsx --test tests/unit/workspace-warm-pool.test.mjs`

Expected: FAIL because `createWorkspaceWarmPool` is missing.

- [ ] **Step 3: Implement minimal preparation, single-flight capacity, and rollback**

```ts
export interface WorkspaceWarmPool {
  ensureCapacity(): Promise<void>;
  claim(projectId: string): Promise<WarmWorkspaceAllocation | null>;
  completeClaim(slotId: string): Promise<void>;
  failClaim(slotId: string, error: unknown): Promise<void>;
  reconcile(): Promise<void>;
}

export interface WarmWorkspaceAllocation {
  slotId: string;
  resourceKey: string;
  containerId: string;
  llmGatewayKeyId: string;
  env: Record<string, string>;
}
```

Implement `prepareOne()` with `provisionIndependentWorkspaceResources()`, `persistWorkspaceSecrets`-equivalent envelope sealing, `buildDevContainerSpec()` without a project ID, warm labels `evcp.kind=workspace-warm` and `evcp.warm-slot-id=<id>`, container startup, and `waitForPreviewReady()`. Keep one `inFlightEnsure` promise per manager and reserve `preparing` rows before external calls so concurrent processes count the same capacity.

On preparation failure, persist `failureCount` and `retryAfter` using exponential delays of
`min(5 seconds * 2^(failureCount - 1), 5 minutes)`. Capacity reconciliation must not replace a
failed row before `retryAfter`; after the deadline it cleans/removes that row and reserves one
replacement. Emit `workspace.pool_prepare_started`, `workspace.pool_ready`, and
`workspace.pool_prepare_failed` with slot ID, duration, counts, and sanitized error category only.

- [ ] **Step 4: Run focused and existing orchestrator tests**

Run: `node --import tsx --test tests/unit/workspace-warm-pool.test.mjs tests/unit/workspace-orchestrator-parallel-provisioning.test.mjs tests/unit/workspace-orchestrator.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit pool preparation**

```bash
git add apps/platform-api/src/workspace-orchestrator/warm-pool.ts apps/platform-api/src/workspace-orchestrator/docker-engine.ts apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts tests/unit/workspace-warm-pool.test.mjs
git commit -m "feat(workspace): prepare healthy warm workspace capacity"
```

---

### Task 4: Atomic Claim, Fast Handoff, and Cold Fallback

**Files:**

- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator-types.ts:10-28`
- Modify: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts:20-390`
- Modify: `apps/platform-api/src/persistence/workspace-runtime-repository.ts:1-65`
- Test: `tests/unit/workspace-warm-pool.test.mjs`
- Test: `tests/unit/workspace-orchestrator-warm-pool.test.mjs`
- Test: `tests/unit/workspace-orchestrator-parallel-provisioning.test.mjs`

**Interfaces:**

- Consumes: the `WorkspaceWarmPool` and physical-resource identity from Tasks 1–3.
- Produces: `WorkspaceOrchestratorDeps.warmPool?: WorkspaceWarmPool`.
- Preserves: `provisionWorkspace({ projectId, slug }): Promise<WorkspaceContainerRecord>`.

- [ ] **Step 1: Write failing handoff, fallback, and cleanup tests**

```js
test("provisionWorkspace claims a ready allocation before cold resources", async () => {
  const fixture = createWarmOrchestratorFixture({ readySlots: 1 });
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_new",
    slug: "new"
  });
  assert.equal(record.state, "running");
  assert.equal(record.resourceKey, fixture.slot.resourceKey);
  assert.equal(fixture.coldProvisionCalls, 0);
  assert.equal(fixture.finalContainer.spec.name, "evcp-ws-prj-new");
  assert.ok(
    fixture.finalContainer.spec.hostConfig.Mounts.some(
      (mount) => mount.Source === `evcp-ws-${fixture.slot.resourceKey}-data`
    )
  );
});

test("an empty pool falls back to cold provisioning immediately", async () => {
  const fixture = createWarmOrchestratorFixture({ readySlots: 0 });
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_cold",
    slug: "cold"
  });
  assert.equal(record.resourceKey, "prj-cold");
  assert.equal(fixture.coldProvisionCalls, 1);
});

test("a failed handoff destroys the claim and falls back cold", async () => {
  const fixture = createWarmOrchestratorFixture({ readySlots: 1, failFinalStart: true });
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_retry",
    slug: "retry"
  });
  assert.equal(record.resourceKey, "prj-retry");
  assert.deepEqual(fixture.cleanedResourceKeys, [fixture.slot.resourceKey]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/unit/workspace-orchestrator-warm-pool.test.mjs tests/unit/workspace-warm-pool.test.mjs`

Expected: FAIL because the orchestrator does not consume warm allocations.

- [ ] **Step 3: Implement the fast handoff**

In `provisionWorkspace()`, keep existing persisted-workspace recovery first. For a new workspace:

```ts
const allocation = await deps.warmPool?.claim(input.projectId);
if (allocation) {
  try {
    return await provisionClaimedWorkspace(input, allocation);
  } catch (error) {
    await deps.warmPool!.failClaim(allocation.slotId, error);
    audit({
      action: "workspace.pool_claim_failed",
      projectId: input.projectId,
      metadata: { slotId: allocation.slotId }
    });
  }
} else if (deps.warmPool) {
  audit({ action: "workspace.pool_cold_fallback", projectId: input.projectId });
}
return provisionColdWorkspace(input);
```

`provisionClaimedWorkspace()` must stop/remove the anonymous container, create the final logical-name container with `resourceKey` only for the volume mount, use `/preview/<logical-project-key>`, start and health-check it, persist project secrets and runtime state, then call `completeClaim()`. Its rollback removes the final container, project secret copies, and every slot-owned physical resource before cold fallback. Trigger `void warmPool.ensureCapacity().catch(...)` only after claim completion/failure; never await refill on the request path.

Emit `workspace.pool_claimed` after durable runtime ownership, `workspace.pool_claim_failed` after a
quarantined handoff, and `workspace.pool_cold_fallback` when selection returns no ready slot. Tests
must assert the event names and verify that event metadata contains no values from the decrypted
credential envelope.

Add an in-process `Map<string, Promise<WorkspaceContainerRecord>>` so simultaneous provision calls for one project share one promise. Keep database uniqueness as cross-process protection.

- [ ] **Step 4: Run workspace tests and typecheck**

Run: `pnpm verify:workspace && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit claim and fallback behavior**

```bash
git add apps/platform-api/src/workspace-orchestrator/warm-pool.ts apps/platform-api/src/workspace-orchestrator/orchestrator-types.ts apps/platform-api/src/workspace-orchestrator/orchestrator.ts apps/platform-api/src/persistence/workspace-runtime-repository.ts tests/unit/workspace-warm-pool.test.mjs tests/unit/workspace-orchestrator-warm-pool.test.mjs tests/unit/workspace-orchestrator-parallel-provisioning.test.mjs
git commit -m "feat(workspace): claim warm slots with cold fallback"
```

---

### Task 5: Restart Reconciliation, Orphan Safety, and Periodic Refill

**Files:**

- Modify: `apps/platform-api/src/workspace-orchestrator/warm-pool.ts`
- Create: `apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts:45-105`
- Modify: `apps/platform-api/src/workspace-orchestrator/factory.ts:20-130`
- Modify: `apps/platform-api/src/app-factory.ts:120-175,3309-3325`
- Modify: `apps/platform-api/src/main.ts:20-55`
- Test: `tests/unit/workspace-warm-pool-reconciliation.test.mjs`
- Test: `tests/unit/workspace-warm-pool-sweep.test.mjs`
- Test: `tests/unit/workspace-orchestrator.test.mjs`

**Interfaces:**

- Consumes: durable store, pool manager, config resolver, Docker inventory, and runtime store.
- Produces: `startWarmPoolSweep(pool, { intervalMs? }): { stop(): void }`.
- Produces: orchestrator methods `reconcileWarmPool()`, `ensureWarmPoolCapacity()`, and
  `getWarmPoolStatus(): Promise<{ target: number; preparing: number; ready: number; claiming: number; failed: number }>`
  for application startup, lifecycle wiring, and operational checks.

- [ ] **Step 1: Write failing restart and timer tests**

```js
test("reconcile preserves a durable healthy ready slot", async () => {
  const fixture = createReconcileFixture({ slotState: "ready", containerRunning: true });
  await fixture.pool.reconcile();
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal((await fixture.store.list())[0].state, "ready");
});

test("reconcile completes a claim when the runtime record owns its resource key", async () => {
  const fixture = createReconcileFixture({ slotState: "claiming", runtimeOwnsSlot: true });
  await fixture.pool.reconcile();
  assert.equal((await fixture.store.list()).length, 0);
  assert.deepEqual(fixture.cleanedResourceKeys, []);
});

test("orphan cleanup does not remove a durable warm slot", async () => {
  const removed = await cleanupOrphanWorkspaceResources({
    docker,
    activeProjectIds: new Set(),
    activeWarmSlotIds: new Set(["slot-1"])
  });
  assert.deepEqual(removed, []);
});
```

The sweep test injects a short fake timer seam or fake pool, asserts overlapping ticks do not overlap `ensureCapacity()`, and asserts `stop()` prevents later calls.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-pool-sweep.test.mjs tests/unit/workspace-orchestrator.test.mjs`

Expected: FAIL on missing reconciliation and sweep behavior.

- [ ] **Step 3: Implement reconciliation and application lifecycle wiring**

Reconciliation rules:

```ts
switch (slot.state) {
  case "ready":
    // Preserve only when the labeled container is running and health succeeds; otherwise clean.
    break;
  case "claiming":
    // Remove the slot row without cleanup when a runtime record owns slot.resourceKey.
    // Otherwise clean stale external resources and remove the row.
    break;
  case "preparing":
  case "failed":
    // Clean idempotently, remove the row, and let ensureCapacity replace it.
    break;
}
```

Emit `workspace.pool_reconciled` once per pass with aggregate state counts and cleanup totals; never
include per-slot credentials or decrypted environment values.

Construct the real pool in `createDefaultWorkspaceOrchestrator()` using the Prisma warm-slot store and the same resolved encryption key. In `createRuntimePlatformApiServices()`, hydrate runtime records, reconcile the warm pool, run project-orphan cleanup with active slot IDs, then launch non-blocking capacity fill. Start the refill sweep beside the idle sweep and retain both handles so `app.close()` stops them.

Expose only aggregate slot counts through `getWarmPoolStatus()`; do not return slot IDs, resource
keys, container IDs, or secret payloads from this operational seam.

- [ ] **Step 4: Run focused tests, workspace verification, and typecheck**

Run: `node --import tsx --test tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-pool-sweep.test.mjs && pnpm verify:workspace && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit reconciliation and refill lifecycle**

```bash
git add apps/platform-api/src/workspace-orchestrator/warm-pool.ts apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts apps/platform-api/src/workspace-orchestrator/factory.ts apps/platform-api/src/app-factory.ts apps/platform-api/src/main.ts tests/unit/workspace-warm-pool-reconciliation.test.mjs tests/unit/workspace-warm-pool-sweep.test.mjs tests/unit/workspace-orchestrator.test.mjs
git commit -m "feat(workspace): reconcile and refill warm workspace slots"
```

---

### Task 6: Deployment Configuration and Operational Documentation

**Files:**

- Modify: `docker/docker-compose.yml:140-165`
- Modify: `docker/docker-compose.release.yml:260-285`
- Modify: `.env.example:70-90`
- Modify: `docs/runbooks/enable-real-workspace-provisioning.md`
- Test: `tests/integration/workspace-compose-contract.test.mjs`
- Test: `tests/integration/install-contract.test.mjs`

**Interfaces:**

- Consumes: `EVCP_WORKSPACE_WARM_POOL_SIZE` parser and startup behavior.
- Produces: operator-visible configuration and disable/rollback instructions.

- [ ] **Step 1: Write failing Compose and install contract assertions**

```js
test("real workspace deployments configure a three-slot warm pool", () => {
  const dev = parse(readFileSync("docker/docker-compose.yml", "utf8"));
  const release = parse(readFileSync("docker/docker-compose.release.yml", "utf8"));
  assert.equal(
    dev.services["platform-api"].environment.EVCP_WORKSPACE_WARM_POOL_SIZE,
    "${EVCP_WORKSPACE_WARM_POOL_SIZE:-3}"
  );
  assert.equal(
    release.services["platform-api"].environment.EVCP_WORKSPACE_WARM_POOL_SIZE,
    "${EVCP_WORKSPACE_WARM_POOL_SIZE:-3}"
  );
});
```

- [ ] **Step 2: Run contract tests and verify RED**

Run: `node --test tests/integration/workspace-compose-contract.test.mjs tests/integration/install-contract.test.mjs`

Expected: FAIL because the environment variable is absent.

- [ ] **Step 3: Add Compose configuration and runbook procedures**

Add this environment entry to both platform API definitions:

```yaml
EVCP_WORKSPACE_WARM_POOL_SIZE: ${EVCP_WORKSPACE_WARM_POOL_SIZE:-3}
```

Document:

- default and maximum values;
- capacity impact from three running workspace processes;
- `0` as the operational disable switch;
- SQL/Docker observations for counts by slot state;
- successful claim and cold-fallback audit events; and
- post-deploy smoke checks for creation, preview, generation, publish, and deletion.

- [ ] **Step 4: Run install contracts and changed-file quality checks**

Run: `node --test tests/integration/workspace-compose-contract.test.mjs tests/integration/install-contract.test.mjs && pnpm check:changed`

Expected: PASS.

- [ ] **Step 5: Commit deployment configuration**

```bash
git add docker/docker-compose.yml docker/docker-compose.release.yml .env.example docs/runbooks/enable-real-workspace-provisioning.md tests/integration/workspace-compose-contract.test.mjs tests/integration/install-contract.test.mjs
git commit -m "ops(workspace): configure warm pool capacity"
```

---

### Task 7: Live Path Verification and Full Regression Gate

**Files:**

- Modify: `tests/integration/provision-full-live.test.mjs`
- Create: `tests/integration/workspace-warm-pool-live.test.mjs`
- Modify: `docs/runbooks/enable-real-workspace-provisioning.md`

**Interfaces:**

- Consumes: complete warm-pool implementation and real adapters.
- Produces: live evidence that a ready slot removes external provisioning from the request path.

- [ ] **Step 1: Add the opt-in live test**

```js
test(
  "a prepared slot is claimed by a new project and refilled",
  { skip: process.env.EVCP_WARM_POOL_LIVE !== "1" },
  async () => {
    await orchestrator.ensureWarmPoolCapacity();
    const before = await orchestrator.getWarmPoolStatus();
    assert.equal(before.ready, 1);

    const record = await orchestrator.provisionWorkspace({ projectId, slug: projectId });
    assert.equal(record.state, "running");
    assert.notEqual(record.resourceKey, resourceKeyForProject(projectId));
    assert.ok(record.containerId);

    const preview = await docker.execInContainer(record.containerId, [
      "curl",
      "-fsS",
      `http://127.0.0.1:3000/preview/${resourceKeyForProject(projectId)}/api/health`
    ]);
    assert.equal(preview.exitCode, 0);
  }
);
```

Instrument the test doubles or live provisioners so the claim request asserts no new schema,
bucket, or LiteLLM key creation occurred after the ready-slot checkpoint. Always delete the project
workspace and remaining anonymous slots in `after()` cleanup.

- [ ] **Step 2: Run the new test without opt-in and verify safe skip**

Run: `node --import tsx --test tests/integration/workspace-warm-pool-live.test.mjs`

Expected: one skipped test and exit code 0.

- [ ] **Step 3: Run the complete local regression gate**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm check:changed`

Expected: PASS; build may show only already documented external font-resolution warnings.

- [ ] **Step 4: Run the opt-in real-adapter smoke test where Docker/PostgreSQL/MinIO/LiteLLM are available**

Run: `EVCP_WARM_POOL_LIVE=1 EVCP_WORKSPACE_REAL_ADAPTERS=1 node --import tsx --test tests/integration/workspace-warm-pool-live.test.mjs`

Expected: PASS with one ready slot claimed, project preview healthy, pool refill observable, and cleanup complete.

- [ ] **Step 5: Commit live verification**

```bash
git add tests/integration/provision-full-live.test.mjs tests/integration/workspace-warm-pool-live.test.mjs docs/runbooks/enable-real-workspace-provisioning.md
git commit -m "test(workspace): verify warm pool allocation end to end"
```

---

### Task 8: Final Review and Release Readiness

**Files:**

- Review: all files changed since `2dbaa0df`

**Interfaces:**

- Consumes: Tasks 1–7.
- Produces: a reviewable branch with verified migration, rollback switch, and deployment evidence.

- [ ] **Step 1: Inspect the complete diff and migration ordering**

Run: `git diff --check 2dbaa0df..HEAD && git diff --stat 2dbaa0df..HEAD && git log --oneline 2dbaa0df..HEAD`

Expected: no whitespace errors; one focused commit per task; migration timestamp sorts after `20260827010000_app_store_registry_subdomain`.

- [ ] **Step 2: Verify spec coverage explicitly**

Run: `rg -n "EVCP_WORKSPACE_WARM_POOL_SIZE|workspace.pool_|resourceKey|claim\(|ensureCapacity|reconcile" apps/platform-api packages/types docker tests docs/runbooks`

Expected: configuration, events, physical ownership, claim, capacity, reconciliation, tests, and operator documentation are all represented.

- [ ] **Step 3: Run final clean-tree verification**

Run: `pnpm check:ci && git status --short`

Expected: quality gate PASS and no uncommitted files.

- [ ] **Step 4: Record deployment checks in the pull-request description**

Use this exact checklist:

```markdown
- [ ] Prisma migration applied successfully
- [ ] Three warm slots reach `ready`
- [ ] New project claims a slot and preview becomes healthy
- [ ] Pool refills to three without blocking the request
- [ ] Fourth concurrent project falls back cold when capacity is exhausted
- [ ] Generation and publish succeed from a warm allocation
- [ ] Project deletion removes the assigned physical resources
- [ ] `EVCP_WORKSPACE_WARM_POOL_SIZE=0` disables new slot creation
```

- [ ] **Step 5: Commit any review-only corrections and stop before merge/deploy**

If review changes were required, stage only those exact files and commit with:

```bash
git commit -m "fix(workspace): address warm pool verification findings"
```

Expected: the branch is ready for PR review; merging and production deployment require the user's explicit request.
