import { PermissionError, type PlatformUser } from "./platform-services";
import type { CoreRepositoryBackedService } from "./persistence/core-repositories";
import type { PlatformRequest, HeaderBag } from "./platform-http-types";
import type { ProjectDeletionFence, ProjectLifecycleCoordinator } from "./project-lifecycle";

export async function deleteProjectResources(cleanups: Array<() => Promise<void>>): Promise<void> {
  const failures: Error[] = [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      if (error instanceof AggregateError) {
        failures.push(
          ...error.errors.map((cause) =>
            cause instanceof Error ? cause : new Error(String(cause))
          )
        );
      } else {
        failures.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Project resource cleanup did not finish");
  }
}

export async function deletePersistedProject(input: {
  actor: PlatformUser;
  encodedProjectId: string;
  persistence: CoreRepositoryBackedService;
  cleanup: (projectId: string, fence?: ProjectDeletionFence) => Promise<void>;
  lifecycle?: ProjectLifecycleCoordinator;
}): Promise<{ id: string; deleted: true }> {
  const projectId = decodeURIComponent(input.encodedProjectId);
  const project = (await input.persistence.listProjects(input.actor)).find(
    (candidate) => candidate.id === projectId
  );
  if (!project)
    throw new PermissionError(`Role ${input.actor.role} cannot delete project ${projectId}`);

  const remove = async (fence?: ProjectDeletionFence) => {
    await input.persistence.recordAudit({
      actorId: input.actor.id,
      action: "project.deletion_requested",
      resourceType: "project",
      resourceId: projectId,
      metadata: { projectId }
    });
    await fence?.assertCurrent();
    await input.cleanup(projectId, fence);
    await fence?.assertCurrent();
    await input.persistence.deleteProject(input.actor, projectId);
    await input.persistence
      .recordAudit({
        actorId: input.actor.id,
        action: "project.deleted",
        resourceType: "project",
        resourceId: projectId,
        metadata: { projectId }
      })
      .catch(() => undefined);
    return { id: projectId, deleted: true as const };
  };
  return input.lifecycle ? input.lifecycle.runDeletion(projectId, remove) : remove();
}

export function registerProjectDeletionRoute(
  routes: {
    delete: (
      path: string,
      handler: (
        request: { headers: HeaderBag; params?: Record<string, string> },
        response: unknown
      ) => void
    ) => void;
  },
  dispatch: (response: unknown, request: PlatformRequest) => void
): void {
  routes.delete("/projects/:projectId", (request, response) =>
    dispatch(response, {
      method: "DELETE",
      path: `/projects/${encodeURIComponent(String(request.params?.projectId ?? ""))}`,
      headers: request.headers
    })
  );
}
