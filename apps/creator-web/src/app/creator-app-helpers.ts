import {
  createPlatformSessionStore,
  startKeycloakLogin,
  type PrdVersionDto
} from "@evcp/api-client";
import { createCreatorPlatformClient, projectToView } from "@/shared/creator-client";
import { apiBaseUrl } from "@/shared/runtime-config";
import type { CreatorBootstrapState } from "@/shared/types";
import { initialCreatorBootstrap, unselectedProject } from "@/app/creator-defaults";

export function creatorApiFailureState(message: string): CreatorBootstrapState {
  return {
    ...initialCreatorBootstrap,
    status: "error",
    message,
    selectedProject: unselectedProject
  };
}

export async function loadCreatorBootstrap(
  selectedProjectKey?: string
): Promise<CreatorBootstrapState> {
  consumeCreatorSessionHandoff();
  const client = createCreatorPlatformClient();
  const currentUser = await client.getCurrentUser();
  const projects = await client.listProjects();
  const projectViews = projects.map((project) => projectToView(project, currentUser));
  const selectedProject =
    projectViews.find((project) => project.id === selectedProjectKey) ??
    projectViews[0] ??
    unselectedProject;
  return {
    status: projectViews.length ? "ready" : "empty",
    userName: currentUser.user.name,
    selectedProject,
    projects: projectViews,
    source: "Platform API"
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

export function signInCreatorSessionBridge(): void {
  beginCreatorKeycloakLogin();
}

export function beginCreatorKeycloakLogin(): void {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  window.location.assign(startKeycloakLogin(baseUrl, "creator", window.location.href));
}

export function consumeCreatorSessionHandoff(): void {
  const handoff = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = handoff.get("evcp_session");
  const expiresAt = handoff.get("evcp_session_expires_at");
  const refreshToken = handoff.get("evcp_refresh_token");
  const refreshExpiresAt = handoff.get("evcp_refresh_expires_at");
  if (!token || !expiresAt) return;
  createPlatformSessionStore(window.localStorage).saveSession({ token, expiresAt, ...(refreshToken && refreshExpiresAt ? { refreshToken, refreshExpiresAt } : {}) });
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}
