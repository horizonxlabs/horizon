import type { WorkspaceAgentMode, WorkspaceSnapshotResponse } from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { apiBaseUrl } from "@/shared/runtime-config";
import { vibeAuthHeaders } from "@/shared/session";

export async function ensureVibeWorkspace(projectId: string): Promise<void> {
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
  const current = await readState();
  if (current === "running" || current === "idle") return;
  const res = await fetch(containerUrl, {
    method: "POST",
    headers: vibeAuthHeaders(),
    body: JSON.stringify({ projectId, slug: projectId })
  });
  if (res.ok || res.status === 409) return;
  const after = await readState();
  if (after === "running" || after === "idle") return;
  throw new Error(
    `Provisioning workspace failed (${res.status}${after ? `, state=${after}` : ""})`
  );
}

// Builds the chat request body. Kept pure (no browser globals) so the approved-plan wiring is unit
// tested directly; approvedPlan is included only when a Creator approved a plan (else omitted).
export function vibeChatBody(
  prompt: string,
  attachmentIds: string[],
  agentMode: WorkspaceAgentMode,
  approvedPlan?: string
): Record<string, unknown> {
  return { prompt, attachmentIds, agentMode, ...(approvedPlan ? { approvedPlan } : {}) };
}

export async function streamVibeChat(
  projectId: string,
  prompt: string,
  attachmentIds: string[],
  agentMode: WorkspaceAgentMode,
  onEvent: (type: string, data: unknown) => void,
  approvedPlan?: string
): Promise<void> {
  const base = apiBaseUrl() ?? "/api";
  const response = await fetch(`${base}/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: vibeAuthHeaders(),
    body: JSON.stringify(vibeChatBody(prompt, attachmentIds, agentMode, approvedPlan))
  });
  if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);
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
      const raw = dataLine.slice("data:".length).trim();
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* keep raw string */
      }
      onEvent(eventLine ? eventLine.slice("event:".length).trim() : "message", data);
    }
  }
}

export async function loadWorkspaceState(projectId: string): Promise<WorkspaceSnapshotResponse> {
  return createCreatorPlatformClient().getWorkspace(projectId);
}
