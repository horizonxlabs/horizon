import {
  createPlatformApiClient,
  createPlatformSessionStore,
  type PrdVersionDto
} from "@evcp/api-client";
import { creatorSessionBridgeProfile, fallbackSelectedProject } from "@/shared/creator-defaults";
import { createCreatorPlatformClient, projectToView } from "@/shared/creator-client";
import { apiBaseUrl } from "@/shared/runtime-config";
import type { CreatorBootstrapState } from "@/shared/types";

export async function loadCreatorBootstrap(
  selectedProjectKey?: string
): Promise<CreatorBootstrapState> {
  const client = createCreatorPlatformClient();
  const currentUser = await client.getCurrentUser();
  const projects = await client.listProjects();
  const projectViews = projects.map((project) => projectToView(project, currentUser));
  const selectedProject =
    projectViews.find((project) => project.id === selectedProjectKey) ??
    projectViews[0] ??
    fallbackSelectedProject;
  return {
    userName: currentUser.user.name,
    selectedProject,
    projects: projectViews.length ? projectViews : [fallbackSelectedProject],
    source: currentUser.auth.mode === "platform_session" ? "Platform API" : "local fallback"
  };
}

export async function loadPrdState(
  projectId: string
): Promise<{ current?: PrdVersionDto; versions: PrdVersionDto[] }> {
  const client = createCreatorPlatformClient();
  const versions = await client.listPrdVersions(projectId);
  const current = versions.length ? await client.getCurrentPrd(projectId) : undefined;
  return { current, versions };
}

export async function signInCreatorSessionBridge(
  selectedProjectKey?: string
): Promise<CreatorBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const bridgeClient = createPlatformApiClient({
    baseUrl,
    legacyUserEmail: "admin@company.com"
  });
  const session = await bridgeClient.simulateSsoLogin(creatorSessionBridgeProfile);
  createPlatformSessionStore(window.localStorage).saveSession(session);
  return loadCreatorBootstrap(selectedProjectKey);
}
