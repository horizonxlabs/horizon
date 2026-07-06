import "reflect-metadata";
import { HttpStatus } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import type { ApiResult } from "@evcp/api-client";
import { PlatformApiModule } from "./platform-api.module";
import { createWorkspaceRoutes } from "./workspace-orchestrator/routes";
import {
  createPlatformApiServices,
  PermissionError,
  QuotaExceededError,
  ValidationError,
  type AuthResolution,
  type PlatformApiServices,
  type PlatformProject,
  type PlatformUser
} from "./platform-services";
import {
  createCoreRepositoryBackedService,
  createPrismaCorePersistence,
  MemoryCorePersistenceClient,
  type CoreRepositoryBackedService
} from "./persistence/core-repositories";
import {
  createAiGovernanceRepositoryBackedService,
  createPrismaAiGovernancePersistence,
  MemoryAiGovernancePersistenceClient,
  type AiGovernanceRepositoryBackedService
} from "./persistence/ai-governance-repositories";
import {
  createPrdRepositoryBackedService,
  createPrismaPrdPersistence,
  MemoryPrdPersistenceClient,
  type PrdRepositoryBackedService
} from "./persistence/prd-repositories";
import {
  createPrismaWorkspacePersistence,
  createWorkspaceRepositoryBackedService,
  MemoryWorkspacePersistenceClient,
  type WorkspaceRepositoryBackedService
} from "./persistence/workspace-repositories";
import {
  createPrismaPublishStorePersistence,
  createPublishStoreRepositoryBackedService,
  MemoryPublishStorePersistenceClient,
  type PublishStoreRepositoryBackedService
} from "./persistence/publish-store-repositories";
import {
  createGeneratedRuntimeRepositoryBackedService,
  createPrismaGeneratedRuntimePersistence,
  MemoryGeneratedRuntimePersistenceClient,
  type GeneratedRuntimeRepositoryBackedService
} from "./persistence/generated-runtime-repositories";

type HeaderBag = Record<string, string | string[] | undefined>;

type HttpRequest = {
  headers: HeaderBag;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
};

type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
};

type RouteRegistry = {
  get: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void | Promise<void>) => void;
  post: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void | Promise<void>) => void;
};

export type PersistenceAwarePlatformApiServices = PlatformApiServices & {
  corePersistence?: CoreRepositoryBackedService;
  aiGovernancePersistence?: AiGovernanceRepositoryBackedService;
  prdPersistence?: PrdRepositoryBackedService;
  workspacePersistence?: WorkspaceRepositoryBackedService;
  publishStorePersistence?: PublishStoreRepositoryBackedService;
  generatedRuntimePersistence?: GeneratedRuntimeRepositoryBackedService;
};

export type CorePersistenceMode = "legacy" | "memory" | "prisma";
type RuntimeEnv = Record<string, string | undefined>;

export interface PlatformRequest {
  method: "GET" | "POST";
  path:
    | "/health"
    | "/auth/me"
    | "/projects"
    | "/audit-logs"
    | "/audit-logs/filter"
    | "/admin/monitoring"
    | "/admin/installer/preflight"
    | "/admin/installer/setup"
    | "/admin/installer/reports"
    | "/admin/backup/policies"
    | "/admin/backup/runs"
    | "/admin/backup/pitr"
    | "/admin/backup/restore-drills"
    | "/admin/backup/overview"
    | "/admin/production/observability"
    | "/admin/production/upgrade-checks"
    | "/admin/production/rollback"
    | "/admin/production/overview"
    | "/admin/security/readiness"
    | "/admin/security/uploads/validate"
    | "/admin/security/release-checklist"
    | "/admin/security/redaction/preview"
    | "/admin/license/install"
    | "/admin/license/validate"
    | "/license/enforce"
    | "/admin/knowledge/sources"
    | `/admin/knowledge/sources/${string}/versions`
    | `/admin/knowledge/versions/${string}/approve`
    | "/admin/knowledge/retrieve"
    | "/admin/knowledge/retrieval-logs"
    | "/admin/skills"
    | `/admin/skills/${string}/versions`
    | `/admin/skills/${string}/disable`
    | `/admin/skills/versions/${string}/approve`
    | "/admin/skills/assignments"
    | "/admin/skills/resolve"
    | `/admin/runtime/projects/${string}`
    | `/admin/runtime/projects/${string}/schema/check`
    | `/admin/runtime/projects/${string}/health`
    | `/admin/runtime/projects/${string}/openapi`
    | `/admin/runtime/projects/${string}/migrations/dry-run`
    | "/admin/auth/providers"
    | "/admin/auth/providers/oidc"
    | "/admin/auth/providers/saml"
    | "/admin/auth/keycloak-defaults"
    | "/admin/auth/direct-idp-constraints"
    | "/admin/auth/simulate-login"
    | "/admin/auth/generated-app/validate-session"
    | "/admin/auth/break-glass"
    | "/admin/policy-templates"
    | "/admin/policy-templates/evaluate"
    | "/ai/providers"
    | "/ai/api-keys"
    | "/ai/routes"
    | "/ai/quotas"
    | "/ai/provider-test-call"
    | "/guardrails/rules"
    | "/guardrails/test"
    | "/guardrails/events"
    | `/projects/${string}/prd`
    | `/projects/${string}/prd/generate`
    | `/projects/${string}/prd/baseline`
    | `/projects/${string}/prd/versions`
    | `/creator/projects/${string}/prd/changes`
    | `/creator/projects/${string}/prd/changes/from-ticket`
    | `/creator/projects/${string}/prd/changes/decision`
    | `/creator/projects/${string}/domains`
    | `/creator/projects/${string}/domains/requests`
    | `/creator/projects/${string}/traceability`
    | `/admin/domain-requests/${string}/decision`
    | `/projects/${string}/workspace`
    | `/projects/${string}/workspace/prompts`
    | `/projects/${string}/workspace/preview/refresh`
    | `/projects/${string}/workspace/container`
    | `/projects/${string}/workspace/container/stop`
    | `/projects/${string}/workspace/container/wake`
    | `/projects/${string}/database`
    | `/projects/${string}/database/sql`
    | `/projects/${string}/frontend/checkpoints`
    | `/projects/${string}/frontend/compare`
    | `/projects/${string}/frontend/restore`
    | `/projects/${string}/app/users`
    | `/projects/${string}/app/roles`
    | `/projects/${string}/app/invitations`
    | `/projects/${string}/app/access-requests`
    | `/projects/${string}/app/access-requests/decision`
    | `/projects/${string}/publish/review`
    | `/projects/${string}/publish`
    | "/app-store/registry"
    | "/store/apps"
    | `/store/apps/${string}`
    | `/store/apps/${string}/install`
    | `/store/apps/${string}/uninstall`
    | `/store/apps/${string}/access-requests`
    | `/store/apps/${string}/tickets`
    | `/store/tickets/${string}`
    | `/creator/projects/${string}/tickets`;
  headers?: HeaderBag;
  body?: Record<string, unknown>;
}

export interface PlatformResponse<T = unknown> {
  status: number;
  body: ApiResult<T>;
}

export function resolveCorePersistenceMode(env: RuntimeEnv = process.env): CorePersistenceMode {
  const mode = (env.EVCP_CORE_PERSISTENCE ?? "legacy").trim().toLowerCase();
  if (mode === "legacy" || mode === "memory" || mode === "prisma") return mode;
  throw new Error(`Unsupported EVCP_CORE_PERSISTENCE mode: ${env.EVCP_CORE_PERSISTENCE}`);
}

export async function createRuntimePlatformApiServices(env: RuntimeEnv = process.env): Promise<PersistenceAwarePlatformApiServices> {
  const services = createPlatformApiServices();
  const mode = resolveCorePersistenceMode(env);
  if (mode === "legacy") return services;
  if (mode === "memory") {
    return {
      ...services,
      corePersistence: createCoreRepositoryBackedService(new MemoryCorePersistenceClient()),
      aiGovernancePersistence: createAiGovernanceRepositoryBackedService(new MemoryAiGovernancePersistenceClient()),
      prdPersistence: createPrdRepositoryBackedService(new MemoryPrdPersistenceClient()),
      workspacePersistence: createWorkspaceRepositoryBackedService(new MemoryWorkspacePersistenceClient()),
      publishStorePersistence: createPublishStoreRepositoryBackedService(new MemoryPublishStorePersistenceClient()),
      generatedRuntimePersistence: createGeneratedRuntimeRepositoryBackedService(new MemoryGeneratedRuntimePersistenceClient())
    };
  }

  const { service } = await createPrismaCorePersistence(env.DATABASE_URL);
  const { service: aiGovernancePersistence } = await createPrismaAiGovernancePersistence(env.DATABASE_URL);
  const { service: prdPersistence } = await createPrismaPrdPersistence(env.DATABASE_URL);
  const { service: workspacePersistence } = await createPrismaWorkspacePersistence(env.DATABASE_URL);
  const { service: publishStorePersistence } = await createPrismaPublishStorePersistence(env.DATABASE_URL);
  const { service: generatedRuntimePersistence } = await createPrismaGeneratedRuntimePersistence(env.DATABASE_URL);
  return {
    ...services,
    corePersistence: service,
    aiGovernancePersistence,
    prdPersistence,
    workspacePersistence,
    publishStorePersistence,
    generatedRuntimePersistence
  };
}

function errorResponse(error: unknown): PlatformResponse {
  if (error instanceof Error && error.name === "MockAuthError") {
    return { status: HttpStatus.UNAUTHORIZED, body: failure("UNAUTHORIZED", error.message) };
  }

  if (error instanceof Error && error.name === "PermissionError") {
    return { status: HttpStatus.FORBIDDEN, body: failure("FORBIDDEN", error.message) };
  }

  if (error instanceof Error && error.name === "ValidationError") {
    return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: failure("VALIDATION_ERROR", error.message) };
  }

  if (error instanceof Error && error.name === "ConflictError") {
    return { status: HttpStatus.CONFLICT, body: failure("CONFLICT", error.message) };
  }

  if (error instanceof Error && error.name === "QuotaExceededError") {
    return { status: HttpStatus.TOO_MANY_REQUESTS, body: failure("QUOTA_EXCEEDED", error.message) };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: failure("INTERNAL_ERROR", "Unexpected platform API error") };
}

function sendPlatformResponse(response: HttpResponse, platformResponse: PlatformResponse): void {
  response.status(platformResponse.status).json(platformResponse.body);
}

async function sendPlatformResponseAsync(response: HttpResponse, platformResponse: Promise<PlatformResponse>): Promise<void> {
  sendPlatformResponse(response, await platformResponse);
}

async function resolvePersistenceAuth(services: PersistenceAwarePlatformApiServices, headers: HeaderBag): Promise<AuthResolution> {
  if (!services.corePersistence) throw new Error("Core persistence service is not configured");
  const resolution = services.auth.resolve(headers);
  if (resolution.mode === "platform_session") return resolution;
  return {
    ...resolution,
    user: await services.corePersistence.getUserByEmail(resolution.user.email)
  };
}

async function resolvePersistenceUser(services: PersistenceAwarePlatformApiServices, headers: HeaderBag) {
  if (services.corePersistence) return (await resolvePersistenceAuth(services, headers)).user;
  return services.auth.resolveCurrentUser(headers);
}

async function resolvePersistenceProject(services: PersistenceAwarePlatformApiServices, actor: Awaited<ReturnType<typeof resolvePersistenceUser>>, projectId: string): Promise<PlatformProject> {
  if (!services.corePersistence) throw new Error("Core persistence service is not configured");
  const project = (await services.corePersistence.listProjects(actor)).find((candidate) => candidate.id === projectId);
  if (!project) throw new PermissionError(`Role ${actor.role} cannot access project ${projectId}`);
  return project;
}

function buildAuthEvidence(resolution: AuthResolution) {
  return {
    mode: resolution.mode,
    sessionId: resolution.sessionId,
    expiresAt: resolution.expiresAt,
    legacyMockFallback: resolution.mode === "mock_header"
  };
}

function buildAuditFilterInput(body: Record<string, unknown> | undefined) {
  return {
    actorId: body?.actorId ? String(body.actorId) : undefined,
    action: body?.action ? String(body.action) : undefined,
    projectId: body?.projectId ? String(body.projectId) : undefined,
    appId: body?.appId ? String(body.appId) : undefined,
    severity: body?.severity ? (String(body.severity) as never) : undefined,
    dateFrom: body?.dateFrom ? String(body.dateFrom) : undefined,
    dateTo: body?.dateTo ? String(body.dateTo) : undefined
  };
}

function buildPersistencePrdPrompt(project: PlatformProject): string {
  return [
    `Create a PRD for ${project.name}.`,
    `Problem: ${project.businessProblem}`,
    `App type: ${project.appType}`,
    `Department: ${project.targetDepartment}`,
    `Users: ${project.intendedUsers.join(", ")}`,
    `Sensitivity: ${project.dataSensitivity}`
  ].join("\n");
}

function buildDeterministicPrdSummary(project: PlatformProject): string {
  return `Deterministic PRD fallback for ${project.name}: ${project.businessProblem}`;
}

function isPersistenceCoreRoute(request: PlatformRequest): boolean {
  return (
    request.path === "/auth/me" ||
    request.path === "/projects" ||
    request.path === "/audit-logs" ||
    request.path === "/audit-logs/filter"
  );
}

function isPersistenceAiGovernanceRoute(request: PlatformRequest): boolean {
  return (
    request.path === "/ai/providers" ||
    request.path === "/ai/api-keys" ||
    request.path === "/ai/routes" ||
    request.path === "/ai/quotas" ||
    request.path === "/guardrails/rules" ||
    request.path === "/guardrails/test" ||
    request.path === "/guardrails/events"
  );
}

function isPersistencePrdRoute(request: PlatformRequest): boolean {
  return (
    /^\/projects\/[^/]+\/prd\/generate$/.test(request.path) ||
    /^\/projects\/[^/]+\/prd\/baseline$/.test(request.path) ||
    /^\/projects\/[^/]+\/prd\/versions$/.test(request.path) ||
    /^\/projects\/[^/]+\/prd$/.test(request.path)
  );
}

function isPersistenceWorkspaceRoute(request: PlatformRequest): boolean {
  return (
    /^\/projects\/[^/]+\/workspace$/.test(request.path) ||
    /^\/projects\/[^/]+\/workspace\/prompts$/.test(request.path) ||
    /^\/projects\/[^/]+\/workspace\/preview\/refresh$/.test(request.path)
  );
}

function isPersistencePublishStoreRoute(request: PlatformRequest): boolean {
  return (
    /^\/projects\/[^/]+\/app\/users$/.test(request.path) ||
    /^\/projects\/[^/]+\/app\/roles$/.test(request.path) ||
    /^\/projects\/[^/]+\/app\/invitations$/.test(request.path) ||
    /^\/projects\/[^/]+\/app\/access-requests$/.test(request.path) ||
    /^\/projects\/[^/]+\/app\/access-requests\/decision$/.test(request.path) ||
    /^\/projects\/[^/]+\/publish\/review$/.test(request.path) ||
    /^\/projects\/[^/]+\/publish$/.test(request.path) ||
    request.path === "/app-store/registry" ||
    request.path === "/store/apps" ||
    /^\/store\/apps\/[^/]+$/.test(request.path) ||
    /^\/store\/apps\/[^/]+\/install$/.test(request.path) ||
    /^\/store\/apps\/[^/]+\/uninstall$/.test(request.path) ||
    /^\/store\/apps\/[^/]+\/access-requests$/.test(request.path) ||
    /^\/store\/apps\/[^/]+\/tickets$/.test(request.path) ||
    /^\/store\/tickets\/[^/]+$/.test(request.path) ||
    /^\/creator\/projects\/[^/]+\/tickets$/.test(request.path)
  );
}

function isPersistenceGeneratedRuntimeRoute(request: PlatformRequest): boolean {
  return (
    /^\/admin\/runtime\/projects\/[^/]+$/.test(request.path) ||
    /^\/admin\/runtime\/projects\/[^/]+\/schema\/check$/.test(request.path) ||
    /^\/admin\/runtime\/projects\/[^/]+\/health$/.test(request.path) ||
    /^\/admin\/runtime\/projects\/[^/]+\/openapi$/.test(request.path) ||
    /^\/admin\/runtime\/projects\/[^/]+\/migrations\/dry-run$/.test(request.path)
  );
}

async function resolvePersistedRuntimeInput(services: PersistenceAwarePlatformApiServices, actor: PlatformUser, projectId: string) {
  if (!services.publishStorePersistence) throw new Error("Publish Store persistence service is not configured");
  const project = await resolvePersistenceProject(services, actor, projectId);
  const manifest = await services.publishStorePersistence.getManifestForProject(actor, project);
  const deployment = await services.publishStorePersistence.getLatestDeploymentForProject(actor, project);
  return { project, manifest, deployment };
}

export async function executePlatformApiRequestAsync(services: PersistenceAwarePlatformApiServices, request: PlatformRequest): Promise<PlatformResponse> {
  const containerMatch = request.path.match(
    /^\/projects\/([^/]+)\/workspace\/container(?:\/(stop|wake))?$/
  );
  if (containerMatch) {
    const projectId = containerMatch[1];
    const action = containerMatch[2];
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const projectIds = services.projects.listProjects(user).map((project) => project.id);
    const auth = { userId: user.id, roles: user.role ? [user.role] : [], projectIds };
    const routes = createWorkspaceRoutes({ orchestrator: services.workspaceOrchestrator });
    let result;
    if (request.method === "POST" && !action) {
      result = await routes.provision(auth, { projectId, slug: String((request.body as Record<string, unknown> | undefined)?.slug ?? projectId) });
    } else if (request.method === "GET" && !action) {
      result = await routes.get(auth, { projectId });
    } else if (request.method === "POST" && action === "stop") {
      result = await routes.stop(auth, { projectId });
    } else if (request.method === "POST" && action === "wake") {
      result = await routes.wake(auth, { projectId });
    } else {
      return { status: HttpStatus.METHOD_NOT_ALLOWED, body: failure("METHOD_NOT_ALLOWED", "method not allowed") };
    }
    return {
      status: result.status,
      body: result.status < 400 ? success(result.body) : failure("WORKSPACE_ERROR", String(result.body.error ?? "error"))
    };
  }

  const corePersistence = services.corePersistence;
  const aiGovernancePersistence = services.aiGovernancePersistence;
  const prdPersistence = services.prdPersistence;
  const workspacePersistence = services.workspacePersistence;
  const publishStorePersistence = services.publishStorePersistence;
  const generatedRuntimePersistence = services.generatedRuntimePersistence;
  const useCorePersistence = Boolean(corePersistence && isPersistenceCoreRoute(request));
  const useAiGovernancePersistence = Boolean(aiGovernancePersistence && isPersistenceAiGovernanceRoute(request));
  const usePrdPersistence = Boolean(corePersistence && prdPersistence && isPersistencePrdRoute(request));
  const useWorkspacePersistence = Boolean(corePersistence && prdPersistence && workspacePersistence && isPersistenceWorkspaceRoute(request));
  const usePublishStorePersistence = Boolean(corePersistence && prdPersistence && workspacePersistence && publishStorePersistence && isPersistencePublishStoreRoute(request));
  const useGeneratedRuntimePersistence = Boolean(corePersistence && publishStorePersistence && generatedRuntimePersistence && isPersistenceGeneratedRuntimeRoute(request));
  if (
    !useCorePersistence &&
    !useAiGovernancePersistence &&
    !usePrdPersistence &&
    !useWorkspacePersistence &&
    !usePublishStorePersistence &&
    !useGeneratedRuntimePersistence
  ) return executePlatformApiRequest(services, request);

  try {
    if (corePersistence && request.method === "GET" && request.path === "/auth/me") {
      const authResolution = await resolvePersistenceAuth(services, request.headers ?? {});
      const user = authResolution.user;
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "auth.me",
        resourceType: "platform_user",
        resourceId: user.id,
        metadata: { authMode: authResolution.mode, sessionId: authResolution.sessionId }
      });
      return { status: HttpStatus.OK, body: success({ user, permissions: user.permissions, auth: buildAuthEvidence(authResolution) }) };
    }

    if (corePersistence && request.method === "GET" && request.path === "/projects") {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      services.auth.requireRole(user, ["admin", "creator"]);
      return { status: HttpStatus.OK, body: success(await corePersistence.listProjects(user)) };
    }

    if (corePersistence && request.method === "POST" && request.path === "/projects") {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      const project = await corePersistence.createProject({
        actor: user,
        name: String(request.body?.name ?? "Untitled Project"),
        slug: String(request.body?.slug ?? "untitled-project"),
        appType: request.body?.appType ? String(request.body.appType) : undefined,
        businessProblem: request.body?.businessProblem ? String(request.body.businessProblem) : undefined,
        targetDepartment: request.body?.targetDepartment ? String(request.body.targetDepartment) : undefined,
        intendedUsers: Array.isArray(request.body?.intendedUsers) ? request.body.intendedUsers.map(String) : undefined,
        dataSensitivity: request.body?.dataSensitivity ? (String(request.body.dataSensitivity) as never) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "project.created",
        resourceType: "project",
        resourceId: project.id,
        metadata: { projectId: project.id, slug: project.slug }
      });
      return { status: HttpStatus.CREATED, body: success(project) };
    }

    if (corePersistence && request.method === "GET" && request.path === "/audit-logs") {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(await corePersistence.filterAudit({})) };
    }

    if (corePersistence && request.method === "POST" && request.path === "/audit-logs/filter") {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(await corePersistence.filterAudit(buildAuditFilterInput(request.body))) };
    }

    if (aiGovernancePersistence && request.method === "GET" && request.path === "/ai/providers") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await aiGovernancePersistence.listProviders(user)) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/providers") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const provider = await aiGovernancePersistence.createProvider(user, {
        name: String(request.body?.name ?? ""),
        adapter: String(request.body?.adapter ?? "mock") as never,
        baseUrl: String(request.body?.baseUrl ?? ""),
        models: Array.isArray(request.body?.models) ? request.body.models.map(String) : []
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (aiGovernancePersistence && request.method === "GET" && request.path === "/ai/api-keys") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await aiGovernancePersistence.listApiKeys(user)) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/api-keys") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const key = await aiGovernancePersistence.createApiKey(user, {
        providerId: String(request.body?.providerId ?? ""),
        name: String(request.body?.name ?? ""),
        secret: String(request.body?.secret ?? ""),
        usageMode: String(request.body?.usageMode ?? "production") as never,
        quotaTokens: Number(request.body?.quotaTokens ?? 0),
        fallbackPriority: Number(request.body?.fallbackPriority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(key) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/routes") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const route = await aiGovernancePersistence.configureRoute(user, {
        scenario: String(request.body?.scenario ?? "prd_generation") as never,
        primaryProviderId: String(request.body?.primaryProviderId ?? ""),
        primaryModel: String(request.body?.primaryModel ?? ""),
        fallbackProviderId: request.body?.fallbackProviderId ? String(request.body.fallbackProviderId) : undefined,
        fallbackModel: request.body?.fallbackModel ? String(request.body.fallbackModel) : undefined
      });
      return { status: HttpStatus.OK, body: success(route) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/quotas") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const quota = await aiGovernancePersistence.configureQuota(user, {
        scope: String(request.body?.scope ?? "organization") as never,
        dailyLimit: Number(request.body?.dailyLimit ?? 0),
        monthlyLimit: Number(request.body?.monthlyLimit ?? 0),
        warningThreshold: Number(request.body?.warningThreshold ?? 0),
        hardStop: Boolean(request.body?.hardStop ?? true),
        usedToday: Number(request.body?.usedToday ?? 0)
      });
      return { status: HttpStatus.OK, body: success(quota) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/guardrails/rules") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const rule = await aiGovernancePersistence.createGuardrailRule(user, {
        name: String(request.body?.name ?? ""),
        type: String(request.body?.type ?? "keyword") as never,
        pattern: String(request.body?.pattern ?? ""),
        severity: String(request.body?.severity ?? "warning") as never,
        action: String(request.body?.action ?? "warn") as never,
        scope: String(request.body?.scope ?? "organization") as never
      });
      return { status: HttpStatus.CREATED, body: success(rule) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/guardrails/test") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const result = await aiGovernancePersistence.testPrompt(user, {
        prompt: String(request.body?.prompt ?? ""),
        scenario: String(request.body?.scenario ?? "prd_generation")
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (aiGovernancePersistence && request.method === "GET" && request.path === "/guardrails/events") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await aiGovernancePersistence.listGuardrailEvents(user)) };
    }

    const prdGenerateMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/generate$/);
    if (corePersistence && prdPersistence && request.method === "POST" && prdGenerateMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, prdGenerateMatch[1]);
      const sourcePrompt = buildPersistencePrdPrompt(project);
      const guardrail = services.guardrails.evaluatePrompt(user, {
        prompt: sourcePrompt,
        scenario: "prd_generation"
      });
      if (guardrail.decision === "block") {
        throw new ValidationError(`PRD generation blocked by guardrail: ${guardrail.matchedRule?.name ?? guardrail.severity}`);
      }
      const completion = services.aiGovernance.invokeCompletion(user, {
        projectId: project.id,
        scenario: "prd_generation",
        prompt: sourcePrompt,
        requestedTokens: 300,
        guardrailDecision: guardrail.decision,
        dryRun: true,
        allowDeterministicFallback: true,
        deterministicFallbackText: buildDeterministicPrdSummary(project)
      });
      const draft = await prdPersistence.generateDraft(user, {
        project,
        sourcePrompt,
        generatedBy: {
          scenario: "prd_generation",
          providerId: completion.providerId,
          model: completion.model
        },
        aiSummary: completion.text
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "prd.draft.generated",
        resourceType: "prd_version",
        resourceId: draft.id,
        metadata: {
          projectId: project.id,
          guardrailDecision: guardrail.decision,
          aiUsageLogId: completion.usageLogId,
          aiStatus: completion.status,
          fallbackUsed: completion.fallbackUsed,
          tokensUsed: completion.tokensUsed
        }
      });
      return { status: HttpStatus.CREATED, body: success(draft) };
    }

    const prdBaselineMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/baseline$/);
    if (corePersistence && prdPersistence && request.method === "POST" && prdBaselineMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, prdBaselineMatch[1]);
      const baseline = await prdPersistence.confirmBaseline(user, project, String(request.body?.versionId ?? ""));
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "prd.baseline.confirmed",
        resourceType: "prd_version",
        resourceId: baseline.id,
        metadata: { projectId: project.id, sourceVersionId: request.body?.versionId ? String(request.body.versionId) : "" }
      });
      return { status: HttpStatus.OK, body: success(baseline) };
    }

    const prdVersionsMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/versions$/);
    if (prdPersistence && request.method === "GET" && prdVersionsMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, prdVersionsMatch[1]);
      return { status: HttpStatus.OK, body: success(await prdPersistence.listVersions(user, project)) };
    }

    const prdCurrentMatch = request.path.match(/^\/projects\/([^/]+)\/prd$/);
    if (prdPersistence && request.method === "GET" && prdCurrentMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, prdCurrentMatch[1]);
      return { status: HttpStatus.OK, body: success(await prdPersistence.getCurrent(user, project)) };
    }

    const workspacePromptMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/prompts$/);
    if (corePersistence && prdPersistence && workspacePersistence && request.method === "POST" && workspacePromptMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      services.auth.requireRole(user, ["admin", "creator"]);
      const project = await resolvePersistenceProject(services, user, workspacePromptMatch[1]);
      const baseline = await prdPersistence.getCurrent(user, project);
      const prompt = String(request.body?.prompt ?? "");
      const guardrail = services.guardrails.evaluatePrompt(user, {
        prompt,
        scenario: "frontend_coding"
      });

      if (guardrail.decision === "block") {
        const blocked = await workspacePersistence.blockPrompt(user, { project, baseline, prompt, guardrail });
        await corePersistence.recordAudit({
          actorId: user.id,
          action: "workspace.prompt.blocked",
          resourceType: "workspace_task",
          resourceId: blocked.task.id,
          severity: "warning",
          metadata: { projectId: project.id, guardrailEventId: guardrail.eventId }
        });
        return { status: HttpStatus.OK, body: success(blocked) };
      }

      const route = services.aiGovernance.resolveRoute("frontend_coding");
      const requestEstimate = 120;
      const quota = services.aiGovernance.checkQuota("creator", requestEstimate);
      if (!quota.allowed) {
        throw new QuotaExceededError(`Creator quota exceeded. Remaining today: ${quota.remainingToday}`);
      }
      services.aiGovernance.recordProviderCall();
      const result = await workspacePersistence.submitPrompt(user, {
        project,
        baseline,
        prompt,
        guardrail,
        route: route.primary,
        tokensUsed: requestEstimate
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "workspace.prompt.accepted",
        resourceType: "workspace_task",
        resourceId: result.task.id,
        metadata: {
          projectId: project.id,
          previewVersion: result.preview.version,
          tokensUsed: result.usage?.tokensUsed ?? 0
        }
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    const workspaceRefreshMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/preview\/refresh$/);
    if (prdPersistence && workspacePersistence && request.method === "POST" && workspaceRefreshMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, workspaceRefreshMatch[1]);
      const baseline = await prdPersistence.getCurrent(user, project);
      return { status: HttpStatus.OK, body: success(await workspacePersistence.refreshPreview(user, { project, baseline })) };
    }

    const workspaceMatch = request.path.match(/^\/projects\/([^/]+)\/workspace$/);
    if (prdPersistence && workspacePersistence && request.method === "GET" && workspaceMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, workspaceMatch[1]);
      const baseline = await prdPersistence.getCurrent(user, project);
      return { status: HttpStatus.OK, body: success(await workspacePersistence.getWorkspace(user, { project, baseline })) };
    }

    const persistedAppUsersMatch = request.path.match(/^\/projects\/([^/]+)\/app\/users$/);
    if (corePersistence && publishStorePersistence && request.method === "GET" && persistedAppUsersMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedAppUsersMatch[1]);
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.getAppAccessSnapshot(user, { project })) };
    }

    const persistedAppRolesMatch = request.path.match(/^\/projects\/([^/]+)\/app\/roles$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedAppRolesMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedAppRolesMatch[1]);
      const role = await publishStorePersistence.createRole(user, {
        project,
        key: String(request.body?.key ?? ""),
        name: String(request.body?.name ?? ""),
        description: request.body?.description ? String(request.body.description) : undefined,
        permissions: Array.isArray(request.body?.permissions) ? request.body.permissions.map(String) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "app.role.saved",
        resourceType: "app_role",
        resourceId: role.id,
        metadata: { projectId: project.id, permissions: role.permissions }
      });
      return { status: HttpStatus.CREATED, body: success(role) };
    }

    const persistedAppInvitationsMatch = request.path.match(/^\/projects\/([^/]+)\/app\/invitations$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedAppInvitationsMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedAppInvitationsMatch[1]);
      const invitation = await publishStorePersistence.createInvitation(user, {
        project,
        email: String(request.body?.email ?? ""),
        roleKey: String(request.body?.roleKey ?? "employee"),
        userType: String(request.body?.userType ?? "internal") as never,
        expiresAt: request.body?.expiresAt ? String(request.body.expiresAt) : undefined,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: invitation.status === "approval_required" ? "app.invitation.policy_required" : "app.invitation.created",
        resourceType: "app_invitation",
        resourceId: invitation.id,
        severity: invitation.status === "approval_required" ? "warning" : "info",
        metadata: { projectId: project.id, email: invitation.email, roleKey: invitation.roleKey, userType: invitation.userType }
      });
      return { status: HttpStatus.CREATED, body: success(invitation) };
    }

    const persistedAppAccessRequestsMatch = request.path.match(/^\/projects\/([^/]+)\/app\/access-requests$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedAppAccessRequestsMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedAppAccessRequestsMatch[1]);
      const accessRequest = await publishStorePersistence.createAccessRequest(user, {
        project,
        requesterEmail: String(request.body?.requesterEmail ?? ""),
        requestedRoleKey: String(request.body?.requestedRoleKey ?? "employee"),
        reason: String(request.body?.reason ?? "")
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "app.access_request.created",
        resourceType: "app_access_request",
        resourceId: accessRequest.id,
        metadata: { projectId: project.id, requesterEmail: accessRequest.requesterEmail, requestedRoleKey: accessRequest.requestedRoleKey }
      });
      return { status: HttpStatus.CREATED, body: success(accessRequest) };
    }

    const persistedAppAccessDecisionMatch = request.path.match(/^\/projects\/([^/]+)\/app\/access-requests\/decision$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedAppAccessDecisionMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedAppAccessDecisionMatch[1]);
      const accessRequest = await publishStorePersistence.decideAccessRequest(user, {
        project,
        requestId: String(request.body?.requestId ?? ""),
        decision: String(request.body?.decision ?? "approved") as never,
        decidedByUserId: request.body?.decidedByUserId ? String(request.body.decidedByUserId) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: accessRequest.status === "approved" ? "app.access_request.approved" : "app.access_request.rejected",
        resourceType: "app_access_request",
        resourceId: accessRequest.id,
        metadata: { projectId: project.id, requestedRoleKey: accessRequest.requestedRoleKey }
      });
      return { status: HttpStatus.OK, body: success(accessRequest) };
    }

    const persistedPublishReviewMatch = request.path.match(/^\/projects\/([^/]+)\/publish\/review$/);
    if (corePersistence && prdPersistence && workspacePersistence && publishStorePersistence && request.method === "GET" && persistedPublishReviewMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedPublishReviewMatch[1]);
      const baseline = await prdPersistence.getCurrent(user, project);
      const preview = await workspacePersistence.refreshPreview(user, { project, baseline });
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.getPublishReview(user, { project, baseline, preview })) };
    }

    const persistedPublishMatch = request.path.match(/^\/projects\/([^/]+)\/publish$/);
    if (corePersistence && prdPersistence && workspacePersistence && publishStorePersistence && request.method === "POST" && persistedPublishMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedPublishMatch[1]);
      const baseline = await prdPersistence.getCurrent(user, project);
      const preview = await workspacePersistence.refreshPreview(user, { project, baseline });
      const result = await publishStorePersistence.publishApp(user, { project, baseline, preview });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "app.publish.completed",
        resourceType: "publish_request",
        resourceId: result.publishRequest.id,
        metadata: {
          projectId: project.id,
          deploymentId: result.deployment.id,
          registryEntryId: result.registryEntry.id,
          manifestVersion: result.manifest.manifestVersion
        }
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (publishStorePersistence && request.method === "GET" && request.path === "/app-store/registry") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.listRegistry(user)) };
    }

    if (publishStorePersistence && request.method === "GET" && request.path === "/store/apps") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.listStoreApps(user)) };
    }

    const persistedStoreInstallMatch = request.path.match(/^\/store\/apps\/([^/]+)\/install$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedStoreInstallMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const installation = await publishStorePersistence.installStoreApp(user, { appSlug: persistedStoreInstallMatch[1] });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "store.app.installed",
        resourceType: "app_installation",
        resourceId: installation.id,
        metadata: { projectId: installation.projectId, appId: installation.appId, appSlug: installation.appSlug }
      });
      return { status: HttpStatus.CREATED, body: success(installation) };
    }

    const persistedStoreUninstallMatch = request.path.match(/^\/store\/apps\/([^/]+)\/uninstall$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedStoreUninstallMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const installation = await publishStorePersistence.uninstallStoreApp(user, { appSlug: persistedStoreUninstallMatch[1] });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "store.app.uninstalled",
        resourceType: "app_installation",
        resourceId: installation.id,
        metadata: { projectId: installation.projectId, appId: installation.appId, appSlug: installation.appSlug }
      });
      return { status: HttpStatus.OK, body: success(installation) };
    }

    const persistedStoreAccessMatch = request.path.match(/^\/store\/apps\/([^/]+)\/access-requests$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedStoreAccessMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const accessRequest = await publishStorePersistence.requestStoreAccess(user, {
        appSlug: persistedStoreAccessMatch[1],
        requestedRoleKey: String(request.body?.requestedRoleKey ?? "employee"),
        reason: String(request.body?.reason ?? ""),
        department: request.body?.department ? String(request.body.department) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "store.access_request.created",
        resourceType: "app_access_request",
        resourceId: accessRequest.id,
        metadata: { appSlug: accessRequest.appSlug, requestedRoleKey: accessRequest.requestedRoleKey, department: accessRequest.department }
      });
      return { status: HttpStatus.CREATED, body: success(accessRequest) };
    }

    const persistedStoreTicketCreateMatch = request.path.match(/^\/store\/apps\/([^/]+)\/tickets$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedStoreTicketCreateMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const ticket = await publishStorePersistence.createTicket(user, {
        appSlug: persistedStoreTicketCreateMatch[1],
        type: String(request.body?.type ?? "bug") as never,
        priority: String(request.body?.priority ?? "medium") as never,
        title: String(request.body?.title ?? ""),
        description: String(request.body?.description ?? ""),
        deviceInfo: String(request.body?.deviceInfo ?? ""),
        screenshotUrl: request.body?.screenshotUrl ? String(request.body.screenshotUrl) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "ticket.created",
        resourceType: "support_ticket",
        resourceId: ticket.id,
        metadata: { appSlug: ticket.appSlug, type: ticket.type, priority: ticket.priority, assignedToUserId: ticket.assignedToUserId }
      });
      return { status: HttpStatus.CREATED, body: success(ticket) };
    }

    const persistedStoreTicketStatusMatch = request.path.match(/^\/store\/tickets\/([^/]+)$/);
    if (publishStorePersistence && request.method === "GET" && persistedStoreTicketStatusMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.getTicketStatus(user, persistedStoreTicketStatusMatch[1])) };
    }

    const persistedCreatorTicketInboxMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/tickets$/);
    if (corePersistence && publishStorePersistence && request.method === "GET" && persistedCreatorTicketInboxMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      await resolvePersistenceProject(services, user, persistedCreatorTicketInboxMatch[1]);
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.listCreatorInbox(user, persistedCreatorTicketInboxMatch[1])) };
    }

    const persistedStoreAppDetailMatch = request.path.match(/^\/store\/apps\/([^/]+)$/);
    if (publishStorePersistence && request.method === "GET" && persistedStoreAppDetailMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return { status: HttpStatus.OK, body: success(await publishStorePersistence.getStoreAppDetail(user, persistedStoreAppDetailMatch[1])) };
    }

    const persistedRuntimeOverviewMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)$/);
    if (corePersistence && generatedRuntimePersistence && request.method === "GET" && persistedRuntimeOverviewMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeOverviewMatch[1]);
      return { status: HttpStatus.OK, body: success(await generatedRuntimePersistence.getRuntimeOverview(user, runtimeInput)) };
    }

    const persistedRuntimeSchemaCheckMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/schema\/check$/);
    if (corePersistence && generatedRuntimePersistence && request.method === "POST" && persistedRuntimeSchemaCheckMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeSchemaCheckMatch[1]);
      const result = await generatedRuntimePersistence.checkSchemaAccess(user, {
        ...runtimeInput,
        attemptedSchema: String(request.body?.attemptedSchema ?? ""),
        operation: String(request.body?.operation ?? "select")
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: result.allowed ? "generated_runtime.schema_access.allowed" : "generated_runtime.schema_access.denied",
        resourceType: "generated_app_runtime",
        resourceId: runtimeInput.deployment.id,
        severity: result.allowed ? "info" : "warning",
        metadata: { projectId: runtimeInput.project.id, attemptedSchema: result.attemptedSchema, operation: result.operation }
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    const persistedRuntimeHealthMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/health$/);
    if (generatedRuntimePersistence && request.method === "GET" && persistedRuntimeHealthMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeHealthMatch[1]);
      return { status: HttpStatus.OK, body: success(await generatedRuntimePersistence.getRuntimeHealth(user, runtimeInput)) };
    }

    const persistedRuntimeOpenApiMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/openapi$/);
    if (generatedRuntimePersistence && request.method === "GET" && persistedRuntimeOpenApiMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeOpenApiMatch[1]);
      return { status: HttpStatus.OK, body: success(await generatedRuntimePersistence.getOpenApiContract(user, runtimeInput)) };
    }

    const persistedRuntimeMigrationDryRunMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/migrations\/dry-run$/);
    if (corePersistence && generatedRuntimePersistence && request.method === "POST" && persistedRuntimeMigrationDryRunMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeMigrationDryRunMatch[1]);
      const result = await generatedRuntimePersistence.runMigrationDryRun(user, {
        ...runtimeInput,
        migrationId: String(request.body?.migrationId ?? ""),
        destructiveChanges: Array.isArray(request.body?.destructiveChanges) ? request.body.destructiveChanges.map(String) : [],
        approvalId: request.body?.approvalId ? String(request.body.approvalId) : undefined
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: result.status === "blocked" ? "generated_runtime.migration_dry_run.blocked" : "generated_runtime.migration_dry_run.passed",
        resourceType: "generated_app_runtime",
        resourceId: runtimeInput.deployment.id,
        severity: result.status === "blocked" ? "warning" : "info",
        metadata: { projectId: runtimeInput.project.id, migrationId: result.migrationId, destructiveChanges: result.destructiveChanges }
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    return executePlatformApiRequest(services, request);
  } catch (error) {
    return errorResponse(error);
  }
}

export function executePlatformApiRequest(services: PlatformApiServices, request: PlatformRequest): PlatformResponse {
  try {
    if (request.method === "GET" && request.path === "/health") {
      return {
        status: HttpStatus.OK,
        body: success({
          service: "platform-api",
          status: "healthy",
          dependencies: {
            database: "configured",
            authMode: "platform_session_with_mock_fallback"
          }
        })
      };
    }

    if (request.method === "GET" && request.path === "/auth/me") {
      const authResolution = services.auth.resolve(request.headers ?? {});
      const user = authResolution.user;

      services.audit.record({
        actorId: user.id,
        action: "auth.me",
        resourceType: "platform_user",
        resourceId: user.id,
        metadata: { authMode: authResolution.mode, sessionId: authResolution.sessionId }
      });

      return {
        status: HttpStatus.OK,
        body: success({
          user,
          permissions: user.permissions,
          auth: buildAuthEvidence(authResolution)
        })
      };
    }

    if (request.method === "GET" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin", "creator"]);
      return { status: HttpStatus.OK, body: success(services.projects.listProjects(user)) };
    }

    if (request.method === "POST" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const project = services.projects.createProject({
        actor: user,
        name: String(request.body?.name ?? "Untitled Project"),
        slug: String(request.body?.slug ?? "untitled-project"),
        appType: request.body?.appType ? String(request.body.appType) : undefined,
        businessProblem: request.body?.businessProblem ? String(request.body.businessProblem) : undefined,
        targetDepartment: request.body?.targetDepartment ? String(request.body.targetDepartment) : undefined,
        intendedUsers: Array.isArray(request.body?.intendedUsers) ? request.body.intendedUsers.map(String) : undefined,
        dataSensitivity: request.body?.dataSensitivity ? (String(request.body.dataSensitivity) as never) : undefined
      });

      return { status: HttpStatus.CREATED, body: success(project) };
    }

    const prdGenerateMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/generate$/);
    if (request.method === "POST" && prdGenerateMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const draft = services.prds.generateDraft(user, prdGenerateMatch[1]);
      return { status: HttpStatus.CREATED, body: success(draft) };
    }

    const prdBaselineMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/baseline$/);
    if (request.method === "POST" && prdBaselineMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const baseline = services.prds.confirmBaseline(user, prdBaselineMatch[1], String(request.body?.versionId ?? ""));
      return { status: HttpStatus.OK, body: success(baseline) };
    }

    const prdVersionsMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/versions$/);
    if (request.method === "GET" && prdVersionsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prds.listVersions(user, prdVersionsMatch[1])) };
    }

    const prdCurrentMatch = request.path.match(/^\/projects\/([^/]+)\/prd$/);
    if (request.method === "GET" && prdCurrentMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prds.getCurrent(user, prdCurrentMatch[1])) };
    }

    const workspacePromptMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/prompts$/);
    if (request.method === "POST" && workspacePromptMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.workspace.submitPrompt(user, workspacePromptMatch[1], {
        prompt: String(request.body?.prompt ?? "")
      });
      return {
        status: result.guardrail.decision === "block" ? HttpStatus.OK : HttpStatus.CREATED,
        body: success(result)
      };
    }

    const workspaceRefreshMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/preview\/refresh$/);
    if (request.method === "POST" && workspaceRefreshMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.workspace.refreshPreview(user, workspaceRefreshMatch[1])) };
    }

    const workspaceMatch = request.path.match(/^\/projects\/([^/]+)\/workspace$/);
    if (request.method === "GET" && workspaceMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.workspace.getWorkspace(user, workspaceMatch[1])) };
    }

    const databaseMatch = request.path.match(/^\/projects\/([^/]+)\/database$/);
    if (request.method === "GET" && databaseMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.databaseView.getDatabaseView(user, databaseMatch[1])) };
    }

    const databaseSqlMatch = request.path.match(/^\/projects\/([^/]+)\/database\/sql$/);
    if (request.method === "POST" && databaseSqlMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.databaseView.executeRawSql(user, databaseSqlMatch[1], String(request.body?.sql ?? ""));
    }

    const frontendCheckpointsMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/checkpoints$/);
    if (request.method === "GET" && frontendCheckpointsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.frontendVersions.getTimeline(user, frontendCheckpointsMatch[1])) };
    }

    const frontendCompareMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/compare$/);
    if (request.method === "POST" && frontendCompareMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.frontendVersions.compareCheckpoints(user, frontendCompareMatch[1], {
            fromCheckpointId: String(request.body?.fromCheckpointId ?? ""),
            toCheckpointId: request.body?.toCheckpointId ? String(request.body.toCheckpointId) : undefined
          })
        )
      };
    }

    const frontendRestoreMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/restore$/);
    if (request.method === "POST" && frontendRestoreMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.frontendVersions.restoreFrontend(user, frontendRestoreMatch[1], String(request.body?.checkpointId ?? "")))
      };
    }

    const appUsersMatch = request.path.match(/^\/projects\/([^/]+)\/app\/users$/);
    if (request.method === "GET" && appUsersMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.appAccess.getSnapshot(user, appUsersMatch[1])) };
    }

    const appRolesMatch = request.path.match(/^\/projects\/([^/]+)\/app\/roles$/);
    if (request.method === "POST" && appRolesMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const role = services.appAccess.createRole(user, appRolesMatch[1], {
        key: String(request.body?.key ?? ""),
        name: String(request.body?.name ?? ""),
        description: request.body?.description ? String(request.body.description) : undefined,
        permissions: Array.isArray(request.body?.permissions) ? request.body.permissions.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(role) };
    }

    const appInvitationsMatch = request.path.match(/^\/projects\/([^/]+)\/app\/invitations$/);
    if (request.method === "POST" && appInvitationsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const invitation = services.appAccess.createInvitation(user, appInvitationsMatch[1], {
        email: String(request.body?.email ?? ""),
        roleKey: String(request.body?.roleKey ?? ""),
        userType: String(request.body?.userType ?? "internal") as never,
        expiresAt: request.body?.expiresAt ? String(request.body.expiresAt) : undefined,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(invitation) };
    }

    const appAccessRequestsMatch = request.path.match(/^\/projects\/([^/]+)\/app\/access-requests$/);
    if (request.method === "POST" && appAccessRequestsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const accessRequest = services.appAccess.createAccessRequest(user, appAccessRequestsMatch[1], {
        requesterEmail: String(request.body?.requesterEmail ?? ""),
        requestedRoleKey: String(request.body?.requestedRoleKey ?? ""),
        reason: String(request.body?.reason ?? "")
      });
      return { status: HttpStatus.CREATED, body: success(accessRequest) };
    }

    const appAccessDecisionMatch = request.path.match(/^\/projects\/([^/]+)\/app\/access-requests\/decision$/);
    if (request.method === "POST" && appAccessDecisionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const accessRequest = services.appAccess.decideAccessRequest(user, appAccessDecisionMatch[1], {
        requestId: String(request.body?.requestId ?? ""),
        decision: String(request.body?.decision ?? "approved") as never,
        decidedByUserId: request.body?.decidedByUserId ? String(request.body.decidedByUserId) : undefined
      });
      return { status: HttpStatus.OK, body: success(accessRequest) };
    }

    const publishReviewMatch = request.path.match(/^\/projects\/([^/]+)\/publish\/review$/);
    if (request.method === "GET" && publishReviewMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.publish.getReview(user, publishReviewMatch[1])) };
    }

    const publishMatch = request.path.match(/^\/projects\/([^/]+)\/publish$/);
    if (request.method === "POST" && publishMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.CREATED, body: success(services.publish.publishApp(user, publishMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/app-store/registry") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.publish.listRegistry(user)) };
    }

    if (request.method === "GET" && request.path === "/store/apps") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.storefront.listApps(user)) };
    }

    const storeAccessMatch = request.path.match(/^\/store\/apps\/([^/]+)\/access-requests$/);
    if (request.method === "POST" && storeAccessMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const accessRequest = services.storefront.requestAccess(user, storeAccessMatch[1], {
        requestedRoleKey: String(request.body?.requestedRoleKey ?? ""),
        reason: String(request.body?.reason ?? ""),
        department: request.body?.department ? String(request.body.department) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(accessRequest) };
    }

    const storeTicketCreateMatch = request.path.match(/^\/store\/apps\/([^/]+)\/tickets$/);
    if (request.method === "POST" && storeTicketCreateMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const ticket = services.tickets.createTicket(user, storeTicketCreateMatch[1], {
        type: String(request.body?.type ?? "bug") as never,
        priority: String(request.body?.priority ?? "medium") as never,
        title: String(request.body?.title ?? ""),
        description: String(request.body?.description ?? ""),
        deviceInfo: String(request.body?.deviceInfo ?? ""),
        screenshotUrl: request.body?.screenshotUrl ? String(request.body.screenshotUrl) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(ticket) };
    }

    const storeAppDetailMatch = request.path.match(/^\/store\/apps\/([^/]+)$/);
    if (request.method === "GET" && storeAppDetailMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.storefront.getAppDetail(user, storeAppDetailMatch[1])) };
    }

    const storeTicketStatusMatch = request.path.match(/^\/store\/tickets\/([^/]+)$/);
    if (request.method === "GET" && storeTicketStatusMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.tickets.getTicketStatus(user, storeTicketStatusMatch[1])) };
    }

    const creatorTicketInboxMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/tickets$/);
    if (request.method === "GET" && creatorTicketInboxMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.tickets.listCreatorInbox(user, creatorTicketInboxMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/audit-logs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.audit.list()) };
    }

    if (request.method === "POST" && request.path === "/audit-logs/filter") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return {
        status: HttpStatus.OK,
        body: success(
          services.audit.filter({
            actorId: request.body?.actorId ? String(request.body.actorId) : undefined,
            action: request.body?.action ? String(request.body.action) : undefined,
            projectId: request.body?.projectId ? String(request.body.projectId) : undefined,
            appId: request.body?.appId ? String(request.body.appId) : undefined,
            severity: request.body?.severity ? (String(request.body.severity) as never) : undefined,
            dateFrom: request.body?.dateFrom ? String(request.body.dateFrom) : undefined,
            dateTo: request.body?.dateTo ? String(request.body.dateTo) : undefined
          })
        )
      };
    }

    if (request.method === "GET" && request.path === "/admin/knowledge/sources") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.knowledge.listSources(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/knowledge/sources") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const source = services.knowledge.createSource(user, {
        title: String(request.body?.title ?? ""),
        sourceType: String(request.body?.sourceType ?? "text") as never,
        ownerUserId: String(request.body?.ownerUserId ?? user.id),
        scope: (request.body?.scope ?? { visibility: "global" }) as never,
        uploadStatus: request.body?.uploadStatus ? (String(request.body.uploadStatus) as never) : undefined,
        indexStatus: request.body?.indexStatus ? (String(request.body.indexStatus) as never) : undefined,
        tags: Array.isArray(request.body?.tags) ? request.body.tags.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(source) };
    }

    const knowledgeVersionMatch = request.path.match(/^\/admin\/knowledge\/sources\/([^/]+)\/versions$/);
    if (request.method === "POST" && knowledgeVersionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const version = services.knowledge.submitVersion(user, knowledgeVersionMatch[1], {
        version: request.body?.version ? String(request.body.version) : undefined,
        contentHash: String(request.body?.contentHash ?? ""),
        changelog: String(request.body?.changelog ?? ""),
        chunkCount: Number(request.body?.chunkCount ?? 0),
        excerpts: Array.isArray(request.body?.excerpts) ? request.body.excerpts.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(version) };
    }

    const knowledgeApproveMatch = request.path.match(/^\/admin\/knowledge\/versions\/([^/]+)\/approve$/);
    if (request.method === "POST" && knowledgeApproveMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.knowledge.approveVersion(user, {
        versionId: knowledgeApproveMatch[1],
        decision: String(request.body?.decision ?? "approved") as never,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/knowledge/retrieve") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.knowledge.retrieve(user, {
        projectId: request.body?.projectId ? String(request.body.projectId) : undefined,
        appId: request.body?.appId ? String(request.body.appId) : undefined,
        department: request.body?.department ? String(request.body.department) : undefined,
        agentRole: String(request.body?.agentRole ?? "frontend_developer") as never,
        scenario: String(request.body?.scenario ?? "frontend_coding") as never,
        query: request.body?.query ? String(request.body.query) : undefined,
        requiredKnowledgeSourceIds: Array.isArray(request.body?.requiredKnowledgeSourceIds) ? request.body.requiredKnowledgeSourceIds.map(String) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/knowledge/retrieval-logs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.knowledge.listRetrievalLogs(user)) };
    }

    if (request.method === "GET" && request.path === "/admin/skills") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.skills.listSkills(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/skills") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const skill = services.skills.createSkill(user, {
        key: String(request.body?.key ?? ""),
        name: String(request.body?.name ?? ""),
        description: request.body?.description ? String(request.body.description) : undefined,
        ownerUserId: String(request.body?.ownerUserId ?? user.id)
      });
      return { status: HttpStatus.CREATED, body: success(skill) };
    }

    const skillVersionMatch = request.path.match(/^\/admin\/skills\/([^/]+)\/versions$/);
    if (request.method === "POST" && skillVersionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const version = services.skills.submitVersion(user, skillVersionMatch[1], {
        version: request.body?.version ? String(request.body.version) : undefined,
        instruction: String(request.body?.instruction ?? ""),
        inputSchema: (request.body?.inputSchema ?? {}) as Record<string, unknown>,
        outputSchema: (request.body?.outputSchema ?? {}) as Record<string, unknown>,
        requiredKnowledgeSourceIds: Array.isArray(request.body?.requiredKnowledgeSourceIds) ? request.body.requiredKnowledgeSourceIds.map(String) : undefined,
        allowedTools: Array.isArray(request.body?.allowedTools) ? request.body.allowedTools.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(version) };
    }

    const skillApproveMatch = request.path.match(/^\/admin\/skills\/versions\/([^/]+)\/approve$/);
    if (request.method === "POST" && skillApproveMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.skills.approveVersion(user, {
        versionId: skillApproveMatch[1],
        decision: String(request.body?.decision ?? "approved") as never,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    const skillDisableMatch = request.path.match(/^\/admin\/skills\/([^/]+)\/disable$/);
    if (request.method === "POST" && skillDisableMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const skill = services.skills.disableSkill(user, skillDisableMatch[1], String(request.body?.reason ?? ""));
      return { status: HttpStatus.OK, body: success(skill) };
    }

    if (request.method === "POST" && request.path === "/admin/skills/assignments") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const assignment = services.skills.assign(user, {
        skillVersionId: String(request.body?.skillVersionId ?? ""),
        agentRole: String(request.body?.agentRole ?? "frontend_developer") as never,
        scenario: String(request.body?.scenario ?? "frontend_coding") as never,
        scopeType: String(request.body?.scopeType ?? "global") as never,
        scopeId: String(request.body?.scopeId ?? "global"),
        priority: Number(request.body?.priority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(assignment) };
    }

    if (request.method === "POST" && request.path === "/admin/skills/resolve") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.skills.resolve(user, {
        projectId: request.body?.projectId ? String(request.body.projectId) : undefined,
        appId: request.body?.appId ? String(request.body.appId) : undefined,
        department: request.body?.department ? String(request.body.department) : undefined,
        agentRole: String(request.body?.agentRole ?? "frontend_developer") as never,
        scenario: String(request.body?.scenario ?? "frontend_coding") as never
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/installer/preflight") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.operations.runPreflight(user, {
        cpuCores: Number(request.body?.cpuCores ?? 0),
        memoryGb: Number(request.body?.memoryGb ?? 0),
        diskFreeGb: Number(request.body?.diskFreeGb ?? 0),
        os: request.body?.os ? String(request.body.os) : undefined,
        dockerVersion: request.body?.dockerVersion ? String(request.body.dockerVersion) : undefined,
        composeVersion: request.body?.composeVersion ? String(request.body.composeVersion) : undefined,
        portsAvailable: Array.isArray(request.body?.portsAvailable) ? request.body.portsAvailable.map(Number) : undefined,
        dnsReady: Boolean(request.body?.dnsReady),
        tlsReady: Boolean(request.body?.tlsReady),
        networkReady: Boolean(request.body?.networkReady)
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/installer/setup") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.operations.saveSetupConfig(user, {
        domain: String(request.body?.domain ?? ""),
        databaseUrl: String(request.body?.databaseUrl ?? ""),
        storage: (request.body?.storage ?? {}) as Record<string, string | undefined>,
        auth: (request.body?.auth ?? {}) as Record<string, unknown>,
        ai: (request.body?.ai ?? {}) as Record<string, unknown>,
        guardrail: (request.body?.guardrail ?? {}) as Record<string, unknown>,
        backup: (request.body?.backup ?? {}) as Record<string, unknown>,
        firstAdmin: (request.body?.firstAdmin ?? {}) as Record<string, unknown>
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/installer/reports") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.operations.getOverview(user).installerReports) };
    }

    if (request.method === "POST" && request.path === "/admin/backup/policies") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.operations.configureBackupPolicy(user, {
        name: String(request.body?.name ?? ""),
        schedule: String(request.body?.schedule ?? ""),
        retentionDays: Number(request.body?.retentionDays ?? 0),
        storage: (request.body?.storage ?? {}) as Record<string, string | undefined>,
        encryptionMode: String(request.body?.encryptionMode ?? ""),
        encryptionKeyRef: String(request.body?.encryptionKeyRef ?? ""),
        enabled: Boolean(request.body?.enabled)
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/backup/runs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.operations.runBackup(user, {
        policyId: String(request.body?.policyId ?? ""),
        trigger: String(request.body?.trigger ?? "manual") as never,
        databaseName: String(request.body?.databaseName ?? "evcp")
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/backup/pitr") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.operations.configurePitr(user, {
        databaseName: String(request.body?.databaseName ?? "evcp"),
        walRetentionHours: Number(request.body?.walRetentionHours ?? 0),
        baseBackupRunId: String(request.body?.baseBackupRunId ?? ""),
        targetTimestamp: String(request.body?.targetTimestamp ?? ""),
        rpoMinutes: Number(request.body?.rpoMinutes ?? 0),
        rtoMinutes: Number(request.body?.rtoMinutes ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/backup/restore-drills") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.operations.runRestoreDrill(user, {
        backupRunId: String(request.body?.backupRunId ?? ""),
        pitrConfigId: String(request.body?.pitrConfigId ?? ""),
        targetTimestamp: String(request.body?.targetTimestamp ?? ""),
        validationChecks: Array.isArray(request.body?.validationChecks) ? request.body.validationChecks.map(String) : [],
        forceFailureChecks: Array.isArray(request.body?.forceFailureChecks) ? request.body.forceFailureChecks.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/backup/overview") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.operations.getOverview(user)) };
    }

    if (request.method === "GET" && request.path === "/admin/production/observability") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.production.getObservabilityDashboard(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/production/upgrade-checks") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.production.runUpgradeCheck(user, {
        targetVersion: String(request.body?.targetVersion ?? ""),
        diskFreeGb: Number(request.body?.diskFreeGb ?? 0),
        lastBackupStatus: String(request.body?.lastBackupStatus ?? "missing") as never,
        serviceHealth: String(request.body?.serviceHealth ?? "failed") as never,
        licenseStatus: String(request.body?.licenseStatus ?? "expired") as never
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/production/rollback") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.production.runRollback(user, {
        fromVersion: String(request.body?.fromVersion ?? ""),
        toVersion: String(request.body?.toVersion ?? ""),
        reason: String(request.body?.reason ?? ""),
        rollbackWindowEndsAt: String(request.body?.rollbackWindowEndsAt ?? "")
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/production/overview") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.production.getOverview(user)) };
    }

    if (request.method === "GET" && request.path === "/admin/security/readiness") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.securityRelease.getReadinessOverview(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/security/uploads/validate") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.securityRelease.validateUpload(user, {
        fileName: String(request.body?.fileName ?? ""),
        mimeType: String(request.body?.mimeType ?? ""),
        sizeBytes: Number(request.body?.sizeBytes ?? 0),
        scanStatus: String(request.body?.scanStatus ?? "pending") as never,
        source: String(request.body?.source ?? "ticket") as never
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/security/release-checklist") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.securityRelease.evaluatePublicRelease(user, {
        projectId: String(request.body?.projectId ?? ""),
        exposure: String(request.body?.exposure ?? "internal") as never,
        authReady: Boolean(request.body?.authReady),
        permissionsReady: Boolean(request.body?.permissionsReady),
        domainApproved: Boolean(request.body?.domainApproved),
        tlsReady: Boolean(request.body?.tlsReady),
        dataClassification: String(request.body?.dataClassification ?? "Internal") as never,
        auditReady: Boolean(request.body?.auditReady)
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/security/redaction/preview") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const requestPayload =
        request.body?.requestPayload && typeof request.body.requestPayload === "object" && !Array.isArray(request.body.requestPayload)
          ? (request.body.requestPayload as Record<string, unknown>)
          : {};
      const result = services.securityRelease.redactSensitivePayload(user, {
        classification: String(request.body?.classification ?? "Internal") as never,
        prompt: String(request.body?.prompt ?? ""),
        ticketDescription: String(request.body?.ticketDescription ?? ""),
        requestPayload
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/license/install") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.production.installLicense(user, {
        licenseKey: String(request.body?.licenseKey ?? ""),
        signedPayload: (request.body?.signedPayload ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/license/validate") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.production.validateLicense(user, {
        onlineAvailable: Boolean(request.body?.onlineAvailable),
        checkedAt: String(request.body?.checkedAt ?? new Date().toISOString())
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/license/enforce") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.production.evaluateLicenseAction(user, {
        action: String(request.body?.action ?? "run_existing_app") as never,
        currentSeats: Number(request.body?.currentSeats ?? 0),
        currentApps: Number(request.body?.currentApps ?? 0),
        monthlyAiTokensUsed: Number(request.body?.monthlyAiTokensUsed ?? 0),
        checkedAt: String(request.body?.checkedAt ?? new Date().toISOString())
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/monitoring") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.monitoring.getDashboard(user)) };
    }

    const runtimeOverviewMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)$/);
    if (request.method === "GET" && runtimeOverviewMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.generatedRuntime.getRuntimeOverview(user, runtimeOverviewMatch[1])) };
    }

    const runtimeSchemaCheckMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/schema\/check$/);
    if (request.method === "POST" && runtimeSchemaCheckMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.generatedRuntime.checkSchemaAccess(user, runtimeSchemaCheckMatch[1], {
            attemptedSchema: String(request.body?.attemptedSchema ?? ""),
            operation: String(request.body?.operation ?? "select")
          })
        )
      };
    }

    const runtimeHealthMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/health$/);
    if (request.method === "GET" && runtimeHealthMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const runtime = services.generatedRuntime.getRuntimeOverview(user, runtimeHealthMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success({
          health: runtime.health,
          readiness: runtime.readiness,
          metrics: runtime.metrics,
          logSample: runtime.logSample
        })
      };
    }

    const runtimeOpenApiMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/openapi$/);
    if (request.method === "GET" && runtimeOpenApiMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.generatedRuntime.getRuntimeOverview(user, runtimeOpenApiMatch[1]).openApi) };
    }

    const runtimeMigrationDryRunMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/migrations\/dry-run$/);
    if (request.method === "POST" && runtimeMigrationDryRunMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.generatedRuntime.runMigrationDryRun(user, runtimeMigrationDryRunMatch[1], {
            migrationId: String(request.body?.migrationId ?? ""),
            destructiveChanges: Array.isArray(request.body?.destructiveChanges) ? request.body.destructiveChanges.map(String) : [],
            approvalId: request.body?.approvalId ? String(request.body.approvalId) : undefined
          })
        )
      };
    }

    if (request.method === "GET" && request.path === "/admin/auth/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.authSso.listProviders(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/providers/oidc") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.authSso.createOidcProvider(user, {
        name: String(request.body?.name ?? ""),
        issuerUrl: String(request.body?.issuerUrl ?? ""),
        clientId: String(request.body?.clientId ?? ""),
        clientSecret: String(request.body?.clientSecret ?? ""),
        scopes: Array.isArray(request.body?.scopes) ? request.body.scopes.map(String) : [],
        groupRoleMapping: (request.body?.groupRoleMapping ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/providers/saml") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.authSso.createSamlProvider(user, {
        name: String(request.body?.name ?? ""),
        entityId: String(request.body?.entityId ?? ""),
        ssoUrl: String(request.body?.ssoUrl ?? ""),
        certificate: String(request.body?.certificate ?? ""),
        groupRoleMapping: (request.body?.groupRoleMapping ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "GET" && request.path === "/admin/auth/keycloak-defaults") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.authSso.getKeycloakDefaults(user)) };
    }

    if (request.method === "GET" && request.path === "/admin/auth/direct-idp-constraints") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.authSso.getDirectIdpConstraints(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/simulate-login") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const session = services.authSso.simulateLogin(user, {
        providerId: String(request.body?.providerId ?? ""),
        subject: String(request.body?.subject ?? ""),
        email: String(request.body?.email ?? ""),
        name: String(request.body?.name ?? ""),
        groups: Array.isArray(request.body?.groups) ? request.body.groups.map(String) : [],
        appRoles: (request.body?.appRoles ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(session) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/generated-app/validate-session") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      const result = services.authSso.validateGeneratedAppSession(String(request.body?.token ?? ""), {
        appSlug: String(request.body?.appSlug ?? ""),
        requiredRole: request.body?.requiredRole ? String(request.body.requiredRole) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/break-glass") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const session = services.breakGlass.login(user, {
        reason: String(request.body?.reason ?? ""),
        ticketRef: request.body?.ticketRef ? String(request.body.ticketRef) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(session) };
    }

    if (request.method === "GET" && request.path === "/admin/policy-templates") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.policyTemplates.listTemplates(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/policy-templates/evaluate") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.policyTemplates.evaluate(user, {
            classification: String(request.body?.classification ?? "internal") as never,
            action: String(request.body?.action ?? "")
          })
        )
      };
    }

    const prdChangesMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/prd\/changes$/);
    if (request.method === "GET" && prdChangesMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prdChanges.listChanges(user, prdChangesMatch[1])) };
    }

    const prdChangeFromTicketMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/prd\/changes\/from-ticket$/);
    if (request.method === "POST" && prdChangeFromTicketMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const change = services.prdChanges.convertTicketToChange(user, prdChangeFromTicketMatch[1], {
        ticketId: String(request.body?.ticketId ?? ""),
        title: String(request.body?.title ?? ""),
        proposedRequirement: String(request.body?.proposedRequirement ?? ""),
        affectedSections: Array.isArray(request.body?.affectedSections) ? request.body.affectedSections.map(String) : [],
        acceptanceCriteria: Array.isArray(request.body?.acceptanceCriteria) ? request.body.acceptanceCriteria.map(String) : [],
        riskLevel: String(request.body?.riskLevel ?? "medium") as never
      });
      return { status: HttpStatus.CREATED, body: success(change) };
    }

    const prdChangeDecisionMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/prd\/changes\/decision$/);
    if (request.method === "POST" && prdChangeDecisionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const decision = services.prdChanges.decideChange(user, prdChangeDecisionMatch[1], {
        changeId: String(request.body?.changeId ?? ""),
        decision: String(request.body?.decision ?? "approved") as never,
        note: String(request.body?.note ?? "")
      });
      return { status: HttpStatus.OK, body: success(decision) };
    }

    const domainSettingsMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/domains$/);
    if (request.method === "GET" && domainSettingsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.domains.getSettings(user, domainSettingsMatch[1])) };
    }

    const domainRequestMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/domains\/requests$/);
    if (request.method === "POST" && domainRequestMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const requestRecord = services.domains.requestPublicDomain(user, domainRequestMatch[1], {
        domain: String(request.body?.domain ?? ""),
        reason: String(request.body?.reason ?? ""),
        intendedAudience: String(request.body?.intendedAudience ?? ""),
        dataClassification: String(request.body?.dataClassification ?? "internal") as never,
        externalUserPolicy: String(request.body?.externalUserPolicy ?? ""),
        checklistAccepted: Boolean(request.body?.checklistAccepted ?? false)
      });
      return { status: HttpStatus.CREATED, body: success(requestRecord) };
    }

    const domainDecisionMatch = request.path.match(/^\/admin\/domain-requests\/([^/]+)\/decision$/);
    if (request.method === "POST" && domainDecisionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const requestRecord = services.domains.decideDomainRequest(user, domainDecisionMatch[1], {
        decision: String(request.body?.decision ?? "approved") as never,
        note: String(request.body?.note ?? "")
      });
      return { status: HttpStatus.OK, body: success(requestRecord) };
    }

    const traceabilityMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/traceability$/);
    if (request.method === "GET" && traceabilityMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.traceability.getProjectTrace(user, traceabilityMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/ai/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listProviders()) };
    }

    if (request.method === "POST" && request.path === "/ai/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.aiGovernance.createProvider(user, {
        name: String(request.body?.name ?? ""),
        adapter: String(request.body?.adapter ?? "mock") as never,
        baseUrl: String(request.body?.baseUrl ?? ""),
        models: Array.isArray(request.body?.models) ? request.body.models.map(String) : []
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "GET" && request.path === "/ai/api-keys") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listApiKeys()) };
    }

    if (request.method === "POST" && request.path === "/ai/api-keys") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const key = services.aiGovernance.createApiKey(user, {
        providerId: String(request.body?.providerId ?? ""),
        name: String(request.body?.name ?? ""),
        secret: String(request.body?.secret ?? ""),
        usageMode: String(request.body?.usageMode ?? "production") as never,
        quotaTokens: Number(request.body?.quotaTokens ?? 0),
        fallbackPriority: Number(request.body?.fallbackPriority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(key) };
    }

    if (request.method === "POST" && request.path === "/ai/routes") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const route = services.aiGovernance.configureRoute(user, {
        scenario: String(request.body?.scenario ?? "prd_generation") as never,
        primaryProviderId: String(request.body?.primaryProviderId ?? ""),
        primaryModel: String(request.body?.primaryModel ?? ""),
        fallbackProviderId: request.body?.fallbackProviderId ? String(request.body.fallbackProviderId) : undefined,
        fallbackModel: request.body?.fallbackModel ? String(request.body.fallbackModel) : undefined
      });
      return { status: HttpStatus.OK, body: success(route) };
    }

    if (request.method === "POST" && request.path === "/ai/quotas") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const quota = services.aiGovernance.configureQuota(user, {
        scope: String(request.body?.scope ?? "organization") as never,
        dailyLimit: Number(request.body?.dailyLimit ?? 0),
        monthlyLimit: Number(request.body?.monthlyLimit ?? 0),
        warningThreshold: Number(request.body?.warningThreshold ?? 0),
        hardStop: Boolean(request.body?.hardStop ?? true),
        usedToday: Number(request.body?.usedToday ?? 0)
      });
      return { status: HttpStatus.OK, body: success(quota) };
    }

    if (request.method === "POST" && request.path === "/ai/provider-test-call") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.aiGovernance.testProviderCall(user, {
        scenario: String(request.body?.scenario ?? "prd_generation") as never,
        prompt: request.body?.prompt ? String(request.body.prompt) : undefined,
        requestedTokens: request.body?.requestedTokens === undefined ? undefined : Number(request.body.requestedTokens),
        dryRun: request.body?.dryRun === undefined ? undefined : Boolean(request.body.dryRun)
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/guardrails/rules") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const rule = services.guardrails.createRule(user, {
        name: String(request.body?.name ?? ""),
        type: String(request.body?.type ?? "keyword") as never,
        pattern: String(request.body?.pattern ?? ""),
        severity: String(request.body?.severity ?? "warning") as never,
        action: String(request.body?.action ?? "warn") as never,
        scope: String(request.body?.scope ?? "organization") as never
      });
      return { status: HttpStatus.CREATED, body: success(rule) };
    }

    if (request.method === "POST" && request.path === "/guardrails/test") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.guardrails.testPrompt(user, {
        prompt: String(request.body?.prompt ?? ""),
        scenario: String(request.body?.scenario ?? "prd_generation")
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/guardrails/events") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.guardrails.listEvents()) };
    }

    return { status: HttpStatus.NOT_FOUND, body: failure("NOT_FOUND", "Unknown platform API route") };
  } catch (error) {
    return errorResponse(error);
  }
}

function registerPlatformRoutes(app: INestApplication, services: PersistenceAwarePlatformApiServices): void {
  const routes = app.getHttpAdapter().getInstance() as RouteRegistry;

  routes.get("/health", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/health", headers: request.headers }))
  );
  routes.get("/auth/me", (request, response) =>
    sendPlatformResponseAsync(response, executePlatformApiRequestAsync(services, { method: "GET", path: "/auth/me", headers: request.headers }))
  );
  routes.get("/projects", (request, response) =>
    sendPlatformResponseAsync(response, executePlatformApiRequestAsync(services, { method: "GET", path: "/projects", headers: request.headers }))
  );
  routes.post("/projects", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, { method: "POST", path: "/projects", headers: request.headers, body: request.body })
    )
  );
  routes.get("/audit-logs", (request, response) =>
    sendPlatformResponseAsync(response, executePlatformApiRequestAsync(services, { method: "GET", path: "/audit-logs", headers: request.headers }))
  );
  routes.post("/audit-logs/filter", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, { method: "POST", path: "/audit-logs/filter", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/knowledge/sources", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/knowledge/sources", headers: request.headers }))
  );
  routes.post("/admin/knowledge/sources", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/knowledge/sources", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/knowledge/sources/:sourceId/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/knowledge/sources/${String(request.params?.sourceId ?? "")}/versions`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/versions/:versionId/approve", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/knowledge/versions/${String(request.params?.versionId ?? "")}/approve`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/retrieve", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/knowledge/retrieve", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/knowledge/retrieval-logs", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/knowledge/retrieval-logs", headers: request.headers }))
  );
  routes.get("/admin/skills", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/skills", headers: request.headers }))
  );
  routes.post("/admin/skills", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/skills", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/skills/:skillId/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/skills/${String(request.params?.skillId ?? "")}/versions`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/versions/:versionId/approve", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/skills/versions/${String(request.params?.versionId ?? "")}/approve`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/:skillId/disable", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/skills/${String(request.params?.skillId ?? "")}/disable`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/assignments", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/skills/assignments", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/skills/resolve", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/skills/resolve", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/installer/preflight", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/installer/preflight", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/installer/setup", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/installer/setup", headers: request.headers, body: request.body }))
  );
  routes.get("/admin/installer/reports", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/installer/reports", headers: request.headers }))
  );
  routes.post("/admin/backup/policies", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/backup/policies", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/backup/runs", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/backup/runs", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/backup/pitr", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/backup/pitr", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/backup/restore-drills", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/backup/restore-drills", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/backup/overview", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/backup/overview", headers: request.headers }))
  );
  routes.get("/admin/monitoring", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/monitoring", headers: request.headers }))
  );
  routes.get("/admin/runtime/projects/:projectId", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}`,
        headers: request.headers
      })
    )
  );
  routes.post("/admin/runtime/projects/:projectId/schema/check", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/schema/check`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/runtime/projects/:projectId/health", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/health`,
        headers: request.headers
      })
    )
  );
  routes.get("/admin/runtime/projects/:projectId/openapi", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/openapi`,
        headers: request.headers
      })
    )
  );
  routes.post("/admin/runtime/projects/:projectId/migrations/dry-run", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/migrations/dry-run`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/production/observability", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/production/observability", headers: request.headers }))
  );
  routes.post("/admin/production/upgrade-checks", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/production/upgrade-checks", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/production/rollback", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/production/rollback", headers: request.headers, body: request.body }))
  );
  routes.get("/admin/production/overview", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/production/overview", headers: request.headers }))
  );
  routes.get("/admin/security/readiness", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/security/readiness", headers: request.headers }))
  );
  routes.post("/admin/security/uploads/validate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/security/uploads/validate", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/security/release-checklist", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/security/release-checklist", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/security/redaction/preview", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/security/redaction/preview", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/license/install", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/license/install", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/license/validate", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/license/validate", headers: request.headers, body: request.body }))
  );
  routes.post("/license/enforce", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/license/enforce", headers: request.headers, body: request.body }))
  );
  routes.post("/projects/:projectId/prd/generate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/generate`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/prd/baseline", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/baseline`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/prd/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/versions`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/prd", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd`,
        headers: request.headers
      })
    )
  );
  routes.get("/creator/projects/:projectId/prd/changes", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/prd/changes`,
        headers: request.headers
      })
    )
  );
  routes.post("/creator/projects/:projectId/prd/changes/from-ticket", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/prd/changes/from-ticket`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/creator/projects/:projectId/prd/changes/decision", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/prd/changes/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/creator/projects/:projectId/domains", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/domains`,
        headers: request.headers
      })
    )
  );
  routes.post("/creator/projects/:projectId/domains/requests", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/domains/requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/domain-requests/:requestId/decision", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/domain-requests/${String(request.params?.requestId ?? "")}/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/creator/projects/:projectId/traceability", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/traceability`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/workspace", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/workspace/prompts", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/prompts`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/workspace/preview/refresh", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/preview/refresh`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/database", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/database`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/database/sql", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/database/sql`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/frontend/checkpoints", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/frontend/checkpoints`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/frontend/compare", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/frontend/compare`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/frontend/restore", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/frontend/restore`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/app/users", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/users`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/app/roles", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/roles`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/invitations", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/invitations`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/access-requests", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/access-requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/access-requests/decision", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/access-requests/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/publish/review", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/publish/review`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/publish", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/publish`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/app-store/registry", (request, response) =>
    sendPlatformResponseAsync(response, executePlatformApiRequestAsync(services, { method: "GET", path: "/app-store/registry", headers: request.headers }))
  );
  routes.get("/store/apps", (request, response) =>
    sendPlatformResponseAsync(response, executePlatformApiRequestAsync(services, { method: "GET", path: "/store/apps", headers: request.headers }))
  );
  routes.get("/store/apps/:appSlug", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}`,
        headers: request.headers
      })
    )
  );
  routes.post("/store/apps/:appSlug/install", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}/install`,
        headers: request.headers
      })
    )
  );
  routes.post("/store/apps/:appSlug/uninstall", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}/uninstall`,
        headers: request.headers
      })
    )
  );
  routes.post("/store/apps/:appSlug/access-requests", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}/access-requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/store/apps/:appSlug/tickets", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}/tickets`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/store/tickets/:ticketId", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/store/tickets/${String(request.params?.ticketId ?? "")}`,
        headers: request.headers
      })
    )
  );
  routes.get("/creator/projects/:projectId/tickets", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/tickets`,
        headers: request.headers
      })
    )
  );
  routes.get("/admin/auth/providers", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/auth/providers", headers: request.headers }))
  );
  routes.post("/admin/auth/providers/oidc", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/providers/oidc", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/auth/providers/saml", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/providers/saml", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/auth/keycloak-defaults", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/auth/keycloak-defaults", headers: request.headers }))
  );
  routes.get("/admin/auth/direct-idp-constraints", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "GET", path: "/admin/auth/direct-idp-constraints", headers: request.headers })
    )
  );
  routes.post("/admin/auth/simulate-login", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/simulate-login", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/auth/generated-app/validate-session", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/auth/generated-app/validate-session",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/auth/break-glass", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/break-glass", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/policy-templates", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/policy-templates", headers: request.headers }))
  );
  routes.post("/admin/policy-templates/evaluate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/policy-templates/evaluate", headers: request.headers, body: request.body })
    )
  );
  routes.get("/ai/providers", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/ai/providers", headers: request.headers }))
  );
  routes.post("/ai/providers", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/providers", headers: request.headers, body: request.body })
    )
  );
  routes.get("/ai/api-keys", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/ai/api-keys", headers: request.headers }))
  );
  routes.post("/ai/api-keys", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/api-keys", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/routes", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/routes", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/quotas", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/quotas", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/provider-test-call", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/provider-test-call", headers: request.headers, body: request.body })
    )
  );
  routes.post("/guardrails/rules", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/guardrails/rules", headers: request.headers, body: request.body })
    )
  );
  routes.post("/guardrails/test", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/guardrails/test", headers: request.headers, body: request.body })
    )
  );
  routes.get("/guardrails/events", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/guardrails/events", headers: request.headers }))
  );
}

export async function createPlatformApiApp(services: PersistenceAwarePlatformApiServices = createPlatformApiServices()): Promise<INestApplication> {
  const app = await NestFactory.create(PlatformApiModule, {
    logger: false
  });

  app.enableCors({
    origin: true,
    credentials: true
  });
  registerPlatformRoutes(app, services);

  return app;
}
