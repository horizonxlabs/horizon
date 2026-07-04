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
  return {
    ok: false,
    error: { code, message, traceId }
  };
}

export type PlatformUserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
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
  slug: string;
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
  actions: Array<"open" | "request_access" | "submit_ticket" | "send_feedback" | "view_status">;
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

export type AiUsageLogDto = {
  id: string;
  projectId: string;
  taskId: string;
  actorId: string;
  scenario: string;
  providerId: string;
  model: string;
  prompt: string;
  tokensUsed: number;
  occurredAt: string;
  status?: "succeeded" | "blocked" | "fallback" | "failed";
};

export type WorkspaceTokenBudgetDto = {
  remainingToday: number;
  remainingMonth: number;
  requestEstimate: number;
};

export type GuardrailResultDto = {
  decision: "allow" | "warn" | "block";
  eventId: string;
  matchedRuleIds?: string[];
  reason?: string;
};

export type WorkspacePromptInput = {
  prompt: string;
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

export type PublishRequestDto = {
  id: string;
  projectId?: string;
  appId?: string;
  status: "blocked" | "published";
  requestedByUserId?: string;
  manifestVersion: string;
  blockingItems: string[];
  createdAt?: string;
  publishedAt?: string;
};

export type DeploymentRecordDto = {
  id: string;
  projectId?: string;
  appId?: string;
  publishRequestId?: string;
  status: "published" | "failed";
  environment?: "app_store";
  route: string;
  manifestVersion?: string;
  prdVersion?: string;
  frontendCheckpointId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
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

export type InstallerPreflightInput = {
  cpuCores: number;
  memoryGb: number;
  diskFreeGb: number;
  os?: string;
  dockerVersion?: string;
  composeVersion?: string;
  portsAvailable?: number[];
  dnsReady?: boolean;
  tlsReady?: boolean;
  networkReady?: boolean;
};

export type InstallerCheckDto = {
  name: string;
  required: string;
  observed: string;
  status: "pass" | "fail";
  action: string;
};

export type InstallerReportDto = {
  id: string;
  status: "passed" | "failed";
  installBlocked: boolean;
  reportPath: string;
  checks: InstallerCheckDto[];
  actionableFailures: string[];
  composeServices?: Array<{ service: string; status: string; signal: string }>;
  createdAt?: string;
};

export type InstallerSetupInput = {
  domain: string;
  databaseUrl: string;
  storage: Record<string, string | number | boolean | undefined>;
  auth: Record<string, unknown>;
  ai: Record<string, unknown>;
  guardrail: Record<string, unknown>;
  backup: Record<string, unknown>;
  firstAdmin: Record<string, unknown>;
};

export type InstallerSetupResponse = {
  id: string;
  status: "completed";
  domain: string;
  databaseUrlMasked: string;
  storage: Record<string, unknown>;
  auth: Record<string, unknown>;
  ai: Record<string, unknown>;
  guardrail: Record<string, unknown>;
  backup: Record<string, unknown>;
  firstAdmin: Record<string, unknown>;
  createdAt?: string;
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

export type PlatformSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const EVCP_SESSION_STORAGE_KEY = "evcp_session";
export const EVCP_SESSION_EXPIRES_AT_STORAGE_KEY = "evcp_session_expires_at";

export class PlatformSessionStore {
  constructor(private readonly storage: PlatformSessionStorage) {}

  getToken(): string | undefined {
    return this.storage.getItem(EVCP_SESSION_STORAGE_KEY) ?? undefined;
  }

  getExpiresAt(): string | undefined {
    return this.storage.getItem(EVCP_SESSION_EXPIRES_AT_STORAGE_KEY) ?? undefined;
  }

  saveSession(session: Pick<PlatformAuthSessionResponse, "token" | "expiresAt">): void {
    this.storage.setItem(EVCP_SESSION_STORAGE_KEY, session.token);
    this.storage.setItem(EVCP_SESSION_EXPIRES_AT_STORAGE_KEY, session.expiresAt);
  }

  clearSession(): void {
    this.storage.removeItem(EVCP_SESSION_STORAGE_KEY);
    this.storage.removeItem(EVCP_SESSION_EXPIRES_AT_STORAGE_KEY);
  }
}

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
    this.fetcher = options.fetcher ?? fetch;
  }

  getCurrentUser(): Promise<CurrentUserResponse> {
    return this.request<CurrentUserResponse>("/auth/me");
  }

  listProjects(): Promise<PlatformProjectDto[]> {
    return this.request<PlatformProjectDto[]>("/projects");
  }

  listStoreApps(): Promise<StorefrontHomeResponse> {
    return this.request<StorefrontHomeResponse>("/store/apps");
  }

  getStoreAppDetail(appSlug: string): Promise<StorefrontAppDetailResponse> {
    return this.request<StorefrontAppDetailResponse>(`/store/apps/${encodeURIComponent(appSlug)}`);
  }

  requestStoreAccess(appSlug: string, input: StoreAccessRequestInput): Promise<StoreAccessRequestResponse> {
    return this.request<StoreAccessRequestResponse>(`/store/apps/${encodeURIComponent(appSlug)}/access-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
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
    return this.request<WorkspaceSnapshotResponse>(`/projects/${encodeURIComponent(projectId)}/workspace`);
  }

  submitWorkspacePrompt(projectId: string, input: WorkspacePromptInput): Promise<WorkspacePromptResultDto> {
    return this.request<WorkspacePromptResultDto>(`/projects/${encodeURIComponent(projectId)}/workspace/prompts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  refreshWorkspacePreview(projectId: string): Promise<PreviewVersionDto> {
    return this.request<PreviewVersionDto>(`/projects/${encodeURIComponent(projectId)}/workspace/preview/refresh`, {
      method: "POST"
    });
  }

  getAppAccessSnapshot(projectId: string): Promise<AppAccessSnapshotResponse> {
    return this.request<AppAccessSnapshotResponse>(`/projects/${encodeURIComponent(projectId)}/app/users`);
  }

  createAppInvitation(projectId: string, input: AppInvitationInput): Promise<AppInvitationDto> {
    return this.request<AppInvitationDto>(`/projects/${encodeURIComponent(projectId)}/app/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  decideAppAccessRequest(projectId: string, input: AppAccessDecisionInput): Promise<AppAccessRequestDto> {
    return this.request<AppAccessRequestDto>(`/projects/${encodeURIComponent(projectId)}/app/access-requests/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  }

  getPublishReview(projectId: string): Promise<PublishReviewResponse> {
    return this.request<PublishReviewResponse>(`/projects/${encodeURIComponent(projectId)}/publish/review`);
  }

  publishProject(projectId: string): Promise<PublishResultResponse> {
    return this.request<PublishResultResponse>(`/projects/${encodeURIComponent(projectId)}/publish`, {
      method: "POST"
    });
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

  simulateSsoLogin(input: SimulatedSsoLoginInput): Promise<PlatformAuthSessionResponse> {
    return this.request<PlatformAuthSessionResponse>("/admin/auth/simulate-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: input.providerId ?? "authprov_keycloak_default_001",
        subject: input.subject,
        email: input.email,
        name: input.name,
        groups: input.groups,
        appRoles: input.appRoles ?? {}
      })
    });
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    return envelope.data;
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
