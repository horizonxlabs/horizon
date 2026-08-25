import {
  createPlatformSessionStore,
  startKeycloakLogin,
  startKeycloakLogout,
  type PlatformApiClient,
  type PrdVersionDto
} from "@evcp/api-client";
import { createCreatorPlatformClient, projectToView } from "@/shared/creator-client";
import { apiBaseUrl } from "@/shared/runtime-config";
import type { CreatorBootstrapState } from "@/shared/types";
import { initialCreatorBootstrap, unselectedProject } from "@/app/creator-defaults";

export function creatorApiFailureState(technicalDetails: string): CreatorBootstrapState {
  return {
    ...initialCreatorBootstrap,
    status: "error",
    message: "Creator projects could not be loaded.",
    technicalDetails,
    selectedProject: unselectedProject
  };
}

export function selectCreatorProjectForRequest(
  projects: CreatorBootstrapState["projects"],
  selectedProjectKey?: string
): CreatorBootstrapState["selectedProject"] {
  if (!selectedProjectKey) {
    return (
      projects.reduce<CreatorBootstrapState["selectedProject"] | undefined>(
        (latest, project) => (!latest || project.createdAt > latest.createdAt ? project : latest),
        undefined
      ) ?? unselectedProject
    );
  }
  return projects.find((project) => project.id === selectedProjectKey) ?? unselectedProject;
}

export async function loadCreatorBootstrap(
  selectedProjectKey?: string
): Promise<CreatorBootstrapState> {
  consumeCreatorSessionHandoff();
  const client = createCreatorPlatformClient();
  const currentUser = await client.getCurrentUser();
  const projects = await client.listProjects();
  const projectViews = projects.map((project) => projectToView(project, currentUser));
  const selectedProject = selectCreatorProjectForRequest(projectViews, selectedProjectKey);
  return {
    status: projectViews.length ? "ready" : "empty",
    userName: currentUser.user.name,
    selectedProject,
    projects: projectViews,
    source: "Platform API"
  };
}

export async function loadPrdState(
  projectId: string,
  signal?: AbortSignal
): Promise<{ current?: PrdVersionDto; versions: PrdVersionDto[] }> {
  const client = createCreatorPlatformClient();
  const encodedProjectId = encodeURIComponent(projectId);
  const versions = await client.request<PrdVersionDto[]>(
    `/projects/${encodedProjectId}/prd/versions`,
    { signal }
  );
  const current = versions.length
    ? await client.request<PrdVersionDto>(`/projects/${encodedProjectId}/prd`, { signal })
    : undefined;
  return { current, versions };
}

// PRD generation runs for minutes; the wizard must never hold a blocking fetch for it.
// The caller closes immediately after createProject and this fire-and-forget runner reports
// the outcome, while the PRD page polls as the recovery path (see useCreatorPrd).
export const PRD_GENERATION_POLL_INTERVAL_MS = 5_000;
export const PRD_GENERATION_TIMEOUT_MS = 8 * 60_000;

export function isPrdGenerationTimedOut(startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs >= PRD_GENERATION_TIMEOUT_MS;
}

export async function runBackgroundPrdGeneration(
  client: Pick<PlatformApiClient, "generatePrdDraft">,
  projectId: string,
  handlers: { onDraft(draft: PrdVersionDto): void; onError(error: Error): void }
): Promise<void> {
  try {
    handlers.onDraft(await client.generatePrdDraft(projectId));
  } catch (error) {
    handlers.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export function signInCreatorSessionBridge(): void {
  beginCreatorKeycloakLogin();
}

export function beginCreatorKeycloakLogin(): void {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  window.location.assign(startKeycloakLogin(baseUrl, "creator", window.location.href));
}

export function beginCreatorKeycloakLogout(): void {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  window.location.assign(startKeycloakLogout(baseUrl, "creator", window.location.href));
}

export function consumeCreatorSessionHandoff(): void {
  const handoff = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = handoff.get("evcp_session");
  const expiresAt = handoff.get("evcp_session_expires_at");
  const refreshToken = handoff.get("evcp_refresh_token");
  const refreshExpiresAt = handoff.get("evcp_refresh_expires_at");
  if (!token || !expiresAt) return;
  createPlatformSessionStore(window.localStorage).saveSession({
    token,
    expiresAt,
    ...(refreshToken && refreshExpiresAt ? { refreshToken, refreshExpiresAt } : {})
  });
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}`
  );
}
