import { createConfiguredPlatformApiClient } from "@/shared/platform-client";

export function createStorePlatformClient() {
  return createConfiguredPlatformApiClient({ legacyUserEmail: "user@company.com" });
}

export function createStoreSessionBridgeClient() {
  return createConfiguredPlatformApiClient({ legacyUserEmail: "admin@company.com" });
}
