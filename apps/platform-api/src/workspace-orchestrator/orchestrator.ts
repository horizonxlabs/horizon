import type { WorkspaceContainerRecord } from "@evcp/types";
import { assertTransition } from "./state";
import { schemaNameFor, roleNameFor } from "./postgres-provisioner";
import { resourceKeyForProject } from "./resource-ports";
import { buildDevContainerSpec } from "./docker-engine";
import type { WorkspaceAuditEvent, WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";
import {
  waitForPreviewReady,
  workspaceSecretEntries,
  workspaceVolumeLabels,
  workspaceVolumeName
} from "./workspace-lifecycle";
import { createWorkspaceDeletion } from "./workspace-deletion";
import { physicalResourceKey } from "./warm-pool-config";
import { workspaceContainerName } from "./runtime-location";
import { createWorkspaceProvisioning } from "./orchestrator-provisioning";
import { WarmWorkspaceClaimRollbackError } from "./warm-pool-types";
import { createProvisioningLeaseCoordinator } from "./provisioning-lease";
import { createWarmPoolLifecycle } from "./warm-pool-lifecycle";
import { createWorkspaceRuntimeCache } from "./runtime-cache";
import { runWorkspaceProjectDeletion } from "./project-deletion-ownership";

export type { WorkspaceAuditEvent, WorkspaceOrchestratorDeps } from "./orchestrator-types";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function createWorkspaceOrchestrator(deps: WorkspaceOrchestratorDeps) {
  const image = deps.image ?? "evcp/workspace-next:1";
  const network = deps.network ?? process.env.EVCP_WORKSPACE_NETWORK ?? "evcp-internal";
  const cpuCores = deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1);
  const memoryMb = deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048);
  const databaseName = deps.databaseName ?? "evcp";
  const postgresHost = deps.postgresHost ?? "postgres:5432";
  const s3Endpoint = deps.s3Endpoint ?? "http://minio:9000";
  const audit = (event: WorkspaceAuditEvent) => deps.onAudit?.(event);

  const cache = createWorkspaceRuntimeCache();
  const records = cache.records;
  const llmKeyIds = new Map<string, string>();
  const provisioning = new Map<string, Promise<WorkspaceContainerRecord>>();
  let runtimeRecords = deps.runtimeRecords;
  const leases = createProvisioningLeaseCoordinator(() => runtimeRecords, deps.docker);

  const now = () => new Date().toISOString();
  const save = (record: WorkspaceContainerRecord): WorkspaceContainerRecord => {
    const next = { ...record, updatedAt: now() };
    cache.set(next);
    return next;
  };

  const persist = async (record: WorkspaceContainerRecord): Promise<void> => {
    await leases.persist({ record, llmGatewayKeyId: llmKeyIds.get(record.projectId) });
  };

  const buildWorkspaceSpec = async (projectId: string, logicalKey: string, physicalKey: string) =>
    buildDevContainerSpec({
      projectId,
      slug: logicalKey,
      image,
      env: {
        ...(await deps.secrets.resolveEnv(projectId)),
        EVCP_PREVIEW_BASE: `/preview/${logicalKey}`
      },
      cpuCores,
      memoryMb,
      network,
      workspaceVolume: workspaceVolumeName(physicalKey)
    });

  const recoverExistingWorkspace = async (
    existing: WorkspaceContainerRecord,
    input: { projectId: string; slug: string }
  ): Promise<WorkspaceContainerRecord> => {
    const physicalKey = physicalResourceKey(existing);
    const logicalKey = resourceKeyForProject(input.projectId);
    await leases.adoptSecrets(input.projectId, deps.secrets);
    let found = await deps.docker.inspectContainer(workspaceContainerName(existing));
    if (!found && existing.containerId && physicalKey !== logicalKey) {
      // Pre-hot allocations used a logical name; only the persisted container may be adopted.
      const legacy = await deps.docker.inspectContainer(`evcp-ws-${logicalKey}`);
      if (legacy?.containerId === existing.containerId) found = legacy;
    }
    if (found) {
      if (!found.running) await deps.docker.startContainer(found.containerId);
      await waitForPreviewReady(deps.docker, found.containerId);
      const recovered = save({
        ...existing,
        resourceKey: physicalKey,
        slug: input.slug,
        state: "running",
        containerId: found.containerId,
        lastActivityAt: now(),
        lastError: undefined
      });
      await persist(recovered);
      audit({
        action: "workspace.recovered",
        projectId: input.projectId,
        metadata: { slug: input.slug, mode: found.running ? "reattached" : "restarted" }
      });
      return recovered;
    }

    // A deleted container is disposable; hydrate secrets and reuse its durable resources.
    await deps.secrets.hydrate();
    if (Object.keys(await deps.secrets.resolveEnv(input.projectId)).length === 0) {
      throw new Error(
        `cannot recover workspace '${input.projectId}': managed secrets are unavailable`
      );
    }
    await deps.docker.ensureVolume(
      workspaceVolumeName(physicalKey),
      workspaceVolumeLabels(input.projectId)
    );
    const { containerId } = await deps.docker.createContainer(
      await buildWorkspaceSpec(input.projectId, logicalKey, physicalKey)
    );
    await deps.docker.startContainer(containerId);
    await waitForPreviewReady(deps.docker, containerId);
    const recovered = save({
      ...existing,
      resourceKey: physicalKey,
      slug: input.slug,
      state: "running",
      containerId,
      lastActivityAt: now(),
      lastError: undefined
    });
    await persist(recovered);
    audit({
      action: "workspace.recovered",
      projectId: input.projectId,
      metadata: { slug: input.slug, mode: "recreated" }
    });
    return recovered;
  };

  const mustGet = (projectId: string): WorkspaceContainerRecord => {
    const record = records.get(projectId);
    if (!record) {
      throw new Error(`no workspace found for project '${projectId}'`);
    }
    return record;
  };

  const auditPoolEvent = (event: WorkspaceAuditEvent): void => {
    try {
      audit(event);
    } catch {
      // Observability cannot invalidate durable ownership or prevent cold fallback.
    }
  };

  const refillWarmPool = (): void => {
    void Promise.resolve()
      .then(() => deps.warmPool?.ensureCapacity())
      .catch(() => undefined);
  };

  const { provisionClaimedWorkspace, provisionColdWorkspace } = createWorkspaceProvisioning(
    deps,
    { image, network, cpuCores, memoryMb, databaseName, postgresHost, s3Endpoint },
    {
      save,
      persist,
      assertOwnership: leases.assertOwned,
      secretAttempt: leases.secretAttempt,
      rememberLlmKey: (projectId, keyId) => {
        llmKeyIds.set(projectId, keyId);
      },
      async removeFailedClaim(projectId, runtimeWriteAttempted) {
        if (runtimeWriteAttempted) await leases.remove(projectId);
        cache.delete(projectId);
        llmKeyIds.delete(projectId);
      }
    }
  );

  const provisionWorkspaceOnce = async (input: {
    projectId: string;
    slug: string;
  }): Promise<WorkspaceContainerRecord> => {
    // Immutable id-derived resource names prevent project renames from orphaning infrastructure.
    const resourceKey = resourceKeyForProject(input.projectId);
    const existing = records.get(input.projectId);
    if (existing?.state === "archived") return existing;
    if (existing && existing.state !== "failed") return recoverExistingWorkspace(existing, input);

    // After API restart, reattach to durable Docker resources instead of provisioning duplicates.
    const found = await deps.docker.inspectContainer(`evcp-ws-${resourceKey}`);
    if (found) {
      if (!found.running) {
        await deps.docker.startContainer(found.containerId).catch(() => undefined);
      }
      await waitForPreviewReady(deps.docker, found.containerId);
      const env = Object.fromEntries(workspaceSecretEntries(found.env));
      const recoveredClaim = await deps.warmPool?.recoverClaim(input.projectId, env);
      // Restore managed values from the original container runtime environment if they were not persisted.
      await deps.secrets.replaceForProvisioning(
        input.projectId,
        env,
        leases.secretAttempt(input.projectId)
      );
      const healed = save({
        id: `ws-${resourceKey}`,
        projectId: input.projectId,
        slug: input.slug,
        resourceKey: recoveredClaim?.resourceKey ?? resourceKey,
        state: "running",
        containerId: found.containerId,
        cpuCores,
        memoryMb,
        lastActivityAt: now(),
        lastError: undefined,
        createdAt: now(),
        updatedAt: now()
      });
      if (recoveredClaim) llmKeyIds.set(input.projectId, recoveredClaim.llmGatewayKeyId);
      await persist(healed);
      if (recoveredClaim) {
        await deps.warmPool!.completeClaim(recoveredClaim.slotId);
        refillWarmPool();
      }
      audit({
        action: "workspace.reattached",
        projectId: input.projectId,
        metadata: { slug: input.slug }
      });
      return healed;
    }

    const assertProjectOwned = () => leases.assertOwned(input.projectId);
    await assertProjectOwned();
    const allocation = await deps.warmPool?.claim(input.projectId, assertProjectOwned);
    if (allocation) {
      try {
        const { record, timings } = await provisionClaimedWorkspace(input, allocation);
        auditPoolEvent({
          action: "workspace.pool_claimed",
          projectId: input.projectId,
          metadata: { slotId: allocation.slotId, ...timings }
        });
        refillWarmPool();
        return record;
      } catch (error) {
        await assertProjectOwned();
        if (error instanceof WarmWorkspaceClaimRollbackError) throw error;
        await deps.warmPool!.failClaim(allocation.slotId, error, assertProjectOwned);
        auditPoolEvent({
          action: "workspace.pool_claim_failed",
          projectId: input.projectId,
          metadata: { slotId: allocation.slotId }
        });
        refillWarmPool();
      }
    } else if (deps.warmPool) {
      auditPoolEvent({ action: "workspace.pool_cold_fallback", projectId: input.projectId });
    }
    return provisionColdWorkspace(input);
  };

  return {
    ...createWarmPoolLifecycle(deps, cache, llmKeyIds),
    async hydrateRuntimeRecords(store: WorkspaceRuntimeRecordStore): Promise<void> {
      runtimeRecords = store;
      deps.runtimeRecords = store;
      for (const snapshot of await store.list()) {
        // Reconcile persisted state with Docker so a stack restart cannot leave preview stuck at 503.
        const live =
          snapshot.record.state !== "running" || !snapshot.record.containerId
            ? true
            : ((
                await deps.docker
                  .inspectContainer(`evcp-ws-${resourceKeyForProject(snapshot.record.projectId)}`)
                  .catch(() => null)
              )?.running ?? false);
        const record = live ? snapshot.record : { ...snapshot.record, state: "idle" as const };
        cache.set(record);
        if (snapshot.llmGatewayKeyId) llmKeyIds.set(record.projectId, snapshot.llmGatewayKeyId);
      }
    },
    getWorkspace(projectId: string): WorkspaceContainerRecord | null {
      return records.get(projectId) ?? null;
    },

    findWorkspaceByResourceKey(resourceKey: string): WorkspaceContainerRecord | null {
      return cache.findByResourceKey(resourceKey);
    },

    async listSecretNames(projectId: string): Promise<string[]> {
      return deps.secrets.listNames(projectId);
    },

    // Per-project scoped-role DATABASE_URL for internal server use only (Postgres schema-isolated); undefined until provisioned.
    async getProjectDatabaseUrl(projectId: string): Promise<string | undefined> {
      return (await deps.secrets.resolveEnv(projectId)).DATABASE_URL;
    },

    // Fully-resolved secret env (DATABASE_URL, S3_*, LLM_GATEWAY_KEY, …) for internal server use only.
    async resolveEnv(projectId: string): Promise<Record<string, string>> {
      return deps.secrets.resolveEnv(projectId);
    },

    markActivity(projectId: string): void {
      const record = records.get(projectId);
      if (record) {
        const updated = save({ ...record, lastActivityAt: now() });
        void persist(updated).catch(() => undefined);
      }
    },

    provisionWorkspace(input: {
      projectId: string;
      slug: string;
    }): Promise<WorkspaceContainerRecord> {
      const existing = provisioning.get(input.projectId);
      if (existing) return existing;
      const operation = leases
        .run(input.projectId, async (snapshot) => {
          if (snapshot) {
            cache.set({
              ...snapshot.record,
              state: snapshot.record.state === "provisioning" ? "failed" : snapshot.record.state
            });
            if (snapshot.llmGatewayKeyId) llmKeyIds.set(input.projectId, snapshot.llmGatewayKeyId);
          }
          return provisionWorkspaceOnce(input);
        })
        .finally(() => {
          if (provisioning.get(input.projectId) === operation) provisioning.delete(input.projectId);
        });
      provisioning.set(input.projectId, operation);
      return operation;
    },

    async stopWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "idle");
      await deps.docker.stopContainer(record.containerId!);
      const next = save({ ...record, state: "idle" });
      await persist(next);
      audit({ action: "workspace.stopped", projectId });
      return next;
    },

    async wakeWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "running");
      const next = await recoverExistingWorkspace(record, { projectId, slug: record.slug });
      audit({ action: "workspace.started", projectId });
      return next;
    },

    async archiveWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "archived");
      if (record.containerId) {
        await deps.docker.stopContainer(record.containerId).catch(() => undefined);
        await deps.docker.removeContainer(record.containerId);
      }
      const next = save({
        ...record,
        resourceKey: physicalResourceKey(record),
        state: "archived",
        containerId: null
      });
      await persist(next);
      audit({ action: "workspace.archived", projectId });
      return next;
    },

    deleteWorkspace: createWorkspaceDeletion(deps, cache, llmKeyIds),
    runProjectDeletion: <T>(
      projectId: string,
      fence: import("../project-lifecycle").ProjectDeletionFence | undefined,
      operation: (fence: import("../project-lifecycle").ProjectDeletionFence) => Promise<T>
    ) => runWorkspaceProjectDeletion(deps, projectId, fence, operation),

    async stopIdleWorkspaces(nowDate: Date = new Date()): Promise<string[]> {
      const stopped: string[] = [];
      for (const record of records.values()) {
        if (record.state !== "running") {
          continue;
        }
        const idleMs = nowDate.getTime() - new Date(record.lastActivityAt).getTime();
        if (idleMs >= IDLE_TIMEOUT_MS) {
          await this.stopWorkspace(record.projectId);
          stopped.push(record.projectId);
        }
      }
      return stopped;
    }
  };
}

export type WorkspaceOrchestrator = ReturnType<typeof createWorkspaceOrchestrator>;
export { schemaNameFor, roleNameFor };
