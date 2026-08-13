import type {
  AppAccessSnapshotResponse,
  AppStoreRegistryEntryDto,
  PublishReviewResponse
} from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

export async function loadCreatorPublishState(projectId: string): Promise<{
  review: PublishReviewResponse;
  registry: AppStoreRegistryEntryDto[];
}> {
  const client = createCreatorPlatformClient();
  const [review, registry] = await Promise.all([
    client.getPublishReview(projectId),
    client.listAppStoreRegistry()
  ]);
  return { review, registry };
}

export async function loadCreatorAccessState(
  projectId: string
): Promise<AppAccessSnapshotResponse> {
  return createCreatorPlatformClient().getAppAccessSnapshot(projectId);
}
