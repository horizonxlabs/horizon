import type { PlatformApiServices, PlatformUser } from "./platform-services";
import type { CoreRepositoryBackedService } from "./persistence/core-repositories";
import type { HeaderBag } from "./platform-http-types";
import { resolvePersistedAuth } from "./auth/persistence-auth-resolver";
import { resolvePreviewTarget, type WorkspaceAuthContext } from "./workspace-orchestrator/routes";

type PersistenceAuthServices = PlatformApiServices & {
  corePersistence?: CoreRepositoryBackedService;
};

export async function resolvePersistenceUser(
  services: PersistenceAuthServices,
  headers: HeaderBag
): Promise<PlatformUser> {
  if (services.corePersistence) return (await resolvePersistedAuth(services, headers)).user;
  return services.auth.resolveCurrentUser(headers);
}

export async function resolveWorkspaceAuth(
  services: PersistenceAuthServices,
  headers: HeaderBag
): Promise<WorkspaceAuthContext> {
  const user = await resolvePersistenceUser(services, headers);
  const projectIds = services.corePersistence
    ? (await services.corePersistence.listProjects(user)).map((project) => project.id)
    : services.projects.listProjects(user).map((project) => project.id);
  return { userId: user.id, roles: user.role ? [user.role] : [], projectIds, actor: user };
}

export async function resolvePreviewProxyDecision(
  services: PersistenceAuthServices,
  headers: HeaderBag,
  slug: string
): Promise<{ status: number } | { upstream: string; previewBase?: string }> {
  let auth: WorkspaceAuthContext | null = null;
  try {
    auth = await resolveWorkspaceAuth(services, headers ?? {});
  } catch {
    auth = null;
  }
  const resolution = await resolvePreviewTarget(services.workspaceOrchestrator, auth, slug);
  return resolution.ok
    ? { upstream: resolution.upstream, ...(resolution.previewBase ? { previewBase: resolution.previewBase } : {}) }
    : { status: resolution.status };
}

export function wantsPreviewJson(headers: HeaderBag): boolean {
  const rawAccept = headers.accept ?? headers.Accept;
  const accept = Array.isArray(rawAccept) ? rawAccept.join(",") : String(rawAccept ?? "");
  return accept.includes("application/json") && !accept.includes("text/html");
}
