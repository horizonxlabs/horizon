import type { WorkspaceOrchestrator } from "./orchestrator";
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
  | { ok: true; upstream: string; previewBase?: string }
  | { ok: false; status: 401 | 403 | 404 | 503 };

export async function resolvePreviewTarget(
  orchestrator: WorkspaceOrchestrator,
  auth: WorkspaceAuthContext | null,
  // The preview path segment is the immutable physical runtime key, never the public slug.
  key: string
): Promise<PreviewResolution> {
  if (!auth) {
    return { ok: false, status: 401 };
  }
  const record = orchestrator.findWorkspaceByPreviewKey(key);
  if (!record) {
    return { ok: false, status: 404 };
  }
  if (!isMember(auth, record.projectId)) {
    return { ok: false, status: 403 };
  }
  if (record.state !== "running" && record.state !== "idle") {
    return { ok: false, status: 503 };
  }
  // Reconcile the durable record with Docker on every preview entry. This is intentionally
  // unconditional: a container can exit between API restarts while persistence still says
  // "running". Provisioning reattaches/restarts/recreates it idempotently.
  await orchestrator.provisionWorkspace({ projectId: record.projectId, slug: record.slug });
  const location = await orchestrator.resolvePreviewLocation(record.projectId);
  if (!location) return { ok: false, status: 503 };
  orchestrator.markActivity(record.projectId);
  return {
    ok: true,
    upstream: `http://${location.containerName}:3000`,
    ...(location.previewBase === `/preview/${key}` ? {} : { previewBase: location.previewBase })
  };
}
