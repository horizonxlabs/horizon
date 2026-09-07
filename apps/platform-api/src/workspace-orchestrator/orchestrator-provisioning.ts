import type { WorkspaceContainerRecord } from "@evcp/types";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WarmWorkspaceAllocation, WarmWorkspaceClaimTimings } from "./warm-pool-types";
import { WarmWorkspaceClaimRollbackError } from "./warm-pool-types";
import type { ProvisioningSecretAttempt } from "./secret-store";
import { assertTransition } from "./state";
import { resourceKeyForProject } from "./resource-ports";
import { buildDevContainerSpec } from "./docker-engine";
import { waitForPreviewReady, workspaceVolumeName } from "./workspace-lifecycle";
import { provisionIndependentWorkspaceResources } from "./workspace-provisioning";

interface ProvisioningState {
  save(record: WorkspaceContainerRecord): WorkspaceContainerRecord;
  persist(record: WorkspaceContainerRecord): Promise<void>;
  assertOwnership(projectId: string): Promise<void>;
  secretAttempt(projectId: string): ProvisioningSecretAttempt;
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
  ): Promise<{ record: WorkspaceContainerRecord; timings: WarmWorkspaceClaimTimings }> => {
    const startedAt = performance.now();
    const logicalKey = resourceKeyForProject(input.projectId);
    const attempt = state.secretAttempt(input.projectId);
    let runtimeWriteAttempted = false;
    let claimCompleted = false;
    try {
      await state.assertOwnership(input.projectId);
      const found = await deps.docker.inspectContainer(`evcp-ws-${allocation.resourceKey}`);
      if (!found?.running || found.containerId !== allocation.containerId) {
        throw new Error("claimed warm workspace is unavailable");
      }
      await waitForPreviewReady(deps.docker, found.containerId);
      const healthyAt = performance.now();
      await state.assertOwnership(input.projectId);
      await deps.secrets.replaceForProvisioning(input.projectId, allocation.env, attempt);
      const secretsAt = performance.now();
      const record: WorkspaceContainerRecord = {
        id: `ws-${logicalKey}`,
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
      runtimeWriteAttempted = true;
      await persist(record);
      const persistedAt = performance.now();
      await state.assertOwnership(input.projectId);
      await deps.warmPool!.completeClaim(allocation.slotId);
      claimCompleted = true;
      await state.assertOwnership(input.projectId);
      const completedAt = performance.now();
      return {
        record: save(record),
        timings: {
          healthMs: healthyAt - startedAt,
          secretsMs: secretsAt - healthyAt,
          runtimeMs: persistedAt - secretsAt,
          completeMs: completedAt - persistedAt,
          totalMs: completedAt - startedAt
        }
      };
    } catch (error) {
      if (error instanceof WarmWorkspaceClaimRollbackError) throw error;
      if (claimCompleted) throw new WarmWorkspaceClaimRollbackError();
      await state.assertOwnership(input.projectId);
      // The pool exclusively owns schema, bucket, key, volume, and anonymous-container cleanup.
      try {
        await deps.secrets.removeProvisioning(input.projectId, attempt.token);
        await state.assertOwnership(input.projectId);
        await state.removeFailedClaim(input.projectId, runtimeWriteAttempted);
      } catch {
        // Keep the claim and allocation recoverable until project persistence can be rolled back.
        throw new WarmWorkspaceClaimRollbackError();
      }
      throw error;
    }
  };

  const provisionColdWorkspace = async (input: {
    projectId: string;
    slug: string;
  }): Promise<WorkspaceContainerRecord> => {
    const resourceKey = resourceKeyForProject(input.projectId);
    const attempt = state.secretAttempt(input.projectId);
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
      await state.assertOwnership(input.projectId);
      const volumeName = workspaceVolumeName(resourceKey);
      const {
        pg,
        bucket,
        llmKey,
        rollbacks: resourceRollbacks
      } = await provisionIndependentWorkspaceResources(deps, {
        projectId: input.projectId,
        resourceKey,
        volumeName,
        assertOwnership: () => state.assertOwnership(input.projectId)
      });
      rollbacks.push(...resourceRollbacks);
      state.rememberLlmKey(input.projectId, llmKey.keyId);

      rollbacks.push(() => deps.secrets.removeProvisioning(input.projectId, attempt.token));
      await state.assertOwnership(input.projectId);
      await deps.secrets.replaceForProvisioning(
        input.projectId,
        {
          DATABASE_URL: `postgresql://${pg.roleName}:${pg.password}@${postgresHost}/${databaseName}?schema=${pg.schemaName}`,
          S3_ENDPOINT: s3Endpoint,
          S3_BUCKET: bucket.bucket,
          S3_ACCESS_KEY: bucket.accessKey,
          S3_SECRET_KEY: bucket.secretKey,
          LLM_GATEWAY_KEY: llmKey.key
        },
        attempt
      );
      await state.assertOwnership(input.projectId);
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
        await state.assertOwnership(input.projectId);
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
