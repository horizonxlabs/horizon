import {
  createPlatformApiClient,
  createPlatformSessionStore,
  type CurrentUserResponse,
  type PlatformProjectDto
} from "@evcp/api-client";
import { initialCreatorBootstrap } from "../data/mock-data";
import type { CreatorBootstrapState, CreatorProjectView } from "../types";
import { apiBaseUrl } from "./routing";
import { platformSessionToken } from "./session";

export function createCreatorPlatformClient() {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  return createPlatformApiClient({
    baseUrl,
    sessionToken: platformSessionToken(),
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

export function clearCreatorSessionBridge(): CreatorBootstrapState {
  createPlatformSessionStore(window.localStorage).clearSession();
  return initialCreatorBootstrap;
}
