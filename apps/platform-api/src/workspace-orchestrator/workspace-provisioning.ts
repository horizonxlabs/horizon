import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";

type Rollback = () => Promise<void>;

interface ProvisionedWorkspaceResources {
  pg: Awaited<ReturnType<WorkspaceOrchestratorDeps["postgres"]["provisionSchema"]>>;
  bucket: Awaited<ReturnType<WorkspaceOrchestratorDeps["objectStorage"]["provisionBucket"]>>;
  llmKey: Awaited<ReturnType<WorkspaceOrchestratorDeps["llmGateway"]["createVirtualKey"]>>;
  rollbacks: Rollback[];
}

async function rollbackCompleted(rollbacks: Rollback[]): Promise<void> {
  for (const rollback of rollbacks.reverse()) {
    await rollback().catch(() => undefined);
  }
}

export async function provisionIndependentWorkspaceResources(
  deps: WorkspaceOrchestratorDeps,
  input: {
    projectId: string;
    resourceKey: string;
    volumeName: string;
    volumeLabels?: Record<string, string>;
  }
): Promise<ProvisionedWorkspaceResources> {
  const results = await Promise.allSettled([
    deps.postgres.provisionSchema(input.resourceKey),
    deps.objectStorage.provisionBucket(input.resourceKey),
    deps.llmGateway.createVirtualKey({
      projectId: input.projectId,
      slug: input.resourceKey
    }),
    deps.docker.ensureVolume(
      input.volumeName,
      input.volumeLabels ?? {
        "evcp.managed": "true",
        "evcp.project-id": input.projectId,
        "evcp.kind": "workspace-data"
      }
    )
  ] as const);

  const rollbacks: Rollback[] = [];
  if (results[0].status === "fulfilled") {
    rollbacks.push(() => deps.postgres.releaseSchema(input.resourceKey));
  }
  if (results[1].status === "fulfilled") {
    rollbacks.push(() => deps.objectStorage.releaseBucket(input.resourceKey));
  }
  if (results[2].status === "fulfilled") {
    const keyId = results[2].value.keyId;
    rollbacks.push(() => deps.llmGateway.revokeVirtualKey(keyId));
  }
  if (results[3].status === "fulfilled") {
    rollbacks.push(() => deps.docker.removeVolume(input.volumeName));
  }

  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    await rollbackCompleted(rollbacks);
    throw failure.reason;
  }

  const [pg, bucket, llmKey] = results;
  if (pg.status !== "fulfilled" || bucket.status !== "fulfilled" || llmKey.status !== "fulfilled") {
    throw new Error("workspace resource provisioning did not return all required resources");
  }

  return {
    pg: pg.value,
    bucket: bucket.value,
    llmKey: llmKey.value,
    rollbacks
  };
}

export async function persistWorkspaceSecrets(
  deps: Pick<WorkspaceOrchestratorDeps, "secrets">,
  projectId: string,
  env: Record<string, string>
): Promise<void> {
  const results = await Promise.allSettled(
    Object.entries(env).map(([name, value]) => deps.secrets.put(projectId, name, value))
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
