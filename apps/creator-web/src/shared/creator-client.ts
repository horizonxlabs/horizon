import {
  createPlatformApiClient,
  createSessionAwareFetch,
  createPlatformSessionStore,
  type CurrentUserResponse,
  type PlatformProjectDto
} from "@evcp/api-client";
import type { CreatorProjectView } from "@/shared/types";
import { apiBaseUrl } from "@/shared/runtime-config";

export function createCreatorPlatformClient(onSessionEnded?: () => void) {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  return createPlatformApiClient({
    baseUrl,
    fetcher: createSessionAwareFetch({ baseUrl, storage: window.localStorage, onSessionEnded }),
    legacyUserEmail: "creator@company.com"
  });
}

export function projectToView(
  project: PlatformProjectDto,
  currentUser: CurrentUserResponse
): CreatorProjectView {
  return {
    id: project.id,
    name: project.name,
    appType: project.appType,
    status: project.status,
    owner: currentUser.user.name,
    prdVersion: project.status === "published" ? "1.0" : "0.1",
    frontendVersion: project.activeFrontendCheckpointId ?? "preview-pending",
    tokenUsedThisMonth: 0
  };
}

export function clearCreatorSessionBridge() {
  createPlatformSessionStore(window.localStorage).clearSession();
}
