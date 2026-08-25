import { resolvePersistedAuth } from "./auth/persistence-auth-resolver";
import type { HeaderBag } from "./platform-http-types";
import type { PersistenceAwarePlatformApiServices } from "./app-factory";

export function createProjectDbAuditAdapter(services: PersistenceAwarePlatformApiServices) {
  return async (
    headers: HeaderBag,
    projectId: string,
    action: string,
    detail: string
  ): Promise<void> => {
    const { user } = await resolvePersistedAuth(services, headers);
    try {
      await services.corePersistence?.recordAudit({
        actorId: user.id,
        action,
        resourceType: "project_database",
        resourceId: projectId,
        metadata: { table: detail }
      });
    } catch (error) {
      services.audit.record({
        actorId: user.id,
        action: "audit.persistence_failed",
        resourceType: "project_database",
        resourceId: projectId,
        severity: "high",
        metadata: {
          attemptedAction: action,
          table: detail,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  };
}
