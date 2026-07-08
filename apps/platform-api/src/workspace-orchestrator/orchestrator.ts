import type { WorkspaceContainerRecord } from "@evcp/types";
import { assertTransition } from "./state";
import { schemaNameFor, roleNameFor, type PostgresProvisioner } from "./postgres-provisioner";
import { resourceKeyForProject } from "./resource-ports";
import type { ObjectStorageProvisioner, LlmGatewayAdmin } from "./resource-ports";
import type { ProjectSecretStore } from "./secret-store";
import { buildDevContainerSpec, type DockerEngine } from "./docker-engine";

export interface WorkspaceAuditEvent {
  action: string;
  projectId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceOrchestratorDeps {
  postgres: PostgresProvisioner;
  objectStorage: ObjectStorageProvisioner;
  llmGateway: LlmGatewayAdmin;
  secrets: ProjectSecretStore;
  docker: DockerEngine;
  image?: string;
  network?: string;
  cpuCores?: number;
  memoryMb?: number;
  postgresHost?: string;
  s3Endpoint?: string;
  onAudit?: (event: WorkspaceAuditEvent) => void;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function createWorkspaceOrchestrator(deps: WorkspaceOrchestratorDeps) {
  const image = deps.image ?? "evcp/workspace-next:1";
  const network = deps.network ?? process.env.EVCP_WORKSPACE_NETWORK ?? "evcp-internal";
  const cpuCores = deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1);
  const memoryMb = deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048);
  const postgresHost = deps.postgresHost ?? "postgres:5432";
  const s3Endpoint = deps.s3Endpoint ?? "http://minio:9000";
  const audit = (event: WorkspaceAuditEvent) => deps.onAudit?.(event);

  const records = new Map<string, WorkspaceContainerRecord>();
  // Retained per-project so a future deleteWorkspace() can revoke the LiteLLM key on hard-delete (see follow-up).
  const llmKeyIds = new Map<string, string>();

  const now = () => new Date().toISOString();

  const save = (record: WorkspaceContainerRecord): WorkspaceContainerRecord => {
    const next = { ...record, updatedAt: now() };
    records.set(record.projectId, next);
    return next;
  };

  const mustGet = (projectId: string): WorkspaceContainerRecord => {
    const record = records.get(projectId);
    if (!record) {
      throw new Error(`no workspace found for project '${projectId}'`);
    }
    return record;
  };

  return {
    getWorkspace(projectId: string): WorkspaceContainerRecord | null {
      return records.get(projectId) ?? null;
    },

    findBySlug(slug: string): WorkspaceContainerRecord | null {
      for (const record of records.values()) {
        if (record.slug === slug) {
          return record;
        }
      }
      return null;
    },

    listSecretNames(projectId: string): string[] {
      return deps.secrets.listNames(projectId);
    },

    markActivity(projectId: string): void {
      const record = records.get(projectId);
      if (record) {
        save({ ...record, lastActivityAt: now() });
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
        // Idempotent: already provisioned in this process — return it instead of erroring.
        return existing;
      }

      // Self-heal: after a platform-api restart the in-memory record is gone, but the container
      // (and its pg schema / bucket) usually still exist. Re-attach to the running container
      // rather than re-provisioning, which would collide with the orphaned resources (500).
      const found = await deps.docker.inspectContainer(`evcp-ws-${resourceKey}`);
      if (found) {
        if (!found.running) {
          await deps.docker.startContainer(found.containerId).catch(() => undefined);
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
          createdAt: now(),
          updatedAt: now()
        });
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
        createdAt: now(),
        updatedAt: now()
      });

      const rollbacks: Array<() => Promise<void>> = [];
      try {
        const pg = await deps.postgres.provisionSchema(resourceKey);
        rollbacks.push(() => deps.postgres.releaseSchema(resourceKey));

        const bucket = await deps.objectStorage.provisionBucket(resourceKey);
        rollbacks.push(() => deps.objectStorage.releaseBucket(resourceKey));

        const llmKey = await deps.llmGateway.createVirtualKey({
          projectId: input.projectId,
          slug: input.slug
        });
        llmKeyIds.set(input.projectId, llmKey.keyId);
        rollbacks.push(() => deps.llmGateway.revokeVirtualKey(llmKey.keyId));

        deps.secrets.put(
          input.projectId,
          "DATABASE_URL",
          `postgresql://${pg.roleName}:${pg.password}@${postgresHost}/evcp?schema=${pg.schemaName}`
        );
        deps.secrets.put(input.projectId, "S3_ENDPOINT", s3Endpoint);
        deps.secrets.put(input.projectId, "S3_BUCKET", bucket.bucket);
        deps.secrets.put(input.projectId, "S3_ACCESS_KEY", bucket.accessKey);
        deps.secrets.put(input.projectId, "S3_SECRET_KEY", bucket.secretKey);
        deps.secrets.put(input.projectId, "LLM_GATEWAY_KEY", llmKey.key);
        rollbacks.push(async () => deps.secrets.removeAll(input.projectId));

        const spec = buildDevContainerSpec({
          slug: resourceKey,
          image,
          env: {
            ...deps.secrets.resolveEnv(input.projectId),
            EVCP_PREVIEW_BASE: `/preview/${resourceKey}`
          },
          cpuCores,
          memoryMb,
          network,
          workspaceVolume: `evcp-ws-${resourceKey}-data`
        });

        const { containerId } = await deps.docker.createContainer(spec);
        rollbacks.push(() => deps.docker.removeContainer(containerId));
        await deps.docker.startContainer(containerId);

        assertTransition(record.state, "running");
        record = save({ ...record, state: "running", containerId, lastActivityAt: now() });
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
        record = save({ ...record, state: "failed", containerId: null });
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
      audit({ action: "workspace.stopped", projectId });
      return next;
    },

    async wakeWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "running");
      await deps.docker.startContainer(record.containerId!);
      const next = save({ ...record, state: "running", lastActivityAt: now() });
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
      deps.secrets.removeAll(projectId);
      records.delete(projectId);
      llmKeyIds.delete(projectId);
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

export type WorkspaceOrchestrator = ReturnType<typeof createWorkspaceOrchestrator>;
export { schemaNameFor, roleNameFor };

export function startIdleSweep(
  orchestrator: Pick<WorkspaceOrchestrator, "stopIdleWorkspaces">,
  opts: { intervalMs?: number } = {}
): { stop(): void } {
  const intervalMs = opts.intervalMs ?? 60_000;
  const timer = setInterval(() => {
    void orchestrator.stopIdleWorkspaces().catch(() => undefined);
  }, intervalMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
    }
  };
}
