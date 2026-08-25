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
    let outcome;
    try {
      outcome = await deps.publishService.publish({
        projectId: input.projectId,
        slug: input.slug,
        environment: input.environment,
        commitSha: input.commitSha,
        publishedByUserId: auth.userId
      });
    } catch (error) {
      // A thrown error here is an infrastructure failure (no dev container, empty git tree, image
      // build/run failure, missing docker network) rather than a modelled publish outcome. Surface
      // the reason to the client instead of a bare 500 so prod deploys are diagnosable.
      return {
        status:
          error instanceof Error && error.name === "ProjectDeletionInProgressError" ? 409 : 500,
        body: {
          error:
            error instanceof Error && error.name === "ProjectDeletionInProgressError"
              ? "project_deletion_in_progress"
              : "publish_failed",
          message: (error as Error).message
        }
      };
    }
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
        return {
          status: 409,
          body: {
            error:
              error instanceof Error && error.name === "ProjectDeletionInProgressError"
                ? "project_deletion_in_progress"
                : "no_staging_deployment",
            message: (error as Error).message
          }
        };
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

export type AppsResolution =
  { ok: true; upstream: string; projectId: string } | { ok: false; status: 404 | 503 };

export async function resolveAppsTarget(
  deployments: DeploymentStore,
  slug: string,
  environment: EnvironmentName = "production",
  rehydrate?: () => Promise<unknown>
): Promise<AppsResolution> {
  if (rehydrate) await rehydrate();
  const current = deployments.getCurrent(slug, environment);
  // Only serve a healthy deployment (never proxy a failed/in-flight container publicly).
  if (!current || current.healthStatus !== "healthy") {
    return { ok: false, status: 404 };
  }
  // Both deployed tiers are public once healthy. Publish, rollback, promote, and deployment-list
  // routes remain member-authorized; this route only exposes a completed app to its users.
  return {
    ok: true,
    upstream: `http://${current.containerName}:3000`,
    projectId: current.projectId
  };
}
