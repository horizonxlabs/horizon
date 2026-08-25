import type { WorkspaceContainerRecord } from "@evcp/types";
import { assertTransition } from "./state";
import { schemaNameFor, roleNameFor } from "./postgres-provisioner";
import { resourceKeyForProject } from "./resource-ports";
import { buildDevContainerSpec } from "./docker-engine";
import type { WorkspaceAuditEvent, WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";
import {
  cleanupOrphanWorkspaceResources,
  waitForPreviewReady,
  workspaceSecretEntries,
  workspaceVolumeLabels,
  workspaceVolumeName
} from "./workspace-lifecycle";
import {
  persistWorkspaceSecrets,
  provisionIndependentWorkspaceResources
} from "./workspace-provisioning";
import { deleteWorkspaceResources } from "./workspace-deletion";
import type { ProjectDeletionFence } from "../project-lifecycle";

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

  const records = new Map<string, WorkspaceContainerRecord>();
  const llmKeyIds = new Map<string, string>();
  let runtimeRecords = deps.runtimeRecords;

  const now = () => new Date().toISOString();
  const save = (record: WorkspaceContainerRecord): WorkspaceContainerRecord => {
    const next = { ...record, updatedAt: now() };
    records.set(record.projectId, next);
    return next;
  };

  const persist = async (record: WorkspaceContainerRecord): Promise<void> => {
    await runtimeRecords?.save({ record, llmGatewayKeyId: llmKeyIds.get(record.projectId) });
  };

  const buildWorkspaceSpec = async (projectId: string, resourceKey: string) =>
    buildDevContainerSpec({
      projectId,
      slug: resourceKey,
      image,
      env: {
        ...(await deps.secrets.resolveEnv(projectId)),
        EVCP_PREVIEW_BASE: `/preview/${resourceKey}`
      },
      cpuCores,
      memoryMb,
      network,
      workspaceVolume: workspaceVolumeName(resourceKey)
    });

  const recoverExistingWorkspace = async (
    existing: WorkspaceContainerRecord,
    input: { projectId: string; slug: string },
    resourceKey: string
  ): Promise<WorkspaceContainerRecord> => {
    const found = await deps.docker.inspectContainer(`evcp-ws-${resourceKey}`);
    if (found) {
      if (!found.running) await deps.docker.startContainer(found.containerId);
      await waitForPreviewReady(deps.docker, found.containerId);
      const recovered = save({
        ...existing,
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
      workspaceVolumeName(resourceKey),
      workspaceVolumeLabels(input.projectId)
    );
    const { containerId } = await deps.docker.createContainer(
      await buildWorkspaceSpec(input.projectId, resourceKey)
    );
    await deps.docker.startContainer(containerId);
    await waitForPreviewReady(deps.docker, containerId);
    const recovered = save({
      ...existing,
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

  return {
    async hydrateRuntimeRecords(store: WorkspaceRuntimeRecordStore): Promise<void> {
      runtimeRecords = store;
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
        records.set(record.projectId, record);
        if (snapshot.llmGatewayKeyId) llmKeyIds.set(record.projectId, snapshot.llmGatewayKeyId);
      }
    },
    async cleanupOrphanContainers(): Promise<string[]> {
      return cleanupOrphanWorkspaceResources({
        docker: deps.docker,
        activeProjectIds: new Set(records.keys()),
        onRemoved: ({ projectId, containerName, volumeName }) =>
          audit({
            action: "workspace.orphan_removed",
            projectId,
            metadata: { containerName, volumeName }
          })
      });
    },
    getWorkspace(projectId: string): WorkspaceContainerRecord | null {
      return records.get(projectId) ?? null;
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

    async provisionWorkspace(input: {
      projectId: string;
      slug: string;
    }): Promise<WorkspaceContainerRecord> {
      // Immutable id-derived resource names prevent project renames from orphaning infrastructure.
      const resourceKey = resourceKeyForProject(input.projectId);
      const existing = records.get(input.projectId);
      if (existing && existing.state !== "failed") {
        if (existing.state === "archived") return existing;
        return recoverExistingWorkspace(existing, input, resourceKey);
      }

      // After API restart, reattach to durable Docker resources instead of provisioning duplicates.
      const found = await deps.docker.inspectContainer(`evcp-ws-${resourceKey}`);
      if (found) {
        if (!found.running) {
          await deps.docker.startContainer(found.containerId).catch(() => undefined);
        }
        await waitForPreviewReady(deps.docker, found.containerId);
        // The original container already contains the encrypted-at-rest secrets in its runtime
        // environment. Restore the managed values when a restart happened before they were
        // persisted (or from an older deployment that did not persist them yet).
        for (const [name, value] of workspaceSecretEntries(found.env)) {
          await deps.secrets.put(input.projectId, name, value);
        }
        const healed = save({
          id: `ws-${resourceKey}`,
          projectId: input.projectId,
          slug: input.slug,
          state: "running",
          containerId: found.containerId,
          cpuCores,
          memoryMb,
          lastActivityAt: now(),
          lastError: undefined,
          createdAt: now(),
          updatedAt: now()
        });
        await persist(healed);
        audit({
          action: "workspace.reattached",
          projectId: input.projectId,
          metadata: { slug: input.slug }
        });
        return healed;
      }

      let record: WorkspaceContainerRecord = save({
        id: `ws-${resourceKey}`,
        projectId: input.projectId,
        slug: input.slug,
        state: "provisioning",
        containerId: null,
        cpuCores,
        memoryMb,
        lastActivityAt: now(),
        lastError: undefined,
        createdAt: now(),
        updatedAt: now()
      });
      await persist(record);

      const rollbacks: Array<() => Promise<void>> = [];
      try {
        const volumeName = workspaceVolumeName(resourceKey);
        const {
          pg,
          bucket,
          llmKey,
          rollbacks: resourceRollbacks
        } = await provisionIndependentWorkspaceResources(deps, {
          projectId: input.projectId,
          resourceKey,
          volumeName
        });
        rollbacks.push(...resourceRollbacks);
        llmKeyIds.set(input.projectId, llmKey.keyId);

        rollbacks.push(() => deps.secrets.removeAll(input.projectId));
        await persistWorkspaceSecrets(deps, input.projectId, {
          DATABASE_URL: `postgresql://${pg.roleName}:${pg.password}@${postgresHost}/${databaseName}?schema=${pg.schemaName}`,
          S3_ENDPOINT: s3Endpoint,
          S3_BUCKET: bucket.bucket,
          S3_ACCESS_KEY: bucket.accessKey,
          S3_SECRET_KEY: bucket.secretKey,
          LLM_GATEWAY_KEY: llmKey.key
        });
        const { containerId } = await deps.docker.createContainer(
          await buildWorkspaceSpec(input.projectId, resourceKey)
        );
        rollbacks.push(() => deps.docker.removeContainer(containerId));
        await deps.docker.startContainer(containerId);
        await waitForPreviewReady(deps.docker, containerId);

        assertTransition(record.state, "running");
        record = save({
          ...record,
          state: "running",
          containerId,
          lastActivityAt: now(),
          lastError: undefined
        });
        await persist(record);
        audit({
          action: "workspace.provisioned",
          projectId: input.projectId,
          metadata: { slug: input.slug }
        });
        return record;
      } catch (error) {
        for (const rollback of rollbacks.reverse()) {
          try {
            await rollback();
          } catch {
            // best-effort rollback; ignore secondary failures
          }
        }
        assertTransition(record.state, "failed");
        record = save({
          ...record,
          state: "failed",
          containerId: null,
          lastError: (error as Error).message
        });
        await persist(record);
        audit({
          action: "workspace.provision_failed",
          projectId: input.projectId,
          metadata: { slug: input.slug, error: (error as Error).message }
        });
        throw error;
      }
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
      const next = await recoverExistingWorkspace(
        record,
        { projectId, slug: record.slug },
        resourceKeyForProject(projectId)
      );
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
      const next = save({ ...record, state: "archived", containerId: null });
      await persist(next);
      audit({ action: "workspace.archived", projectId });
      return next;
    },

    async deleteWorkspace(projectId: string, fence?: ProjectDeletionFence): Promise<void> {
      const record = records.get(projectId);
      if (!record) {
        return;
      }
      await deleteWorkspaceResources({
        record,
        deps,
        llmGatewayKeyId: llmKeyIds.get(projectId),
        runtimeRecords,
        fence
      });
      records.delete(projectId);
      llmKeyIds.delete(projectId);
      try {
        audit({ action: "workspace.deleted", projectId });
      } catch {
        // Cleanup has completed; audit transport failure must not make a retry target live resources.
      }
    },

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
