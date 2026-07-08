import {
  createPlatformApiClient,
  createPlatformSessionStore,
  type AppAccessSnapshotResponse,
  type AppStoreRegistryEntryDto,
  type PrdVersionDto,
  type PublishReviewResponse,
  type WorkspaceSnapshotResponse
} from "@evcp/api-client";
import { creatorSessionBridgeProfile, fallbackSelectedProject } from "../data/mock-data";
import { createCreatorPlatformClient, projectToView } from "../lib/creator-client";
import { apiBaseUrl, projectRouteSegmentFromPath } from "../lib/routing";
import { vibeAuthHeaders } from "../lib/session";
import type { CreatorBootstrapState } from "../types";

export async function ensureVibeWorkspace(projectId: string, slug: string): Promise<void> {
  const base = apiBaseUrl() ?? "/api";
  const containerUrl = `${base}/projects/${encodeURIComponent(projectId)}/workspace/container`;
  const readState = async (): Promise<string | undefined> => {
    const res = await fetch(containerUrl, { headers: vibeAuthHeaders() });
    if (!res.ok) return undefined;
    const body = (await res.json().catch(() => null)) as {
      data?: { workspace?: { state?: string } };
      workspace?: { state?: string };
    } | null;
    return body?.data?.workspace?.state ?? body?.workspace?.state;
  };
  // Already running/idle → nothing to do.
  const current = await readState();
  if (current === "running" || current === "idle") return;
  // Otherwise provision. Treat "already provisioned" (any non-fresh outcome where a
  // workspace ends up present) as success.
  const res = await fetch(containerUrl, {
    method: "POST",
    headers: vibeAuthHeaders(),
    body: JSON.stringify({ projectId, slug })
  });
  if (res.ok || res.status === 409) return;
  const after = await readState();
  if (after) return;
  throw new Error(`Provisioning workspace failed (${res.status})`);
}

// Stream a chat turn: POST the prompt and parse the text/event-stream response,
// invoking onEvent(type, data) for each SSE frame (token | action_result | commit | error | done).
export async function streamVibeChat(
  projectId: string,
  prompt: string,
  attachmentIds: string[],
  onEvent: (type: string, data: unknown) => void
): Promise<void> {
  const base = apiBaseUrl() ?? "/api";
  const response = await fetch(`${base}/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: vibeAuthHeaders(),
    body: JSON.stringify({ prompt, attachmentIds })
  });
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const type = eventLine ? eventLine.slice("event:".length).trim() : "message";
      const raw = dataLine.slice("data:".length).trim();
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* keep raw string */
      }
      onEvent(type, data);
    }
  }
}

export async function loadCreatorBootstrap(
  selectedProjectKey = projectRouteSegmentFromPath(window.location.pathname)
): Promise<CreatorBootstrapState> {
  const client = createCreatorPlatformClient();
  const currentUser = await client.getCurrentUser();
  const projects = await client.listProjects();
  const projectViews = projects.map((project) => projectToView(project, currentUser));
  const selectedProject =
    projectViews.find(
      (project) => project.slug === selectedProjectKey || project.id === selectedProjectKey
    ) ??
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

export async function loadWorkspaceState(projectId: string): Promise<WorkspaceSnapshotResponse> {
  return createCreatorPlatformClient().getWorkspace(projectId);
}

export async function loadCreatorPublishState(projectId: string): Promise<{
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

export async function signInCreatorSessionBridge(): Promise<CreatorBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const bridgeClient = createPlatformApiClient({
    baseUrl,
    legacyUserEmail: "admin@company.com"
  });
  const session = await bridgeClient.simulateSsoLogin(creatorSessionBridgeProfile);
  createPlatformSessionStore(window.localStorage).saveSession(session);
  return loadCreatorBootstrap();
}
