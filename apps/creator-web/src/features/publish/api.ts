import type {
  AppAccessSnapshotResponse,
  AppStoreRegistryEntryDto,
  PublishReviewResponse
} from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

export async function loadCreatorPublishState(
  projectId: string
): Promise<{
  access: AppAccessSnapshotResponse;
  review: PublishReviewResponse;
  registry: AppStoreRegistryEntryDto[];
}> {
  const client = createCreatorPlatformClient();
  const [access, review, registry] = await Promise.all([
    client.getAppAccessSnapshot(projectId),
    client.getPublishReview(projectId),
    client.listAppStoreRegistry()
  ]);
  return { access, review, registry };
}
