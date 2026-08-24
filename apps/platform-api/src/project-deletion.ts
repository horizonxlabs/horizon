import { PermissionError, type PlatformUser } from "./platform-services";
import type { CoreRepositoryBackedService } from "./persistence/core-repositories";
import type { PlatformRequest, HeaderBag } from "./platform-http-types";

export async function deletePersistedProject(input: {
  actor: PlatformUser;
  encodedProjectId: string;
  persistence: CoreRepositoryBackedService;
  cleanup: (projectId: string) => Promise<void>;
}): Promise<{ id: string; deleted: true }> {
  const projectId = decodeURIComponent(input.encodedProjectId);
  const project = (await input.persistence.listProjects(input.actor)).find(
    (candidate) => candidate.id === projectId
  );
  if (!project)
    throw new PermissionError(`Role ${input.actor.role} cannot delete project ${projectId}`);

  await input.cleanup(projectId);
  await input.persistence.deleteProject(input.actor, projectId);
  await input.persistence.recordAudit({
    actorId: input.actor.id,
    action: "project.deleted",
    resourceType: "project",
    resourceId: projectId,
    metadata: { projectId }
  });
  return { id: projectId, deleted: true };
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
