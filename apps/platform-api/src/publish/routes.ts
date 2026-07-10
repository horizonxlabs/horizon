import type { EnvironmentName } from "@evcp/types";
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
  publishService: Pick<ReturnType<typeof createPublishService>, "publish" | "promote">;
  deployments: DeploymentStore;
}) {
  const runPublish = async (
    auth: WorkspaceAuthContext,
    input: { projectId: string; slug: string; environment: EnvironmentName; commitSha?: string }
  ): Promise<RouteResponse> => {
    if (!isMember(auth, input.projectId)) {
      return { status: 403, body: { error: "forbidden" } };
    }
    const outcome = await deps.publishService.publish({
      projectId: input.projectId,
      slug: input.slug,
      environment: input.environment,
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
    publish(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string; environment: EnvironmentName }
    ): Promise<RouteResponse> {
      return runPublish(auth, input);
    },
    rollback(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string; environment: EnvironmentName; commitSha: string }
    ): Promise<RouteResponse> {
      return runPublish(auth, input);
    },
    async promote(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string }
    ): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      let outcome;
      try {
        outcome = await deps.publishService.promote({
          projectId: input.projectId,
          slug: input.slug,
          publishedByUserId: auth.userId
        });
      } catch (error) {
        // e.g. no healthy staging deployment to promote
        return { status: 409, body: { error: "no_staging_deployment", message: (error as Error).message } };
      }
      if (outcome.ok) {
        return { status: 201, body: { deployment: outcome.deployment } };
      }
      if (outcome.reason === "pre_checks_failed") {
        return { status: 422, body: { error: "pre_checks_failed", failures: outcome.failures } };
      }
      return { status: 502, body: { error: "health_failed", deployment: outcome.deployment } };
    },
    list(auth: WorkspaceAuthContext, input: { projectId: string }): RouteResponse {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return { status: 200, body: { deployments: deps.deployments.list(input.projectId) } };
    }
  };
}

export type AppsResolution = { ok: true; upstream: string } | { ok: false; status: 401 | 403 | 404 | 503 };

export async function resolveAppsTarget(
  deployments: DeploymentStore,
  auth: WorkspaceAuthContext | null,
  slug: string,
  environment: EnvironmentName = "production"
): Promise<AppsResolution> {
  const current = deployments.getCurrent(slug, environment);
  // Only serve a healthy deployment (never proxy a failed/in-flight container publicly).
  if (!current || current.healthStatus !== "healthy") {
    return { ok: false, status: 404 };
  }
  // Production is the PUBLIC live app — end users open it directly, and a plain browser navigation
  // cannot carry the SPA's bearer token, so it must not be auth-gated. Staging is a gated preview:
  // only members of the owning project may view it. (The proxy strips authorization/cookie before
  // forwarding, so the deployed container never receives the caller's credentials either way.)
  if (environment !== "production") {
    if (!auth) {
      return { ok: false, status: 401 };
    }
    if (!auth.projectIds.includes(current.projectId)) {
      return { ok: false, status: 403 };
    }
  }
  return { ok: true, upstream: `http://evcp-${environment}-${slug}:3000` };
}
