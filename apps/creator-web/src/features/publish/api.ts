import type {
  AppAccessSnapshotResponse,
  AppStoreRegistryEntryDto,
  PublishReviewResponse,
  WorkspaceDeploymentDto
} from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

export async function loadCreatorPublishState(projectId: string): Promise<{
  review: PublishReviewResponse;
  registry: AppStoreRegistryEntryDto[];
  deployments: WorkspaceDeploymentDto[];
}> {
  const client = createCreatorPlatformClient();
  const [review, registry, deployments] = await Promise.all([
    client.getPublishReview(projectId),
    client.listAppStoreRegistry(),
    client.listDeployments(projectId)
  ]);
  return { review, registry, deployments };
}

export async function loadCreatorAccessState(
  projectId: string
): Promise<AppAccessSnapshotResponse> {
  return createCreatorPlatformClient().getAppAccessSnapshot(projectId);
}
