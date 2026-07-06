import type { WorkspaceOrchestrator } from "./orchestrator";

export interface WorkspaceAuthContext {
  userId: string;
  roles: string[];
  projectIds: string[];
}

interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

function isMember(auth: WorkspaceAuthContext, projectId: string): boolean {
  return auth.projectIds.includes(projectId);
}

export function createWorkspaceRoutes(deps: { orchestrator: WorkspaceOrchestrator }) {
  const { orchestrator } = deps;
  return {
    async provision(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string }
    ): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      const workspace = await orchestrator.provisionWorkspace(input);
      return { status: 201, body: { workspace } };
    },

    async get(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      const workspace = orchestrator.getWorkspace(input.projectId);
      if (!workspace) {
        return { status: 404, body: { error: "not_found" } };
      }
      return {
        status: 200,
        body: { workspace, secretNames: orchestrator.listSecretNames(input.projectId) }
      };
    },

    async stop(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return { status: 200, body: { workspace: await orchestrator.stopWorkspace(input.projectId) } };
    },

    async wake(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return { status: 200, body: { workspace: await orchestrator.wakeWorkspace(input.projectId) } };
    }
  };
}

export type PreviewResolution = { ok: true; upstream: string } | { ok: false; status: 401 | 403 | 404 | 503 };

export async function resolvePreviewTarget(
  orchestrator: WorkspaceOrchestrator,
  auth: WorkspaceAuthContext | null,
  slug: string
): Promise<PreviewResolution> {
  if (!auth) {
    return { ok: false, status: 401 };
  }
  // find workspace record by slug
  let record: ReturnType<WorkspaceOrchestrator["getWorkspace"]> = null;
  for (const projectId of auth.projectIds) {
    const candidate = orchestrator.getWorkspace(projectId);
    if (candidate?.slug === slug) {
      record = candidate;
      break;
    }
  }
  if (!record) {
    // Not one of the caller's workspaces: 403 if the slug exists at all (someone else's), else 404.
    const anyWorkspace = orchestrator.findBySlug(slug);
    return anyWorkspace ? { ok: false, status: 403 } : { ok: false, status: 404 };
  }
  if (record.state === "idle") {
    await orchestrator.wakeWorkspace(record.projectId);
  } else if (record.state !== "running") {
    return { ok: false, status: 503 };
  }
  orchestrator.markActivity(record.projectId);
  return { ok: true, upstream: `http://evcp-ws-${slug}:3000` };
}
