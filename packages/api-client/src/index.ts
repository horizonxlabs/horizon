import { PlatformSessionStore, type PlatformSessionStorage } from "./platform-session-store";

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

export function failure(code: string, message: string, traceId?: string): ApiFailure { return { ok: false, error: { code, message, traceId } }; }
export { getDatabaseView, getWorkspaceFiles } from "./workspace-resources";
export type * from "./workspace-resources";
import type { WorkspaceDeploymentDto, WorkspacePublishResponse, PublishRequestDto, DeploymentRecordDto } from "./deployment-types";
export type { WorkspaceDeploymentDto, WorkspacePublishResponse, PublishRequestDto, DeploymentRecordDto } from "./deployment-types";
import type {
  AiUsageLogDto,
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
export type * from "./setup-types";
import type {
  BusinessSettingsDto,
  BusinessSettingsInput,
  SetupInitializeInput,
  SetupStatusDto
} from "./setup-types";
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
  role: string;
  permissions?: string[];
};
export type * from "./keycloak-user-types";
export { createKeycloakUserClient, startKeycloakLogin, startKeycloakLogout } from "./keycloak-client";
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

export type PlatformProjectDto = {
  id: string;
  name: string;
  status: string;
  ownerUserId: string;
  appType: string;
  businessProblem: string;
  targetDepartment: string;
  intendedUsers: string[];
  dataSensitivity: "public" | "internal" | "confidential" | "restricted";
  appId?: string;
  activeFrontendCheckpointId?: string;
  createdAt: string;
};

export type CreateProjectInput = {
  name: string;
  appType?: string;
  businessProblem?: string;
  targetDepartment?: string;
  intendedUsers?: string[];
  dataSensitivity?: "public" | "internal" | "confidential" | "restricted";
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

export type StorefrontAppCardDto = {
  id: string;
  appId: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  ownerName: string;
  route: string;
  accessStatus: "active" | "available" | "pending";
  installStatus?: "installed" | "not_installed" | "disabled";
  installationId?: string;
  installedAt?: string;
  myRole?: string;
  health: string;
  version: string;
  lastUpdated: string;
  primaryAction: string;
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

export type StorefrontAppDetailResponse = StorefrontAppCardDto & {
  ownerUserId: string;
  department: string;
  accessMode: string;
  releaseNotes: string[];
  supportContact: string;
  actions: Array<
    | "open"
    | "install"
    | "uninstall"
    | "request_access"
    | "submit_ticket"
    | "send_feedback"
    | "view_status"
  >;
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

export type StoreTicketInput = {
  type: "bug" | "feedback" | "feature_request";
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  deviceInfo: string;
  screenshotUrl?: string;
};

export type StoreTicketTimelineEntryDto = {
  id: string;
  ticketId?: string;
  status: string;
  label: string;
  actorId?: string;
  occurredAt?: string;
};

export type StoreTicketResponse = {
  id: string;
  ticketNumber: string;
  appSlug: string;
  appName?: string;
  type?: string;
  priority?: string;
  title?: string;
  description?: string;
  deviceInfo?: string;
  status: string;
  timeline: StoreTicketTimelineEntryDto[];
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

export type WorkspaceAgentMode = "plan" | "build";

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
  baseline: {
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
};

export type AppStoreRegistryEntryDto = {
  id: string;
  appId?: string;
  projectId?: string;
  slug: string;
  name?: string;
  route?: string;
  status: "published";
  visibility?: "restricted";
  accessMode?: "membership_or_invite";
  roleKeys?: string[];
  ownerUserId?: string;
  deploymentId?: string;
  manifestVersion?: string;
  publishedAt?: string;
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

export class PlatformApiError extends Error {
  readonly code: string;
  readonly traceId?: string;
  readonly status?: number;

  constructor(input: { code: string; message: string; traceId?: string; status?: number }) {
    super(input.message);
    this.name = "PlatformApiError";
    this.code = input.code;
    this.traceId = input.traceId;
    this.status = input.status;
  }
}

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
    return this.request<PrdVersionDto>(`/projects/${encodeURIComponent(projectId)}/prd/baseline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  listStoreApps(): Promise<StorefrontHomeResponse> {
    return this.request<StorefrontHomeResponse>("/store/apps");
  }

  getStoreAppDetail(appSlug: string): Promise<StorefrontAppDetailResponse> {
    return this.request<StorefrontAppDetailResponse>(`/store/apps/${encodeURIComponent(appSlug)}`);
  }

  requestStoreAccess(
    appSlug: string,
    input: StoreAccessRequestInput
  ): Promise<StoreAccessRequestResponse> {
    return this.request<StoreAccessRequestResponse>(
      `/store/apps/${encodeURIComponent(appSlug)}/access-requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
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
    return this.request<StoreTicketResponse>(`/store/apps/${encodeURIComponent(appSlug)}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  getStoreTicket(ticketId: string): Promise<StoreTicketResponse> {
    return this.request<StoreTicketResponse>(`/store/tickets/${encodeURIComponent(ticketId)}`);
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
    return this.request<DurableAiJobDto>(`/projects/${encodeURIComponent(projectId)}/ai-jobs/${encodeURIComponent(jobId)}`);
  }

  enqueueDurableAiJob(projectId: string, input: CreateDurableAiJobInput): Promise<Pick<DurableAiJobDto, "id" | "requestId" | "status">> {
    return this.request<Pick<DurableAiJobDto, "id" | "requestId" | "status">>(`/projects/${encodeURIComponent(projectId)}/ai-jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
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
    return this.request<WorkspacePromptResultDto>(
      `/projects/${encodeURIComponent(projectId)}/workspace/prompts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
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
    return this.request<AppInvitationDto>(
      `/projects/${encodeURIComponent(projectId)}/app/invitations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
    );
  }

  decideAppAccessRequest(
    projectId: string,
    input: AppAccessDecisionInput
  ): Promise<AppAccessRequestDto> {
    return this.request<AppAccessRequestDto>(
      `/projects/${encodeURIComponent(projectId)}/app/access-requests/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
    );
  }

  getPublishReview(projectId: string): Promise<PublishReviewResponse> {
    return this.request<PublishReviewResponse>(
      `/projects/${encodeURIComponent(projectId)}/publish/review`
    );
  }

  // Container publish (Staging → Production). The 2-arg overload is the current contract; the
  // no-environment overload is retained for the legacy app-store publish caller (returns its shape).
  publishProject(projectId: string): Promise<PublishResultResponse>;
  publishProject(projectId: string, environment: "staging" | "production"): Promise<WorkspacePublishResponse>;
  publishProject(
    projectId: string,
    environment?: "staging" | "production"
  ): Promise<PublishResultResponse | WorkspacePublishResponse> {
    const path = `/projects/${encodeURIComponent(projectId)}/publish`;
    // Container publish (staging/production) is a raw-shape route; app-store publish (no env) uses
    // the standard enveloped API.
    return environment
      ? this.rawRequest<WorkspacePublishResponse>(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ environment })
        })
      : this.request<PublishResultResponse>(path, { method: "POST" });
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
    return this.request<InstallerReportDto>("/admin/installer/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  saveInstallerSetup(input: InstallerSetupInput): Promise<InstallerSetupResponse> {
    return this.request<InstallerSetupResponse>("/admin/installer/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  listInstallerReports(): Promise<InstallerReportDto[]> {
    return this.request<InstallerReportDto[]>("/admin/installer/reports");
  }

  getSetupStatus(): Promise<SetupStatusDto> {
    return this.request<SetupStatusDto>("/setup/status");
  }

  initializeSetup(input: SetupInitializeInput): Promise<{ setupCompleted: true }> {
    return this.request<{ setupCompleted: true }>("/setup/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
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

  listAiProviders(): Promise<AiProviderDto[]> {
    return this.request<AiProviderDto[]>("/ai/providers");
  }

  createAiProvider(input: CreateAiProviderInput): Promise<AiProviderDto> {
    return this.postJson<AiProviderDto>("/ai/providers", input);
  }

  setAiProviderStatus(providerId: string, status: AiProviderDto["status"]): Promise<AiProviderDto> {
    return this.postJson<AiProviderDto>("/ai/providers/status", { providerId, status });
  }

  updateAiProvider(providerId: string, input: { name: string; baseUrl: string; models: string[] }): Promise<AiProviderDto> {
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
    return this.request<AiScenarioRouteDto>("/ai/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  configureAiQuota(input: AiQuotaDto): Promise<AiQuotaDto> {
    return this.request<AiQuotaDto>("/ai/quotas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  listAiScenarioRoutes(): Promise<AiScenarioRouteDto[]> {
    return this.request<AiScenarioRouteDto[]>("/ai/routes");
  }

  listAiQuotas(): Promise<AiQuotaDto[]> {
    return this.request<AiQuotaDto[]>("/ai/quotas");
  }

  createGuardrailRule(input: CreateGuardrailRuleInput): Promise<GuardrailRuleDto> {
    return this.request<GuardrailRuleDto>("/guardrails/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  listGuardrailEvents(): Promise<GuardrailEventDto[]> {
    return this.request<GuardrailEventDto[]>("/guardrails/events");
  }

  testAiProvider(input: AiProviderTestCallInput): Promise<AiProviderTestCallResponse> {
    return this.request<AiProviderTestCallResponse>("/ai/provider-test-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
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

  async requestWithMeta<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
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

  // The workspace container-publish routes (publish/promote/deployments) live on a separate raw
  // Express surface that returns bare shapes ({ deployment }, { deployments }, { error: "<code>" })
  // rather than the { ok, data, error } envelope `request` expects. Parse those directly — routing
  // them through `request` throws "Cannot read properties of undefined (reading 'code')" on EVERY
  // response, success included, because there is no `envelope.ok`/`envelope.error`.
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
