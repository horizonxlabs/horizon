import type { PublishAccessUrlConfigDto } from "@evcp/api-client";
import type { AppStoreRegistryEntry } from "../platform-services";
import type { PublishStorePersistenceClient } from "./publish-store-persistence-types";
import { mapRegistryEntry } from "./publish-store-service-support";

export async function resolvePersistedPublishedSubdomain(
  client: PublishStorePersistenceClient,
  accessUrlConfig: PublishAccessUrlConfigDto,
  subdomain: string
): Promise<AppStoreRegistryEntry | null> {
  const normalized = subdomain.trim().toLowerCase();
  const record = await client.appStoreRegistryEntry.findFirst({
    where: { subdomain: normalized }
  });
  if (!record || record.status !== "published" || record.subdomain !== normalized) return null;
  return mapRegistryEntry(record, accessUrlConfig);
}
