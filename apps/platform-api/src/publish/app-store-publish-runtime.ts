import { HttpStatus } from "@nestjs/common";
import {
  failure,
  success,
  validateSubdomainLabel,
  type AppStoreVisibility,
  type PublishAccessUrlConfigDto
} from "@evcp/api-client";
import type { WorkspaceDeployment } from "@evcp/types";
import type { HeaderBag, PlatformRequest, PlatformResponse } from "../platform-http-types";
import {
  PermissionError,
  type PlatformApiServices,
  type PlatformProject,
  type PlatformUser
} from "../platform-services";
import type { CoreRepositoryBackedService } from "../persistence/core-repositories";
import type { PrdRepositoryBackedService } from "../persistence/prd-repositories";
import type { PublishStoreRepositoryBackedService } from "../persistence/publish-store-repositories";
import type { WorkspaceRepositoryBackedService } from "../persistence/workspace-repositories";
import { resolvePersistenceUser } from "../preview-proxy-decision";

type RuntimeEnv = Record<string, string | undefined>;
const INTERNAL_PUBLISH_PERSISTENCE = Symbol("internal-publish-persistence");
type InternalPublishPersistenceRequest = PlatformRequest & {
  [INTERNAL_PUBLISH_PERSISTENCE]?: true;
};
type PublishRuntimeServices = PlatformApiServices & {
  corePersistence?: CoreRepositoryBackedService;
  prdPersistence?: PrdRepositoryBackedService;
  workspacePersistence?: WorkspaceRepositoryBackedService;
  publishStorePersistence?: PublishStoreRepositoryBackedService;
  publishAccessUrlConfig?: PublishAccessUrlConfigDto;
};

function isInternalPublishPersistenceRequest(request: PlatformRequest): boolean {
  return (request as InternalPublishPersistenceRequest)[INTERNAL_PUBLISH_PERSISTENCE] === true;
}

export function createInternalPublishPersistenceRequest(input: {
  headers: HeaderBag;
  projectId: string;
  deployment: WorkspaceDeployment;
  subdomain?: string;
  visibility?: AppStoreVisibility;
}): PlatformRequest {
  const request: InternalPublishPersistenceRequest = {
    method: "POST",
    path: `/projects/${input.projectId}/publish`,
    headers: input.headers,
    body: {
      runtimeDeployment: input.deployment,
      subdomain: input.subdomain,
      visibility: input.visibility
    }
  };
  Object.defineProperty(request, INTERNAL_PUBLISH_PERSISTENCE, { value: true });
  return request;
}

export function resolvePublishAccessUrlConfig(
  env: RuntimeEnv = process.env
): PublishAccessUrlConfigDto {
  const configuredDomain = env.EVCP_APP_SUBDOMAIN_BASE_DOMAIN?.trim().toLowerCase();
  return !configuredDomain || configuredDomain === "localhost"
    ? { baseDomain: "localhost", secure: false, port: 9800 }
    : { baseDomain: configuredDomain, secure: true };
}

function validateRequestedSubdomain(
  value: unknown
): { ok: true; subdomain: string } | { ok: false; response: PlatformResponse } {
  const validation = validateSubdomainLabel(typeof value === "string" ? value : "");
  return validation.ok
    ? { ok: true, subdomain: validation.value }
    : {
        ok: false,
        response: {
          status: HttpStatus.BAD_REQUEST,
          body: failure(validation.code, validation.message)
        }
      };
}

function validateRequestedVisibility(
  value: unknown,
  preserveExisting = false
):
  | { ok: true; visibility: AppStoreVisibility | undefined }
  | { ok: false; response: PlatformResponse } {
  if (value === undefined) {
    return { ok: true, visibility: preserveExisting ? undefined : "restricted" };
  }
  if (value === "restricted") {
    return { ok: true, visibility: "restricted" };
  }
  if (value === "public") return { ok: true, visibility: "public" };
  return {
    ok: false,
    response: {
      status: HttpStatus.BAD_REQUEST,
      body: failure("VISIBILITY_INVALID", "Visibility must be public or restricted.")
    }
  };
}

function subdomainConflictResponse(error: unknown): PlatformResponse | null {
  return error instanceof Error && (error as Error & { code?: unknown }).code === "SUBDOMAIN_TAKEN"
    ? {
        status: HttpStatus.CONFLICT,
        body: failure("SUBDOMAIN_TAKEN", "This subdomain is already in use.")
      }
    : null;
}

async function resolvePersistenceProject(
  services: PublishRuntimeServices,
  actor: PlatformUser,
  projectId: string
): Promise<PlatformProject> {
  if (!services.corePersistence) throw new Error("Core persistence service is not configured");
  const project = (await services.corePersistence.listProjects(actor)).find(
    (candidate) => candidate.id === projectId
  );
  if (!project) throw new PermissionError(`Role ${actor.role} cannot access project ${projectId}`);
  return project;
}

export async function preflightPublishedSubdomain(
  services: PublishRuntimeServices,
  input: { headers: HeaderBag; projectId: string; subdomain: string }
): Promise<{ subdomain: string }> {
  const validation = validateRequestedSubdomain(input.subdomain);
  if (!validation.ok) {
    const body = validation.response.body;
    throw body.ok
      ? new Error("Subdomain validation failed")
      : Object.assign(new Error(body.error.message), {
          code: body.error.code,
          status: validation.response.status
        });
  }
  if (services.publishStorePersistence) {
    const actor = await resolvePersistenceUser(services, input.headers);
    await resolvePersistenceProject(services, actor, input.projectId);
    return {
      subdomain: await services.publishStorePersistence.assertSubdomainAvailable(
        actor,
        input.projectId,
        validation.subdomain
      )
    };
  }
  const actor = services.auth.resolveCurrentUser(input.headers);
  services.projects.getProjectForActor(actor, input.projectId);
  return {
    subdomain: services.publish.assertSubdomainAvailable(
      actor,
      input.projectId,
      validation.subdomain
    )
  };
}

export async function resolveRawAppStoreSubdomain(input: {
  headers: HeaderBag;
  projectId: string;
  value: unknown;
  preflight?: (input: {
    headers: HeaderBag;
    projectId: string;
    subdomain: string;
  }) => Promise<{ subdomain: string }>;
}): Promise<{ ok: true; subdomain: string } | { ok: false; status: number; body: unknown }> {
  const validation = validateRequestedSubdomain(input.value);
  if (!validation.ok) {
    return {
      ok: false,
      status: validation.response.status,
      body: validation.response.body
    };
  }
  if (!input.preflight) return { ok: true, subdomain: validation.subdomain };
  try {
    return {
      ok: true,
      subdomain: (
        await input.preflight({
          headers: input.headers,
          projectId: input.projectId,
          subdomain: validation.subdomain
        })
      ).subdomain
    };
  } catch (error) {
    const domainError = error as { code?: unknown; status?: unknown };
    if (error instanceof Error && error.name === "PermissionError") {
      return {
        ok: false,
        status: HttpStatus.FORBIDDEN,
        body: failure("FORBIDDEN", error.message)
      };
    }
    if (domainError.code === "SUBDOMAIN_TAKEN" && domainError.status === 409) {
      return {
        ok: false,
        status: 409,
        body: failure("SUBDOMAIN_TAKEN", "This subdomain is already in use.")
      };
    }
    if (domainError.code === "SUBDOMAIN_INVALID" && domainError.status === 400) {
      return {
        ok: false,
        status: 400,
        body: failure("SUBDOMAIN_INVALID", "The requested subdomain is invalid.")
      };
    }
    return {
      ok: false,
      status: 500,
      body: failure("SUBDOMAIN_PREFLIGHT_FAILED", "Subdomain availability check failed.")
    };
  }
}

export async function handlePersistedPublishApiRequest(
  services: PublishRuntimeServices,
  request: PlatformRequest
): Promise<PlatformResponse | null> {
  const reviewMatch = request.path.match(/^\/projects\/([^/]+)\/publish\/review$/);
  const { corePersistence, prdPersistence, workspacePersistence, publishStorePersistence } =
    services;
  if (
    corePersistence &&
    prdPersistence &&
    workspacePersistence &&
    publishStorePersistence &&
    request.method === "GET" &&
    reviewMatch
  ) {
    const actor = await resolvePersistenceUser(services, request.headers ?? {});
    const project = await resolvePersistenceProject(services, actor, reviewMatch[1]);
    const baseline = await prdPersistence.getCurrent(actor, project);
    const preview = await workspacePersistence.refreshPreview(actor, { project, baseline });
    return {
      status: HttpStatus.OK,
      body: success(
        await publishStorePersistence.getPublishReview(actor, { project, baseline, preview })
      )
    };
  }

  const publishMatch = request.path.match(/^\/projects\/([^/]+)\/publish$/);
  if (!(
    corePersistence &&
    prdPersistence &&
    workspacePersistence &&
    publishStorePersistence &&
    request.method === "POST" &&
    publishMatch
  )) {
    return null;
  }
  const runtimeDeployment = request.body?.runtimeDeployment as never;
  const requestedSubdomain = request.body?.subdomain;
  const visibilityValidation = validateRequestedVisibility(
    request.body?.visibility,
    isInternalPublishPersistenceRequest(request)
  );
  if (!visibilityValidation.ok) return visibilityValidation.response;
  const validation =
    isInternalPublishPersistenceRequest(request) && requestedSubdomain === undefined
      ? undefined
      : validateRequestedSubdomain(requestedSubdomain);
  if (validation && !validation.ok) return validation.response;
  const actor = await resolvePersistenceUser(services, request.headers ?? {});
  const project = await resolvePersistenceProject(services, actor, publishMatch[1]);
  const baseline = await prdPersistence.getCurrent(actor, project);
  const preview = await workspacePersistence.refreshPreview(actor, { project, baseline });
  let result;
  try {
    result = await publishStorePersistence.publishApp(actor, {
      project,
      baseline,
      preview,
      runtimeDeployment,
      subdomain: validation?.subdomain,
      visibility: visibilityValidation.visibility
    });
  } catch (error) {
    const conflict = subdomainConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
  try {
    await corePersistence.recordAudit({
      actorId: actor.id,
      action: "app.publish.completed",
      resourceType: "publish_request",
      resourceId: result.publishRequest.id,
      metadata: {
        projectId: project.id,
        deploymentId: result.deployment.id,
        registryEntryId: result.registryEntry.id,
        manifestVersion: result.manifest.manifestVersion,
        subdomain: result.registryEntry.subdomain,
        route: result.registryEntry.route,
        subdomainUrl: result.registryEntry.subdomainUrl
      }
    });
  } catch {
    try {
      services.audit.record({
        actorId: actor.id,
        action: "audit.persistence_failed",
        resourceType: "publish_request",
        resourceId: result.publishRequest.id,
        severity: "high",
        metadata: {
          attemptedAction: "app.publish.completed",
          projectId: project.id,
          deploymentId: result.deployment.id,
          registryEntryId: result.registryEntry.id
        }
      });
    } catch {
      try {
        console.error("publish completion audit unavailable", {
          projectId: project.id,
          publishRequestId: result.publishRequest.id,
          deploymentId: result.deployment.id,
          registryEntryId: result.registryEntry.id
        });
      } catch {
        // The publish transaction is already committed; diagnostics must stay non-fatal.
      }
    }
  }
  return { status: HttpStatus.CREATED, body: success(result) };
}

export function handleLegacyPublishApiRequest(
  services: PlatformApiServices,
  request: PlatformRequest,
  accessUrlConfig: PublishAccessUrlConfigDto
): PlatformResponse | null {
  const reviewMatch = request.path.match(/^\/projects\/([^/]+)\/publish\/review$/);
  if (request.method === "GET" && reviewMatch) {
    const actor = services.auth.resolveCurrentUser(request.headers ?? {});
    return {
      status: HttpStatus.OK,
      body: success({
        ...services.publish.getReview(actor, reviewMatch[1]),
        accessUrlConfig
      })
    };
  }
  const publishMatch = request.path.match(/^\/projects\/([^/]+)\/publish$/);
  if (request.method !== "POST" || !publishMatch) return null;
  const requestedSubdomain = request.body?.subdomain;
  const visibilityValidation = validateRequestedVisibility(
    request.body?.visibility,
    isInternalPublishPersistenceRequest(request)
  );
  if (!visibilityValidation.ok) return visibilityValidation.response;
  const validation =
    isInternalPublishPersistenceRequest(request) && requestedSubdomain === undefined
      ? undefined
      : validateRequestedSubdomain(requestedSubdomain);
  if (validation && !validation.ok) return validation.response;
  const actor = services.auth.resolveCurrentUser(request.headers ?? {});
  try {
    return {
      status: HttpStatus.CREATED,
      body: success(
        services.publish.publishApp(actor, publishMatch[1], {
          subdomain: validation?.subdomain,
          visibility: visibilityValidation.visibility
        })
      )
    };
  } catch (error) {
    const conflict = subdomainConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
}
