import type {
  AppStoreRegistryEntryDto,
  PublishResultResponse,
  PublishReviewResponse,
  WorkspaceDeploymentDto
} from "@evcp/api-client";

function deploymentLinks(subdomainUrl?: string, route?: string) {
  return {
    ...(subdomainUrl ? { subdomainUrl } : {}),
    ...(route ? { route } : {})
  };
}

export function createVisibleDeployment({
  publishResult,
  publishReview,
  runtimeDeployments,
  visibleRegistryEntry
}: {
  publishResult?: PublishResultResponse;
  publishReview?: PublishReviewResponse;
  runtimeDeployments: WorkspaceDeploymentDto[];
  visibleRegistryEntry?: AppStoreRegistryEntryDto;
}) {
  if (publishResult) {
    return {
      id: publishResult.deployment.id,
      status: publishResult.deployment.status,
      environment: publishResult.deployment.environment ?? "app_store",
      manifestVersion:
        publishResult.deployment.manifestVersion ??
        publishResult.manifest.manifestVersion ??
        "unknown",
      ...deploymentLinks(
        publishResult.registryEntry.subdomainUrl ?? publishResult.deployment.subdomainUrl,
        publishResult.registryEntry.route ?? publishResult.deployment.route
      )
    };
  }

  const latestRuntimeDeployment = [...runtimeDeployments]
    .filter((deployment) => deployment.healthStatus === "healthy")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (!latestRuntimeDeployment) return undefined;

  return {
    id: latestRuntimeDeployment.id,
    status: latestRuntimeDeployment.healthStatus,
    environment: latestRuntimeDeployment.environment,
    manifestVersion:
      visibleRegistryEntry?.manifestVersion ?? publishReview?.manifest.manifestVersion ?? "unknown",
    ...deploymentLinks(visibleRegistryEntry?.subdomainUrl, visibleRegistryEntry?.route)
  };
}
