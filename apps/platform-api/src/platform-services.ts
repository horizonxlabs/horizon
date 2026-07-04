import { failure, success, type ApiFailure, type ApiSuccess } from "@evcp/api-client";
import { getMockPermissions } from "@evcp/auth-sdk";
import { appStoreItems, mockUsers, projects as seedProjects } from "@evcp/mock-data";
import type { MockUser, PlatformRole, Status } from "@evcp/types";
import { createHash } from "node:crypto";

export interface PlatformUser extends MockUser {
  status: "active" | "inactive" | "invited" | "suspended";
  permissions: string[];
}

export interface PlatformProject {
  id: string;
  slug: string;
  name: string;
  status: Status;
  ownerUserId: string;
  appType: string;
  businessProblem: string;
  targetDepartment: string;
  intendedUsers: string[];
  dataSensitivity: "public" | "internal" | "confidential" | "restricted";
  appId?: string;
  activeFrontendCheckpointId?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  severity: "info" | "warning" | "high" | "critical";
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface CreateProjectInput {
  actor: PlatformUser;
  name: string;
  slug: string;
  appType?: string;
  businessProblem?: string;
  targetDepartment?: string;
  intendedUsers?: string[];
  dataSensitivity?: PlatformProject["dataSensitivity"];
}

export interface PrdSection {
  id: string;
  key: string;
  title: string;
  body: string;
  order: number;
}

export interface PrdVersion {
  id: string;
  projectId: string;
  version: string;
  status: "draft" | "baseline";
  isBaseline: boolean;
  sourcePrompt: string;
  changeSummary: string;
  generatedBy: {
    scenario: AiScenario;
    providerId: string;
    model: string;
  };
  sections: PrdSection[];
  createdByUserId: string;
  createdAt: string;
}

export interface PrdDocument {
  id: string;
  projectId: string;
  status: "draft" | "baseline_confirmed";
  currentVersionId: string;
  baselineVersionId?: string;
  versions: PrdVersion[];
  updatedAt: string;
}

export type WorkspaceStepStatus = "pending" | "running" | "done" | "warning" | "failed";
export type WorkspaceTaskStatus = "ready" | "running" | "blocked" | "failed";

export interface WorkspaceTaskStep {
  id: string;
  label: string;
  status: WorkspaceStepStatus;
  order: number;
}

export interface WorkspaceTask {
  id: string;
  projectId: string;
  prompt: string;
  status: WorkspaceTaskStatus;
  guardrailDecision: GuardrailDecision;
  guardrailEventId: string;
  steps: WorkspaceTaskStep[];
  createdByUserId: string;
  createdAt: string;
}

export interface PreviewVersion {
  id: string;
  projectId: string;
  version: string;
  summary: string;
  device: "desktop" | "tablet" | "mobile";
  screenTitle: string;
  highlights: string[];
  createdAt: string;
}

export interface AiUsageLog {
  id: string;
  projectId: string;
  taskId: string;
  actorId: string;
  scenario: AiScenario;
  providerId: string;
  model: string;
  prompt: string;
  tokensUsed: number;
  occurredAt: string;
}

export interface WorkspacePromptResult {
  guardrail: GuardrailResult;
  task: WorkspaceTask;
  preview: PreviewVersion;
  usage?: AiUsageLog;
  tokenBudget: {
    remainingToday: number;
    remainingMonth: number;
    requestEstimate: number;
  };
}

export interface WorkspaceSnapshot {
  project: PlatformProject;
  baseline: PrdVersion;
  preview: PreviewVersion;
  tasks: WorkspaceTask[];
  usage: AiUsageLog[];
  tokenBudget: WorkspacePromptResult["tokenBudget"];
}

export interface AppDatabaseColumn {
  id: string;
  tableKey: string;
  name: string;
  dataType: string;
  required: boolean;
  defaultValue?: string;
  source: "generated" | "manual";
}

export interface AppDatabaseTable {
  id: string;
  projectId: string;
  key: string;
  displayName: string;
  description: string;
  columns: AppDatabaseColumn[];
  source: "generated" | "manual";
}

export interface AppDatabaseRelationship {
  id: string;
  projectId: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  cardinality: "one_to_one" | "one_to_many" | "many_to_many";
}

export interface AppDatabaseSampleRecord {
  id: string;
  projectId: string;
  tableKey: string;
  ordinal: number;
  data: Record<string, string | number | boolean | null>;
}

export interface AppDatabaseMigration {
  id: string;
  projectId: string;
  migrationId: string;
  status: "planned" | "applied" | "failed";
  createdByUserId: string;
  linkedPrdVersion: string;
  linkedFrontendCheckpoint?: string;
  appliedAt: string;
}

export interface DatabaseViewSnapshot {
  project: PlatformProject;
  schemaName: string;
  readOnly: true;
  restrictions: string[];
  tables: AppDatabaseTable[];
  relationships: AppDatabaseRelationship[];
  migrations: AppDatabaseMigration[];
  sampleRecords: AppDatabaseSampleRecord[];
}

export interface FrontendCheckpoint {
  id: string;
  projectId: string;
  version: string;
  sourcePreviewVersion: string;
  sourceTaskId?: string;
  status: "current" | "previous" | "restored";
  checksum: string;
  fileManifest: string[];
  routeSnapshot: string[];
  changeSummary: string;
  changedAreas: string[];
  createdByUserId: string;
  restoreSourceCheckpointId?: string;
  createdAt: string;
}

export interface FrontendCheckpointTimeline {
  project: PlatformProject;
  activeCheckpoint: FrontendCheckpoint;
  checkpoints: FrontendCheckpoint[];
}

export interface FrontendCompareResult {
  from: FrontendCheckpoint;
  to: FrontendCheckpoint;
  changedAreas: string[];
  filesChanged: string[];
  previewSummary: string;
}

export interface FrontendRestoreResult {
  checkpoint: FrontendCheckpoint;
  restoredFrom: FrontendCheckpoint;
  boundary: {
    frontendChanged: true;
    unchanged: Array<"backend" | "database" | "auth" | "app_roles" | "membership" | "domain" | "prd_baseline">;
  };
  auditEventId: string;
}

export type AppUserType = "internal" | "external";
export type AppInvitationStatus = "pending" | "accepted" | "revoked" | "approval_required";
export type AppAccessRequestStatus = "pending" | "approved" | "rejected";
export type PublishChecklistStatus = "pass" | "fail";

export interface ManagedApp {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "disabled" | "archived";
  route: string;
}

export interface AppRoleDefinition {
  id: string;
  appId: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  memberCount: number;
}

export interface AppMemberRecord {
  id: string;
  appId: string;
  userId: string;
  email: string;
  name: string;
  userType: AppUserType;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: "active" | "pending" | "approval_required";
  lastAccessAt?: string;
}

export interface AppInvitation {
  id: string;
  appId: string;
  projectId: string;
  email: string;
  userType: AppUserType;
  roleKey: string;
  invitedByUserId: string;
  status: AppInvitationStatus;
  expiresAt?: string;
  note?: string;
  policyWarning?: string;
  createdAt: string;
}

export interface AppAccessRequest {
  id: string;
  appId: string;
  projectId: string;
  requesterEmail: string;
  requestedRoleKey: string;
  reason: string;
  status: AppAccessRequestStatus;
  decidedByUserId?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface AppAccessSnapshot {
  project: PlatformProject;
  app: ManagedApp;
  roles: AppRoleDefinition[];
  members: AppMemberRecord[];
  invitations: AppInvitation[];
  accessRequests: AppAccessRequest[];
}

export interface AppManifest {
  id: string;
  appId: string;
  projectId: string;
  manifestVersion: string;
  app: {
    id: string;
    slug: string;
    name: string;
    route: string;
    status: ManagedApp["status"];
  };
  prd: {
    versionId: string;
    version: string;
  };
  frontend: {
    checkpointId: string;
    version: string;
    checksum: string;
    routes: string[];
  };
  auth: {
    mode: "platform_auth_sdk";
    accessMode: "restricted";
  };
  roles: Array<Pick<AppRoleDefinition, "key" | "name" | "permissions">>;
  database: {
    schemaName: string;
    tables: string[];
  };
  generatedAt: string;
}

export interface PublishChecklistItem {
  key: string;
  label: string;
  status: PublishChecklistStatus;
  detail: string;
}

export interface PublishReview {
  project: PlatformProject;
  manifest: AppManifest;
  checklist: PublishChecklistItem[];
  ready: boolean;
}

export interface PublishRequestRecord {
  id: string;
  projectId: string;
  appId: string;
  status: "blocked" | "published";
  requestedByUserId: string;
  manifestVersion: string;
  blockingItems: string[];
  createdAt: string;
  publishedAt?: string;
}

export interface DeploymentRecord {
  id: string;
  projectId: string;
  appId: string;
  publishRequestId: string;
  status: "published" | "failed";
  environment: "app_store";
  route: string;
  manifestVersion: string;
  prdVersion: string;
  frontendCheckpointId: string;
  publishedByUserId: string;
  publishedAt: string;
}

export interface AppStoreRegistryEntry {
  id: string;
  appId: string;
  slug: string;
  name: string;
  route: string;
  status: "published";
  visibility: "restricted";
  accessMode: "membership_or_invite";
  roleKeys: string[];
  ownerUserId: string;
  deploymentId: string;
  manifestVersion: string;
  publishedAt: string;
}

export interface PublishResult {
  publishRequest: PublishRequestRecord;
  deployment: DeploymentRecord;
  registryEntry: AppStoreRegistryEntry;
  manifest: AppManifest;
}

export type AiProviderAdapter = "openai" | "anthropic" | "google" | "azure_openai" | "mock";
export type AiProviderStatus = "active" | "disabled" | "warning" | "error";
export type AiUsageMode = "production" | "development" | "fallback";
export type AiScenario = "prd_generation" | "requirement_analysis" | "frontend_coding" | "backend_coding" | "review" | "documentation";
export type GuardrailDecision = "allow" | "warn" | "block";
export type GuardrailRuleType = "keyword" | "regex" | "policy";

export interface AiProvider {
  id: string;
  name: string;
  adapter: AiProviderAdapter;
  baseUrl: string;
  models: string[];
  status: AiProviderStatus;
  createdAt: string;
}

export interface AiApiKey {
  id: string;
  providerId: string;
  name: string;
  usageMode: AiUsageMode;
  quotaTokens: number;
  fallbackPriority: number;
  fingerprint: string;
  maskedValue: string;
  status: "active" | "disabled";
  createdAt: string;
  lastUsedAt?: string;
}

interface StoredAiApiKey extends AiApiKey {
  secretCiphertext: string;
  keyVersion: number;
  encryptionProvider: "local-envelope";
}

export interface AiScenarioRoute {
  scenario: AiScenario;
  primary: {
    providerId: string;
    model: string;
  };
  fallback?: {
    providerId: string;
    model: string;
  };
}

export interface ConfigureRouteInput {
  scenario: AiScenario;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string;
  fallbackModel?: string;
}

export interface AiQuota {
  scope: "organization" | "creator" | "project" | "app";
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number;
  hardStop: boolean;
  usedToday: number;
}

export interface QuotaDecision {
  allowed: boolean;
  reason: "within_quota" | "quota_warning" | "quota_exceeded";
  remainingToday: number;
}

export interface GuardrailRule {
  id: string;
  name: string;
  type: GuardrailRuleType;
  pattern: string;
  severity: "info" | "warning" | "high" | "critical";
  action: GuardrailDecision;
  scope: "organization" | "project" | "app";
  status: "active" | "disabled";
  updatedAt: string;
}

export interface GuardrailEvent {
  id: string;
  actorId: string;
  prompt: string;
  scenario: string;
  decision: GuardrailDecision;
  matchedRuleId?: string;
  matchedRuleName?: string;
  severity: GuardrailRule["severity"];
  occurredAt: string;
}

export interface GuardrailResult {
  decision: GuardrailDecision;
  matchedRule?: GuardrailRule;
  severity: GuardrailRule["severity"];
  eventId: string;
}

export class MockAuthError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "MockAuthError";
  }
}

export class PermissionError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export class ValidationError extends Error {
  readonly statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class QuotaExceededError extends Error {
  readonly statusCode = 429;

  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

type HeaderBag = Record<string, string | string[] | undefined>;

function toPlatformUser(user: MockUser): PlatformUser {
  return {
    ...user,
    status: "active",
    permissions: getMockPermissions(user.role)
  };
}

function normalizeHeader(headers: HeaderBag, name: string): string | undefined {
  const direct = headers[name];
  const lower = headers[name.toLowerCase()];
  const value = direct ?? lower;

  if (Array.isArray(value)) return value[0];
  return value;
}

export class IdentityService {
  private readonly users = Object.values(mockUsers).map(toPlatformUser);

  listUsers(): PlatformUser[] {
    return [...this.users];
  }

  getUserByEmail(email: string): PlatformUser {
    const user = this.users.find((candidate) => candidate.email === email);
    if (!user) throw new MockAuthError(`Unknown mock user: ${email}`);
    return user;
  }
}

export class AuditService {
  private readonly events: AuditEvent[] = [];

  record(input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> & Partial<Pick<AuditEvent, "severity" | "metadata">>): AuditEvent {
    const event: AuditEvent = {
      id: `aud_${String(this.events.length + 1).padStart(4, "0")}`,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      severity: input.severity ?? "info",
      occurredAt: new Date().toISOString(),
      metadata: input.metadata ?? {}
    };

    this.events.push(event);
    return event;
  }

  list(): AuditEvent[] {
    return [...this.events];
  }
}

export class MockAuthService {
  constructor(private readonly identity: IdentityService) {}

  resolveCurrentUser(headers: HeaderBag): PlatformUser {
    const email = normalizeHeader(headers, "x-mock-user-email") ?? normalizeHeader(headers, "x-evcp-user");
    if (!email) throw new MockAuthError("Missing x-mock-user-email header");
    return this.identity.getUserByEmail(email);
  }

  requireRole(user: PlatformUser, roles: PlatformRole[]): void {
    if (!roles.includes(user.role)) {
      throw new PermissionError(`Role ${user.role} cannot access this resource`);
    }
  }
}

export class ProjectService {
  private readonly projects: PlatformProject[] = seedProjects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    status: project.status,
    ownerUserId: mockUsers.creator.id,
    appType: project.appType,
    businessProblem: "Employees need a self-service leave request and manager approval workflow.",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal",
    appId: appStoreItems.find((item) => item.slug === project.slug)?.id,
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString()
  }));

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  listProjects(actor?: PlatformUser): PlatformProject[] {
    if (!actor || actor.role === "admin") return [...this.projects];
    return this.projects.filter((project) => project.ownerUserId === actor.id);
  }

  createProject(input: CreateProjectInput): PlatformProject {
    this.auth.requireRole(input.actor, ["admin", "creator"]);
    if (!input.name.trim()) throw new ValidationError("Project name is required");
    if (!input.slug.trim()) throw new ValidationError("Project slug is required");

    const project: PlatformProject = {
      id: `prj_${input.slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      slug: input.slug,
      name: input.name,
      status: "draft",
      ownerUserId: input.actor.id,
      appType: input.appType ?? "Workflow App",
      businessProblem: input.businessProblem ?? "Capture the business problem before PRD generation.",
      targetDepartment: input.targetDepartment ?? "Business Team",
      intendedUsers: input.intendedUsers ?? ["Business User"],
      dataSensitivity: input.dataSensitivity ?? "internal",
      appId: `app_${input.slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      createdAt: new Date().toISOString()
    };

    const existingIndex = this.projects.findIndex((candidate) => candidate.slug === project.slug);
    if (existingIndex >= 0) this.projects[existingIndex] = project;
    else this.projects.push(project);

    this.audit.record({
      actorId: input.actor.id,
      action: "project.created",
      resourceType: "project",
      resourceId: project.id,
      metadata: { slug: project.slug }
    });

    return project;
  }

  getProjectForActor(actor: PlatformUser, projectId: string): PlatformProject {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new ValidationError(`Unknown project: ${projectId}`);
    if (actor.role !== "admin" && project.ownerUserId !== actor.id) {
      throw new PermissionError(`User ${actor.email} cannot access project ${projectId}`);
    }
    return project;
  }
}

function slugId(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()}`;
}

function fingerprintSecret(secret: string): string {
  return `fp_${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `sk-...${tail}`;
}

function encryptSecretEnvelope(secret: string): string {
  return `local-envelope:${Buffer.from(secret, "utf8").toString("base64")}`;
}

export class AiGovernanceService {
  private readonly providers: AiProvider[] = [];
  private readonly apiKeys: StoredAiApiKey[] = [];
  private readonly routes: AiScenarioRoute[] = [];
  private readonly quotas: AiQuota[] = [];
  private providerCalls = 0;

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  createProvider(actor: PlatformUser, input: Omit<AiProvider, "id" | "status" | "createdAt">): AiProvider {
    this.requireAdmin(actor, "ai.provider.denied", "ai_provider", input.name);

    const provider: AiProvider = {
      id: slugId("aip", input.name),
      name: input.name,
      adapter: input.adapter,
      baseUrl: input.baseUrl,
      models: [...input.models],
      status: "active",
      createdAt: new Date().toISOString()
    };

    const existing = this.providers.findIndex((candidate) => candidate.id === provider.id);
    if (existing >= 0) this.providers[existing] = provider;
    else this.providers.push(provider);

    this.audit.record({
      actorId: actor.id,
      action: "ai.provider.created",
      resourceType: "ai_provider",
      resourceId: provider.id,
      metadata: { adapter: provider.adapter }
    });

    return provider;
  }

  listProviders(): AiProvider[] {
    return [...this.providers];
  }

  createApiKey(
    actor: PlatformUser,
    input: {
      providerId: string;
      name: string;
      secret: string;
      usageMode: AiUsageMode;
      quotaTokens: number;
      fallbackPriority: number;
    }
  ): AiApiKey {
    this.requireAdmin(actor, "ai.api_key.denied", "ai_api_key", input.name);
    this.requireProvider(input.providerId);

    const stored: StoredAiApiKey = {
      id: slugId("aik", `${input.providerId}_${input.name}`),
      providerId: input.providerId,
      name: input.name,
      usageMode: input.usageMode,
      quotaTokens: input.quotaTokens,
      fallbackPriority: input.fallbackPriority,
      fingerprint: fingerprintSecret(input.secret),
      maskedValue: maskSecret(input.secret),
      status: "active",
      createdAt: new Date().toISOString(),
      secretCiphertext: encryptSecretEnvelope(input.secret),
      keyVersion: 1,
      encryptionProvider: "local-envelope"
    };

    const existing = this.apiKeys.findIndex((candidate) => candidate.id === stored.id);
    if (existing >= 0) this.apiKeys[existing] = stored;
    else this.apiKeys.push(stored);

    this.audit.record({
      actorId: actor.id,
      action: "ai.api_key.created",
      resourceType: "ai_api_key",
      resourceId: stored.id,
      metadata: { providerId: input.providerId, fingerprint: stored.fingerprint }
    });

    return this.toPublicKey(stored);
  }

  listApiKeys(): AiApiKey[] {
    return this.apiKeys.map((key) => this.toPublicKey(key));
  }

  configureRoute(actor: PlatformUser, input: ConfigureRouteInput): AiScenarioRoute {
    this.requireAdmin(actor, "ai.route.denied", "ai_scenario_route", input.scenario);
    this.requireProvider(input.primaryProviderId);
    if (input.fallbackProviderId) this.requireProvider(input.fallbackProviderId);

    const route: AiScenarioRoute = {
      scenario: input.scenario,
      primary: {
        providerId: input.primaryProviderId,
        model: input.primaryModel
      },
      fallback: input.fallbackProviderId
        ? {
            providerId: input.fallbackProviderId,
            model: input.fallbackModel ?? input.primaryModel
          }
        : undefined
    };

    const existing = this.routes.findIndex((candidate) => candidate.scenario === route.scenario);
    if (existing >= 0) this.routes[existing] = route;
    else this.routes.push(route);

    this.audit.record({
      actorId: actor.id,
      action: "ai.route.configured",
      resourceType: "ai_scenario_route",
      resourceId: route.scenario,
      metadata: { primaryProviderId: route.primary.providerId, fallbackProviderId: route.fallback?.providerId }
    });

    return route;
  }

  resolveRoute(scenario: AiScenario): AiScenarioRoute {
    const route = this.routes.find((candidate) => candidate.scenario === scenario);
    if (!route) throw new Error(`No route configured for scenario ${scenario}`);
    return route;
  }

  configureQuota(actor: PlatformUser, input: AiQuota): AiQuota {
    this.requireAdmin(actor, "ai.quota.denied", "ai_quota", input.scope);

    const existing = this.quotas.findIndex((candidate) => candidate.scope === input.scope);
    if (existing >= 0) this.quotas[existing] = input;
    else this.quotas.push(input);

    this.audit.record({
      actorId: actor.id,
      action: "ai.quota.configured",
      resourceType: "ai_quota",
      resourceId: input.scope,
      metadata: { dailyLimit: input.dailyLimit, hardStop: input.hardStop }
    });

    return input;
  }

  checkQuota(scope: AiQuota["scope"], requestedTokens: number): QuotaDecision {
    const quota = this.quotas.find((candidate) => candidate.scope === scope);
    if (!quota) return { allowed: true, reason: "within_quota", remainingToday: Number.MAX_SAFE_INTEGER };

    const remainingToday = Math.max(quota.dailyLimit - quota.usedToday, 0);
    if (quota.hardStop && requestedTokens > remainingToday) {
      return { allowed: false, reason: "quota_exceeded", remainingToday };
    }

    if (quota.usedToday + requestedTokens >= quota.warningThreshold) {
      return { allowed: true, reason: "quota_warning", remainingToday };
    }

    return { allowed: true, reason: "within_quota", remainingToday };
  }

  providerCallCount(): number {
    return this.providerCalls;
  }

  recordProviderCall(): void {
    this.providerCalls += 1;
  }

  private requireAdmin(actor: PlatformUser, deniedAction: string, resourceType: string, resourceId: string): void {
    try {
      this.auth.requireRole(actor, ["admin"]);
    } catch (error) {
      this.audit.record({
        actorId: actor.id,
        action: deniedAction,
        resourceType,
        resourceId,
        severity: "warning"
      });
      throw error;
    }
  }

  private requireProvider(providerId: string): AiProvider {
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) throw new Error(`Unknown AI provider: ${providerId}`);
    if (provider.status !== "active") throw new Error(`AI provider ${providerId} is not active`);
    return provider;
  }

  private toPublicKey(key: StoredAiApiKey): AiApiKey {
    const { secretCiphertext: _secretCiphertext, keyVersion: _keyVersion, encryptionProvider: _encryptionProvider, ...publicKey } = key;
    return publicKey;
  }
}

export class GuardrailService {
  private readonly rules: GuardrailRule[] = [];
  private readonly events: GuardrailEvent[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  createRule(actor: PlatformUser, input: Omit<GuardrailRule, "id" | "status" | "updatedAt">): GuardrailRule {
    this.auth.requireRole(actor, ["admin"]);

    const rule: GuardrailRule = {
      id: slugId("grd", input.name),
      name: input.name,
      type: input.type,
      pattern: input.pattern,
      severity: input.severity,
      action: input.action,
      scope: input.scope,
      status: "active",
      updatedAt: new Date().toISOString()
    };

    const existing = this.rules.findIndex((candidate) => candidate.id === rule.id);
    if (existing >= 0) this.rules[existing] = rule;
    else this.rules.push(rule);

    this.audit.record({
      actorId: actor.id,
      action: "guardrail.rule.created",
      resourceType: "guardrail_rule",
      resourceId: rule.id,
      metadata: { type: rule.type, action: rule.action }
    });

    return rule;
  }

  listRules(): GuardrailRule[] {
    return [...this.rules];
  }

  testPrompt(actor: PlatformUser, input: { prompt: string; scenario: string }): GuardrailResult {
    this.auth.requireRole(actor, ["admin"]);
    return this.evaluatePrompt(actor, input);
  }

  evaluatePrompt(actor: PlatformUser, input: { prompt: string; scenario: string }): GuardrailResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const matchedRule = this.findMatchingRule(input.prompt);
    const classifierDecision = this.classifyPolicy(input.prompt);
    const decision = matchedRule?.action ?? classifierDecision.decision;
    const severity = matchedRule?.severity ?? classifierDecision.severity;
    const event: GuardrailEvent = {
      id: `gre_${String(this.events.length + 1).padStart(4, "0")}`,
      actorId: actor.id,
      prompt: input.prompt,
      scenario: input.scenario,
      decision,
      matchedRuleId: matchedRule?.id,
      matchedRuleName: matchedRule?.name,
      severity,
      occurredAt: new Date().toISOString()
    };

    this.events.push(event);
    this.audit.record({
      actorId: actor.id,
      action: "guardrail.prompt_tested",
      resourceType: "guardrail_event",
      resourceId: event.id,
      severity: decision === "block" ? "high" : decision === "warn" ? "warning" : "info",
      metadata: { decision, scenario: input.scenario, matchedRuleId: matchedRule?.id }
    });

    return {
      decision,
      matchedRule,
      severity,
      eventId: event.id
    };
  }

  listEvents(): GuardrailEvent[] {
    return [...this.events];
  }

  private findMatchingRule(prompt: string): GuardrailRule | undefined {
    return this.rules.find((rule) => {
      if (rule.status !== "active") return false;
      if (rule.type === "keyword") return prompt.toLowerCase().includes(rule.pattern.toLowerCase());
      if (rule.type === "regex") return new RegExp(rule.pattern, "i").test(prompt);
      return false;
    });
  }

  private classifyPolicy(prompt: string): Pick<GuardrailResult, "decision" | "severity"> {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("delete all") || normalized.includes("payroll export")) {
      return { decision: "block", severity: "high" };
    }

    if (normalized.includes("confidential") || normalized.includes("personal data")) {
      return { decision: "warn", severity: "warning" };
    }

    return { decision: "allow", severity: "info" };
  }
}

export class PrdService {
  private readonly documents: PrdDocument[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly aiGovernance: AiGovernanceService,
    private readonly guardrails: GuardrailService
  ) {}

  generateDraft(actor: PlatformUser, projectId: string): PrdVersion {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const route = this.aiGovernance.resolveRoute("prd_generation");
    const sourcePrompt = this.buildPrompt(project);
    const guardrail = this.guardrails.evaluatePrompt(actor, {
      prompt: sourcePrompt,
      scenario: "prd_generation"
    });

    if (guardrail.decision === "block") {
      throw new ValidationError(`PRD generation blocked by guardrail: ${guardrail.matchedRule?.name ?? guardrail.severity}`);
    }

    const quota = this.aiGovernance.checkQuota("creator", 300);
    if (!quota.allowed) {
      throw new QuotaExceededError(`Creator quota exceeded. Remaining today: ${quota.remainingToday}`);
    }

    this.aiGovernance.recordProviderCall();

    const now = new Date().toISOString();
    const document = this.ensureDocument(project.id, now);
    const draft: PrdVersion = {
      id: `prdver_${project.id}_${String(document.versions.filter((version) => version.status === "draft").length + 1).padStart(2, "0")}`,
      projectId: project.id,
      version: "0.1",
      status: "draft",
      isBaseline: false,
      sourcePrompt,
      changeSummary: `Generated initial PRD draft for ${project.name}`,
      generatedBy: {
        scenario: "prd_generation",
        providerId: route.primary.providerId,
        model: route.primary.model
      },
      sections: this.buildSections(project),
      createdByUserId: actor.id,
      createdAt: now
    };

    document.status = "draft";
    document.currentVersionId = draft.id;
    document.versions.push(draft);
    document.updatedAt = now;

    this.audit.record({
      actorId: actor.id,
      action: "prd.draft.generated",
      resourceType: "prd_version",
      resourceId: draft.id,
      metadata: { projectId: project.id, route: route.primary, guardrailDecision: guardrail.decision }
    });

    return draft;
  }

  getCurrent(actor: PlatformUser, projectId: string): PrdVersion {
    const document = this.getDocumentForActor(actor, projectId);
    const version = document.versions.find((candidate) => candidate.id === document.currentVersionId);
    if (!version) throw new ValidationError(`No current PRD version for project ${projectId}`);
    return version;
  }

  listVersions(actor: PlatformUser, projectId: string): PrdVersion[] {
    const document = this.getDocumentForActor(actor, projectId);
    return [...document.versions];
  }

  confirmBaseline(actor: PlatformUser, projectId: string, versionId: string): PrdVersion {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const document = this.getDocumentForActor(actor, project.id);
    if (document.baselineVersionId) {
      throw new ConflictError(`PRD baseline already confirmed for project ${projectId}`);
    }

    const draft = document.versions.find((candidate) => candidate.id === versionId);
    if (!draft) throw new ValidationError(`Unknown PRD version: ${versionId}`);

    const now = new Date().toISOString();
    const baseline: PrdVersion = {
      ...draft,
      id: `prdver_${project.id}_baseline_v1_0`,
      version: "1.0",
      status: "baseline",
      isBaseline: true,
      changeSummary: `Baseline v1.0 confirmed for ${project.name}`,
      createdAt: now,
      sections: draft.sections.map((section) => ({ ...section, id: section.id.replace(versionId, `prdver_${project.id}_baseline_v1_0`) }))
    };

    document.status = "baseline_confirmed";
    document.currentVersionId = baseline.id;
    document.baselineVersionId = baseline.id;
    document.versions.push(baseline);
    document.updatedAt = now;

    this.audit.record({
      actorId: actor.id,
      action: "prd.baseline.confirmed",
      resourceType: "prd_version",
      resourceId: baseline.id,
      metadata: { projectId: project.id, sourceVersionId: draft.id }
    });

    return baseline;
  }

  private ensureDocument(projectId: string, now: string): PrdDocument {
    const existing = this.documents.find((document) => document.projectId === projectId);
    if (existing) return existing;

    const document: PrdDocument = {
      id: `prddoc_${projectId}`,
      projectId,
      status: "draft",
      currentVersionId: "",
      versions: [],
      updatedAt: now
    };
    this.documents.push(document);
    return document;
  }

  private getDocumentForActor(actor: PlatformUser, projectId: string): PrdDocument {
    this.projects.getProjectForActor(actor, projectId);
    const document = this.documents.find((candidate) => candidate.projectId === projectId);
    if (!document) throw new ValidationError(`No PRD document for project ${projectId}`);
    return document;
  }

  private buildPrompt(project: PlatformProject): string {
    return [
      `Create a PRD for ${project.name}.`,
      `Problem: ${project.businessProblem}`,
      `App type: ${project.appType}`,
      `Department: ${project.targetDepartment}`,
      `Users: ${project.intendedUsers.join(", ")}`,
      `Data sensitivity: ${project.dataSensitivity}`
    ].join("\n");
  }

  private buildSections(project: PlatformProject): PrdSection[] {
    const sections = [
      ["overview", "Overview", `${project.name} is a ${project.appType} for ${project.targetDepartment}.`],
      ["business_objective", "Business Objective", project.businessProblem],
      ["users_roles", "Users and Roles", `Primary users: ${project.intendedUsers.join(", ")}.`],
      ["core_flows", "Core Flows", "Create request, manager review, HR visibility, status tracking and audit trail."],
      ["data_model", "Data Model", "Employee, leave request, approval step, attachment, notification and audit event."],
      ["permissions", "Permissions", "Employees manage own requests. Managers approve team requests. HR admins administer policy."],
      ["nfr", "Non-Functional Requirements", `Data sensitivity is ${project.dataSensitivity}; all access must be authenticated and audited.`],
      ["acceptance_criteria", "Acceptance Criteria", "Creator can generate, review and confirm PRD baseline before app generation."]
    ];

    return sections.map(([key, title, body], index) => ({
      id: `prdsec_${project.id}_${key}`,
      key,
      title,
      body,
      order: index + 1
    }));
  }
}

export class DatabaseViewService {
  private readonly tables: AppDatabaseTable[] = [];
  private readonly relationships: AppDatabaseRelationship[] = [];
  private readonly sampleRecords: AppDatabaseSampleRecord[] = [];
  private readonly migrations: AppDatabaseMigration[] = [];

  constructor(
    private readonly projects: ProjectService
  ) {}

  getDatabaseView(actor: PlatformUser, projectId: string): DatabaseViewSnapshot {
    const project = this.projects.getProjectForActor(actor, projectId);
    this.ensureMetadata(project);

    return {
      project,
      schemaName: `app_${project.slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      readOnly: true,
      restrictions: [
        "No raw SQL editor",
        "No drop table action",
        "No production data deletion",
        "Schema changes must go through AI migration flow"
      ],
      tables: this.tables.filter((table) => table.projectId === project.id),
      relationships: this.relationships.filter((relationship) => relationship.projectId === project.id),
      migrations: this.migrations.filter((migration) => migration.projectId === project.id),
      sampleRecords: this.sampleRecords.filter((record) => record.projectId === project.id)
    };
  }

  listSampleRecords(actor: PlatformUser, projectId: string, tableKey: string): AppDatabaseSampleRecord[] {
    const project = this.projects.getProjectForActor(actor, projectId);
    this.ensureMetadata(project);
    return this.sampleRecords.filter((record) => record.projectId === project.id && record.tableKey === tableKey);
  }

  executeRawSql(actor: PlatformUser, projectId: string, _sql: string): never {
    this.projects.getProjectForActor(actor, projectId);
    throw new PermissionError("Raw SQL is not available in Creator database view");
  }

  boundaryDigest(actor: PlatformUser, projectId: string): Record<string, unknown> {
    const view = this.getDatabaseView(actor, projectId);
    return {
      schemaName: view.schemaName,
      tables: view.tables.map((table) => ({
        key: table.key,
        columns: table.columns.map((column) => `${column.name}:${column.dataType}:${column.required}`)
      })),
      relationships: view.relationships.map((relationship) => `${relationship.sourceTable}.${relationship.sourceColumn}->${relationship.targetTable}.${relationship.targetColumn}`),
      migrations: view.migrations.map((migration) => `${migration.migrationId}:${migration.status}`)
    };
  }

  private ensureMetadata(project: PlatformProject): void {
    if (this.tables.some((table) => table.projectId === project.id)) return;

    const tableDefinitions: Array<Omit<AppDatabaseTable, "id" | "projectId" | "source">> = [
      {
        key: "employees",
        displayName: "Employees",
        description: "Employee directory fields used by Leave Management.",
        columns: [
          { id: "", tableKey: "employees", name: "id", dataType: "uuid", required: true, source: "generated" },
          { id: "", tableKey: "employees", name: "full_name", dataType: "text", required: true, source: "generated" },
          { id: "", tableKey: "employees", name: "manager_id", dataType: "uuid", required: false, source: "generated" }
        ]
      },
      {
        key: "leave_requests",
        displayName: "Leave Requests",
        description: "Employee leave requests including WFH leave type from Sprint 4 prompt.",
        columns: [
          { id: "", tableKey: "leave_requests", name: "id", dataType: "uuid", required: true, source: "generated" },
          { id: "", tableKey: "leave_requests", name: "employee_id", dataType: "uuid", required: true, source: "generated" },
          { id: "", tableKey: "leave_requests", name: "leave_type", dataType: "text", required: true, defaultValue: "annual", source: "generated" },
          { id: "", tableKey: "leave_requests", name: "status", dataType: "text", required: true, defaultValue: "pending", source: "generated" }
        ]
      },
      {
        key: "approval_steps",
        displayName: "Approval Steps",
        description: "Manager approval queue entries linked to leave requests.",
        columns: [
          { id: "", tableKey: "approval_steps", name: "id", dataType: "uuid", required: true, source: "generated" },
          { id: "", tableKey: "approval_steps", name: "leave_request_id", dataType: "uuid", required: true, source: "generated" },
          { id: "", tableKey: "approval_steps", name: "approver_id", dataType: "uuid", required: true, source: "generated" },
          { id: "", tableKey: "approval_steps", name: "decision", dataType: "text", required: false, source: "generated" }
        ]
      }
    ];

    for (const table of tableDefinitions) {
      const storedTable: AppDatabaseTable = {
        id: `dbtbl_${project.id}_${table.key}`,
        projectId: project.id,
        key: table.key,
        displayName: table.displayName,
        description: table.description,
        source: "generated",
        columns: table.columns.map((column, index) => ({
          ...column,
          id: `dbcol_${project.id}_${table.key}_${index + 1}`
        }))
      };
      this.tables.push(storedTable);
    }

    this.relationships.push(
      {
        id: `dbrel_${project.id}_leave_employee`,
        projectId: project.id,
        sourceTable: "leave_requests",
        sourceColumn: "employee_id",
        targetTable: "employees",
        targetColumn: "id",
        cardinality: "one_to_many"
      },
      {
        id: `dbrel_${project.id}_approval_leave`,
        projectId: project.id,
        sourceTable: "approval_steps",
        sourceColumn: "leave_request_id",
        targetTable: "leave_requests",
        targetColumn: "id",
        cardinality: "one_to_many"
      }
    );

    this.sampleRecords.push(
      {
        id: `dbrec_${project.id}_leave_1`,
        projectId: project.id,
        tableKey: "leave_requests",
        ordinal: 1,
        data: { id: "lr_1001", employee_id: "emp_001", leave_type: "WFH", status: "pending" }
      },
      {
        id: `dbrec_${project.id}_leave_2`,
        projectId: project.id,
        tableKey: "leave_requests",
        ordinal: 2,
        data: { id: "lr_1002", employee_id: "emp_002", leave_type: "annual", status: "approved" }
      },
      {
        id: `dbrec_${project.id}_approval_1`,
        projectId: project.id,
        tableKey: "approval_steps",
        ordinal: 1,
        data: { id: "ap_9001", leave_request_id: "lr_1001", approver_id: "emp_mgr_01", decision: null }
      }
    );

    this.migrations.push({
      id: `dbmig_${project.id}_001`,
      projectId: project.id,
      migrationId: "2026081001_leave_management_base",
      status: "applied",
      createdByUserId: project.ownerUserId,
      linkedPrdVersion: "1.0",
      linkedFrontendCheckpoint: project.activeFrontendCheckpointId,
      appliedAt: new Date("2026-08-10T09:00:00.000Z").toISOString()
    });
  }
}

export class FrontendVersionService {
  private readonly checkpoints: FrontendCheckpoint[] = [];

  constructor(
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly prds: PrdService,
    private readonly databaseView: DatabaseViewService
  ) {}

  recordFromPreview(actor: PlatformUser, preview: PreviewVersion, task: WorkspaceTask): FrontendCheckpoint {
    const project = this.projects.getProjectForActor(actor, preview.projectId);
    for (const checkpoint of this.checkpoints.filter((candidate) => candidate.projectId === project.id && candidate.status === "current")) {
      checkpoint.status = "previous";
    }

    const versionNumber = this.checkpoints.filter((checkpoint) => checkpoint.projectId === project.id).length + 1;
    const checkpoint: FrontendCheckpoint = {
      id: `fechk_${project.id}_${String(versionNumber).padStart(4, "0")}`,
      projectId: project.id,
      version: `fe-${String(versionNumber).padStart(4, "0")}`,
      sourcePreviewVersion: preview.version,
      sourceTaskId: task.id,
      status: "current",
      checksum: `sha256:${createHash("sha256").update(`${project.id}:${preview.version}:${task.prompt}`).digest("hex").slice(0, 16)}`,
      fileManifest: ["src/pages/LeaveRequest.tsx", "src/components/ApprovalQueue.tsx", "src/styles/leave-management.css"],
      routeSnapshot: ["/leave-requests", "/manager/approvals", "/policy"],
      changeSummary: preview.summary,
      changedAreas: ["UI components", "Frontend routing", "CSS styles"],
      createdByUserId: actor.id,
      createdAt: preview.createdAt
    };

    this.checkpoints.push(checkpoint);
    project.activeFrontendCheckpointId = checkpoint.id;
    return checkpoint;
  }

  getTimeline(actor: PlatformUser, projectId: string): FrontendCheckpointTimeline {
    const project = this.projects.getProjectForActor(actor, projectId);
    const checkpoints = this.listCheckpoints(actor, project.id);
    const activeCheckpoint = checkpoints.find((checkpoint) => checkpoint.status === "current");
    if (!activeCheckpoint) throw new ValidationError(`No frontend checkpoints for project ${projectId}`);
    return { project, activeCheckpoint, checkpoints };
  }

  listCheckpoints(actor: PlatformUser, projectId: string): FrontendCheckpoint[] {
    this.projects.getProjectForActor(actor, projectId);
    return this.checkpoints.filter((checkpoint) => checkpoint.projectId === projectId);
  }

  compareCheckpoints(actor: PlatformUser, projectId: string, input: { fromCheckpointId: string; toCheckpointId?: string }): FrontendCompareResult {
    const checkpoints = this.listCheckpoints(actor, projectId);
    const from = checkpoints.find((checkpoint) => checkpoint.id === input.fromCheckpointId);
    const to = input.toCheckpointId
      ? checkpoints.find((checkpoint) => checkpoint.id === input.toCheckpointId)
      : checkpoints.find((checkpoint) => checkpoint.status === "current");

    if (!from) throw new ValidationError(`Unknown frontend checkpoint: ${input.fromCheckpointId}`);
    if (!to) throw new ValidationError(`Unknown target frontend checkpoint`);

    return {
      from,
      to,
      changedAreas: Array.from(new Set([...from.changedAreas, ...to.changedAreas])),
      filesChanged: Array.from(new Set([...from.fileManifest, ...to.fileManifest])),
      previewSummary: `Compare ${from.version} with ${to.version}: frontend files only`
    };
  }

  restoreFrontend(actor: PlatformUser, projectId: string, checkpointId: string): FrontendRestoreResult {
    const project = this.projects.getProjectForActor(actor, projectId);
    const source = this.listCheckpoints(actor, project.id).find((checkpoint) => checkpoint.id === checkpointId);
    if (!source) throw new ValidationError(`Unknown frontend checkpoint: ${checkpointId}`);

    for (const checkpoint of this.checkpoints.filter((candidate) => candidate.projectId === project.id && candidate.status === "current")) {
      checkpoint.status = "previous";
    }

    const now = new Date().toISOString();
    const versionNumber = this.checkpoints.filter((checkpoint) => checkpoint.projectId === project.id).length + 1;
    const restored: FrontendCheckpoint = {
      ...source,
      id: `fechk_${project.id}_${String(versionNumber).padStart(4, "0")}`,
      version: `fe-${String(versionNumber).padStart(4, "0")}`,
      status: "current",
      restoreSourceCheckpointId: source.id,
      changeSummary: `Restored frontend only from ${source.version}`,
      checksum: `sha256:${createHash("sha256").update(`${project.id}:restore:${source.id}:${versionNumber}`).digest("hex").slice(0, 16)}`,
      createdByUserId: actor.id,
      createdAt: now
    };

    this.checkpoints.push(restored);
    project.activeFrontendCheckpointId = restored.id;
    const audit = this.audit.record({
      actorId: actor.id,
      action: "frontend.restore.completed",
      resourceType: "frontend_checkpoint",
      resourceId: restored.id,
      metadata: {
        projectId: project.id,
        restoredFromCheckpointId: source.id,
        boundary: this.restoreBoundary().unchanged
      }
    });

    return {
      checkpoint: restored,
      restoredFrom: source,
      boundary: this.restoreBoundary(),
      auditEventId: audit.id
    };
  }

  captureBoundarySnapshot(actor: PlatformUser, projectId: string): Record<string, unknown> {
    const project = this.projects.getProjectForActor(actor, projectId);
    const baseline = this.prds.listVersions(actor, project.id).find((version) => version.isBaseline);
    return {
      backend: "platform-api:v1",
      database: this.databaseView.boundaryDigest(actor, project.id),
      auth: "mock-auth",
      appRoles: ["employee", "manager", "hr_admin"],
      membership: [project.ownerUserId],
      domain: `/apps/${project.slug}`,
      prdBaseline: baseline?.id
    };
  }

  private restoreBoundary(): FrontendRestoreResult["boundary"] {
    return {
      frontendChanged: true,
      unchanged: ["backend", "database", "auth", "app_roles", "membership", "domain", "prd_baseline"]
    };
  }
}

export class AppUserAccessService {
  private readonly roles: AppRoleDefinition[] = [];
  private readonly members: AppMemberRecord[] = [];
  private readonly invitations: AppInvitation[] = [];
  private readonly accessRequests: AppAccessRequest[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly identity: IdentityService
  ) {}

  getSnapshot(actor: PlatformUser, projectId: string): AppAccessSnapshot {
    const project = this.projects.getProjectForActor(actor, projectId);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);

    return {
      project,
      app,
      roles: this.rolesForApp(app.id),
      members: this.members.filter((member) => member.appId === app.id),
      invitations: this.invitations.filter((invitation) => invitation.appId === app.id),
      accessRequests: this.accessRequests.filter((request) => request.appId === app.id)
    };
  }

  createRole(
    actor: PlatformUser,
    projectId: string,
    input: {
      key: string;
      name: string;
      description?: string;
      permissions?: string[];
    }
  ): AppRoleDefinition {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);
    const key = input.key.trim().toLowerCase();
    if (!key) throw new ValidationError("App role key is required");

    const role: AppRoleDefinition = {
      id: `approle_${app.id}_${key}`,
      appId: app.id,
      key,
      name: input.name.trim() || key,
      description: input.description ?? "Custom app role",
      permissions: input.permissions?.length ? [...input.permissions] : [`${project.slug}:read`],
      memberCount: this.members.filter((member) => member.appId === app.id && member.roleKey === key).length
    };

    const existingIndex = this.roles.findIndex((candidate) => candidate.appId === app.id && candidate.key === key);
    if (existingIndex >= 0) this.roles[existingIndex] = role;
    else this.roles.push(role);

    this.audit.record({
      actorId: actor.id,
      action: "app.role.saved",
      resourceType: "app_role",
      resourceId: role.id,
      metadata: { projectId: project.id, permissions: role.permissions }
    });

    return role;
  }

  createInvitation(
    actor: PlatformUser,
    projectId: string,
    input: {
      email: string;
      roleKey: string;
      userType: AppUserType;
      expiresAt?: string;
      note?: string;
    }
  ): AppInvitation {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);
    this.requireRoleKey(app.id, input.roleKey);
    const email = input.email.trim().toLowerCase();
    if (!email) throw new ValidationError("Invitation email is required");

    const now = new Date().toISOString();
    const isExternal = input.userType === "external";
    const invitation: AppInvitation = {
      id: `appinv_${app.id}_${String(this.invitations.length + 1).padStart(4, "0")}`,
      appId: app.id,
      projectId: project.id,
      email,
      userType: input.userType,
      roleKey: input.roleKey,
      invitedByUserId: actor.id,
      status: isExternal ? "approval_required" : "pending",
      expiresAt: input.expiresAt,
      note: input.note,
      policyWarning: isExternal ? "External invite requires approval before app access is activated." : undefined,
      createdAt: now
    };

    this.invitations.push(invitation);
    this.audit.record({
      actorId: actor.id,
      action: isExternal ? "app.invitation.policy_required" : "app.invitation.created",
      resourceType: "app_invitation",
      resourceId: invitation.id,
      severity: isExternal ? "warning" : "info",
      metadata: { projectId: project.id, email, roleKey: input.roleKey, userType: input.userType }
    });

    return invitation;
  }

  createAccessRequest(
    actor: PlatformUser,
    projectId: string,
    input: {
      requesterEmail: string;
      requestedRoleKey: string;
      reason: string;
    }
  ): AppAccessRequest {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);
    this.requireRoleKey(app.id, input.requestedRoleKey);
    const requesterEmail = input.requesterEmail.trim().toLowerCase();
    if (!requesterEmail) throw new ValidationError("Requester email is required");

    const request: AppAccessRequest = {
      id: `appreq_${app.id}_${String(this.accessRequests.length + 1).padStart(4, "0")}`,
      appId: app.id,
      projectId: project.id,
      requesterEmail,
      requestedRoleKey: input.requestedRoleKey,
      reason: input.reason.trim() || "Access requested from App Store",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    this.accessRequests.push(request);
    this.audit.record({
      actorId: actor.id,
      action: "app.access_request.created",
      resourceType: "app_access_request",
      resourceId: request.id,
      metadata: { projectId: project.id, requesterEmail, requestedRoleKey: input.requestedRoleKey }
    });

    return request;
  }

  decideAccessRequest(
    actor: PlatformUser,
    projectId: string,
    input: {
      requestId: string;
      decision: "approved" | "rejected";
      decidedByUserId?: string;
    }
  ): AppAccessRequest {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);
    const request = this.accessRequests.find((candidate) => candidate.id === input.requestId && candidate.appId === app.id);
    if (!request) throw new ValidationError(`Unknown app access request: ${input.requestId}`);
    if (request.status !== "pending") throw new ConflictError(`Access request ${input.requestId} is already ${request.status}`);

    request.status = input.decision;
    request.decidedByUserId = input.decidedByUserId ?? actor.id;
    request.decidedAt = new Date().toISOString();

    if (input.decision === "approved") {
      this.addMember(app, request.requesterEmail, request.requestedRoleKey, "internal", "active");
    }

    this.audit.record({
      actorId: actor.id,
      action: input.decision === "approved" ? "app.access_request.approved" : "app.access_request.rejected",
      resourceType: "app_access_request",
      resourceId: request.id,
      metadata: { projectId: project.id, requestedRoleKey: request.requestedRoleKey }
    });

    return request;
  }

  rolesForProject(actor: PlatformUser, projectId: string): AppRoleDefinition[] {
    return this.getSnapshot(actor, projectId).roles;
  }

  membersForProject(actor: PlatformUser, projectId: string): AppMemberRecord[] {
    return this.getSnapshot(actor, projectId).members;
  }

  private ensureApp(project: PlatformProject): ManagedApp {
    return {
      id: project.appId ?? `app_${project.slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      projectId: project.id,
      slug: project.slug,
      name: project.name,
      status: project.status === "published" ? "published" : "draft",
      route: `/apps/${project.slug}`
    };
  }

  private ensureDefaults(project: PlatformProject, app: ManagedApp): void {
    if (!this.roles.some((role) => role.appId === app.id)) {
      const defaultRoles: Array<Omit<AppRoleDefinition, "id" | "appId" | "memberCount">> = [
        {
          key: "employee",
          name: "Employee",
          description: "Request and view own leave records.",
          permissions: ["leave:request", "leave:view-own"]
        },
        {
          key: "manager",
          name: "Manager",
          description: "Approve team leave requests and view team queue.",
          permissions: ["leave:approve", "leave:view-team"]
        },
        {
          key: "hr_admin",
          name: "HR Admin",
          description: "Administer leave policies and reporting.",
          permissions: ["leave:admin", "leave:report"]
        }
      ];

      for (const role of defaultRoles) {
        this.roles.push({
          ...role,
          id: `approle_${app.id}_${role.key}`,
          appId: app.id,
          memberCount: 0
        });
      }
    }

    if (!this.members.some((member) => member.appId === app.id)) {
      this.addMember(app, "creator@company.com", "hr_admin", "internal", "active", project.ownerUserId);
      this.addMember(app, "user@company.com", "employee", "internal", "active", mockUsers.endUser.id);
    }

    if (!this.invitations.some((invitation) => invitation.appId === app.id)) {
      this.invitations.push({
        id: `appinv_${app.id}_seed_internal`,
        appId: app.id,
        projectId: project.id,
        email: "manager@company.com",
        userType: "internal",
        roleKey: "manager",
        invitedByUserId: project.ownerUserId,
        status: "pending",
        note: "Join manager approval queue",
        createdAt: new Date("2026-08-17T09:00:00.000Z").toISOString()
      });
    }

    if (!this.accessRequests.some((request) => request.appId === app.id)) {
      this.accessRequests.push({
        id: `appreq_${app.id}_seed_manager`,
        appId: app.id,
        projectId: project.id,
        requesterEmail: "manager@company.com",
        requestedRoleKey: "manager",
        reason: "Needs approval queue access",
        status: "pending",
        createdAt: new Date("2026-08-17T10:00:00.000Z").toISOString()
      });
    }

    this.recountMembers(app.id);
  }

  private requireRoleKey(appId: string, roleKey: string): AppRoleDefinition {
    const role = this.roles.find((candidate) => candidate.appId === appId && candidate.key === roleKey);
    if (!role) throw new ValidationError(`Unknown app role: ${roleKey}`);
    return role;
  }

  private addMember(
    app: ManagedApp,
    email: string,
    roleKey: string,
    userType: AppUserType,
    status: AppMemberRecord["status"],
    userId?: string
  ): AppMemberRecord {
    const role = this.requireRoleKey(app.id, roleKey);
    const existing = this.members.find((member) => member.appId === app.id && member.email === email && member.roleKey === roleKey);
    if (existing) return existing;
    const knownUser = this.identity.listUsers().find((user) => user.email === email);
    const member: AppMemberRecord = {
      id: `appmem_${app.id}_${String(this.members.length + 1).padStart(4, "0")}`,
      appId: app.id,
      userId: userId ?? knownUser?.id ?? slugId("usr", email),
      email,
      name: knownUser?.name ?? email.split("@")[0],
      userType,
      roleId: role.id,
      roleKey: role.key,
      roleName: role.name,
      status,
      lastAccessAt: status === "active" ? new Date("2026-08-20T09:00:00.000Z").toISOString() : undefined
    };

    this.members.push(member);
    this.recountMembers(app.id);
    return member;
  }

  private rolesForApp(appId: string): AppRoleDefinition[] {
    this.recountMembers(appId);
    return this.roles.filter((role) => role.appId === appId);
  }

  private recountMembers(appId: string): void {
    for (const role of this.roles.filter((candidate) => candidate.appId === appId)) {
      role.memberCount = this.members.filter((member) => member.appId === appId && member.roleKey === role.key).length;
    }
  }
}

export class PublishService {
  private readonly manifests: AppManifest[] = [];
  private readonly publishRequests: PublishRequestRecord[] = [];
  private readonly deployments: DeploymentRecord[] = [];
  private readonly registry: AppStoreRegistryEntry[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly prds: PrdService,
    private readonly frontendVersions: FrontendVersionService,
    private readonly databaseView: DatabaseViewService,
    private readonly appAccess: AppUserAccessService
  ) {}

  getReview(actor: PlatformUser, projectId: string): PublishReview {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const manifest = this.buildManifest(actor, project);
    const checklist = this.buildChecklist(actor, project, manifest);
    return {
      project,
      manifest,
      checklist,
      ready: checklist.every((item) => item.status === "pass")
    };
  }

  publishApp(actor: PlatformUser, projectId: string): PublishResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const review = this.getReview(actor, projectId);
    const blockingItems = review.checklist.filter((item) => item.status === "fail").map((item) => item.label);
    const now = new Date().toISOString();
    const publishRequest: PublishRequestRecord = {
      id: `pubreq_${review.manifest.app.slug}_${String(this.publishRequests.length + 1).padStart(4, "0")}`,
      projectId: review.project.id,
      appId: review.manifest.appId,
      status: blockingItems.length > 0 ? "blocked" : "published",
      requestedByUserId: actor.id,
      manifestVersion: review.manifest.manifestVersion,
      blockingItems,
      createdAt: now,
      publishedAt: blockingItems.length > 0 ? undefined : now
    };

    this.publishRequests.push(publishRequest);

    if (blockingItems.length > 0) {
      this.audit.record({
        actorId: actor.id,
        action: "app.publish.blocked",
        resourceType: "publish_request",
        resourceId: publishRequest.id,
        severity: "warning",
        metadata: { projectId: review.project.id, blockingItems }
      });
      throw new ValidationError(`Publish blocked: ${blockingItems.join(", ")}`);
    }

    this.storeManifest(review.manifest);
    review.project.status = "published";
    const deployment: DeploymentRecord = {
      id: `dep_${review.manifest.app.slug.replace(/[^a-z0-9]+/gi, "_")}_${String(this.deployments.length + 1).padStart(3, "0")}`,
      projectId: review.project.id,
      appId: review.manifest.appId,
      publishRequestId: publishRequest.id,
      status: "published",
      environment: "app_store",
      route: review.manifest.app.route,
      manifestVersion: review.manifest.manifestVersion,
      prdVersion: review.manifest.prd.version,
      frontendCheckpointId: review.manifest.frontend.checkpointId,
      publishedByUserId: actor.id,
      publishedAt: now
    };

    const registryEntry: AppStoreRegistryEntry = {
      id: `store_${review.manifest.app.slug}`,
      appId: review.manifest.appId,
      slug: review.manifest.app.slug,
      name: review.manifest.app.name,
      route: review.manifest.app.route,
      status: "published",
      visibility: "restricted",
      accessMode: "membership_or_invite",
      roleKeys: review.manifest.roles.map((role) => role.key),
      ownerUserId: review.project.ownerUserId,
      deploymentId: deployment.id,
      manifestVersion: review.manifest.manifestVersion,
      publishedAt: now
    };

    this.deployments.push(deployment);
    this.upsertRegistry(registryEntry);
    this.audit.record({
      actorId: actor.id,
      action: "app.publish.completed",
      resourceType: "publish_request",
      resourceId: publishRequest.id,
      metadata: {
        projectId: review.project.id,
        deploymentId: deployment.id,
        registryEntryId: registryEntry.id,
        manifestVersion: review.manifest.manifestVersion
      }
    });

    return {
      publishRequest,
      deployment,
      registryEntry,
      manifest: review.manifest
    };
  }

  listRegistry(actor: PlatformUser): AppStoreRegistryEntry[] {
    this.auth.requireRole(actor, ["admin", "creator", "end_user"]);
    return [...this.registry];
  }

  private buildManifest(actor: PlatformUser, project: PlatformProject): AppManifest {
    const appAccess = this.appAccess.getSnapshot(actor, project.id);
    let baseline: PrdVersion | undefined;
    try {
      baseline = this.prds.listVersions(actor, project.id).find((version) => version.isBaseline);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
    }
    const database = this.databaseView.getDatabaseView(actor, project.id);
    let activeCheckpoint: FrontendCheckpoint | undefined;
    try {
      activeCheckpoint = this.frontendVersions.getTimeline(actor, project.id).activeCheckpoint;
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
    }

    return {
      id: `manifest_${appAccess.app.id}_v1`,
      appId: appAccess.app.id,
      projectId: project.id,
      manifestVersion: "1",
      app: {
        id: appAccess.app.id,
        slug: appAccess.app.slug,
        name: appAccess.app.name,
        route: appAccess.app.route,
        status: appAccess.app.status
      },
      prd: {
        versionId: baseline?.id ?? "",
        version: baseline?.version ?? ""
      },
      frontend: {
        checkpointId: activeCheckpoint?.id ?? "",
        version: activeCheckpoint?.version ?? "",
        checksum: activeCheckpoint?.checksum ?? "",
        routes: activeCheckpoint?.routeSnapshot ?? []
      },
      auth: {
        mode: "platform_auth_sdk",
        accessMode: "restricted"
      },
      roles: appAccess.roles.map((role) => ({
        key: role.key,
        name: role.name,
        permissions: [...role.permissions]
      })),
      database: {
        schemaName: database.schemaName,
        tables: database.tables.map((table) => table.key)
      },
      generatedAt: new Date().toISOString()
    };
  }

  private buildChecklist(actor: PlatformUser, project: PlatformProject, manifest: AppManifest): PublishChecklistItem[] {
    const access = this.appAccess.getSnapshot(actor, project.id);
    return [
      {
        key: "prd_baseline",
        label: "PRD baseline",
        status: manifest.prd.versionId ? "pass" : "fail",
        detail: manifest.prd.versionId ? `Baseline ${manifest.prd.version}` : "Confirm PRD baseline before publishing"
      },
      {
        key: "active_frontend",
        label: "Active frontend checkpoint",
        status: manifest.frontend.checkpointId ? "pass" : "fail",
        detail: manifest.frontend.checkpointId ? manifest.frontend.version : "Generate or restore an active frontend checkpoint"
      },
      {
        key: "app_roles",
        label: "App roles",
        status: manifest.roles.length > 0 ? "pass" : "fail",
        detail: manifest.roles.length > 0 ? `${manifest.roles.length} roles configured` : "Create at least one app role"
      },
      {
        key: "app_owner",
        label: "At least one owner",
        status: project.ownerUserId || access.members.some((member) => member.roleKey === "hr_admin") ? "pass" : "fail",
        detail: project.ownerUserId ? `Owner ${project.ownerUserId}` : "Assign an owner before publishing"
      },
      {
        key: "blocking_guardrail",
        label: "No blocking guardrail event",
        status: "pass",
        detail: "No blocking guardrail event is attached to this publish review"
      }
    ];
  }

  private storeManifest(manifest: AppManifest): void {
    const existingIndex = this.manifests.findIndex((candidate) => candidate.appId === manifest.appId);
    if (existingIndex >= 0) this.manifests[existingIndex] = manifest;
    else this.manifests.push(manifest);
  }

  private upsertRegistry(entry: AppStoreRegistryEntry): void {
    const existingIndex = this.registry.findIndex((candidate) => candidate.appId === entry.appId);
    if (existingIndex >= 0) this.registry[existingIndex] = entry;
    else this.registry.push(entry);
  }
}

export class WorkspaceService {
  private readonly tasks: WorkspaceTask[] = [];
  private readonly previews: PreviewVersion[] = [];
  private readonly usageLogs: AiUsageLog[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly prds: PrdService,
    private readonly aiGovernance: AiGovernanceService,
    private readonly guardrails: GuardrailService,
    private readonly frontendVersions: FrontendVersionService
  ) {}

  getWorkspace(actor: PlatformUser, projectId: string): WorkspaceSnapshot {
    const project = this.projects.getProjectForActor(actor, projectId);
    const baseline = this.requireBaseline(actor, projectId);

    return {
      project,
      baseline,
      preview: this.latestPreview(project.id),
      tasks: this.tasks.filter((task) => task.projectId === project.id),
      usage: this.listUsage(actor, project.id),
      tokenBudget: this.buildTokenBudget(0)
    };
  }

  submitPrompt(actor: PlatformUser, projectId: string, input: { prompt: string }): WorkspacePromptResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    this.requireBaseline(actor, project.id);
    const prompt = input.prompt.trim();
    if (!prompt) throw new ValidationError("Prompt is required");

    const guardrail = this.guardrails.evaluatePrompt(actor, {
      prompt,
      scenario: "frontend_coding"
    });
    const now = new Date().toISOString();

    if (guardrail.decision === "block") {
      const blockedTask = this.createTask(project.id, actor.id, prompt, "blocked", guardrail, now, "failed");
      this.tasks.push(blockedTask);
      this.audit.record({
        actorId: actor.id,
        action: "workspace.prompt.blocked",
        resourceType: "workspace_task",
        resourceId: blockedTask.id,
        severity: "warning",
        metadata: { projectId: project.id, guardrailEventId: guardrail.eventId }
      });
      return {
        guardrail,
        task: blockedTask,
        preview: this.latestPreview(project.id),
        tokenBudget: this.buildTokenBudget(0)
      };
    }

    const route = this.aiGovernance.resolveRoute("frontend_coding");
    const requestEstimate = 120;
    const quota = this.aiGovernance.checkQuota("creator", requestEstimate);
    if (!quota.allowed) {
      throw new QuotaExceededError(`Creator quota exceeded. Remaining today: ${quota.remainingToday}`);
    }

    this.aiGovernance.recordProviderCall();
    const task = this.createTask(project.id, actor.id, prompt, "ready", guardrail, now, "done");
    const preview = this.createPreview(project.id, prompt, now);
    this.frontendVersions.recordFromPreview(actor, preview, task);
    const usage: AiUsageLog = {
      id: `ailog_${String(this.usageLogs.length + 1).padStart(4, "0")}`,
      projectId: project.id,
      taskId: task.id,
      actorId: actor.id,
      scenario: "frontend_coding",
      providerId: route.primary.providerId,
      model: route.primary.model,
      prompt,
      tokensUsed: requestEstimate,
      occurredAt: now
    };

    this.tasks.push(task);
    this.previews.push(preview);
    this.usageLogs.push(usage);
    this.audit.record({
      actorId: actor.id,
      action: "workspace.prompt.accepted",
      resourceType: "workspace_task",
      resourceId: task.id,
      metadata: { projectId: project.id, previewVersion: preview.version, tokensUsed: usage.tokensUsed }
    });

    return {
      guardrail,
      task,
      preview,
      usage,
      tokenBudget: this.buildTokenBudget(requestEstimate)
    };
  }

  refreshPreview(actor: PlatformUser, projectId: string): PreviewVersion {
    this.projects.getProjectForActor(actor, projectId);
    this.requireBaseline(actor, projectId);
    return this.latestPreview(projectId);
  }

  listUsage(actor: PlatformUser, projectId: string): AiUsageLog[] {
    this.projects.getProjectForActor(actor, projectId);
    return this.usageLogs.filter((event) => event.projectId === projectId);
  }

  private requireBaseline(actor: PlatformUser, projectId: string): PrdVersion {
    let versions: PrdVersion[];
    try {
      versions = this.prds.listVersions(actor, projectId);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(`PRD baseline is required before opening workspace for project ${projectId}`);
      }
      throw error;
    }
    const baseline = versions.find((version) => version.isBaseline);
    if (!baseline) throw new ValidationError(`PRD baseline is required before opening workspace for project ${projectId}`);
    return baseline;
  }

  private createTask(
    projectId: string,
    actorId: string,
    prompt: string,
    status: WorkspaceTaskStatus,
    guardrail: GuardrailResult,
    createdAt: string,
    terminalStepStatus: WorkspaceStepStatus
  ): WorkspaceTask {
    const id = `wst_${String(this.tasks.length + 1).padStart(4, "0")}`;
    const labels = [
      "Understanding request",
      "Loading PRD baseline",
      "Guardrail pre-check",
      "Selecting skill",
      "Generating frontend",
      "Applying auth/role rules",
      "Building preview",
      "Running checks",
      "Ready"
    ];

    return {
      id,
      projectId,
      prompt,
      status,
      guardrailDecision: guardrail.decision,
      guardrailEventId: guardrail.eventId,
      steps: labels.map((label, index) => ({
        id: `${id}_step_${index + 1}`,
        label,
        status: status === "blocked" && index >= 3 ? "pending" : terminalStepStatus,
        order: index + 1
      })),
      createdByUserId: actorId,
      createdAt
    };
  }

  private createPreview(projectId: string, prompt: string, createdAt: string): PreviewVersion {
    const versionNumber = this.previews.filter((preview) => preview.projectId === projectId && preview.version !== "preview-0000").length + 1;
    return {
      id: `preview_${projectId}_${String(versionNumber).padStart(4, "0")}`,
      projectId,
      version: `preview-${String(versionNumber).padStart(4, "0")}`,
      summary: `Mock preview updated: ${prompt}`,
      device: "desktop",
      screenTitle: "Leave Management",
      highlights: ["WFH leave type", "Manager approval queue", "HR policy visibility"],
      createdAt
    };
  }

  private latestPreview(projectId: string): PreviewVersion {
    const preview = [...this.previews].reverse().find((candidate) => candidate.projectId === projectId);
    if (preview) return preview;

    return {
      id: `preview_${projectId}_empty`,
      projectId,
      version: "preview-0000",
      summary: "No generated preview yet",
      device: "desktop",
      screenTitle: "Leave Management",
      highlights: ["Baseline PRD loaded", "Prompt required", "No generated changes"],
      createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString()
    };
  }

  private buildTokenBudget(tokensUsed: number): WorkspacePromptResult["tokenBudget"] {
    return {
      remainingToday: Math.max(1000 - tokensUsed, 0),
      remainingMonth: Math.max(5000 - tokensUsed, 0),
      requestEstimate: 120
    };
  }
}

export interface PlatformApiServices {
  identity: IdentityService;
  auth: MockAuthService;
  audit: AuditService;
  projects: ProjectService;
  aiGovernance: AiGovernanceService;
  guardrails: GuardrailService;
  prds: PrdService;
  workspace: WorkspaceService;
  databaseView: DatabaseViewService;
  frontendVersions: FrontendVersionService;
  appAccess: AppUserAccessService;
  publish: PublishService;
  envelope: {
    success: typeof success;
    failure: typeof failure;
  };
}

export type PlatformApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function createPlatformApiServices(): PlatformApiServices {
  const identity = new IdentityService();
  const auth = new MockAuthService(identity);
  const audit = new AuditService();
  const projects = new ProjectService(auth, audit);
  const aiGovernance = new AiGovernanceService(auth, audit);
  const guardrails = new GuardrailService(auth, audit);
  const prds = new PrdService(auth, audit, projects, aiGovernance, guardrails);
  const databaseView = new DatabaseViewService(projects);
  const frontendVersions = new FrontendVersionService(audit, projects, prds, databaseView);
  const appAccess = new AppUserAccessService(auth, audit, projects, identity);
  const publish = new PublishService(auth, audit, projects, prds, frontendVersions, databaseView, appAccess);
  const workspace = new WorkspaceService(auth, audit, projects, prds, aiGovernance, guardrails, frontendVersions);

  return {
    identity,
    auth,
    audit,
    projects,
    aiGovernance,
    guardrails,
    prds,
    workspace,
    databaseView,
    frontendVersions,
    appAccess,
    publish,
    envelope: { success, failure }
  };
}
