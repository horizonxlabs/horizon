import type { WorkspaceContainerRecord } from "@evcp/types";
import { assertTransition } from "./state";
import { schemaNameFor, roleNameFor } from "./postgres-provisioner";
import { resourceKeyForProject } from "./resource-ports";
import { buildDevContainerSpec } from "./docker-engine";
import type { WorkspaceAuditEvent, WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";

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

  const persist = async (record: WorkspaceContainerRecord): Promise<void> => { await runtimeRecords?.save({ record, llmGatewayKeyId: llmKeyIds.get(record.projectId) }); };

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
      workspaceVolume: `evcp-ws-${resourceKey}-data`
    });

  const recoverExistingWorkspace = async (
    existing: WorkspaceContainerRecord,
    input: { projectId: string; slug: string },
    resourceKey: string
  ): Promise<WorkspaceContainerRecord> => {
    const found = await deps.docker.inspectContainer(`evcp-ws-${resourceKey}`);
    if (found) {
      if (!found.running) await deps.docker.startContainer(found.containerId);
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

    // A deleted container is disposable: its named workspace volume and project resources remain.
    // Load encrypted at-rest secrets first so a post-restart recovery can recreate the container
    // without attempting to create its schema, bucket, or LLM key again.
    await deps.secrets.hydrate();
    if (Object.keys(await deps.secrets.resolveEnv(input.projectId)).length === 0) {
      throw new Error(
        `cannot recover workspace '${input.projectId}': managed secrets are unavailable`
      );
    }
    const { containerId } = await deps.docker.createContainer(
      await buildWorkspaceSpec(input.projectId, resourceKey)
    );
    await deps.docker.startContainer(containerId);
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
        records.set(snapshot.record.projectId, snapshot.record);
        if (snapshot.llmGatewayKeyId) llmKeyIds.set(snapshot.record.projectId, snapshot.llmGatewayKeyId);
      }
    },
    async cleanupOrphanContainers(): Promise<string[]> {
      const removed: string[] = [];
      for (const container of await deps.docker.listManagedContainers()) {
        const projectId = container.labels["evcp.project-id"];
        const isDevelopmentWorkspace = container.name.startsWith("evcp-ws-") && !container.labels["evcp.env"];
        // Older containers without a stable project-id label are left untouched: deletion must be
        // provably safe. They are adopted by provisionWorkspace and relabelled on recreation.
        if (!isDevelopmentWorkspace || !projectId || records.has(projectId)) continue;
        if (container.running) await deps.docker.stopContainer(container.containerId).catch(() => undefined);
        await deps.docker.removeContainer(container.containerId);
        removed.push(container.name);
        audit({ action: "workspace.orphan_removed", projectId, metadata: { containerName: container.name } });
      }
      return removed;
    },
    getWorkspace(projectId: string): WorkspaceContainerRecord | null {
      return records.get(projectId) ?? null;
    },

    async listSecretNames(projectId: string): Promise<string[]> {
      return deps.secrets.listNames(projectId);
    },

    /**
     * Per-project scoped-role connection string (postgresql://<role>:<pw>@host/db?schema=<app_schema>)
     * for internal server-side use only — never surfaced to the Creator. Postgres enforces schema
     * isolation via this role. Undefined until the workspace has been provisioned.
     */
    async getProjectDatabaseUrl(projectId: string): Promise<string | undefined> {
      return (await deps.secrets.resolveEnv(projectId)).DATABASE_URL;
    },

    /**
     * The project's fully-resolved secret environment (DATABASE_URL, S3_*, LLM_GATEWAY_KEY, …)
     * for internal server-side use only — never surfaced to the Creator. Used by the container
     * publish stack to start production/staging containers with the same secrets as dev.
     */
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
      // Physical resources are named by the immutable id-derived key, never the mutable slug, so a
      // rename never orphans them. The slug is kept only as a display field on the record.
      const resourceKey = resourceKeyForProject(input.projectId);
      const existing = records.get(input.projectId);
      if (existing && existing.state !== "failed") {
        if (existing.state === "archived") return existing;
        return recoverExistingWorkspace(existing, input, resourceKey);
      }

      // Self-heal: after a platform-api restart the in-memory record is gone, but the container
      // (and its pg schema / bucket) usually still exist. Re-attach to the running container
      // rather than re-provisioning, which would collide with the orphaned resources (500).
      const found = await deps.docker.inspectContainer(`evcp-ws-${resourceKey}`);
      if (found) {
        if (!found.running) {
          await deps.docker.startContainer(found.containerId).catch(() => undefined);
        }
        // The original container already contains the encrypted-at-rest secrets in its runtime
        // environment. Restore the managed values when a restart happened before they were
        // persisted (or from an older deployment that did not persist them yet).
        for (const entry of found.env) {
          const separator = entry.indexOf("=");
          if (separator <= 0) continue;
          const name = entry.slice(0, separator);
          if (
            name !== "DATABASE_URL" &&
            name !== "LLM_GATEWAY_KEY" &&
            name !== "S3_ENDPOINT" &&
            name !== "S3_BUCKET" &&
            name !== "S3_ACCESS_KEY" &&
            name !== "S3_SECRET_KEY"
          ) {
            continue;
          }
          await deps.secrets.put(input.projectId, name, entry.slice(separator + 1));
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
        const pg = await deps.postgres.provisionSchema(resourceKey);
        rollbacks.push(() => deps.postgres.releaseSchema(resourceKey));

        const bucket = await deps.objectStorage.provisionBucket(resourceKey);
        rollbacks.push(() => deps.objectStorage.releaseBucket(resourceKey));

        const llmKey = await deps.llmGateway.createVirtualKey({
          projectId: input.projectId,
          slug: resourceKey
        });
        llmKeyIds.set(input.projectId, llmKey.keyId);
        rollbacks.push(() => deps.llmGateway.revokeVirtualKey(llmKey.keyId));

        await deps.secrets.put(
          input.projectId,
          "DATABASE_URL",
          `postgresql://${pg.roleName}:${pg.password}@${postgresHost}/${databaseName}?schema=${pg.schemaName}`
        );
        await deps.secrets.put(input.projectId, "S3_ENDPOINT", s3Endpoint);
        await deps.secrets.put(input.projectId, "S3_BUCKET", bucket.bucket);
        await deps.secrets.put(input.projectId, "S3_ACCESS_KEY", bucket.accessKey);
        await deps.secrets.put(input.projectId, "S3_SECRET_KEY", bucket.secretKey);
        await deps.secrets.put(input.projectId, "LLM_GATEWAY_KEY", llmKey.key);
        rollbacks.push(() => deps.secrets.removeAll(input.projectId));

        const { containerId } = await deps.docker.createContainer(
          await buildWorkspaceSpec(input.projectId, resourceKey)
        );
        rollbacks.push(() => deps.docker.removeContainer(containerId));
        await deps.docker.startContainer(containerId);

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
      await deps.docker.startContainer(record.containerId!);
      const next = save({ ...record, state: "running", lastActivityAt: now() });
      await persist(next);
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

    async deleteWorkspace(projectId: string): Promise<void> {
      const record = records.get(projectId);
      if (!record) {
        return;
      }
      if (record.containerId) {
        await deps.docker.stopContainer(record.containerId).catch(() => undefined);
        await deps.docker.removeContainer(record.containerId).catch(() => undefined);
      }
      const releaseKey = resourceKeyForProject(record.projectId);
      await deps.postgres.releaseSchema(releaseKey).catch(() => undefined);
      await deps.objectStorage.releaseBucket(releaseKey).catch(() => undefined);
      const keyId = llmKeyIds.get(projectId);
      if (keyId) {
        await deps.llmGateway.revokeVirtualKey(keyId).catch(() => undefined);
      }
      await deps.secrets.removeAll(projectId);
      records.delete(projectId);
      llmKeyIds.delete(projectId);
      await runtimeRecords?.remove(projectId);
      audit({ action: "workspace.deleted", projectId });
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

export type WorkspaceOrchestrator = ReturnType<typeof createWorkspaceOrchestrator>; export { schemaNameFor, roleNameFor };
