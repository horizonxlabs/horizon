import { PlatformSessionStore, type PlatformSessionStorage } from "./platform-session-store";
import type {
  ConvertTicketToPrdChangeInput,
  PrdChangeRequestDto,
  StoreTicketInput,
  StoreTicketResponse
} from "./store-ticket-types";
export type {
  ConvertTicketToPrdChangeInput,
  PrdChangeRequestDto,
  StoreTicketInput,
  StoreTicketResponse,
  StoreTicketTimelineEntryDto
} from "./store-ticket-types";
import { PlatformApiError } from "./platform-api-error";
import type { StorefrontAppCardDto, StorefrontAppDetailResponse } from "./storefront-types";
export type { StorefrontAppCardDto, StorefrontAppDetailResponse } from "./storefront-types";
import type { AppStorePublishInput, PublishAccessUrlConfigDto } from "./publish-subdomain";
export { RESERVED_SUBDOMAINS, buildSubdomainUrl, normalizeSubdomainSuggestion, subdomainFromHostname, validateSubdomainLabel } from "./publish-subdomain";
export type * from "./publish-subdomain";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    traceId?: string;
  };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { ok: true, data, meta };
}

export function failure(code: string, message: string, traceId?: string): ApiFailure {
  return { ok: false, error: { code, message, traceId } };
}
export { getDatabaseView, getWorkspaceFiles } from "./workspace-resources";
export type * from "./workspace-resources";
import type {
  WorkspaceDeploymentDto,
  WorkspacePublishResponse,
  PublishRequestDto,
  DeploymentRecordDto,
  AppStoreRegistryEntryDto
} from "./deployment-types";
export type * from "./deployment-types";
import type {
  AiUsageLogDto,
  AiExecutionEvidenceDto,
  GuardrailResultDto,
  AiProviderTestCallInput,
  AiProviderTestCallResponse,
  DurableAiJobDto,
  CreateDurableAiJobInput,
  AiProviderDto,
  CreateAiProviderInput,
  ProviderModelCatalogDto,
  AiApiKeyDto,
  CreateAiApiKeyInput,
  AiScenarioRouteDto,
  ConfigureAiRouteInput,
  AiQuotaDto,
  GuardrailRuleDto,
  CreateGuardrailRuleInput,
  GuardrailEventDto
} from "./ai-governance-types";
export type * from "./ai-governance-types";
import type {
  FrontendCheckpointTimelineDto,
  FrontendRestoreResultDto
} from "./frontend-checkpoint-types";
export type * from "./frontend-checkpoint-types";
export type * from "./setup-types";
import type {
  BusinessSettingsDto,
  BusinessSettingsInput,
  SetupInitializeInput,
  SetupStatusDto
} from "./setup-types";
export type * from "./system-types";
import type { SystemUpdateResponseDto, SystemVersionDto } from "./system-types";
export type * from "./domain-types";
import type { DomainStatusDto, SetDomainResponseDto } from "./domain-types";
import type { CreateProjectInput, PlatformProjectDto } from "./project-types";
export type * from "./project-types";
export type * from "./installer-types";
import type {
  InstallerPreflightInput,
  InstallerReportDto,
  InstallerSetupInput,
  InstallerSetupResponse
} from "./installer-types";
export type PlatformUserDto = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "creator" | "end_user";
  permissions?: string[];
};
export type * from "./keycloak-user-types";
export {
  createKeycloakUserClient,
  startKeycloakLogin,
  startKeycloakLogout
} from "./keycloak-client";
export type CreatePlatformUserInput = {
  email: string;
  name: string;
  role: string;
  tempPassword: string;
};

export type PlatformUserSummary = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
};

export type PlatformAuthEvidenceDto = {
  mode: "platform_session" | "mock_header";
  sessionId?: string;
  expiresAt?: string;
  legacyMockFallback: boolean;
};

export type CurrentUserResponse = {
  user: PlatformUserDto;
  permissions: string[];
  auth: PlatformAuthEvidenceDto;
};

export type PrdSectionDto = {
  id?: string;
  key: string;
  title: string;
  body: string;
  order: number;
};

export type PrdVersionDto = {
  id: string;
  projectId?: string;
  version: string;
  status: "draft" | "baseline" | string;
  isBaseline?: boolean;
  sourcePrompt?: string;
  changeSummary: string;
  generatedBy?: unknown;
  createdByUserId?: string;
  createdAt?: string;
  sections?: PrdSectionDto[];
};

export type ConfirmPrdBaselineInput = {
  versionId: string;
};

export type StorefrontHomeResponse = {
  profile: {
    userName: string;
    email: string;
  };
  myApps: StorefrontAppCardDto[];
  availableApps: StorefrontAppCardDto[];
  notifications: unknown[];
};

export type StoreAppInstallationResponse = {
  id: string;
  appId?: string;
  appSlug: string;
  projectId?: string;
  userId?: string;
  userEmail?: string;
  status: "active" | "disabled";
  installedAt: string;
  disabledAt?: string;
  lastOpenedAt?: string;
};

export type StoreAccessRequestInput = {
  requestedRoleKey: string;
  reason: string;
  department?: string;
};

export type StoreAccessRequestResponse = {
  id: string;
  appSlug: string;
  requestedRoleKey: string;
  requesterEmail: string;
  status: "pending";
  reason: string;
  department?: string;
  createdAt: string;
};

export type WorkspaceTaskStepDto = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "warning" | "failed";
  order: number;
};

export type WorkspaceTaskDto = {
  id: string;
  projectId: string;
  prompt: string;
  status: "ready" | "running" | "blocked" | "failed";
  guardrailDecision: "allow" | "warn" | "block";
  guardrailEventId: string;
  knowledgeVersionIds?: string[];
  skillVersionId?: string;
  steps: WorkspaceTaskStepDto[];
  createdByUserId: string;
  createdAt: string;
};

export type PreviewVersionDto = {
  id: string;
  projectId: string;
  version: string;
  summary: string;
  device: "desktop" | "tablet" | "mobile";
  screenTitle: string;
  highlights: string[];
  createdAt: string;
};

export type WorkspaceTokenBudgetDto = {
  remainingToday: number;
  remainingMonth: number;
  requestEstimate: number;
};

export type WorkspaceAgentMode = "auto" | "plan" | "build";

export type WorkspacePromptInput = {
  prompt: string;
  attachmentIds?: string[];
  agentMode?: WorkspaceAgentMode;
};

export type WorkspacePromptResultDto = {
  guardrail: GuardrailResultDto;
  task: WorkspaceTaskDto;
  preview: PreviewVersionDto;
  usage?: AiUsageLogDto;
  knowledgeRetrieval?: unknown;
  skillSelection?: unknown;
  tokenBudget: WorkspaceTokenBudgetDto;
};

export type ProjectFilePurposeDto = "ai_context" | "app_asset";
export type ProjectFileScanStatusDto = "pending" | "clean" | "failed" | "malicious" | "quarantined";

export type ProjectFileUploadDto = {
  id: string;
  projectId: string;
  sourceId: string;
  versionId: string;
  ownerUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bucket: string;
  objectKey: string;
  purpose: ProjectFilePurposeDto;
  uploadStatus: "pending" | "uploaded" | "failed";
  scanStatus: ProjectFileScanStatusDto;
  indexStatus: "pending" | "indexed" | "failed";
  extractionStatus: "pending" | "indexed" | "failed";
  includeByDefault: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFileUploadInitInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  purpose?: ProjectFilePurposeDto;
  includeByDefault?: boolean;
};

export type ProjectFileUploadInitResponse = {
  uploadId: string;
  sourceId: string;
  versionId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  file: ProjectFileUploadDto;
};

export type ProjectFileUploadCompleteInput = {
  scanStatus?: ProjectFileScanStatusDto;
  extractedText?: string;
  excerpts?: string[];
};

export type ProjectFileUploadCompleteResponse = { file: ProjectFileUploadDto };

export type WorkspaceSnapshotResponse = {
  project: PlatformProjectDto;
  baseline?: {
    id: string;
    projectId: string;
    version: string;
    title?: string;
    status?: string;
    summary?: string;
    isBaseline: boolean;
    createdAt?: string;
  };
  preview: PreviewVersionDto;
  tasks: WorkspaceTaskDto[];
  usage: AiUsageLogDto[];
  tokenBudget: WorkspaceTokenBudgetDto;
};

export type ManagedAppDto = {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "disabled" | "archived";
  route: string;
};

export type AppRoleDefinitionDto = {
  id: string;
  appId: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  memberCount: number;
};

export type AppMemberRecordDto = {
  id: string;
  appId: string;
  userId?: string;
  email: string;
  name: string;
  userType: "internal" | "external";
  roleId?: string;
  roleKey: string;
  roleName: string;
  status: "active" | "pending" | "approval_required";
  lastAccessAt?: string;
};

export type AppInvitationDto = {
  id: string;
  appId: string;
  projectId: string;
  email: string;
  userType: "internal" | "external";
  roleKey: string;
  invitedByUserId: string;
  status: "pending" | "accepted" | "revoked" | "approval_required";
  expiresAt?: string;
  note?: string;
  policyWarning?: string;
  createdAt: string;
};

export type AppAccessRequestDto = {
  id: string;
  appId: string;
  projectId: string;
  requesterEmail: string;
  requestedRoleKey: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedByUserId?: string;
  decidedAt?: string;
  createdAt: string;
};

export type AppAccessSnapshotResponse = {
  project?: PlatformProjectDto;
  app: ManagedAppDto;
  roles: AppRoleDefinitionDto[];
  members: AppMemberRecordDto[];
  invitations: AppInvitationDto[];
  accessRequests: AppAccessRequestDto[];
};

export type AppInvitationInput = {
  email: string;
  roleKey: string;
  userType: "internal" | "external";
  expiresAt?: string;
  note?: string;
};

export type AppAccessDecisionInput = {
  requestId: string;
  decision: "approved" | "rejected";
  decidedByUserId?: string;
};

export type AppManifestDto = {
  id?: string;
  appId: string;
  projectId?: string;
  manifestVersion: string;
  app?: {
    id?: string;
    slug: string;
    name?: string;
    route: string;
    status?: string;
  };
  prd?: {
    versionId: string;
    version: string;
  };
  frontend?: {
    checkpointId: string;
    version: string;
    checksum: string;
    routes: string[];
  };
  auth?: {
    mode: "platform_auth_sdk";
    accessMode: "restricted";
  };
  roles?: Array<{ key: string; name: string; permissions: string[] }>;
  database?: {
    schemaName: string;
    tables: string[];
  };
  generatedAt?: string;
};

export type PublishChecklistItemDto = {
  key: string;
  label: string;
  status: "pass" | "fail";
  detail: string;
};

export type PublishReviewResponse = {
  project?: PlatformProjectDto;
  manifest: AppManifestDto;
  checklist: PublishChecklistItemDto[];
  ready: boolean;
  accessUrlConfig: PublishAccessUrlConfigDto;
};

export type PublishResultResponse = {
  publishRequest: PublishRequestDto;
  deployment: DeploymentRecordDto;
  registryEntry: AppStoreRegistryEntryDto;
  manifest: AppManifestDto;
};

export type PlatformAuthClaimsDto = {
  subject: string;
  email: string;
  name: string;
  groups: string[];
  platformRoles: string[];
  appRoles: Record<string, string[]>;
};

export type SimulatedSsoLoginInput = {
  providerId?: string;
  subject: string;
  email: string;
  name: string;
  groups: string[];
  appRoles?: Record<string, string[]>;
};

export type PlatformAuthSessionResponse = {
  id: string;
  providerId: string;
  providerType: "oidc" | "saml" | "keycloak";
  token: string;
  claims: PlatformAuthClaimsDto;
  issuedAt: string;
  expiresAt: string;
};

export type PlatformApiClientOptions = {
  baseUrl: string;
  sessionToken?: string;
  legacyUserEmail?: string;
  fetcher?: typeof fetch;
};

export * from "./platform-session-store";
export * from "./platform-session-client";

export { PlatformApiError } from "./platform-api-error";

export class PlatformApiClient {
  private readonly baseUrl: string;
  private readonly sessionToken?: string;
  private readonly legacyUserEmail?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: PlatformApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.sessionToken = options.sessionToken;
    this.legacyUserEmail = options.legacyUserEmail;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  getCurrentUser(): Promise<CurrentUserResponse> {
    return this.request<CurrentUserResponse>("/auth/me");
  }

  listProjects(): Promise<PlatformProjectDto[]> {
    return this.request<PlatformProjectDto[]>("/projects");
  }

  createProject(input: CreateProjectInput): Promise<PlatformProjectDto> {
    return this.postJson<PlatformProjectDto>("/projects", input);
  }

  deleteProject(projectId: string): Promise<{ id: string; deleted: true }> {
    return this.request<{ id: string; deleted: true }>(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE"
    });
  }

  generatePrdDraft(projectId: string): Promise<PrdVersionDto> {
    return this.request<PrdVersionDto>(`/projects/${encodeURIComponent(projectId)}/prd/generate`, {
      method: "POST"
    });
  }

  getCurrentPrd(projectId: string): Promise<PrdVersionDto> {
    return this.request<PrdVersionDto>(`/projects/${encodeURIComponent(projectId)}/prd`);
  }

  listPrdVersions(projectId: string): Promise<PrdVersionDto[]> {
    return this.request<PrdVersionDto[]>(`/projects/${encodeURIComponent(projectId)}/prd/versions`);
  }

  confirmPrdBaseline(projectId: string, input: ConfirmPrdBaselineInput): Promise<PrdVersionDto> {
    return this.postJson<PrdVersionDto>(
      `/projects/${encodeURIComponent(projectId)}/prd/baseline`,
      input
    );
  }

  getFrontendCheckpoints(projectId: string) {
    return this.request<FrontendCheckpointTimelineDto>(
      `/projects/${encodeURIComponent(projectId)}/frontend/checkpoints`
    );
  }

  restoreFrontendCheckpoint(projectId: string, checkpointId: string) {
    return this.request<FrontendRestoreResultDto>(
      `/projects/${encodeURIComponent(projectId)}/frontend/restore`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkpointId })
      }
    );
  }

  listStoreApps(): Promise<StorefrontHomeResponse> {
    return this.request<StorefrontHomeResponse>("/store/apps");
  }

  getStoreAppDetail(appSlug: string): Promise<StorefrontAppDetailResponse> {
    return this.request<StorefrontAppDetailResponse>(`/store/apps/${encodeURIComponent(appSlug)}`);
  }
  authorizeStoreAppLaunch(
    appSlug: string,
    routePath: string
  ): Promise<{ authorized: true; launchUrl: string }> {
    return this.postJson<{ authorized: true; launchUrl: string }>(
      `/store/apps/${encodeURIComponent(appSlug)}/launch-session`,
      {
        routePath
      }
    );
  }

  requestStoreAccess(
    appSlug: string,
    input: StoreAccessRequestInput
  ): Promise<StoreAccessRequestResponse> {
    return this.postJson<StoreAccessRequestResponse>(
      `/store/apps/${encodeURIComponent(appSlug)}/access-requests`,
      input
    );
  }

  installStoreApp(appSlug: string): Promise<StoreAppInstallationResponse> {
    return this.request<StoreAppInstallationResponse>(
      `/store/apps/${encodeURIComponent(appSlug)}/install`,
      {
        method: "POST"
      }
    );
  }

  uninstallStoreApp(appSlug: string): Promise<StoreAppInstallationResponse> {
    return this.request<StoreAppInstallationResponse>(
      `/store/apps/${encodeURIComponent(appSlug)}/uninstall`,
      {
        method: "POST"
      }
    );
  }

  submitStoreTicket(appSlug: string, input: StoreTicketInput): Promise<StoreTicketResponse> {
    return this.postJson<StoreTicketResponse>(
      `/store/apps/${encodeURIComponent(appSlug)}/tickets`,
      input
    );
  }

  getStoreTicket(ticketId: string): Promise<StoreTicketResponse> {
    return this.request<StoreTicketResponse>(`/store/tickets/${encodeURIComponent(ticketId)}`);
  }

  convertTicketToPrdChange(
    projectId: string,
    input: ConvertTicketToPrdChangeInput
  ): Promise<PrdChangeRequestDto> {
    return this.request<PrdChangeRequestDto>(
      `/creator/projects/${encodeURIComponent(projectId)}/prd/changes/from-ticket`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
    );
  }

  getWorkspace(projectId: string): Promise<WorkspaceSnapshotResponse> {
    return this.request<WorkspaceSnapshotResponse>(
      `/projects/${encodeURIComponent(projectId)}/workspace`
    );
  }

  authorizeWorkspacePreview(projectId: string): Promise<{ authorized: true }> {
    return this.request<{ authorized: true }>(
      `/projects/${encodeURIComponent(projectId)}/workspace/preview-session`,
      { method: "POST" }
    );
  }

  getDurableAiJob(projectId: string, jobId: string): Promise<DurableAiJobDto> {
    return this.request<DurableAiJobDto>(
      `/projects/${encodeURIComponent(projectId)}/ai-jobs/${encodeURIComponent(jobId)}`
    );
  }

  enqueueDurableAiJob(
    projectId: string,
    input: CreateDurableAiJobInput
  ): Promise<Pick<DurableAiJobDto, "id" | "requestId" | "status">> {
    return this.postJson<Pick<DurableAiJobDto, "id" | "requestId" | "status">>(
      `/projects/${encodeURIComponent(projectId)}/ai-jobs`,
      input
    );
  }

  listProjectFiles(projectId: string): Promise<ProjectFileUploadDto[]> {
    return this.request<ProjectFileUploadDto[]>(
      `/creator/projects/${encodeURIComponent(projectId)}/files`
    );
  }

  initializeProjectFileUpload(
    projectId: string,
    input: ProjectFileUploadInitInput
  ): Promise<ProjectFileUploadInitResponse> {
    return this.request<ProjectFileUploadInitResponse>(
      `/creator/projects/${encodeURIComponent(projectId)}/files/init`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
    );
  }

  completeProjectFileUpload(
    projectId: string,
    uploadId: string,
    input: ProjectFileUploadCompleteInput = {}
  ): Promise<ProjectFileUploadCompleteResponse> {
    return this.request<ProjectFileUploadCompleteResponse>(
      `/creator/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(uploadId)}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
    );
  }

  submitWorkspacePrompt(
    projectId: string,
    input: WorkspacePromptInput
  ): Promise<WorkspacePromptResultDto> {
    return this.postJson<WorkspacePromptResultDto>(
      `/projects/${encodeURIComponent(projectId)}/workspace/prompts`,
      input
    );
  }

  refreshWorkspacePreview(projectId: string): Promise<PreviewVersionDto> {
    return this.request<PreviewVersionDto>(
      `/projects/${encodeURIComponent(projectId)}/workspace/preview/refresh`,
      {
        method: "POST"
      }
    );
  }

  getAppAccessSnapshot(projectId: string): Promise<AppAccessSnapshotResponse> {
    return this.request<AppAccessSnapshotResponse>(
      `/projects/${encodeURIComponent(projectId)}/app/users`
    );
  }

  createAppInvitation(projectId: string, input: AppInvitationInput): Promise<AppInvitationDto> {
    return this.postJson<AppInvitationDto>(
      `/projects/${encodeURIComponent(projectId)}/app/invitations`,
      input
    );
  }

  decideAppAccessRequest(
    projectId: string,
    input: AppAccessDecisionInput
  ): Promise<AppAccessRequestDto> {
    return this.postJson<AppAccessRequestDto>(
      `/projects/${encodeURIComponent(projectId)}/app/access-requests/decision`,
      input
    );
  }

  getPublishReview(projectId: string): Promise<PublishReviewResponse> {
    return this.request<PublishReviewResponse>(
      `/projects/${encodeURIComponent(projectId)}/publish/review`
    );
  }

  publishProject(projectId: string, input: AppStorePublishInput): Promise<PublishResultResponse>;
  publishProject(
    projectId: string,
    environment: "staging" | "production"
  ): Promise<WorkspacePublishResponse>;
  publishProject(
    projectId: string,
    input: AppStorePublishInput | "staging" | "production"
  ): Promise<PublishResultResponse | WorkspacePublishResponse> {
    const path = `/projects/${encodeURIComponent(projectId)}/publish`;
    return typeof input === "string"
      ? this.rawRequest<WorkspacePublishResponse>(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ environment: input })
        })
      : this.postJson<PublishResultResponse>(path, input);
  }

  promoteDeployment(projectId: string): Promise<WorkspacePublishResponse> {
    return this.rawRequest<WorkspacePublishResponse>(
      `/projects/${encodeURIComponent(projectId)}/promote`,
      { method: "POST" }
    );
  }

  async listDeployments(projectId: string): Promise<WorkspaceDeploymentDto[]> {
    const body = await this.rawRequest<{ deployments: WorkspaceDeploymentDto[] }>(
      `/projects/${encodeURIComponent(projectId)}/deployments`
    );
    return body.deployments ?? [];
  }

  listAppStoreRegistry(): Promise<AppStoreRegistryEntryDto[]> {
    return this.request<AppStoreRegistryEntryDto[]>("/app-store/registry");
  }

  runInstallerPreflight(input: InstallerPreflightInput): Promise<InstallerReportDto> {
    return this.postJson<InstallerReportDto>("/admin/installer/preflight", input);
  }

  saveInstallerSetup(input: InstallerSetupInput): Promise<InstallerSetupResponse> {
    return this.postJson<InstallerSetupResponse>("/admin/installer/setup", input);
  }

  listInstallerReports(): Promise<InstallerReportDto[]> {
    return this.request<InstallerReportDto[]>("/admin/installer/reports");
  }

  getSetupStatus(): Promise<SetupStatusDto> {
    return this.request<SetupStatusDto>("/setup/status");
  }

  initializeSetup(input: SetupInitializeInput): Promise<{ setupCompleted: true }> {
    return this.postJson<{ setupCompleted: true }>("/setup/initialize", input);
  }

  getBusinessSettings(): Promise<BusinessSettingsDto> {
    return this.request<BusinessSettingsDto>("/admin/business-settings");
  }

  updateBusinessSettings(input: BusinessSettingsInput): Promise<BusinessSettingsDto> {
    return this.request<BusinessSettingsDto>("/admin/business-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  createUser(input: CreatePlatformUserInput): Promise<PlatformUserSummary> {
    return this.postJson<PlatformUserSummary>("/admin/users", input);
  }

  getSystemVersion(): Promise<SystemVersionDto> {
    return this.request<SystemVersionDto>("/admin/system/version");
  }

  updateSystemVersion(version: string): Promise<SystemUpdateResponseDto> {
    return this.postJson<SystemUpdateResponseDto>("/admin/system/update", { version });
  }

  getDomainStatus(): Promise<DomainStatusDto> {
    return this.request<DomainStatusDto>("/admin/system/domain");
  }

  setDomain(domain: string): Promise<SetDomainResponseDto> {
    return this.postJson<SetDomainResponseDto>("/admin/system/domain", { domain });
  }

  listAiProviders(): Promise<AiProviderDto[]> {
    return this.request<AiProviderDto[]>("/ai/providers");
  }

  createAiProvider(input: CreateAiProviderInput): Promise<AiProviderDto> {
    return this.postJson<AiProviderDto>("/ai/providers", input);
  }

  setAiProviderStatus(providerId: string, status: AiProviderDto["status"]): Promise<AiProviderDto> {
    return this.postJson<AiProviderDto>("/ai/providers/status", { providerId, status });
  }

  updateAiProvider(
    providerId: string,
    input: { name: string; baseUrl: string; models: string[] }
  ): Promise<AiProviderDto> {
    return this.postJson<AiProviderDto>("/ai/providers/update", { providerId, ...input });
  }

  deleteAiProvider(providerId: string): Promise<{ id: string }> {
    return this.postJson<{ id: string }>("/ai/providers/delete", { providerId });
  }

  listProviderModelCatalog(baseUrl: string): Promise<ProviderModelCatalogDto> {
    return this.postJson<ProviderModelCatalogDto>("/ai/provider-catalog", { baseUrl });
  }

  listAiApiKeys(): Promise<AiApiKeyDto[]> {
    return this.request<AiApiKeyDto[]>("/ai/api-keys");
  }

  createAiApiKey(input: CreateAiApiKeyInput): Promise<AiApiKeyDto> {
    return this.postJson<AiApiKeyDto>("/ai/api-keys", input);
  }

  setAiApiKeyStatus(keyId: string, status: AiApiKeyDto["status"]): Promise<AiApiKeyDto> {
    return this.postJson<AiApiKeyDto>("/ai/api-keys/status", { keyId, status });
  }

  deleteAiApiKey(keyId: string): Promise<{ id: string }> {
    return this.postJson<{ id: string }>("/ai/api-keys/delete", { keyId });
  }

  configureAiRoute(input: ConfigureAiRouteInput): Promise<AiScenarioRouteDto> {
    return this.postJson<AiScenarioRouteDto>("/ai/routes", input);
  }

  configureAiQuota(input: AiQuotaDto): Promise<AiQuotaDto> {
    return this.postJson<AiQuotaDto>("/ai/quotas", input);
  }

  listAiScenarioRoutes(): Promise<AiScenarioRouteDto[]> {
    return this.request<AiScenarioRouteDto[]>("/ai/routes");
  }

  listAiQuotas(): Promise<AiQuotaDto[]> {
    return this.request<AiQuotaDto[]>("/ai/quotas");
  }

  createGuardrailRule(input: CreateGuardrailRuleInput): Promise<GuardrailRuleDto> {
    return this.postJson<GuardrailRuleDto>("/guardrails/rules", input);
  }

  listGuardrailEvents(): Promise<GuardrailEventDto[]> {
    return this.request<GuardrailEventDto[]>("/guardrails/events");
  }

  listAiUsage(): Promise<AiExecutionEvidenceDto[]> {
    return this.request<AiExecutionEvidenceDto[]>("/ai/usage");
  }

  testAiProvider(input: AiProviderTestCallInput): Promise<AiProviderTestCallResponse> {
    return this.postJson<AiProviderTestCallResponse>("/ai/provider-test-call", input);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await this.requestWithMeta<T>(path, init)).data;
  }

  private postJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async requestWithMeta<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<{ data: T; meta?: Record<string, unknown> }> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init.headers)
    });
    const envelope = (await response.json()) as ApiResult<T>;
    if (!response.ok || !envelope.ok) {
      const error = envelope.ok
        ? { code: `HTTP_${response.status}`, message: response.statusText }
        : envelope.error;
      throw new PlatformApiError({
        code: error.code,
        message: error.message,
        traceId: error.traceId,
        status: response.status
      });
    }
    return { data: envelope.data, meta: envelope.meta };
  }

  // Deployment endpoints use bare response shapes instead of the standard API envelope.
  private async rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init.headers)
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === "string" ? body.error : `HTTP_${response.status}`;
      const failures = Array.isArray(body.failures) ? body.failures.join("; ") : undefined;
      const message =
        typeof body.message === "string" ? body.message : (failures ?? code.replace(/_/g, " "));
      throw new PlatformApiError({ code, message, status: response.status });
    }
    return body as T;
  }

  private headers(input?: HeadersInit): Headers {
    const headers = new Headers(input);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (this.sessionToken) {
      headers.set("authorization", `Bearer ${this.sessionToken}`);
    } else if (this.legacyUserEmail) {
      headers.set("x-mock-user-email", this.legacyUserEmail);
    }
    return headers;
  }
}

export function createPlatformApiClient(options: PlatformApiClientOptions): PlatformApiClient {
  return new PlatformApiClient(options);
}

export function createPlatformSessionStore(storage: PlatformSessionStorage): PlatformSessionStore {
  return new PlatformSessionStore(storage);
}
