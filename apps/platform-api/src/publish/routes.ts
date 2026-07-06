import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import type { DeploymentStore } from "./deployment-store";
import type { createPublishService } from "./publish-service";

interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

function isMember(auth: WorkspaceAuthContext, projectId: string): boolean {
  return auth.projectIds.includes(projectId);
}

export function createPublishRoutes(deps: {
  publishService: Pick<ReturnType<typeof createPublishService>, "publish">;
  deployments: DeploymentStore;
}) {
  const runPublish = async (
    auth: WorkspaceAuthContext,
    input: { projectId: string; slug: string; commitSha?: string }
  ): Promise<RouteResponse> => {
    if (!isMember(auth, input.projectId)) {
      return { status: 403, body: { error: "forbidden" } };
    }
    const outcome = await deps.publishService.publish({
      projectId: input.projectId,
      slug: input.slug,
      commitSha: input.commitSha,
      publishedByUserId: auth.userId
    });
    if (outcome.ok) {
      return { status: 201, body: { deployment: outcome.deployment } };
    }
    if (outcome.reason === "pre_checks_failed") {
      return { status: 422, body: { error: "pre_checks_failed", failures: outcome.failures } };
    }
    return { status: 502, body: { error: "health_failed", deployment: outcome.deployment } };
  };

  return {
    publish(auth: WorkspaceAuthContext, input: { projectId: string; slug: string }): Promise<RouteResponse> {
      return runPublish(auth, input);
    },
    rollback(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string; commitSha: string }
    ): Promise<RouteResponse> {
      return runPublish(auth, input);
    },
    list(auth: WorkspaceAuthContext, input: { projectId: string }): RouteResponse {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return { status: 200, body: { deployments: deps.deployments.list(input.projectId) } };
    }
  };
}

export type AppsResolution = { ok: true; upstream: string } | { ok: false; status: 401 | 404 | 503 };

export async function resolveAppsTarget(
  deployments: DeploymentStore,
  auth: WorkspaceAuthContext | null,
  slug: string
): Promise<AppsResolution> {
  if (!auth) {
    return { ok: false, status: 401 };
  }
  const current = deployments.getCurrent(slug);
  if (!current) {
    return { ok: false, status: 404 };
  }
  return { ok: true, upstream: `http://evcp-prod-${slug}:3000` };
}
