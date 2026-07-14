import type { WorkspaceOrchestrator } from "./orchestrator";
import { resourceKeyForProject } from "./resource-ports";
import type { PlatformUser } from "../platform-services";

export interface WorkspaceAuthContext {
  userId: string;
  roles: string[];
  projectIds: string[];
  actor?: PlatformUser;
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
      try {
        const workspace = await orchestrator.provisionWorkspace(input);
        return { status: 201, body: { workspace } };
      } catch (error) {
        const workspace = orchestrator.getWorkspace(input.projectId);
        return {
          status: 503,
          body: {
            code: "WORKSPACE_PROVISION_FAILED",
            error: (error as Error).message,
            workspace: workspace ?? null
          }
        };
      }
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
        body: { workspace, secretNames: await orchestrator.listSecretNames(input.projectId) }
      };
    },

    async stop(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return {
        status: 200,
        body: { workspace: await orchestrator.stopWorkspace(input.projectId) }
      };
    },

    async wake(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return {
        status: 200,
        body: { workspace: await orchestrator.wakeWorkspace(input.projectId) }
      };
    }
  };
}

export type PreviewResolution =
  | { ok: true; upstream: string }
  | { ok: false; status: 401 | 403 | 404 | 503 };

export async function resolvePreviewTarget(
  orchestrator: WorkspaceOrchestrator,
  auth: WorkspaceAuthContext | null,
  // The preview path segment is the id-derived resource key (e.g. `prj-team-time-off`), not the
  // public slug — so a rename never changes a project's preview URL.
  key: string
): Promise<PreviewResolution> {
  if (!auth) {
    return { ok: false, status: 401 };
  }
  // find the caller's workspace whose id-derived key matches
  let record: ReturnType<WorkspaceOrchestrator["getWorkspace"]> = null;
  for (const projectId of auth.projectIds) {
    if (resourceKeyForProject(projectId) !== key) continue;
    const candidate = orchestrator.getWorkspace(projectId);
    if (candidate) {
      record = candidate;
      break;
    }
  }
  if (!record) {
    // Not one of the caller's workspaces: 403 if it exists at all (someone else's), else 404. The
    // project id is recoverable from the key because project ids never contain hyphens.
    const anyWorkspace = orchestrator.getWorkspace(key.replaceAll("-", "_"));
    return anyWorkspace ? { ok: false, status: 403 } : { ok: false, status: 404 };
  }
  if (record.state === "idle") {
    await orchestrator.wakeWorkspace(record.projectId);
  } else if (record.state !== "running") {
    return { ok: false, status: 503 };
  }
  orchestrator.markActivity(record.projectId);
  return { ok: true, upstream: `http://evcp-ws-${key}:3000` };
}
