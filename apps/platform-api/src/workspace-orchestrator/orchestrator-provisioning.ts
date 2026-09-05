import type { WorkspaceContainerRecord } from "@evcp/types";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WarmWorkspaceAllocation } from "./warm-pool-types";
import { assertTransition } from "./state";
import { resourceKeyForProject } from "./resource-ports";
import { buildDevContainerSpec } from "./docker-engine";
import { waitForPreviewReady, workspaceVolumeName } from "./workspace-lifecycle";
import {
  persistWorkspaceSecrets,
  provisionIndependentWorkspaceResources
} from "./workspace-provisioning";

interface ProvisioningState {
  save(record: WorkspaceContainerRecord): WorkspaceContainerRecord;
  persist(record: WorkspaceContainerRecord): Promise<void>;
  rememberLlmKey(projectId: string, keyId: string): void;
  removeFailedClaim(projectId: string, runtimeWriteAttempted: boolean): Promise<void>;
}

interface ProvisioningConfig {
  image: string;
  network: string;
  cpuCores: number;
  memoryMb: number;
  databaseName: string;
  postgresHost: string;
  s3Endpoint: string;
}

export function createWorkspaceProvisioning(
  deps: WorkspaceOrchestratorDeps,
  config: ProvisioningConfig,
  state: ProvisioningState
) {
  const { image, network, cpuCores, memoryMb, databaseName, postgresHost, s3Endpoint } = config;
  const { save, persist } = state;
  const now = () => new Date().toISOString();
  const audit = deps.onAudit;
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

  const provisionClaimedWorkspace = async (
    input: { projectId: string; slug: string },
    allocation: WarmWorkspaceAllocation
  ): Promise<WorkspaceContainerRecord> => {
    const logicalKey = resourceKeyForProject(input.projectId);
    let containerId: string | undefined;
    let runtimeWriteAttempted = false;
    try {
      await deps.docker.stopContainer(allocation.containerId);
      await deps.docker.removeContainer(allocation.containerId);
      const created = await deps.docker.createContainer(
        buildDevContainerSpec({
          projectId: input.projectId,
          slug: logicalKey,
          image,
          env: { ...allocation.env, EVCP_PREVIEW_BASE: `/preview/${logicalKey}` },
          cpuCores,
          memoryMb,
          network,
          workspaceVolume: workspaceVolumeName(allocation.resourceKey)
        })
      );
      containerId = created.containerId;
      await deps.docker.startContainer(containerId);
      await waitForPreviewReady(deps.docker, containerId);
      await persistWorkspaceSecrets(deps, input.projectId, allocation.env);
      const record: WorkspaceContainerRecord = {
        id: `ws-${logicalKey}`,
        projectId: input.projectId,
        slug: input.slug,
        resourceKey: allocation.resourceKey,
        state: "running",
        containerId,
        cpuCores,
        memoryMb,
        lastActivityAt: now(),
        lastError: undefined,
        createdAt: now(),
        updatedAt: now()
      };
      state.rememberLlmKey(input.projectId, allocation.llmGatewayKeyId);
      runtimeWriteAttempted = true;
      await persist(record);
      await deps.warmPool!.completeClaim(allocation.slotId);
      return save(record);
    } catch (error) {
      // The pool exclusively owns schema, bucket, key, volume, and anonymous-container cleanup.
      if (containerId) await deps.docker.removeContainer(containerId).catch(() => undefined);
      await deps.secrets.removeAll(input.projectId).catch(() => undefined);
      await state.removeFailedClaim(input.projectId, runtimeWriteAttempted);
      throw error;
    }
  };

  const provisionColdWorkspace = async (input: {
    projectId: string;
    slug: string;
  }): Promise<WorkspaceContainerRecord> => {
    const resourceKey = resourceKeyForProject(input.projectId);
    let record: WorkspaceContainerRecord = save({
      id: `ws-${resourceKey}`,
      projectId: input.projectId,
      slug: input.slug,
      resourceKey,
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
      state.rememberLlmKey(input.projectId, llmKey.keyId);

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
        await buildWorkspaceSpec(input.projectId, resourceKey, resourceKey)
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
      audit?.({
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
      audit?.({
        action: "workspace.provision_failed",
        projectId: input.projectId,
        metadata: { slug: input.slug, error: (error as Error).message }
      });
      throw error;
    }
  };

  return { provisionClaimedWorkspace, provisionColdWorkspace };
}
