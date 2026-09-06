import "reflect-metadata";
import { HttpStatus } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { failure, success, type PublishAccessUrlConfigDto } from "@evcp/api-client";
import { PlatformApiModule } from "./platform-api.module";
import { createWorkspaceRoutes } from "./workspace-orchestrator/routes";
import { registerPreviewSessionRoute } from "./workspace-orchestrator/preview-session-route";
import { registerProjectDbRoutes } from "./project-database";
import { createProjectDbAuditAdapter } from "./project-database-audit";
import { canAccessPublishedDeployment, registerPublishHttpRoutes } from "./publish/http-routes";
import { createInternalPublishPersistenceRequest, handleLegacyPublishApiRequest, handlePersistedPublishApiRequest, preflightPublishedSubdomain, resolvePublishAccessUrlConfig } from "./publish/app-store-publish-runtime";
import { createDefaultPublishStack } from "./publish/factory";
import { MemoryLaunchGrantStore, type LaunchGrantStore } from "./publish/launch-grant-store";
import { createChatSseHandler } from "./generation-loop/chat-route";
import { createDefaultGenerationService } from "./generation-loop/factory";
import { createGovernedContextResolver, createPlatformBugAuditor } from "./generation-loop/governed-context";
import { createMemoryMigrationStore } from "./generation-loop/migration-store";
import { createPrismaWorkspaceMigrationStore } from "./persistence/workspace-migration-repository";
import { initializeWorkspaceRuntime } from "./workspace-orchestrator/runtime-startup";
import type { WorkspaceWarmPoolFactory } from "./workspace-orchestrator/factory";
import { registerWorkspaceFilesRoute } from "./generation-loop/workspace-files-route";
import { resolveWorkspaceAgentMode } from "./workspace-agent-mode";
import { registerKeycloakUserManagementRoutes, type KeycloakUserService } from "./keycloak/routes";
import { startWorkspaceSweeps } from "./workspace-orchestrator/workspace-sweeps";
import { createHash } from "node:crypto";
import * as nodeHttp from "node:http";
import { createPlatformApiServices, PermissionError, ValidationError, type AuthResolution, type PlatformApiServices, type PlatformProject, type PlatformUser } from "./platform-services";
import { createCoreRepositoryBackedService, createPrismaCorePersistence, MemoryCorePersistenceClient, type CoreRepositoryBackedService, type CorePersistenceClient } from "./persistence/core-repositories";
import { createPlatformCredentialService, type PlatformCredentialService } from "./auth/platform-credential-service";
import { createCorePersistenceCredentialStore, createUserWithRole } from "./auth/prisma-credential-store";
import { resolvePersistedAuth } from "./auth/persistence-auth-resolver";
import type { PlatformSessionService } from "./auth/platform-session-service";
import { getMockPermissions } from "@evcp/auth-sdk";
import { createAiGovernanceRepositoryBackedService, createPrismaAiGovernancePersistence, MemoryAiGovernancePersistenceClient, type AiGovernanceRepositoryBackedService } from "./persistence/ai-governance-repositories";
import { createPersistedGovernedAiExecutor } from "./ai-governance/execution-runtime";
import { PrismaAiExecutionStore } from "./persistence/ai-execution-repository";
import { createAiJobPayloadCipher, MemoryDurableAiJobStore, type AiJobPayloadCipher, type DurableAiJobStore } from "./ai-governance/durable-job-worker";
import { PrismaDurableAiJobStore } from "./persistence/ai-job-repository";
import { handleDurableAiJob, registerDurableAiJobHttpRoutes } from "./ai-governance/durable-job-route";
import { UnavailableAiSecretStore, VaultKvV2AiSecretStore, type AiSecretStore } from "./ai-governance/secret-store";
import { PrismaProjectFileRepository } from "./persistence/project-file-repository";
import { deletePersistedProjectResources } from "./persistence/project-file-cleanup";
import type { ProjectFileUploadUrlIssuer } from "./workspace-orchestrator/minio-object-storage";
import { resolveProjectFileUploadUrlIssuer } from "./project-file-upload-issuer";
import { hydrateKnowledgeSkills, type KnowledgeSkillWriter } from "./persistence/knowledge-skill-repositories";
import { handleKnowledgeSkillWithPersistence, isKnowledgeSkillRoute } from "./knowledge-skill-routes";
import { handlePersistentProjectFilesRoute, isPersistenceProjectFileRoute } from "./persistence/persistent-project-files-route";
import { handleAiGovernanceRoute, handleInMemoryAiGovernanceRoute } from "./ai-governance/ai-governance-routes";
import { aiGovernanceHttpRoutes } from "./ai-governance/ai-governance-route-manifest";
import { handlePersistedWorkspacePrompt } from "./ai-governance/persisted-workspace-prompt-route";
import { createBusinessSettingsRepositoryBackedService, createPrismaBusinessSettingsPersistence, MemoryBusinessSettingsPersistenceClient, type BusinessSettingsRepositoryBackedService } from "./persistence/business-settings-repositories";
import { isPersistenceBusinessSettingsRoute, registerSetupRoutes, resolveSetupRequest } from "./setup-routes";
import { registerSystemRoutes, resolveSystemRequest } from "./system/system-routes";
import { createSystemUpdateService } from "./system/system-update-service";
import { registerDomainRoutes, resolveDomainRequest } from "./system/domain-routes";
import { createDomainService } from "./system/domain-service";
import { createSwarmServiceEngine } from "./workspace-orchestrator/swarm-service-engine";
import { readKeycloakConfig } from "./keycloak/config";
import { KeycloakAdminClient } from "./keycloak/admin-client";
import * as fs from "node:fs";
import { renderPreviewUnavailableHtml } from "./workspace-orchestrator/preview-unavailable-page";
import { createPrdRepositoryBackedService, createPrismaPrdPersistence, MemoryPrdPersistenceClient, type PrdRepositoryBackedService } from "./persistence/prd-repositories";
import { createPrismaWorkspacePersistence, createWorkspaceRepositoryBackedService, MemoryWorkspacePersistenceClient, type WorkspaceRepositoryBackedService } from "./persistence/workspace-repositories";
import { createPrismaPublishStorePersistence, createPublishStoreRepositoryBackedService, MemoryPublishStorePersistenceClient, type PublishStoreRepositoryBackedService } from "./persistence/publish-store-repositories";
import { createGeneratedRuntimeRepositoryBackedService, createPrismaGeneratedRuntimePersistence, MemoryGeneratedRuntimePersistenceClient, type GeneratedRuntimeRepositoryBackedService } from "./persistence/generated-runtime-repositories";
import { isNativeAuthRoute, isPersistenceAiGovernanceRoute, isPersistenceCoreRoute, isPersistenceGeneratedRuntimeRoute, isPersistencePrdRoute, isPersistencePublishStoreRoute, isPersistenceWorkspaceRoute } from "./route-predicates";
import type { PlatformRequest, PlatformResponse, HeaderBag } from "./platform-http-types";
export type { PlatformRequest, PlatformResponse, HeaderBag } from "./platform-http-types";
import { errorResponse } from "./error-response";
import { deletePersistedProject, registerProjectDeletionRoute } from "./project-deletion";
import { createProjectLifecycleCoordinator, runProjectMutationRequest, type ProjectLifecycleCoordinator } from "./project-lifecycle";
import { createPrismaProjectLifecycleStore } from "./persistence/prisma-project-lifecycle-store";
import { resolvePersistenceUser, resolvePreviewProxyDecision, resolveWorkspaceAuth, wantsPreviewJson } from "./preview-proxy-decision";
export { resolvePreviewProxyDecision, wantsPreviewJson } from "./preview-proxy-decision";
type HttpRequest = { headers: HeaderBag; body?: Record<string, unknown>; params?: Record<string, string> };
type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
};
type RouteRegistry = {
  get: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void | Promise<void>) => void;
  post: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void | Promise<void>) => void;
  put: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void | Promise<void>) => void;
  delete: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void | Promise<void>) => void;
};
export type PersistenceAwarePlatformApiServices = PlatformApiServices & {
  keycloakUserManagement?: KeycloakUserService;
  corePersistence?: CoreRepositoryBackedService;
  corePersistenceClient?: CorePersistenceClient;
  credentialService?: PlatformCredentialService;
  aiGovernancePersistence?: AiGovernanceRepositoryBackedService;
  governedAiExecutor?: import("./ai-governance/execution-service").GovernedAiExecutor;
  businessSettingsPersistence?: BusinessSettingsRepositoryBackedService;
  prdPersistence?: PrdRepositoryBackedService;
  workspacePersistence?: WorkspaceRepositoryBackedService;
  publishStorePersistence?: PublishStoreRepositoryBackedService;
  generatedRuntimePersistence?: GeneratedRuntimeRepositoryBackedService;
  durableAiJobs?: DurableAiJobStore;
  durableAiJobPayloadCipher?: AiJobPayloadCipher;
  projectFilePersistence?: PrismaProjectFileRepository;
  projectFileUploadUrlIssuer?: ProjectFileUploadUrlIssuer;
  knowledgeSkillWriter?: KnowledgeSkillWriter;
  platformSessions?: PlatformSessionService;
  projectResourceCleanup?: (projectId: string, fence?: import("./project-lifecycle").ProjectDeletionFence) => Promise<void>;
  projectLifecycle?: ProjectLifecycleCoordinator;
  publishAccessUrlConfig?: PublishAccessUrlConfigDto;
  launchGrantStore?: LaunchGrantStore;
};
export type CorePersistenceMode = "legacy" | "memory" | "prisma";
type RuntimeEnv = Record<string, string | undefined>;

export { resolvePublishAccessUrlConfig } from "./publish/app-store-publish-runtime";

export function resolveCorePersistenceMode(env: RuntimeEnv = process.env): CorePersistenceMode {
  const mode = (env.EVCP_CORE_PERSISTENCE ?? "legacy").trim().toLowerCase();
  if (mode === "legacy" || mode === "memory" || mode === "prisma") return mode;
  throw new Error(`Unsupported EVCP_CORE_PERSISTENCE mode: ${env.EVCP_CORE_PERSISTENCE}`);
}

export async function createRuntimePlatformApiServices(env: RuntimeEnv = process.env): Promise<PersistenceAwarePlatformApiServices> {
  const publishAccessUrlConfig = resolvePublishAccessUrlConfig(env);
  const mode = resolveCorePersistenceMode(env);
  let warmPoolFactory: WorkspaceWarmPoolFactory | undefined;
  const services: PersistenceAwarePlatformApiServices = {
    ...createPlatformApiServices({ publishAccessUrlConfig, workspace: { env, onWarmPoolFactory: (factory) => { warmPoolFactory = factory; } } }),
    publishAccessUrlConfig,
    ...(mode === "memory" ? { launchGrantStore: new MemoryLaunchGrantStore() } : {})
  };
  const productionAiSecretStore: AiSecretStore =
    env.VAULT_ADDR && env.VAULT_TOKEN_FILE
      ? new VaultKvV2AiSecretStore({
          address: env.VAULT_ADDR,
          mount: env.VAULT_KV_MOUNT ?? "platform",
          tokenFile: env.VAULT_TOKEN_FILE
        })
      : new UnavailableAiSecretStore();
  const durableAiJobPayloadCipher = env.EVCP_AI_JOB_ENCRYPTION_KEY ? createAiJobPayloadCipher(env.EVCP_AI_JOB_ENCRYPTION_KEY) : undefined;
  if (mode === "legacy") return services;
  if (mode === "memory") {
    const client = new MemoryCorePersistenceClient();
    const aiClient = new MemoryAiGovernancePersistenceClient();
    return {
      ...services,
      corePersistence: createCoreRepositoryBackedService(client),
      corePersistenceClient: client,
      credentialService: createPlatformCredentialService(createCorePersistenceCredentialStore(client)),
      aiGovernancePersistence: createAiGovernanceRepositoryBackedService(aiClient),
      governedAiExecutor: createPersistedGovernedAiExecutor(aiClient),
      businessSettingsPersistence: createBusinessSettingsRepositoryBackedService(new MemoryBusinessSettingsPersistenceClient()),
      prdPersistence: createPrdRepositoryBackedService(new MemoryPrdPersistenceClient()),
      workspacePersistence: createWorkspaceRepositoryBackedService(new MemoryWorkspacePersistenceClient()),
      publishStorePersistence: createPublishStoreRepositoryBackedService(new MemoryPublishStorePersistenceClient(), publishAccessUrlConfig),
      generatedRuntimePersistence: createGeneratedRuntimeRepositoryBackedService(new MemoryGeneratedRuntimePersistenceClient()),
      durableAiJobs: new MemoryDurableAiJobStore(),
      durableAiJobPayloadCipher
    };
  }

  const { client, service } = await createPrismaCorePersistence(env.DATABASE_URL);
  (services as PersistenceAwarePlatformApiServices).projectLifecycle = createProjectLifecycleCoordinator({ store: createPrismaProjectLifecycleStore(client as never) });
  await initializeWorkspaceRuntime(services.workspaceOrchestrator, env.DATABASE_URL, warmPoolFactory);
  const { client: aiClient, service: aiGovernancePersistence } = await createPrismaAiGovernancePersistence(env.DATABASE_URL, productionAiSecretStore);
  const { service: businessSettingsPersistence } = await createPrismaBusinessSettingsPersistence(env.DATABASE_URL);
  const { service: prdPersistence } = await createPrismaPrdPersistence(env.DATABASE_URL);
  const { service: workspacePersistence } = await createPrismaWorkspacePersistence(env.DATABASE_URL);
  const { service: publishStorePersistence } = await createPrismaPublishStorePersistence(env.DATABASE_URL, publishAccessUrlConfig);
  const { service: generatedRuntimePersistence } = await createPrismaGeneratedRuntimePersistence(env.DATABASE_URL);
  const projectFileUploadUrlIssuer = resolveProjectFileUploadUrlIssuer(env);
  return {
    ...services,
    corePersistence: service,
    corePersistenceClient: client,
    credentialService: createPlatformCredentialService(createCorePersistenceCredentialStore(client)),
    aiGovernancePersistence,
    governedAiExecutor: createPersistedGovernedAiExecutor(aiClient, {
      executionStore: new PrismaAiExecutionStore(aiClient as never),
      secretStore: productionAiSecretStore
    }),
    businessSettingsPersistence,
    prdPersistence,
    workspacePersistence,
    publishStorePersistence,
    generatedRuntimePersistence,
    durableAiJobs: new PrismaDurableAiJobStore(aiClient as never),
    durableAiJobPayloadCipher,
    projectFilePersistence: new PrismaProjectFileRepository(client as never),
    projectFileUploadUrlIssuer,
    knowledgeSkillWriter: await hydrateKnowledgeSkills(services, env.DATABASE_URL)
  };
}

function sendPlatformResponse(response: HttpResponse, platformResponse: PlatformResponse): void {
  response.status(platformResponse.status).json(platformResponse.body);
}

async function sendPlatformResponseAsync(response: HttpResponse, platformResponse: Promise<PlatformResponse>): Promise<void> {
  sendPlatformResponse(response, await platformResponse);
}

export { renderPreviewUnavailableHtml };

const resolvePersistenceAuth = resolvePersistedAuth;

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

type SimulatedPlatformSession = {
  claims?: {
    email?: string;
    name?: string;
    platformRoles?: string[];
  };
};

function roleFromPlatformRoles(roles: string[] | undefined): PlatformUser["role"] {
  if (roles?.includes("admin")) return "admin";
  if (roles?.includes("creator")) return "creator";
  return "end_user";
}

async function ensureCoreUserForSimulatedSession(corePersistenceClient: CorePersistenceClient, session: SimulatedPlatformSession): Promise<void> {
  const email = session.claims?.email?.trim().toLowerCase();
  if (!email) return;

  const existing = await corePersistenceClient.platformUser.findUnique({ where: { email } });
  if (existing) return;

  await createUserWithRole(corePersistenceClient, {
    id: `usr_sso_${createHash("sha256").update(email).digest("hex").slice(0, 12)}`,
    email,
    name: session.claims?.name?.trim() || email,
    role: roleFromPlatformRoles(session.claims?.platformRoles)
  });
}

function buildPersistencePrdPrompt(project: PlatformProject): string {
  return [`Create a PRD for ${project.name}.`, `Problem: ${project.businessProblem}`, `App type: ${project.appType}`, `Department: ${project.targetDepartment}`, `Users: ${project.intendedUsers.join(", ")}`, `Sensitivity: ${project.dataSensitivity}`].join("\n");
}

async function resolvePersistedRuntimeInput(services: PersistenceAwarePlatformApiServices, actor: PlatformUser, projectId: string) {
  if (!services.publishStorePersistence) throw new Error("Publish Store persistence service is not configured");
  const project = await resolvePersistenceProject(services, actor, projectId);
  const manifest = await services.publishStorePersistence.getManifestForProject(actor, project);
  const deployment = await services.publishStorePersistence.getLatestDeploymentForProject(actor, project);
  return { project, manifest, deployment };
}

export async function executePlatformApiRequestAsync(services: PersistenceAwarePlatformApiServices, request: PlatformRequest): Promise<PlatformResponse> {
  const lifecycle = services.projectLifecycle ??= createProjectLifecycleCoordinator();
  return runProjectMutationRequest({
    lifecycle,
    request,
    operation: () => executePlatformApiRequestAsyncInternal(services, request),
    onError: errorResponse
  });
}

async function executePlatformApiRequestAsyncInternal(services: PersistenceAwarePlatformApiServices, request: PlatformRequest): Promise<PlatformResponse> {
  const containerMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/container(?:\/(stop|wake))?$/);
  if (containerMatch) {
    try {
      const projectId = containerMatch[1];
      const action = containerMatch[2];
      const auth = await resolveWorkspaceAuth(services, request.headers ?? {});
      const routes = createWorkspaceRoutes({ orchestrator: services.workspaceOrchestrator });
      let result;
      if (request.method === "POST" && !action) {
        result = await routes.provision(auth, {
          projectId,
          slug: String((request.body as Record<string, unknown> | undefined)?.slug ?? projectId)
        });
      } else if (request.method === "GET" && !action) {
        result = await routes.get(auth, { projectId });
      } else if (request.method === "POST" && action === "stop") {
        result = await routes.stop(auth, { projectId });
      } else if (request.method === "POST" && action === "wake") {
        result = await routes.wake(auth, { projectId });
      } else {
        return {
          status: HttpStatus.METHOD_NOT_ALLOWED,
          body: failure("METHOD_NOT_ALLOWED", "method not allowed")
        };
      }
      return {
        status: result.status,
        body: result.status < 400 ? success(result.body) : failure(String(result.body.code ?? "WORKSPACE_ERROR"), String(result.body.error ?? "error"))
      };
    } catch (error) {
      return errorResponse(error);
    }
  }

  const corePersistence = services.corePersistence;
  const aiGovernancePersistence = services.aiGovernancePersistence;
  const governedAiExecutor = services.governedAiExecutor;
  const prdPersistence = services.prdPersistence;
  const workspacePersistence = services.workspacePersistence;
  const publishStorePersistence = services.publishStorePersistence;
  const generatedRuntimePersistence = services.generatedRuntimePersistence;
  const corePersistenceClient = services.corePersistenceClient;
  const credentialService = services.credentialService;
  const useCorePersistence = Boolean(corePersistence && isPersistenceCoreRoute(request));
  const useAiGovernancePersistence = Boolean(aiGovernancePersistence && isPersistenceAiGovernanceRoute(request));
  const useBusinessSettingsPersistence = Boolean(services.businessSettingsPersistence && isPersistenceBusinessSettingsRoute(request));
  const usePrdPersistence = Boolean(corePersistence && prdPersistence && isPersistencePrdRoute(request));
  const useWorkspacePersistence = Boolean(corePersistence && prdPersistence && workspacePersistence && isPersistenceWorkspaceRoute(request));
  const usePublishStorePersistence = Boolean(corePersistence && prdPersistence && workspacePersistence && publishStorePersistence && isPersistencePublishStoreRoute(request));
  const useGeneratedRuntimePersistence = Boolean(corePersistence && publishStorePersistence && generatedRuntimePersistence && isPersistenceGeneratedRuntimeRoute(request));
  const useNativeAuth = Boolean(corePersistenceClient && credentialService && isNativeAuthRoute(request));
  const usePersistentProjectFiles = Boolean(corePersistence && isPersistenceProjectFileRoute(request.path));
  const useDurableAiJobs = Boolean(services.durableAiJobs && request.path.match(/^\/projects\/[^/]+\/ai-jobs(?:\/[^/]+)?$/));
  const useSimulatedAuth = Boolean(corePersistenceClient && request.method === "POST" && request.path === "/admin/auth/simulate-login");
  const useKnowledgeSkill = Boolean(services.knowledgeSkillWriter && isKnowledgeSkillRoute(request));
  if (!useCorePersistence && !useAiGovernancePersistence && !useBusinessSettingsPersistence && !usePrdPersistence && !useWorkspacePersistence && !usePublishStorePersistence && !useGeneratedRuntimePersistence && !useNativeAuth && !usePersistentProjectFiles && !useDurableAiJobs && !useSimulatedAuth && !useKnowledgeSkill) return executePlatformApiRequest(services, request);

  try {
    if (useKnowledgeSkill && services.knowledgeSkillWriter) return await handleKnowledgeSkillWithPersistence((r) => executePlatformApiRequest(services, r), request, services, services.knowledgeSkillWriter);
    const persistentProjectFileResponse = request.method === "DELETE" ? null : await handlePersistentProjectFilesRoute({
      method: request.method,
      path: request.path,
      body: request.body,
      repository: services.projectFilePersistence,
      issuer: services.projectFileUploadUrlIssuer,
      resolveActor: () => resolvePersistenceUser(services, request.headers ?? {}),
      resolveProject: (actor, projectId) => resolvePersistenceProject(services, actor as PlatformUser, projectId),
      lifecycle: services.projectLifecycle
    });
    if (persistentProjectFileResponse)
      return {
        status: persistentProjectFileResponse.status,
        body: success(persistentProjectFileResponse.data)
      };
    if (corePersistenceClient && request.method === "POST" && request.path === "/admin/auth/simulate-login") {
      const response = executePlatformApiRequest(services, request);
      if (response.status === HttpStatus.CREATED && response.body.ok === true) {
        await ensureCoreUserForSimulatedSession(corePersistenceClient, response.body.data as SimulatedPlatformSession);
      }
      return response;
    }

    if (corePersistenceClient && credentialService && request.method === "POST" && request.path === "/admin/users") {
      const actor = await resolvePersistenceUser(services, request.headers ?? {});
      services.auth.requireRole(actor, ["admin"]);

      const body = (request.body ?? {}) as Record<string, unknown>;
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const name = String(body.name ?? "").trim();
      const tempPassword = String(body.tempPassword ?? "");
      const role = body.role ? String(body.role) : "creator";

      if (!email || !name || !tempPassword) {
        return {
          status: HttpStatus.BAD_REQUEST,
          body: failure("invalid_input", "Email and name are required")
        };
      }

      const existing = await corePersistenceClient.platformUser.findUnique({ where: { email } });
      if (existing) {
        return {
          status: HttpStatus.CONFLICT,
          body: failure("email_exists", "That email already exists")
        };
      }

      const id = `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const created = await createUserWithRole(corePersistenceClient, { id, email, name, role });

      const passwordResult = await credentialService.setPassword(created.id, tempPassword, {
        mustChange: true
      });
      if (!passwordResult.ok) {
        return {
          status: HttpStatus.BAD_REQUEST,
          body: failure("weak_password", "Temporary password must be at least 8 characters")
        };
      }

      services.identity.registerUser({
        id: created.id,
        email: created.email,
        name: created.name,
        role: role as PlatformUser["role"],
        status: created.status as PlatformUser["status"],
        permissions: getMockPermissions(role as PlatformUser["role"])
      } as PlatformUser);

      const summary = {
        id: created.id,
        email: created.email,
        name: created.name,
        role,
        status: created.status,
        mustChangePassword: true
      };
      return { status: HttpStatus.CREATED, body: success(summary) };
    }

    if (credentialService && request.method === "POST" && request.path === "/auth/login") {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const email = String(body.email ?? "");
      const password = String(body.password ?? "");

      const verified = await credentialService.verifyLogin(email, password);
      if (!verified) {
        return {
          status: HttpStatus.UNAUTHORIZED,
          body: failure("invalid_credentials", "Invalid email or password")
        };
      }

      const user = corePersistence ? await corePersistence.getUserByEmail(email.trim().toLowerCase()) : services.identity.getUserByEmail(email.trim().toLowerCase());
      const session = services.authSso.issueNativeSession(user);
      return {
        status: HttpStatus.OK,
        body: success({
          token: session.token,
          expiresAt: session.expiresAt,
          mustChangePassword: verified.mustChangePassword
        })
      };
    }

    if (credentialService && request.method === "POST" && request.path === "/auth/change-password") {
      const actor = corePersistence ? (await resolvePersistenceAuth(services, request.headers ?? {})).user : services.auth.resolve(request.headers ?? {}).user;
      const body = (request.body ?? {}) as Record<string, unknown>;
      const currentPassword = String(body.currentPassword ?? "");
      const newPassword = String(body.newPassword ?? "");

      const result = await credentialService.changePassword(actor.id, currentPassword, newPassword);
      if (!result.ok) {
        if (result.reason === "weak_password") {
          return {
            status: HttpStatus.BAD_REQUEST,
            body: failure("weak_password", "New password must be at least 8 characters")
          };
        }
        return {
          status: HttpStatus.BAD_REQUEST,
          body: failure("invalid_credentials", "Invalid email or password")
        };
      }

      return { status: HttpStatus.OK, body: success({ ok: true }) };
    }

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
      return {
        status: HttpStatus.OK,
        body: success({
          user,
          permissions: user.permissions,
          auth: buildAuthEvidence(authResolution)
        })
      };
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
        metadata: { projectId: project.id }
      });
      return { status: HttpStatus.CREATED, body: success(project) };
    }

    const projectDeleteMatch = request.path.match(/^\/projects\/([^/]+)$/);
    if (corePersistence && request.method === "DELETE" && projectDeleteMatch) {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      const cleanup = services.projectResourceCleanup ?? ((id: string, fence) => deletePersistedProjectResources(id, { workspace: services.workspaceOrchestrator, files: services.projectFilePersistence, storage: services.projectFileUploadUrlIssuer }, undefined, fence));
      const lifecycle = services.projectLifecycle ??= createProjectLifecycleCoordinator();
      const data = await deletePersistedProject({ actor: user, encodedProjectId: projectDeleteMatch[1], persistence: corePersistence, cleanup, lifecycle, workspace: services.workspaceOrchestrator });
      return { status: HttpStatus.OK, body: success(data) };
    }

    if (corePersistence && request.method === "GET" && request.path === "/audit-logs") {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(await corePersistence.filterAudit({})) };
    }

    if (corePersistence && request.method === "POST" && request.path === "/audit-logs/filter") {
      const user = (await resolvePersistenceAuth(services, request.headers ?? {})).user;
      services.auth.requireRole(user, ["admin"]);
      return {
        status: HttpStatus.OK,
        body: success(await corePersistence.filterAudit(buildAuditFilterInput(request.body)))
      };
    }

    const aiResponse = await handleAiGovernanceRoute(request, {
      services,
      aiGovernancePersistence,
      governedAiExecutor,
      resolvePersistenceUser
    });
    if (aiResponse) return aiResponse;

    const durableAiJobMatch = request.path.match(/^\/projects\/([^/]+)\/ai-jobs(?:\/([^/]+))?$/);
    if (durableAiJobMatch && ((request.method === "POST" && !durableAiJobMatch[2]) || (request.method === "GET" && durableAiJobMatch[2]))) {
      const actor = await resolvePersistenceUser(services, request.headers ?? {});
      const project = services.corePersistence ? await resolvePersistenceProject(services, actor, durableAiJobMatch[1]) : services.projects.getProjectForActor(actor, durableAiJobMatch[1]);
      const result = await handleDurableAiJob({
        method: request.method,
        jobId: durableAiJobMatch[2],
        body: request.body,
        projectId: project.id,
        actorId: actor.id,
        store: services.durableAiJobs,
        cipher: services.durableAiJobPayloadCipher
      });
      return result.status === HttpStatus.NOT_FOUND ? { status: HttpStatus.NOT_FOUND, body: failure("NOT_FOUND", "AI job not found") } : { status: result.status, body: success(result.data) };
    }

    const setup = await resolveSetupRequest(request, services, () => resolvePersistenceUser(services, request.headers ?? {}));
    if (setup) return setup;

    const prdGenerateMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/generate$/);
    if (corePersistence && prdPersistence && governedAiExecutor && request.method === "POST" && prdGenerateMatch) {
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
      const execution = await governedAiExecutor.execute(user, {
        scenario: "prd_generation",
        projectId: project.id,
        prompt: sourcePrompt,
        requestId: String(request.body?.requestId ?? crypto.randomUUID()),
        requestedTokens: 300
      });
      if (execution.status === "blocked" || execution.status === "failed" || !execution.text) {
        throw new ValidationError(`PRD generation unavailable: ${execution.evidence.failureReason ?? execution.status}`);
      }
      const draft = await prdPersistence.generateDraft(user, {
        project,
        sourcePrompt,
        generatedBy: {
          scenario: "prd_generation",
          providerId: execution.evidence.providerId,
          model: execution.evidence.model
        },
        aiSummary: execution.text
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "prd.draft.generated",
        resourceType: "prd_version",
        resourceId: draft.id,
        metadata: {
          projectId: project.id,
          guardrailDecision: guardrail.decision,
          executionId: execution.evidence.id,
          aiStatus: execution.status,
          fallbackUsed: execution.evidence.fallbackUsed,
          tokensUsed: execution.evidence.tokensUsed
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
        metadata: {
          projectId: project.id,
          sourceVersionId: request.body?.versionId ? String(request.body.versionId) : ""
        }
      });
      return { status: HttpStatus.OK, body: success(baseline) };
    }

    const prdVersionsMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/versions$/);
    if (prdPersistence && request.method === "GET" && prdVersionsMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, prdVersionsMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await prdPersistence.listVersions(user, project))
      };
    }

    const prdCurrentMatch = request.path.match(/^\/projects\/([^/]+)\/prd$/);
    if (prdPersistence && request.method === "GET" && prdCurrentMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, prdCurrentMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await prdPersistence.getCurrent(user, project))
      };
    }

    const workspacePromptMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/prompts$/);
    if (corePersistence && prdPersistence && workspacePersistence && governedAiExecutor && request.method === "POST" && workspacePromptMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      services.auth.requireRole(user, ["admin", "creator"]);
      const project = await resolvePersistenceProject(services, user, workspacePromptMatch[1]);
      const prompt = String(request.body?.prompt ?? "");
      const baseline = await prdPersistence.getCurrentOptional(user, project);
      const agentMode = resolveWorkspaceAgentMode(request.body);
      if (agentMode === "plan") {
        const guardrail = services.guardrails.evaluatePrompt(user, {
          prompt,
          scenario: "frontend_coding"
        });
        const planned = await workspacePersistence.planPrompt(user, {
          project,
          baseline,
          prompt,
          guardrail
        });
        await corePersistence.recordAudit({
          actorId: user.id,
          action: "workspace.prompt.plan_only",
          resourceType: "workspace_task",
          resourceId: planned.task.id,
          severity: "info",
          metadata: { projectId: project.id }
        });
        return { status: HttpStatus.OK, body: success(planned) };
      }
      const result = await handlePersistedWorkspacePrompt({
        actor: user,
        project,
        baseline,
        prompt,
        requestId: String(request.body?.requestId ?? crypto.randomUUID()),
        executor: governedAiExecutor,
        workspace: workspacePersistence,
        audit: ({ actorId, action, resourceId, severity, metadata }) =>
          corePersistence.recordAudit({
            actorId,
            action,
            resourceType: "workspace_task",
            resourceId,
            severity,
            metadata
          })
      });
      return { status: result.status, body: success(result.body) };
    }

    const workspaceRefreshMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/preview\/refresh$/);
    if (prdPersistence && workspacePersistence && request.method === "POST" && workspaceRefreshMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, workspaceRefreshMatch[1]);
      const baseline = await prdPersistence.getCurrentOptional(user, project);
      return {
        status: HttpStatus.OK,
        body: success(await workspacePersistence.refreshPreview(user, { project, baseline }))
      };
    }

    const workspaceMatch = request.path.match(/^\/projects\/([^/]+)\/workspace$/);
    if (prdPersistence && workspacePersistence && request.method === "GET" && workspaceMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, workspaceMatch[1]);
      const baseline = await prdPersistence.getCurrentOptional(user, project);
      return {
        status: HttpStatus.OK,
        body: success(await workspacePersistence.getWorkspace(user, { project, baseline }))
      };
    }

    const persistedAppUsersMatch = request.path.match(/^\/projects\/([^/]+)\/app\/users$/);
    if (corePersistence && publishStorePersistence && request.method === "GET" && persistedAppUsersMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const project = await resolvePersistenceProject(services, user, persistedAppUsersMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await publishStorePersistence.getAppAccessSnapshot(user, { project }))
      };
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
        metadata: {
          projectId: project.id,
          email: invitation.email,
          roleKey: invitation.roleKey,
          userType: invitation.userType
        }
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
        metadata: {
          projectId: project.id,
          requesterEmail: accessRequest.requesterEmail,
          requestedRoleKey: accessRequest.requestedRoleKey
        }
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

    const persistedPublishResponse = await handlePersistedPublishApiRequest(services, request);
    if (persistedPublishResponse) return persistedPublishResponse;

    if (publishStorePersistence && request.method === "GET" && request.path === "/app-store/registry") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await publishStorePersistence.listRegistry(user))
      };
    }

    if (publishStorePersistence && request.method === "GET" && request.path === "/store/apps") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await publishStorePersistence.listStoreApps(user))
      };
    }

    const persistedStoreInstallMatch = request.path.match(/^\/store\/apps\/([^/]+)\/install$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedStoreInstallMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const installation = await publishStorePersistence.installStoreApp(user, {
        appSlug: persistedStoreInstallMatch[1]
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "store.app.installed",
        resourceType: "app_installation",
        resourceId: installation.id,
        metadata: {
          projectId: installation.projectId,
          appId: installation.appId,
          appSlug: installation.appSlug
        }
      });
      return { status: HttpStatus.CREATED, body: success(installation) };
    }

    const persistedStoreUninstallMatch = request.path.match(/^\/store\/apps\/([^/]+)\/uninstall$/);
    if (corePersistence && publishStorePersistence && request.method === "POST" && persistedStoreUninstallMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const installation = await publishStorePersistence.uninstallStoreApp(user, {
        appSlug: persistedStoreUninstallMatch[1]
      });
      await corePersistence.recordAudit({
        actorId: user.id,
        action: "store.app.uninstalled",
        resourceType: "app_installation",
        resourceId: installation.id,
        metadata: {
          projectId: installation.projectId,
          appId: installation.appId,
          appSlug: installation.appSlug
        }
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
        metadata: {
          appSlug: accessRequest.appSlug,
          requestedRoleKey: accessRequest.requestedRoleKey,
          department: accessRequest.department
        }
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
        metadata: {
          appSlug: ticket.appSlug,
          type: ticket.type,
          priority: ticket.priority,
          assignedToUserId: ticket.assignedToUserId
        }
      });
      return { status: HttpStatus.CREATED, body: success(ticket) };
    }

    const persistedStoreTicketStatusMatch = request.path.match(/^\/store\/tickets\/([^/]+)$/);
    if (publishStorePersistence && request.method === "GET" && persistedStoreTicketStatusMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await publishStorePersistence.getTicketStatus(user, persistedStoreTicketStatusMatch[1]))
      };
    }

    const persistedCreatorTicketInboxMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/tickets$/);
    if (corePersistence && publishStorePersistence && request.method === "GET" && persistedCreatorTicketInboxMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      await resolvePersistenceProject(services, user, persistedCreatorTicketInboxMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await publishStorePersistence.listCreatorInbox(user, persistedCreatorTicketInboxMatch[1]))
      };
    }

    const persistedStoreAppDetailMatch = request.path.match(/^\/store\/apps\/([^/]+)$/);
    if (publishStorePersistence && request.method === "GET" && persistedStoreAppDetailMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await publishStorePersistence.getStoreAppDetail(user, persistedStoreAppDetailMatch[1]))
      };
    }

    const persistedRuntimeOverviewMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)$/);
    if (corePersistence && generatedRuntimePersistence && request.method === "GET" && persistedRuntimeOverviewMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeOverviewMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await generatedRuntimePersistence.getRuntimeOverview(user, runtimeInput))
      };
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
        metadata: {
          projectId: runtimeInput.project.id,
          attemptedSchema: result.attemptedSchema,
          operation: result.operation
        }
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    const persistedRuntimeHealthMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/health$/);
    if (generatedRuntimePersistence && request.method === "GET" && persistedRuntimeHealthMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeHealthMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await generatedRuntimePersistence.getRuntimeHealth(user, runtimeInput))
      };
    }

    const persistedRuntimeOpenApiMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/openapi$/);
    if (generatedRuntimePersistence && request.method === "GET" && persistedRuntimeOpenApiMatch) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const runtimeInput = await resolvePersistedRuntimeInput(services, user, persistedRuntimeOpenApiMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success(await generatedRuntimePersistence.getOpenApiContract(user, runtimeInput))
      };
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
        metadata: {
          projectId: runtimeInput.project.id,
          migrationId: result.migrationId,
          destructiveChanges: result.destructiveChanges
        }
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
            authMode: String(process.env.EVCP_ALLOW_SIMULATE_LOGIN ?? "0") === "1" ? "platform_session_with_mock_header_for_tests" : "platform_session"
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
      return {
        status: HttpStatus.OK,
        body: success(services.prds.listVersions(user, prdVersionsMatch[1]))
      };
    }

    const prdCurrentMatch = request.path.match(/^\/projects\/([^/]+)\/prd$/);
    if (request.method === "GET" && prdCurrentMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.prds.getCurrent(user, prdCurrentMatch[1]))
      };
    }

    const workspacePromptMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/prompts$/);
    if (request.method === "POST" && workspacePromptMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.workspace.submitPrompt(user, workspacePromptMatch[1], {
        prompt: String(request.body?.prompt ?? ""),
        agentMode: resolveWorkspaceAgentMode(request.body)
      });
      return {
        status: result.guardrail.decision === "block" ? HttpStatus.OK : HttpStatus.CREATED,
        body: success(result)
      };
    }

    const workspaceRefreshMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/preview\/refresh$/);
    if (request.method === "POST" && workspaceRefreshMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.workspace.refreshPreview(user, workspaceRefreshMatch[1]))
      };
    }

    const workspaceMatch = request.path.match(/^\/projects\/([^/]+)\/workspace$/);
    if (request.method === "GET" && workspaceMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.workspace.getWorkspace(user, workspaceMatch[1]))
      };
    }

    const frontendCheckpointsMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/checkpoints$/);
    if (request.method === "GET" && frontendCheckpointsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.frontendVersions.getTimeline(user, frontendCheckpointsMatch[1]))
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.appAccess.getSnapshot(user, appUsersMatch[1]))
      };
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

    const legacyPublishResponse = handleLegacyPublishApiRequest(services, request, (services as PersistenceAwarePlatformApiServices).publishAccessUrlConfig ?? resolvePublishAccessUrlConfig());
    if (legacyPublishResponse) return legacyPublishResponse;

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
      return {
        status: HttpStatus.OK,
        body: success(services.storefront.getAppDetail(user, storeAppDetailMatch[1]))
      };
    }

    const storeTicketStatusMatch = request.path.match(/^\/store\/tickets\/([^/]+)$/);
    if (request.method === "GET" && storeTicketStatusMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.tickets.getTicketStatus(user, storeTicketStatusMatch[1]))
      };
    }

    const creatorTicketInboxMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/tickets$/);
    if (request.method === "GET" && creatorTicketInboxMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.tickets.listCreatorInbox(user, creatorTicketInboxMatch[1]))
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.operations.getOverview(user).installerReports)
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.production.getObservabilityDashboard(user))
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.securityRelease.getReadinessOverview(user))
      };
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
      const requestPayload = request.body?.requestPayload && typeof request.body.requestPayload === "object" && !Array.isArray(request.body.requestPayload) ? (request.body.requestPayload as Record<string, unknown>) : {};
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

    const projectFilesMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/files$/);
    if (request.method === "GET" && projectFilesMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.projectFiles.listProjectFiles(user, projectFilesMatch[1]))
      };
    }

    const projectFileInitMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/files\/init$/);
    if (request.method === "POST" && projectFileInitMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.projectFiles.initializeUpload(user, projectFileInitMatch[1], {
        fileName: String(request.body?.fileName ?? ""),
        mimeType: String(request.body?.mimeType ?? ""),
        sizeBytes: Number(request.body?.sizeBytes ?? 0),
        sha256: String(request.body?.sha256 ?? ""),
        purpose: request.body?.purpose ? (String(request.body.purpose) as never) : undefined,
        includeByDefault: request.body?.includeByDefault === undefined ? undefined : Boolean(request.body.includeByDefault)
      });
      return { status: HttpStatus.CREATED, body: success(result) };
    }

    const projectFileCompleteMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/files\/([^/]+)\/complete$/);
    if (request.method === "POST" && projectFileCompleteMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.projectFiles.completeUpload(user, projectFileCompleteMatch[1], projectFileCompleteMatch[2], {
        scanStatus: request.body?.scanStatus ? (String(request.body.scanStatus) as never) : undefined,
        extractedText: request.body?.extractedText ? String(request.body.extractedText) : undefined,
        excerpts: Array.isArray(request.body?.excerpts) ? request.body.excerpts.map(String) : undefined
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
      return {
        status: HttpStatus.OK,
        body: success(services.generatedRuntime.getRuntimeOverview(user, runtimeOverviewMatch[1]))
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.generatedRuntime.getRuntimeOverview(user, runtimeOpenApiMatch[1]).openApi)
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.authSso.getDirectIdpConstraints(user))
      };
    }

    if (request.method === "POST" && request.path === "/admin/auth/simulate-login") {
      if (String(process.env.EVCP_ALLOW_SIMULATE_LOGIN ?? "0") !== "1") {
        return {
          status: HttpStatus.FORBIDDEN,
          body: failure("simulate_login_disabled", "Simulate-login is disabled")
        };
      }
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
      return {
        status: HttpStatus.OK,
        body: success(services.prdChanges.listChanges(user, prdChangesMatch[1]))
      };
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
      return {
        status: HttpStatus.OK,
        body: success(services.domains.getSettings(user, domainSettingsMatch[1]))
      };
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

    const aiResponse = handleInMemoryAiGovernanceRoute(request, services);
    if (aiResponse) return aiResponse;

    return {
      status: HttpStatus.NOT_FOUND,
      body: failure("NOT_FOUND", "Unknown platform API route")
    };
  } catch (error) {
    return errorResponse(error);
  }
}

async function registerPlatformRoutes(app: INestApplication, services: PersistenceAwarePlatformApiServices): Promise<void> {
  const routes = app.getHttpAdapter().getInstance() as RouteRegistry;

  if (services.keycloakUserManagement) {
    registerKeycloakUserManagementRoutes(routes, services.keycloakUserManagement, (headers) => resolvePersistenceUser(services, headers ?? {}), services.platformSessions);
  }

  routes.get("/health", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/health",
        headers: request.headers
      })
    )
  );
  routes.get("/auth/me", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/auth/me",
        headers: request.headers
      })
    )
  );
  routes.get("/projects", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/projects",
        headers: request.headers
      })
    )
  );
  routes.post("/projects", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/projects",
        headers: request.headers,
        body: request.body
      })
    )
  );
  registerProjectDeletionRoute(routes, (response, request) => sendPlatformResponseAsync(response as HttpResponse, executePlatformApiRequestAsync(services, request)));
  routes.post("/admin/users", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/admin/users",
        headers: request.headers,
        body: request.body
      })
    )
  );
  registerSetupRoutes(routes, (response, platformRequest) => sendPlatformResponseAsync(response, executePlatformApiRequestAsync(services, platformRequest)));
  const systemUpdateService = createSystemUpdateService({ engine: createSwarmServiceEngine() });
  registerSystemRoutes(routes, (response, platformRequest) =>
    sendPlatformResponseAsync(
      response,
      resolveSystemRequest(platformRequest, {
        systemUpdateService,
        auth: services.auth,
        resolveActor: () => resolvePersistenceUser(services, platformRequest.headers ?? {})
      })
    )
  );
  const domainService = createDomainService({
    engine: createSwarmServiceEngine(),
    // Falls back to a memory-backed singleton (mirrors createRuntimePlatformApiServices' memory
    // mode) so /admin/system/domain works even when core persistence isn't wired up.
    settings: services.businessSettingsPersistence ?? createBusinessSettingsRepositoryBackedService(),
    keycloak: process.env.KEYCLOAK_ISSUER_URL ? new KeycloakAdminClient({ config: readKeycloakConfig(process.env) }) : undefined,
    writeDomainEnv: (path, content) => fs.writeFileSync(path, content, { mode: 0o600 })
  });
  registerDomainRoutes(routes, (response, platformRequest) =>
    sendPlatformResponseAsync(
      response,
      resolveDomainRequest(platformRequest, {
        domainService,
        auth: services.auth,
        resolveActor: () => resolvePersistenceUser(services, platformRequest.headers ?? {})
      })
    )
  );
  routes.post("/auth/login", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/auth/login",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/auth/change-password", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/auth/change-password",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/audit-logs", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/audit-logs",
        headers: request.headers
      })
    )
  );
  routes.post("/audit-logs/filter", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/audit-logs/filter",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/workspace/container", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/container`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/workspace/container", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/container`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/workspace/container/stop", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/container/stop`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/workspace/container/wake", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/container/wake`,
        headers: request.headers
      })
    )
  );

  type RawExpress = {
    all: (
      path: string,
      handler: (
        req: {
          params: Record<string, string>;
          method: string;
          headers: Record<string, string | string[] | undefined>;
          url: string;
          originalUrl: string;
          body?: unknown;
          on: (event: string, cb: (chunk: unknown) => void) => void;
        },
        res: {
          status: (code: number) => { json: (body: unknown) => void };
          statusCode: number;
          setHeader: (k: string, v: string | string[] | number) => void;
          end: (body?: unknown) => void;
          write: (chunk: unknown) => void;
          headersSent: boolean;
        }
      ) => void
    ) => void;
  };
  type PreviewReq = Parameters<RawExpress["all"]>[1] extends (req: infer Q, res: infer _S) => void ? Q : never;
  type PreviewRes = Parameters<RawExpress["all"]>[1] extends (req: infer _Q, res: infer S) => void ? S : never;
  const rawApp = app.getHttpAdapter().getInstance() as unknown as RawExpress;
  const sendPreviewUnavailable = (req: PreviewReq, res: PreviewRes, status: number, error: string, message?: string) => {
    if (wantsPreviewJson(req.headers)) {
      res.status(status).json({ error });
      return;
    }
    res.statusCode = status;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(renderPreviewUnavailableHtml({ status, message }));
  };
  const previewHandler = async (req: PreviewReq, res: PreviewRes) => {
    const slug = String(req.params?.slug ?? "");
    const cookieToken = String(req.headers.cookie ?? "").match(/(?:^|;\s*)evcp_preview_token=([^;]+)/)?.[1];
    const previewHeaders = cookieToken ? { ...req.headers, authorization: `Bearer ${decodeURIComponent(cookieToken)}` } : req.headers;
    const decision = await resolvePreviewProxyDecision(services, previewHeaders, slug);
    if ("status" in decision) {
      sendPreviewUnavailable(req, res, decision.status, "preview_unavailable");
      return;
    }
    const target = new URL(decision.upstream);
    const forwardPath = req.originalUrl || "/";
    const forwardHeaders: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: target.host
    };
    for (const key of Object.keys(forwardHeaders)) {
      if (key.toLowerCase() === "authorization" || key.toLowerCase() === "cookie") {
        delete forwardHeaders[key];
      }
    }
    const proxyReq = nodeHttp.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        method: req.method,
        path: forwardPath,
        headers: forwardHeaders
      },
      (proxyRes: any) => {
        res.statusCode = proxyRes.statusCode ?? 502;
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value !== undefined) res.setHeader(key, value as string | string[]);
        }
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) {
        sendPreviewUnavailable(req, res, 503, "preview_upstream_unreachable", "The workspace container is booting or installing dependencies. The preview will refresh automatically.");
      }
    });
    const method = String(req.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || req.body === undefined || req.body === null) {
      proxyReq.end();
    } else {
      const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      proxyReq.setHeader("content-type", "application/json");
      proxyReq.setHeader("content-length", Buffer.byteLength(payload));
      proxyReq.write(payload);
      proxyReq.end();
    }
  };
  rawApp.all("/preview/:slug", previewHandler);
  rawApp.all("/preview/:slug/*splat", previewHandler);

  const sharedMigrationStore = resolveCorePersistenceMode() === "prisma" ? await createPrismaWorkspaceMigrationStore(process.env.DATABASE_URL) : createMemoryMigrationStore();
  const generationService = await createDefaultGenerationService({
    orchestrator: services.workspaceOrchestrator,
    migrations: sharedMigrationStore,
    resolveGovernedContext: createGovernedContextResolver(services),
    ...(services.governedAiExecutor ? { governedAiExecutor: services.governedAiExecutor } : {}),
    onAudit: (event) =>
      services.audit.record({
        actorId: "system",
        action: event.action,
        resourceType: "workspace_container",
        resourceId: event.projectId,
        metadata: event.metadata
      })
  });
  registerWorkspaceFilesRoute({
    rawApp,
    generationService,
    resolveAuth: async (req) => resolveWorkspaceAuth(services, req.headers ?? {})
  });
  const chatSseHandler = createChatSseHandler({
    generationService,
    resolveAuth: async (req) => {
      try { return await resolveWorkspaceAuth(services, (req as { headers?: HeaderBag }).headers ?? {}); }
      catch { return null; }
    },
    resolveAttachmentContext: async (req, projectId, attachmentIds) => {
      const user = await resolvePersistenceUser(services, (req as { headers?: HeaderBag }).headers ?? {});
      const project = services.corePersistence ? await resolvePersistenceProject(services, user, projectId) : services.projects.getProjectForActor(user, projectId);
      if (services.projectFilePersistence) {
        const selection = await services.projectFilePersistence.resolveAttachments(project.id, attachmentIds);
        return { versionIds: selection.versionIds, excerpts: selection.excerpts };
      }
      const attachmentSelection = services.projectFiles.resolveAttachmentSources(user, project.id, attachmentIds);
      const retrieval = services.knowledge.retrieve(user, {
        projectId: project.id,
        appId: project.appId,
        department: project.targetDepartment,
        agentRole: "frontend_developer",
        scenario: "frontend_coding",
        query: `workspace chat attachments ${attachmentIds.join(" ")}`,
        requiredKnowledgeSourceIds: attachmentSelection.sourceIds
      });
      return {
        versionIds: retrieval.matchedVersionIds,
        excerpts: retrieval.sources.flatMap((source) => source.excerpts.map((excerpt) => `${source.title}: ${excerpt}`))
      };
    },
    onPlatformBug: createPlatformBugAuditor(services.audit),
    lifecycle: services.projectLifecycle ??= createProjectLifecycleCoordinator()
  });
  rawApp.all("/projects/:projectId/chat", chatSseHandler as unknown as Parameters<RawExpress["all"]>[1]);
  rawApp.all("/projects/:projectId/chat/history", chatSseHandler as unknown as Parameters<RawExpress["all"]>[1]);
  rawApp.all("/projects/:projectId/chat/active", chatSseHandler as unknown as Parameters<RawExpress["all"]>[1]);
  rawApp.all("/projects/:projectId/chat/cancel", chatSseHandler as unknown as Parameters<RawExpress["all"]>[1]);
  rawApp.all("/projects/:projectId/chat/restore", chatSseHandler as unknown as Parameters<RawExpress["all"]>[1]);

  const recordPublishAudit = (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) =>
    services.audit.record({ actorId: "system", action: event.action, resourceType: "workspace_container", resourceId: event.projectId, metadata: event.metadata });
  const projectLifecycle = services.projectLifecycle ??= createProjectLifecycleCoordinator();
  const publishStack = await createDefaultPublishStack({ orchestrator: services.workspaceOrchestrator, migrations: sharedMigrationStore, env: process.env, onAudit: recordPublishAudit, lifecycle: projectLifecycle });
  const publishAccessUrlConfig = services.publishAccessUrlConfig ?? resolvePublishAccessUrlConfig(process.env);
  services.projectResourceCleanup = (projectId, fence) => deletePersistedProjectResources(projectId, { workspace: services.workspaceOrchestrator, files: services.projectFilePersistence, storage: services.projectFileUploadUrlIssuer }, () => publishStack.publishService.deleteProject(projectId, fence), fence);
  await registerPublishHttpRoutes({
    rawApp,
    orchestrator: services.workspaceOrchestrator,
    migrations: sharedMigrationStore,
    publishStack,
    nodeHttp,
    resolvePublishAuth: async (headers) => {
      try {
        return await resolveWorkspaceAuth(services, headers ?? {});
      } catch {
        return null;
      }
    },
    canAccessDeployment: (auth, projectId) => canAccessPublishedDeployment(auth, projectId, services.publishStorePersistence),
    preflightPublishedSubdomain: (input) => preflightPublishedSubdomain(services, input),
    persistPublishedDeployment: ({ headers, projectId, deployment, subdomain, visibility }) =>
      executePlatformApiRequestAsync(
        services,
        createInternalPublishPersistenceRequest({ headers, projectId, deployment, subdomain, visibility })
      ),
    launchGrantStore: services.launchGrantStore,
    subdomainBaseDomain: publishAccessUrlConfig.baseDomain,
    subdomainSecureCookie: publishAccessUrlConfig.secure,
    resolvePublishedSubdomain: async (subdomain) => {
      if (!services.publishStorePersistence) return null;
      const entry = await services.publishStorePersistence.resolvePublishedSubdomain(subdomain);
      return entry?.subdomain
        ? { appSlug: entry.slug, projectId: entry.projectId, routePath: entry.route, subdomain: entry.subdomain, visibility: entry.visibility }
        : null;
    },
    resolveAppLaunch: async ({ headers, appSlug }) => {
      const detail = services.publishStorePersistence
        ? await services.publishStorePersistence.getStoreAppDetail(
            await resolvePersistenceUser(services, headers),
            appSlug
          )
        : services.storefront.getAppDetail(services.auth.resolveCurrentUser(headers), appSlug);
      return {
        appSlug: detail.slug,
        projectId: detail.projectId,
        routePath: detail.route,
        subdomain: detail.subdomain,
        subdomainUrl: detail.subdomainUrl, visibility: detail.accessMode === "public" ? "public" : "restricted"
      };
    },
    recordAudit: recordPublishAudit,
    lifecycle: projectLifecycle
  });

  routes.get("/creator/projects/:projectId/files", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/files`,
        headers: request.headers
      })
    )
  );
  routes.post("/creator/projects/:projectId/files/init", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/files/init`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/creator/projects/:projectId/files/:uploadId/complete", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/files/${String(request.params?.uploadId ?? "")}/complete`,
        headers: request.headers,
        body: request.body
      })
    )
  );

  routes.get("/admin/knowledge/sources", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/admin/knowledge/sources",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/knowledge/sources", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/admin/knowledge/sources",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/sources/:sourceId/versions", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/admin/knowledge/sources/${String(request.params?.sourceId ?? "")}/versions`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/versions/:versionId/approve", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/admin/knowledge/versions/${String(request.params?.versionId ?? "")}/approve`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/retrieve", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/admin/knowledge/retrieve",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/knowledge/retrieval-logs", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/admin/knowledge/retrieval-logs",
        headers: request.headers
      })
    )
  );
  routes.get("/admin/skills", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/admin/skills",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/skills", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/admin/skills",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/:skillId/versions", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/admin/skills/${String(request.params?.skillId ?? "")}/versions`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/versions/:versionId/approve", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/admin/skills/versions/${String(request.params?.versionId ?? "")}/approve`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/:skillId/disable", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/admin/skills/${String(request.params?.skillId ?? "")}/disable`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/assignments", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/admin/skills/assignments",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/resolve", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: "/admin/skills/resolve",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/installer/preflight", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/installer/preflight",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/installer/setup", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/installer/setup",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/installer/reports", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/installer/reports",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/backup/policies", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/backup/policies",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/backup/runs", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/backup/runs",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/backup/pitr", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/backup/pitr",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/backup/restore-drills", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/backup/restore-drills",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/backup/overview", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/backup/overview",
        headers: request.headers
      })
    )
  );
  routes.get("/admin/monitoring", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/monitoring",
        headers: request.headers
      })
    )
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
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/production/observability",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/production/upgrade-checks", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/production/upgrade-checks",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/production/rollback", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/production/rollback",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/production/overview", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/production/overview",
        headers: request.headers
      })
    )
  );
  routes.get("/admin/security/readiness", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/security/readiness",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/security/uploads/validate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/security/uploads/validate",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/security/release-checklist", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/security/release-checklist",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/security/redaction/preview", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/security/redaction/preview",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/license/install", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/license/install",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/license/validate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/license/validate",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/license/enforce", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/license/enforce",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/prd/generate", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/generate`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  registerDurableAiJobHttpRoutes({
    routes,
    respond: sendPlatformResponseAsync,
    execute: (request) => executePlatformApiRequestAsync(services, request)
  });
  routes.post("/projects/:projectId/prd/baseline", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/baseline`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/prd/versions", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/versions`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/prd", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
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
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace`,
        headers: request.headers
      })
    )
  );
  registerPreviewSessionRoute({
    routes,
    authorize: async (headers, projectId) => {
      const actor = await resolvePersistenceUser(services, headers);
      const project = await resolvePersistenceProject(services, actor, projectId);
      return { previewKey: project.id.replaceAll("_", "-") };
    },
    secureCookie: process.env.NODE_ENV === "production"
  });
  routes.post("/projects/:projectId/workspace/prompts", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/prompts`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/workspace/preview/refresh", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/preview/refresh`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  registerProjectDbRoutes({
    get: (path, handler) => routes.get(path, handler),
    post: (path, handler) => routes.post(path, handler),
    resolveAccessibleProjectIds: async (headers) => {
      const { user } = await resolvePersistenceAuth(services, headers);
      return (await services.corePersistence!.listProjects(user)).map((project) => project.id);
    },
    getDatabaseUrl: (projectId) => services.workspaceOrchestrator.getProjectDatabaseUrl(projectId),
    runChildMutation: (projectId, operation) => projectLifecycle.runChildMutation(projectId, operation),
    audit: createProjectDbAuditAdapter(services),
    ok: (response, body) => sendPlatformResponse(response, { status: HttpStatus.OK, body: success(body) }),
    fail: (response, status, code, message) => sendPlatformResponse(response, { status, body: failure(code, message) })
  });
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
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/users`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/app/roles", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/roles`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/invitations", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/invitations`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/access-requests", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/access-requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/access-requests/decision", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/access-requests/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/publish/review", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/publish/review`,
        headers: request.headers
      })
    )
  );
  routes.get("/app-store/registry", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/app-store/registry",
        headers: request.headers
      })
    )
  );
  routes.get("/store/apps", (request, response) =>
    sendPlatformResponseAsync(
      response,
      executePlatformApiRequestAsync(services, {
        method: "GET",
        path: "/store/apps",
        headers: request.headers
      })
    )
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
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/auth/providers",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/auth/providers/oidc", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/auth/providers/oidc",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/auth/providers/saml", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/auth/providers/saml",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/auth/keycloak-defaults", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/auth/keycloak-defaults",
        headers: request.headers
      })
    )
  );
  routes.get("/admin/auth/direct-idp-constraints", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/auth/direct-idp-constraints",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/auth/simulate-login", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/auth/simulate-login",
        headers: request.headers,
        body: request.body
      })
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
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/auth/break-glass",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/policy-templates", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: "/admin/policy-templates",
        headers: request.headers
      })
    )
  );
  routes.post("/admin/policy-templates/evaluate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/policy-templates/evaluate",
        headers: request.headers,
        body: request.body
      })
    )
  );
  for (const { method, path } of aiGovernanceHttpRoutes) {
    const verb = method === "GET" ? "get" : "post";
    routes[verb](path, (request, response) =>
      sendPlatformResponseAsync(
        response,
        executePlatformApiRequestAsync(services, {
          method,
          path,
          headers: request.headers,
          body: request.body
        })
      )
    );
  }
}

export { startWorkspaceIdleSweep } from "./workspace-orchestrator/workspace-sweeps";

export async function createPlatformApiApp(services: PersistenceAwarePlatformApiServices = createPlatformApiServices()): Promise<INestApplication> {
  const app = await NestFactory.create(PlatformApiModule, {
    logger: false
  });

  (app as INestApplication & { useBodyParser: (type: "json", options: { limit: string }) => void }).useBodyParser("json", { limit: "1mb" });
  app.enableCors({
    origin: true,
    credentials: true
  });
  await registerPlatformRoutes(app, services);
  app.get(PlatformApiModule).registerWorkspaceSweeps(startWorkspaceSweeps(services));

  return app;
}
