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
  knowledgeVersionIds?: string[];
  skillVersionId?: string;
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
  knowledgeRetrieval?: KnowledgeRetrievalResult;
  skillSelection?: SkillResolveResult;
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
  projectId: string;
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

export interface GeneratedRuntimeArtifactContract {
  root: string;
  requiredPaths: string[];
}

export interface GeneratedRuntimeContainerContract {
  status: "running" | "stopped" | "failed";
  containerName: string;
  imageTag: string;
  route: string;
  healthEndpoint: string;
  readyEndpoint: string;
  metricsEndpoint: string;
}

export interface GeneratedRuntimeSchemaIsolation {
  schemaName: string;
  dbUser: string;
  allowedSchemas: string[];
  deniedSchemas: string[];
}

export interface GeneratedRuntimeSchemaAccessCheck {
  projectId: string;
  attemptedSchema: string;
  operation: string;
  allowed: boolean;
  reason?: "assigned_schema_allowed" | "cross_schema_access_denied";
  evidence: string;
}

export interface GeneratedRuntimeHealth {
  status: "healthy" | "degraded" | "down";
  appId: string;
  deploymentId: string;
  dependencies: Record<string, "healthy" | "ready">;
}

export interface GeneratedRuntimeReadiness {
  ready: boolean;
  gates: string[];
}

export interface GeneratedRuntimeLogSample {
  appId: string;
  deploymentId: string;
  requestId: string;
  severity: "info" | "warning" | "error";
  message: string;
  timestamp: string;
}

export interface GeneratedRuntimeMetrics {
  requestCount: number;
  errorCount: number;
  latencyP95Ms: number;
  window: string;
}

export interface GeneratedRuntimeOpenApiContract {
  version: string;
  openapiPath: string;
  paths: string[];
  pathCount: number;
}

export interface GeneratedRuntimeMigrationDryRun {
  migrationId: string;
  deploymentId: string;
  status: "passed" | "blocked";
  destructiveChanges: string[];
  requiredApprovals: string[];
  approvalId?: string;
}

export interface GeneratedRuntimeOverview {
  projectId: string;
  appId: string;
  deploymentId: string;
  artifactContract: GeneratedRuntimeArtifactContract;
  container: GeneratedRuntimeContainerContract;
  schemaIsolation: GeneratedRuntimeSchemaIsolation;
  health: GeneratedRuntimeHealth;
  readiness: GeneratedRuntimeReadiness;
  logSample: GeneratedRuntimeLogSample;
  metrics: GeneratedRuntimeMetrics;
  openApi: GeneratedRuntimeOpenApiContract;
  migrationDryRun: GeneratedRuntimeMigrationDryRun;
}

export type StoreAppAccessStatus = "active" | "available" | "pending";
export type StorePrimaryAction = "open" | "request_access" | "view_status";
export type TicketType = "bug" | "feedback" | "feature" | "access_issue" | "data_issue" | "performance" | "other";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketStatus = "submitted" | "in_review" | "planned" | "resolved" | "closed";

export interface StorefrontAppCard {
  id: string;
  appId: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  ownerName: string;
  route: string;
  accessStatus: StoreAppAccessStatus;
  myRole?: string;
  health: Status;
  version: string;
  lastUpdated: string;
  primaryAction: StorePrimaryAction;
}

export interface StorefrontHome {
  profile: {
    userName: string;
    email: string;
  };
  myApps: StorefrontAppCard[];
  availableApps: StorefrontAppCard[];
  notifications: InAppNotification[];
}

export interface StorefrontAppDetail extends StorefrontAppCard {
  ownerUserId: string;
  department: string;
  accessMode: AppStoreRegistryEntry["accessMode"];
  releaseNotes: string[];
  supportContact: string;
  actions: Array<"open" | "request_access" | "submit_ticket" | "send_feedback" | "view_status">;
}

export interface StoreAccessRequestResult {
  id: string;
  appSlug: string;
  requestedRoleKey: string;
  requesterEmail: string;
  status: "pending";
  reason: string;
  department?: string;
  createdAt: string;
}

export interface SupportTicketTimelineEntry {
  id: string;
  ticketId: string;
  status: TicketStatus;
  label: string;
  actorId: string;
  occurredAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  appId: string;
  appSlug: string;
  projectId: string;
  submittedByUserId: string;
  submittedByEmail: string;
  type: TicketType;
  priority: TicketPriority;
  title: string;
  description: string;
  deviceInfo: string;
  screenshotUrl?: string;
  status: TicketStatus;
  assignedToUserId: string;
  createdAt: string;
  updatedAt: string;
  timeline: SupportTicketTimelineEntry[];
}

export interface TicketStatusView extends SupportTicket {
  appName: string;
}

export interface CreatorTicketInboxItem extends SupportTicket {
  appName: string;
  actions: Array<"reply" | "convert_to_prd_change" | "convert_to_ai_prompt" | "resolve">;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: "app_published" | "access_request" | "ticket_update";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export type PrdChangeSourceType = "ticket" | "prompt" | "manual";
export type PrdChangeStatus = "draft" | "pending_approval" | "approved" | "rejected" | "changes_requested";
export type PrdChangeRiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalDecision = "approved" | "rejected" | "changes_requested";

export interface PrdChangeDecision {
  id: string;
  changeId: string;
  decision: ApprovalDecision;
  note: string;
  decidedByUserId: string;
  decidedAt: string;
}

export interface PrdChangeRequest {
  id: string;
  projectId: string;
  sourceType: PrdChangeSourceType;
  sourceTicketId?: string;
  title: string;
  proposedRequirement: string;
  affectedSections: string[];
  acceptanceCriteria: string[];
  riskLevel: PrdChangeRiskLevel;
  status: PrdChangeStatus;
  requestedByUserId: string;
  approvedPrdVersionId?: string;
  createdAt: string;
  updatedAt: string;
  decisions: PrdChangeDecision[];
}

export interface PrdChangeDecisionResult {
  change: PrdChangeRequest;
  decision: PrdChangeDecision;
  prdVersion?: PrdVersion;
}

export type DomainMode = "internal" | "custom" | "public";
export type DomainRequestStatus = "pending_approval" | "approved" | "rejected";

export interface DomainSetting {
  id: string;
  projectId: string;
  internalPath: string;
  customDomain?: string;
  publicDomain?: string;
  mode: DomainMode;
  updatedAt: string;
}

export interface DomainRequest {
  id: string;
  projectId: string;
  domain: string;
  reason: string;
  intendedAudience: string;
  dataClassification: PlatformProject["dataSensitivity"];
  externalUserPolicy: string;
  checklistAccepted: boolean;
  status: DomainRequestStatus;
  requestedByUserId: string;
  decidedByUserId?: string;
  decisionNote?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface DeploymentTraceRecord {
  id: string;
  projectId: string;
  ticket: Pick<SupportTicket, "id" | "ticketNumber" | "title" | "status">;
  prdChange: Pick<PrdChangeRequest, "id" | "title" | "status" | "riskLevel">;
  prdVersion: Pick<PrdVersion, "id" | "version" | "changeSummary">;
  frontend: Pick<FrontendCheckpoint, "id" | "version" | "status">;
  manifest: Pick<AppManifest, "id" | "manifestVersion">;
  deployment: {
    deploymentId: string;
    publishRequestId: string;
    route: string;
    manifestVersion: string;
    publishedAt: string;
  };
  domain: Pick<DomainSetting, "internalPath" | "customDomain" | "publicDomain" | "mode">;
  auditEventIds: string[];
  generatedAt: string;
}

export interface MonitoringDashboard {
  serviceHealth: Array<{ name: string; status: Status; detail: string }>;
  appHealth: Array<{ app: string; status: Status; route: string }>;
  aiUsage: {
    providerCalls: number;
    guardrailEvents: number;
  };
  ticketCounts: {
    open: number;
    inReview: number;
    resolved: number;
  };
  domainRequests: {
    pending: number;
    approved: number;
    rejected: number;
  };
  recentAuditEvents: AuditEvent[];
}

export interface AuditFilterInput {
  actorId?: string;
  action?: string;
  projectId?: string;
  appId?: string;
  severity?: AuditEvent["severity"];
  dateFrom?: string;
  dateTo?: string;
}

export type AuthProviderType = "oidc" | "saml" | "keycloak";
export type AuthProviderStatus = "draft" | "ready" | "active" | "disabled";
export type PolicyClassification = PlatformProject["dataSensitivity"];

export interface AuthProviderConfig {
  id: string;
  type: AuthProviderType;
  name: string;
  status: AuthProviderStatus;
  issuerUrl?: string;
  entityId?: string;
  ssoUrl?: string;
  clientId?: string;
  clientSecretMasked?: string;
  clientSecretFingerprint?: string;
  certificateFingerprint?: string;
  scopes?: string[];
  groupRoleMapping: Record<string, PlatformRole[]>;
  createdByUserId: string;
  createdAt: string;
}

export interface KeycloakClientDefault {
  clientId: string;
  purpose: string;
  redirectUris: string[];
}

export interface KeycloakDefaults {
  strategy: "keycloak_broker_default";
  realm: string;
  baseUrl: string;
  clients: KeycloakClientDefault[];
  defaultGroups: Array<{ group: string; platformRoles: PlatformRole[] }>;
}

export interface DirectIdpConstraints {
  allowed: boolean;
  requiresSecurityReview: boolean;
  boundary: string;
  constraints: string[];
}

export interface PlatformAuthClaims {
  subject: string;
  email: string;
  name: string;
  groups: string[];
  platformRoles: PlatformRole[];
  appRoles: Record<string, string[]>;
}

export interface PlatformAuthSession {
  id: string;
  providerId: string;
  providerType: AuthProviderType;
  token: string;
  claims: PlatformAuthClaims;
  issuedAt: string;
  expiresAt: string;
}

export interface GeneratedAppSessionValidation {
  allowed: boolean;
  reason?: "invalid_session" | "missing_app_role";
  claims?: PlatformAuthClaims;
}

export interface BreakGlassSession {
  id: string;
  userId: string;
  reason: string;
  ticketRef?: string;
  token: string;
  ttlMinutes: number;
  issuedAt: string;
  expiresAt: string;
}

export interface PolicyTemplate {
  id: string;
  classification: PolicyClassification;
  label: string;
  requiredReviewers: string[];
  requiredChecks: string[];
  publishAllowed: boolean;
  externalExposureAllowed: boolean;
}

export type AiProviderAdapter = "openai" | "anthropic" | "google" | "azure_openai" | "mock";
export type AiProviderStatus = "active" | "disabled" | "warning" | "error";
export type AiUsageMode = "production" | "development" | "fallback";
export type AiScenario = "prd_generation" | "requirement_analysis" | "frontend_coding" | "backend_coding" | "review" | "documentation";
export type AgentRoleKey = "requirement_analyst" | "database_designer" | "frontend_developer" | "backend_developer" | "security_reviewer" | "technical_writer";
export type GuardrailDecision = "allow" | "warn" | "block";
export type GuardrailRuleType = "keyword" | "regex" | "policy";

export type KnowledgeSourceType = "pdf" | "markdown" | "text" | "word" | "excel" | "openapi_json";
export type KnowledgeSourceStatus = "draft" | "active" | "deprecated" | "archived";
export type KnowledgeUploadStatus = "pending" | "uploaded" | "failed";
export type KnowledgeIndexStatus = "pending" | "indexed" | "failed";
export type GovernanceApprovalDecision = "approved" | "rejected";
export type VersionApprovalStatus = "pending" | "approved" | "rejected";
export type VersionLifecycleStatus = "pending" | "active" | "superseded" | "rejected";

export interface GovernanceScope {
  visibility: "global" | "department" | "project" | "app" | "agent";
  department?: string;
  projectIds?: string[];
  appIds?: string[];
  agentRoles?: AgentRoleKey[];
  scenarios?: AiScenario[];
}

export interface KnowledgeSource {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  ownerUserId: string;
  scope: GovernanceScope;
  uploadStatus: KnowledgeUploadStatus;
  indexStatus: KnowledgeIndexStatus;
  status: KnowledgeSourceStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeVersion {
  id: string;
  sourceId: string;
  version: string;
  contentHash: string;
  changelog: string;
  chunkCount: number;
  excerpts: string[];
  approvalStatus: VersionApprovalStatus;
  lifecycleStatus: VersionLifecycleStatus;
  isActive: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface KnowledgeApproval {
  id: string;
  sourceId: string;
  versionId: string;
  decision: GovernanceApprovalDecision;
  note: string;
  decidedByUserId: string;
  decidedAt: string;
}

export interface KnowledgeRetrievalLog {
  id: string;
  actorUserId: string;
  projectId?: string;
  appId?: string;
  department?: string;
  agentRole: AgentRoleKey;
  scenario: AiScenario;
  matchedVersionIds: string[];
  deniedVersionIds: string[];
  retrievalContext: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeRetrievalSource {
  sourceId: string;
  versionId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  scope: GovernanceScope;
  excerpts: string[];
}

export interface KnowledgeRetrievalResult {
  scenario: AiScenario;
  agentRole: AgentRoleKey;
  matchedVersionIds: string[];
  deniedVersionIds: string[];
  deniedReasons: string[];
  sources: KnowledgeRetrievalSource[];
  retrievalLogId: string;
}

export type SkillStatus = "draft" | "active" | "disabled" | "deprecated";

export interface SkillDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  ownerUserId: string;
  status: SkillStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  instruction: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredKnowledgeSourceIds: string[];
  allowedTools: string[];
  contentHash: string;
  approvalStatus: VersionApprovalStatus;
  lifecycleStatus: VersionLifecycleStatus;
  isActive: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface SkillApproval {
  id: string;
  skillId: string;
  versionId: string;
  decision: GovernanceApprovalDecision;
  note: string;
  decidedByUserId: string;
  decidedAt: string;
}

export interface SkillAssignment {
  id: string;
  skillId: string;
  skillVersionId: string;
  agentRole: AgentRoleKey;
  scenario: AiScenario;
  scopeType: GovernanceScope["visibility"];
  scopeId: string;
  priority: number;
  status: "active" | "disabled";
  createdAt: string;
}

export interface SkillResolveResult {
  skillId: string;
  skillVersionId: string;
  assignmentId: string;
  skill?: SkillDefinition;
  version?: SkillVersion;
  assignment?: SkillAssignment;
  agentRole: AgentRoleKey;
  scenario: AiScenario;
  allowedTools: string[];
  requiredKnowledgeSourceIds: string[];
  reason?: string;
}

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

  filter(input: AuditFilterInput): AuditEvent[] {
    return this.events.filter((event) => {
      if (input.actorId && event.actorId !== input.actorId) return false;
      if (input.action && event.action !== input.action) return false;
      if (input.severity && event.severity !== input.severity) return false;
      if (input.projectId && event.metadata.projectId !== input.projectId) return false;
      if (input.appId && event.metadata.appId !== input.appId) return false;
      if (input.dateFrom && event.occurredAt < input.dateFrom) return false;
      if (input.dateTo && event.occurredAt > input.dateTo) return false;
      return true;
    });
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

export class PlatformAuthSsoService {
  private readonly providers: AuthProviderConfig[] = [];
  private readonly sessions: PlatformAuthSession[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  createOidcProvider(
    actor: PlatformUser,
    input: {
      name: string;
      issuerUrl: string;
      clientId: string;
      clientSecret: string;
      scopes: string[];
      groupRoleMapping: Record<string, PlatformRole[]>;
    }
  ): AuthProviderConfig {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.name.trim()) throw new ValidationError("OIDC provider name is required");
    if (!input.issuerUrl.trim()) throw new ValidationError("OIDC issuer URL is required");
    if (!input.clientId.trim()) throw new ValidationError("OIDC client ID is required");
    if (!input.clientSecret.trim()) throw new ValidationError("OIDC client secret is required");

    const provider: AuthProviderConfig = {
      id: `authprov_oidc_${String(this.providers.filter((candidate) => candidate.type === "oidc").length + 1).padStart(3, "0")}`,
      type: "oidc",
      name: input.name.trim(),
      status: "ready",
      issuerUrl: input.issuerUrl.trim(),
      clientId: input.clientId.trim(),
      clientSecretMasked: this.maskAuthSecret(input.clientSecret),
      clientSecretFingerprint: fingerprintSecret(input.clientSecret),
      scopes: [...input.scopes],
      groupRoleMapping: this.normalizeMapping(input.groupRoleMapping),
      createdByUserId: actor.id,
      createdAt: new Date().toISOString()
    };

    this.providers.push(provider);
    this.audit.record({
      actorId: actor.id,
      action: "auth.oidc_provider.created",
      resourceType: "auth_provider_config",
      resourceId: provider.id,
      severity: "high",
      metadata: { providerType: provider.type, issuerUrl: provider.issuerUrl, fingerprint: provider.clientSecretFingerprint }
    });
    return provider;
  }

  createSamlProvider(
    actor: PlatformUser,
    input: {
      name: string;
      entityId: string;
      ssoUrl: string;
      certificate: string;
      groupRoleMapping: Record<string, PlatformRole[]>;
    }
  ): AuthProviderConfig {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.name.trim()) throw new ValidationError("SAML provider name is required");
    if (!input.entityId.trim()) throw new ValidationError("SAML entity ID is required");
    if (!input.ssoUrl.trim()) throw new ValidationError("SAML SSO URL is required");
    if (!input.certificate.trim()) throw new ValidationError("SAML certificate is required");

    const provider: AuthProviderConfig = {
      id: `authprov_saml_${String(this.providers.filter((candidate) => candidate.type === "saml").length + 1).padStart(3, "0")}`,
      type: "saml",
      name: input.name.trim(),
      status: "ready",
      entityId: input.entityId.trim(),
      ssoUrl: input.ssoUrl.trim(),
      certificateFingerprint: fingerprintSecret(input.certificate),
      groupRoleMapping: this.normalizeMapping(input.groupRoleMapping),
      createdByUserId: actor.id,
      createdAt: new Date().toISOString()
    };

    this.providers.push(provider);
    this.audit.record({
      actorId: actor.id,
      action: "auth.saml_provider.created",
      resourceType: "auth_provider_config",
      resourceId: provider.id,
      severity: "high",
      metadata: { providerType: provider.type, entityId: provider.entityId, fingerprint: provider.certificateFingerprint }
    });
    return provider;
  }

  listProviders(actor: PlatformUser): AuthProviderConfig[] {
    this.auth.requireRole(actor, ["admin"]);
    return [this.keycloakProvider(actor.id), ...this.providers];
  }

  getKeycloakDefaults(actor: PlatformUser): KeycloakDefaults {
    this.auth.requireRole(actor, ["admin"]);
    return {
      strategy: "keycloak_broker_default",
      realm: "evcp",
      baseUrl: "http://keycloak:8080/realms/evcp",
      clients: [
        { clientId: "evcp-platform-api", purpose: "Platform API token validation", redirectUris: ["http://127.0.0.1:4100/*"] },
        { clientId: "evcp-admin-web", purpose: "Admin Console login", redirectUris: ["http://127.0.0.1:4100/*"] },
        { clientId: "evcp-creator-web", purpose: "Creator Workspace login", redirectUris: ["http://127.0.0.1:4101/*"] },
        { clientId: "evcp-generated-app", purpose: "Generated app Platform Auth SDK", redirectUris: ["/apps/*"] }
      ],
      defaultGroups: [
        { group: "evcp-admins", platformRoles: ["admin"] },
        { group: "evcp-creators", platformRoles: ["creator"] },
        { group: "evcp-users", platformRoles: ["end_user"] }
      ]
    };
  }

  getDirectIdpConstraints(actor: PlatformUser): DirectIdpConstraints {
    this.auth.requireRole(actor, ["admin"]);
    return {
      allowed: true,
      requiresSecurityReview: true,
      boundary: "Direct IdP integrations must still terminate into the Platform Auth session and claims contract.",
      constraints: [
        "Generated apps must never integrate directly with external IdP.",
        "OIDC/SAML claim mapping must match Keycloak-backed Platform Auth claims.",
        "Secrets and certificates must be masked and fingerprinted in API/UI responses.",
        "Security Admin review is required before activating direct IdP mode."
      ]
    };
  }

  simulateLogin(
    actor: PlatformUser,
    input: {
      providerId: string;
      subject: string;
      email: string;
      name: string;
      groups: string[];
      appRoles?: Record<string, string[]>;
    }
  ): PlatformAuthSession {
    this.auth.requireRole(actor, ["admin"]);
    const provider = this.requireProvider(input.providerId);
    if (!input.subject.trim()) throw new ValidationError("Auth subject is required");
    if (!input.email.trim()) throw new ValidationError("Auth email is required");

    const issuedAt = new Date();
    const claims: PlatformAuthClaims = {
      subject: input.subject.trim(),
      email: input.email.trim(),
      name: input.name.trim() || input.email.trim(),
      groups: [...input.groups],
      platformRoles: this.mapPlatformRoles(provider.groupRoleMapping, input.groups),
      appRoles: input.appRoles ?? {}
    };
    const session: PlatformAuthSession = {
      id: `psess_${String(this.sessions.length + 1).padStart(4, "0")}`,
      providerId: provider.id,
      providerType: provider.type,
      token: `psess_${fingerprintSecret(`${provider.id}:${claims.subject}:${this.sessions.length + 1}`).slice(3)}`,
      claims,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 60 * 60 * 1000).toISOString()
    };

    this.sessions.push(session);
    this.audit.record({
      actorId: actor.id,
      action: "auth.sso_login.succeeded",
      resourceType: "platform_auth_session",
      resourceId: session.id,
      metadata: { providerId: provider.id, providerType: provider.type, email: claims.email, platformRoles: claims.platformRoles }
    });
    return session;
  }

  validateGeneratedAppSession(token: string, input: { appSlug: string; requiredRole?: string }): GeneratedAppSessionValidation {
    const session = this.sessions.find((candidate) => candidate.token === token);
    if (!session) return { allowed: false, reason: "invalid_session" };
    const roles = session.claims.appRoles[input.appSlug] ?? [];
    if (input.requiredRole && !roles.includes(input.requiredRole)) {
      return { allowed: false, reason: "missing_app_role", claims: session.claims };
    }
    return { allowed: true, claims: session.claims };
  }

  private keycloakProvider(createdByUserId = "system"): AuthProviderConfig {
    return {
      id: "authprov_keycloak_default_001",
      type: "keycloak",
      name: "Bundled Keycloak Default",
      status: "active",
      issuerUrl: "http://keycloak:8080/realms/evcp",
      groupRoleMapping: {
        "evcp-admins": ["admin"],
        "evcp-creators": ["creator"],
        "evcp-users": ["end_user"]
      },
      createdByUserId,
      createdAt: new Date("2026-09-07T00:00:00.000Z").toISOString()
    };
  }

  private requireProvider(providerId: string): AuthProviderConfig {
    if (providerId === "authprov_keycloak_default_001") return this.keycloakProvider();
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) throw new ValidationError(`Unknown auth provider: ${providerId}`);
    return provider;
  }

  private mapPlatformRoles(mapping: Record<string, PlatformRole[]>, groups: string[]): PlatformRole[] {
    const roles = groups.flatMap((group) => mapping[group] ?? []);
    return [...new Set(roles)];
  }

  private normalizeMapping(mapping: Record<string, PlatformRole[]>): Record<string, PlatformRole[]> {
    return Object.fromEntries(Object.entries(mapping).map(([group, roles]) => [group, [...new Set(roles)]]));
  }

  private maskAuthSecret(secret: string): string {
    return `************${secret.slice(-4)}`;
  }
}

export class BreakGlassService {
  private readonly sessions: BreakGlassSession[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  login(actor: PlatformUser, input: { reason: string; ticketRef?: string }): BreakGlassSession {
    this.auth.requireRole(actor, ["admin"]);
    const reason = input.reason.trim();
    if (!reason) throw new ValidationError("Break-glass reason is required");

    const issuedAt = new Date();
    const session: BreakGlassSession = {
      id: `breakglass_${String(this.sessions.length + 1).padStart(4, "0")}`,
      userId: actor.id,
      reason,
      ticketRef: input.ticketRef?.trim() || undefined,
      token: `breakglass_${fingerprintSecret(`${actor.id}:${reason}:${this.sessions.length + 1}`).slice(3)}`,
      ttlMinutes: 15,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000).toISOString()
    };

    this.sessions.push(session);
    this.audit.record({
      actorId: actor.id,
      action: "auth.break_glass_used",
      resourceType: "break_glass_session",
      resourceId: session.id,
      severity: "critical",
      metadata: { reason, ticketRef: session.ticketRef, ttlMinutes: session.ttlMinutes }
    });
    return session;
  }

  listSessions(actor: PlatformUser): BreakGlassSession[] {
    this.auth.requireRole(actor, ["admin"]);
    return [...this.sessions];
  }
}

export class PolicyTemplateService {
  private readonly templates: PolicyTemplate[] = [
    {
      id: "policy_public_default",
      classification: "public",
      label: "Public",
      requiredReviewers: [],
      requiredChecks: ["auth_session_required"],
      publishAllowed: true,
      externalExposureAllowed: true
    },
    {
      id: "policy_internal_default",
      classification: "internal",
      label: "Internal",
      requiredReviewers: ["Project Owner"],
      requiredChecks: ["auth_session_required", "app_role_required"],
      publishAllowed: true,
      externalExposureAllowed: true
    },
    {
      id: "policy_confidential_default",
      classification: "confidential",
      label: "Confidential",
      requiredReviewers: ["Project Owner", "Security Admin"],
      requiredChecks: ["auth_session_required", "app_role_required", "audit_high_severity"],
      publishAllowed: true,
      externalExposureAllowed: false
    },
    {
      id: "policy_restricted_default",
      classification: "restricted",
      label: "Restricted",
      requiredReviewers: ["Project Owner", "Security Admin", "Platform Admin"],
      requiredChecks: ["auth_session_required", "app_role_required", "audit_high_severity", "break_glass_disabled"],
      publishAllowed: false,
      externalExposureAllowed: false
    }
  ];

  constructor(private readonly auth: MockAuthService) {}

  listTemplates(actor: PlatformUser): PolicyTemplate[] {
    this.auth.requireRole(actor, ["admin"]);
    return [...this.templates];
  }

  evaluate(actor: PlatformUser, input: { classification: PolicyClassification; action: string }): PolicyTemplate {
    this.auth.requireRole(actor, ["admin"]);
    const template = this.templates.find((candidate) => candidate.classification === input.classification);
    if (!template) throw new ValidationError(`Unknown policy classification: ${input.classification}`);
    return template;
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

  getProjectById(projectId: string): PlatformProject {
    const project = this.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new ValidationError(`Unknown project: ${projectId}`);
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

export class KnowledgeGovernanceService {
  private readonly sources: KnowledgeSource[] = [];
  private readonly versions: KnowledgeVersion[] = [];
  private readonly approvals: KnowledgeApproval[] = [];
  private readonly retrievalLogs: KnowledgeRetrievalLog[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService
  ) {}

  createSource(
    actor: PlatformUser,
    input: {
      title: string;
      sourceType: KnowledgeSourceType;
      ownerUserId: string;
      scope: GovernanceScope;
      uploadStatus?: KnowledgeUploadStatus;
      indexStatus?: KnowledgeIndexStatus;
      tags?: string[];
    }
  ): KnowledgeSource {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.title.trim()) throw new ValidationError("Knowledge source title is required");

    const now = new Date().toISOString();
    const source: KnowledgeSource = {
      id: slugId("knsrc", input.title),
      title: input.title,
      sourceType: input.sourceType,
      ownerUserId: input.ownerUserId,
      scope: {
        ...input.scope,
        projectIds: [...(input.scope.projectIds ?? [])],
        appIds: [...(input.scope.appIds ?? [])],
        agentRoles: [...(input.scope.agentRoles ?? [])],
        scenarios: [...(input.scope.scenarios ?? [])]
      },
      uploadStatus: input.uploadStatus ?? "pending",
      indexStatus: input.indexStatus ?? "pending",
      status: "draft",
      tags: [...(input.tags ?? [])],
      createdAt: now,
      updatedAt: now
    };

    const existing = this.sources.findIndex((candidate) => candidate.id === source.id);
    if (existing >= 0) this.sources[existing] = source;
    else this.sources.push(source);

    this.audit.record({
      actorId: actor.id,
      action: "knowledge.source.created",
      resourceType: "knowledge_source",
      resourceId: source.id,
      metadata: { sourceType: source.sourceType, scope: source.scope }
    });

    return source;
  }

  listSources(actor: PlatformUser): KnowledgeSource[] {
    this.auth.requireRole(actor, ["admin"]);
    return [...this.sources];
  }

  submitVersion(
    actor: PlatformUser,
    sourceId: string,
    input: {
      version?: string;
      contentHash: string;
      changelog: string;
      chunkCount: number;
      excerpts?: string[];
    }
  ): KnowledgeVersion {
    this.auth.requireRole(actor, ["admin"]);
    const source = this.requireSource(sourceId);
    if (!input.contentHash.trim()) throw new ValidationError("Knowledge version content hash is required");
    if (!input.changelog.trim()) throw new ValidationError("Knowledge version changelog is required");

    const versionNumber = this.versions.filter((candidate) => candidate.sourceId === sourceId).length + 1;
    const version: KnowledgeVersion = {
      id: `${sourceId}_${input.version ?? `v${versionNumber}`}`,
      sourceId,
      version: input.version ?? `v${versionNumber}`,
      contentHash: input.contentHash,
      changelog: input.changelog,
      chunkCount: input.chunkCount,
      excerpts: [...(input.excerpts ?? [])],
      approvalStatus: "pending",
      lifecycleStatus: "pending",
      isActive: false,
      createdByUserId: actor.id,
      createdAt: new Date().toISOString()
    };

    this.versions.push(version);
    source.updatedAt = version.createdAt;
    this.audit.record({
      actorId: actor.id,
      action: "knowledge.version.submitted",
      resourceType: "knowledge_version",
      resourceId: version.id,
      metadata: { sourceId, contentHash: version.contentHash }
    });

    return version;
  }

  approveVersion(
    actor: PlatformUser,
    input: { versionId: string; decision: GovernanceApprovalDecision; note?: string }
  ): { version: KnowledgeVersion; approval: KnowledgeApproval; auditEventId: string } {
    this.auth.requireRole(actor, ["admin"]);
    const version = this.requireVersion(input.versionId);
    const source = this.requireSource(version.sourceId);
    const decidedAt = new Date().toISOString();

    if (input.decision === "approved") {
      for (const candidate of this.versions.filter((item) => item.sourceId === version.sourceId && item.isActive)) {
        candidate.isActive = false;
        candidate.lifecycleStatus = "superseded";
      }
      version.approvalStatus = "approved";
      version.lifecycleStatus = "active";
      version.isActive = true;
      version.approvedByUserId = actor.id;
      version.approvedAt = decidedAt;
      source.status = "active";
      source.updatedAt = decidedAt;
    } else {
      version.approvalStatus = "rejected";
      version.lifecycleStatus = "rejected";
      version.isActive = false;
    }

    const approval: KnowledgeApproval = {
      id: `knapp_${String(this.approvals.length + 1).padStart(4, "0")}`,
      sourceId: source.id,
      versionId: version.id,
      decision: input.decision,
      note: input.note ?? "",
      decidedByUserId: actor.id,
      decidedAt
    };
    this.approvals.push(approval);

    const auditEvent = this.audit.record({
      actorId: actor.id,
      action: `knowledge.version.${input.decision}`,
      resourceType: "knowledge_version",
      resourceId: version.id,
      metadata: { sourceId: source.id, note: approval.note, lifecycleStatus: version.lifecycleStatus }
    });

    return { version, approval, auditEventId: auditEvent.id };
  }

  retrieve(
    actor: PlatformUser,
    input: {
      projectId?: string;
      appId?: string;
      department?: string;
      agentRole: AgentRoleKey;
      scenario: AiScenario;
      query?: string;
      requiredKnowledgeSourceIds?: string[];
    }
  ): KnowledgeRetrievalResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = input.projectId ? this.projects.getProjectForActor(actor, input.projectId) : undefined;
    const department = input.department ?? project?.targetDepartment;
    const appId = input.appId ?? project?.appId;
    const required = new Set(input.requiredKnowledgeSourceIds ?? []);
    const matched: KnowledgeRetrievalSource[] = [];
    const deniedVersionIds: string[] = [];
    const deniedReasons: string[] = [];

    for (const version of this.versions.filter((candidate) => candidate.approvalStatus === "approved" && candidate.lifecycleStatus === "active" && candidate.isActive)) {
      const source = this.requireSource(version.sourceId);
      if (source.status !== "active" || source.indexStatus !== "indexed") continue;
      if (required.size > 0 && !required.has(source.id)) continue;
      const mismatch = this.scopeMismatch(source.scope, {
        projectId: input.projectId,
        appId,
        department,
        agentRole: input.agentRole,
        scenario: input.scenario
      });
      if (mismatch) {
        deniedVersionIds.push(version.id);
        deniedReasons.push(`${source.title}: ${mismatch}`);
        continue;
      }
      matched.push({
        sourceId: source.id,
        versionId: version.id,
        title: source.title,
        sourceType: source.sourceType,
        scope: source.scope,
        excerpts: version.excerpts
      });
    }

    const log: KnowledgeRetrievalLog = {
      id: `knret_${String(this.retrievalLogs.length + 1).padStart(4, "0")}`,
      actorUserId: actor.id,
      projectId: input.projectId,
      appId,
      department,
      agentRole: input.agentRole,
      scenario: input.scenario,
      matchedVersionIds: matched.map((source) => source.versionId),
      deniedVersionIds,
      retrievalContext: {
        query: input.query ?? "",
        requiredKnowledgeSourceIds: [...required]
      },
      createdAt: new Date().toISOString()
    };
    this.retrievalLogs.push(log);
    this.audit.record({
      actorId: actor.id,
      action: matched.length > 0 ? "knowledge.retrieved" : "knowledge.retrieval.denied",
      resourceType: "knowledge_retrieval_log",
      resourceId: log.id,
      severity: matched.length > 0 ? "info" : "warning",
      metadata: {
        projectId: input.projectId,
        appId,
        matchedVersionIds: log.matchedVersionIds,
        deniedVersionIds,
        deniedReasons
      }
    });

    return {
      scenario: input.scenario,
      agentRole: input.agentRole,
      matchedVersionIds: log.matchedVersionIds,
      deniedVersionIds,
      deniedReasons,
      sources: matched,
      retrievalLogId: log.id
    };
  }

  listRetrievalLogs(actor: PlatformUser): KnowledgeRetrievalLog[] {
    this.auth.requireRole(actor, ["admin"]);
    return [...this.retrievalLogs];
  }

  private scopeMismatch(
    scope: GovernanceScope,
    input: { projectId?: string; appId?: string; department?: string; agentRole: AgentRoleKey; scenario: AiScenario }
  ): string | undefined {
    if (scope.scenarios?.length && !scope.scenarios.includes(input.scenario)) return `scenario mismatch: ${input.scenario}`;
    if (scope.agentRoles?.length && !scope.agentRoles.includes(input.agentRole)) return `agent role mismatch: ${input.agentRole}`;
    if (scope.visibility === "department" || scope.department) {
      if (scope.department && scope.department !== input.department) return `department mismatch: ${input.department ?? "unknown"}`;
    }
    if (scope.visibility === "project" || scope.projectIds?.length) {
      if (scope.projectIds?.length && (!input.projectId || !scope.projectIds.includes(input.projectId))) return `project mismatch: ${input.projectId ?? "unknown"}`;
    }
    if (scope.visibility === "app" || scope.appIds?.length) {
      if (scope.appIds?.length && (!input.appId || !scope.appIds.includes(input.appId))) return `app mismatch: ${input.appId ?? "unknown"}`;
    }
    return undefined;
  }

  private requireSource(sourceId: string): KnowledgeSource {
    const source = this.sources.find((candidate) => candidate.id === sourceId);
    if (!source) throw new ValidationError(`Unknown knowledge source: ${sourceId}`);
    return source;
  }

  private requireVersion(versionId: string): KnowledgeVersion {
    const version = this.versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new ValidationError(`Unknown knowledge version: ${versionId}`);
    return version;
  }
}

export class SkillGovernanceService {
  private readonly skills: SkillDefinition[] = [];
  private readonly versions: SkillVersion[] = [];
  private readonly approvals: SkillApproval[] = [];
  private readonly assignments: SkillAssignment[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService
  ) {}

  createSkill(actor: PlatformUser, input: { key: string; name: string; description?: string; ownerUserId: string }): SkillDefinition {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.key.trim()) throw new ValidationError("Skill key is required");
    if (!input.name.trim()) throw new ValidationError("Skill name is required");

    const now = new Date().toISOString();
    const skill: SkillDefinition = {
      id: slugId("skdef", input.key),
      key: input.key,
      name: input.name,
      description: input.description ?? "",
      ownerUserId: input.ownerUserId,
      status: "draft",
      createdAt: now,
      updatedAt: now
    };

    const existing = this.skills.findIndex((candidate) => candidate.id === skill.id);
    if (existing >= 0) this.skills[existing] = skill;
    else this.skills.push(skill);

    this.audit.record({
      actorId: actor.id,
      action: "skill.created",
      resourceType: "skill_definition",
      resourceId: skill.id,
      metadata: { key: skill.key }
    });

    return skill;
  }

  listSkills(actor: PlatformUser): SkillDefinition[] {
    this.auth.requireRole(actor, ["admin"]);
    return [...this.skills];
  }

  submitVersion(
    actor: PlatformUser,
    skillId: string,
    input: {
      version?: string;
      instruction: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
      requiredKnowledgeSourceIds?: string[];
      allowedTools?: string[];
    }
  ): SkillVersion {
    this.auth.requireRole(actor, ["admin"]);
    const skill = this.requireSkill(skillId);
    if (!input.instruction.trim()) throw new ValidationError("Skill instruction is required");

    const versionNumber = this.versions.filter((candidate) => candidate.skillId === skillId).length + 1;
    const versionName = input.version ?? `v${versionNumber}`;
    const contentHash = createHash("sha256")
      .update(JSON.stringify({ instruction: input.instruction, inputSchema: input.inputSchema, outputSchema: input.outputSchema }))
      .digest("hex");
    const version: SkillVersion = {
      id: `${skill.id}_${versionName}`,
      skillId,
      version: versionName,
      instruction: input.instruction,
      inputSchema: { ...input.inputSchema },
      outputSchema: { ...input.outputSchema },
      requiredKnowledgeSourceIds: [...(input.requiredKnowledgeSourceIds ?? [])],
      allowedTools: [...(input.allowedTools ?? [])],
      contentHash: `sha256:${contentHash}`,
      approvalStatus: "pending",
      lifecycleStatus: "pending",
      isActive: false,
      createdByUserId: actor.id,
      createdAt: new Date().toISOString()
    };

    this.versions.push(version);
    skill.updatedAt = version.createdAt;
    this.audit.record({
      actorId: actor.id,
      action: "skill.version.submitted",
      resourceType: "skill_version",
      resourceId: version.id,
      metadata: { skillId, contentHash: version.contentHash }
    });

    return version;
  }

  approveVersion(
    actor: PlatformUser,
    input: { versionId: string; decision: GovernanceApprovalDecision; note?: string }
  ): { version: SkillVersion; approval: SkillApproval; auditEventId: string } {
    this.auth.requireRole(actor, ["admin"]);
    const version = this.requireVersion(input.versionId);
    const skill = this.requireSkill(version.skillId);
    const decidedAt = new Date().toISOString();

    if (input.decision === "approved") {
      for (const candidate of this.versions.filter((item) => item.skillId === version.skillId && item.isActive)) {
        candidate.isActive = false;
        candidate.lifecycleStatus = "superseded";
      }
      version.approvalStatus = "approved";
      version.lifecycleStatus = "active";
      version.isActive = true;
      version.approvedByUserId = actor.id;
      version.approvedAt = decidedAt;
      skill.status = "active";
      skill.updatedAt = decidedAt;
    } else {
      version.approvalStatus = "rejected";
      version.lifecycleStatus = "rejected";
      version.isActive = false;
    }

    const approval: SkillApproval = {
      id: `skapp_${String(this.approvals.length + 1).padStart(4, "0")}`,
      skillId: skill.id,
      versionId: version.id,
      decision: input.decision,
      note: input.note ?? "",
      decidedByUserId: actor.id,
      decidedAt
    };
    this.approvals.push(approval);
    const auditEvent = this.audit.record({
      actorId: actor.id,
      action: `skill.version.${input.decision}`,
      resourceType: "skill_version",
      resourceId: version.id,
      metadata: { skillId: skill.id, note: approval.note, lifecycleStatus: version.lifecycleStatus }
    });

    return { version, approval, auditEventId: auditEvent.id };
  }

  assign(
    actor: PlatformUser,
    input: {
      skillVersionId: string;
      agentRole: AgentRoleKey;
      scenario: AiScenario;
      scopeType: GovernanceScope["visibility"];
      scopeId: string;
      priority?: number;
    }
  ): SkillAssignment {
    this.auth.requireRole(actor, ["admin"]);
    const version = this.requireVersion(input.skillVersionId);
    if (version.approvalStatus !== "approved" || version.lifecycleStatus !== "active") {
      throw new ValidationError(`Skill version ${version.id} is not approved active`);
    }

    const assignment: SkillAssignment = {
      id: `skassign_${String(this.assignments.length + 1).padStart(4, "0")}`,
      skillId: version.skillId,
      skillVersionId: version.id,
      agentRole: input.agentRole,
      scenario: input.scenario,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      priority: input.priority ?? 0,
      status: "active",
      createdAt: new Date().toISOString()
    };
    this.assignments.push(assignment);
    this.audit.record({
      actorId: actor.id,
      action: "skill.assignment.created",
      resourceType: "skill_assignment",
      resourceId: assignment.id,
      metadata: { skillId: assignment.skillId, skillVersionId: assignment.skillVersionId, scopeType: assignment.scopeType, scopeId: assignment.scopeId }
    });
    return assignment;
  }

  resolve(
    actor: PlatformUser,
    input: {
      projectId?: string;
      appId?: string;
      department?: string;
      agentRole: AgentRoleKey;
      scenario: AiScenario;
    }
  ): SkillResolveResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = input.projectId ? this.projects.getProjectForActor(actor, input.projectId) : undefined;
    const department = input.department ?? project?.targetDepartment;
    const appId = input.appId ?? project?.appId;

    const candidates = this.assignments
      .filter((assignment) => assignment.status === "active" && assignment.agentRole === input.agentRole && assignment.scenario === input.scenario)
      .filter((assignment) => this.assignmentMatches(assignment, { projectId: input.projectId, appId, department }))
      .map((assignment) => {
        const version = this.versions.find((candidate) => candidate.id === assignment.skillVersionId);
        const skill = version ? this.skills.find((candidate) => candidate.id === version.skillId) : undefined;
        return { assignment, version, skill };
      })
      .filter(({ version, skill }) => skill?.status === "active" && version?.approvalStatus === "approved" && version.lifecycleStatus === "active" && version.isActive)
      .sort((left, right) => right.assignment.priority - left.assignment.priority);

    const selected = candidates[0];
    if (!selected?.version || !selected.skill) {
      this.audit.record({
        actorId: actor.id,
        action: "skill.resolve.denied",
        resourceType: "skill_assignment",
        resourceId: `${input.agentRole}:${input.scenario}`,
        severity: "warning",
        metadata: { projectId: input.projectId, appId, department }
      });
      throw new ValidationError(`No approved active skill for ${input.agentRole} / ${input.scenario}`);
    }

    this.audit.record({
      actorId: actor.id,
      action: "skill.resolved",
      resourceType: "skill_assignment",
      resourceId: selected.assignment.id,
      metadata: { projectId: input.projectId, skillVersionId: selected.version.id }
    });

    return {
      skillId: selected.skill.id,
      skillVersionId: selected.version.id,
      assignmentId: selected.assignment.id,
      skill: selected.skill,
      version: selected.version,
      assignment: selected.assignment,
      agentRole: input.agentRole,
      scenario: input.scenario,
      allowedTools: selected.version.allowedTools,
      requiredKnowledgeSourceIds: selected.version.requiredKnowledgeSourceIds
    };
  }

  disableSkill(actor: PlatformUser, skillId: string, reason = ""): SkillDefinition {
    this.auth.requireRole(actor, ["admin"]);
    const skill = this.requireSkill(skillId);
    skill.status = "disabled";
    skill.updatedAt = new Date().toISOString();
    this.audit.record({
      actorId: actor.id,
      action: "skill.disabled",
      resourceType: "skill_definition",
      resourceId: skill.id,
      severity: "warning",
      metadata: { reason }
    });
    return skill;
  }

  private assignmentMatches(assignment: SkillAssignment, input: { projectId?: string; appId?: string; department?: string }): boolean {
    if (assignment.scopeType === "global") return true;
    if (assignment.scopeType === "project") return assignment.scopeId === input.projectId;
    if (assignment.scopeType === "app") return assignment.scopeId === input.appId;
    if (assignment.scopeType === "department") return assignment.scopeId === input.department;
    return true;
  }

  private requireSkill(skillId: string): SkillDefinition {
    const skill = this.skills.find((candidate) => candidate.id === skillId);
    if (!skill) throw new ValidationError(`Unknown skill: ${skillId}`);
    return skill;
  }

  private requireVersion(versionId: string): SkillVersion {
    const version = this.versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new ValidationError(`Unknown skill version: ${versionId}`);
    return version;
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

  createVersionFromChange(actor: PlatformUser, projectId: string, change: PrdChangeRequest): PrdVersion {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const document = this.getDocumentForActor(actor, project.id);
    const current = document.versions.find((candidate) => candidate.id === document.currentVersionId);
    if (!current) throw new ValidationError(`No current PRD version for project ${projectId}`);

    const now = new Date().toISOString();
    const approvedCount = document.versions.filter((version) => version.version.startsWith("1.")).length;
    const versionNumber = `1.${Math.max(approvedCount, 1)}`;
    const version: PrdVersion = {
      id: `prdver_${project.id}_change_${String(approvedCount).padStart(2, "0")}`,
      projectId: project.id,
      version: versionNumber,
      status: "baseline",
      isBaseline: false,
      sourcePrompt: `Approved PRD change ${change.id}`,
      changeSummary: change.title,
      generatedBy: {
        scenario: "requirement_analysis",
        providerId: "human_approval",
        model: "creator_review"
      },
      sections: current.sections.map((section) => ({
        ...section,
        id: `${section.id}_${change.id}`,
        body: change.affectedSections.includes(section.key)
          ? `${section.body}\n\nApproved change ${change.id}: ${change.proposedRequirement}`
          : section.body
      })),
      createdByUserId: actor.id,
      createdAt: now
    };

    document.currentVersionId = version.id;
    document.versions.push(version);
    document.updatedAt = now;

    this.audit.record({
      actorId: actor.id,
      action: "prd.version.created_from_change",
      resourceType: "prd_version",
      resourceId: version.id,
      severity: "high",
      metadata: { projectId: project.id, prdChangeId: change.id }
    });

    return version;
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
    return this.getSnapshotForProject(project);
  }

  getSnapshotForProject(project: PlatformProject): AppAccessSnapshot {
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

  getMemberForEmail(project: PlatformProject, email: string): AppMemberRecord | undefined {
    const snapshot = this.getSnapshotForProject(project);
    return snapshot.members.find((member) => member.email === email && member.status === "active");
  }

  getPendingRequestForEmail(project: PlatformProject, email: string, roleKey?: string): AppAccessRequest | undefined {
    const snapshot = this.getSnapshotForProject(project);
    return snapshot.accessRequests.find(
      (request) =>
        request.requesterEmail === email &&
        request.status === "pending" &&
        (!roleKey || request.requestedRoleKey === roleKey)
    );
  }

  createStoreAccessRequest(
    actor: PlatformUser,
    project: PlatformProject,
    input: {
      requestedRoleKey: string;
      reason: string;
      department?: string;
    }
  ): StoreAccessRequestResult {
    this.auth.requireRole(actor, ["end_user"]);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);
    this.requireRoleKey(app.id, input.requestedRoleKey);

    const existing = this.getPendingRequestForEmail(project, actor.email, input.requestedRoleKey);
    if (existing) {
      return {
        id: existing.id,
        appSlug: project.slug,
        requestedRoleKey: existing.requestedRoleKey,
        requesterEmail: existing.requesterEmail,
        status: "pending",
        reason: existing.reason,
        department: typeof existing.reason === "string" && input.department ? input.department : undefined,
        createdAt: existing.createdAt
      };
    }

    const accessRequest: AppAccessRequest = {
      id: `appreq_${app.id}_${String(this.accessRequests.length + 1).padStart(4, "0")}`,
      appId: app.id,
      projectId: project.id,
      requesterEmail: actor.email,
      requestedRoleKey: input.requestedRoleKey,
      reason: input.reason.trim() || "Access requested from App Store",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    this.accessRequests.push(accessRequest);
    this.audit.record({
      actorId: actor.id,
      action: "store.access_request.created",
      resourceType: "app_access_request",
      resourceId: accessRequest.id,
      metadata: { projectId: project.id, requestedRoleKey: input.requestedRoleKey, department: input.department }
    });

    return {
      id: accessRequest.id,
      appSlug: project.slug,
      requestedRoleKey: accessRequest.requestedRoleKey,
      requesterEmail: accessRequest.requesterEmail,
      status: "pending",
      reason: accessRequest.reason,
      department: input.department,
      createdAt: accessRequest.createdAt
    };
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
      projectId: review.project.id,
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

  getLatestDeploymentForProject(actor: PlatformUser, projectId: string): DeploymentRecord {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const deployment = [...this.deployments].reverse().find((candidate) => candidate.projectId === projectId);
    if (!deployment) throw new ValidationError(`No deployment record for project ${projectId}`);
    return deployment;
  }

  getManifestForProject(actor: PlatformUser, projectId: string): AppManifest {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const manifest = [...this.manifests].reverse().find((candidate) => candidate.projectId === projectId);
    if (!manifest) throw new ValidationError(`No app manifest for project ${projectId}`);
    return manifest;
  }

  getRegistryEntryForProject(actor: PlatformUser, projectId: string): AppStoreRegistryEntry {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const entry = this.registry.find((candidate) => candidate.projectId === projectId);
    if (!entry) throw new ValidationError(`No App Store registry entry for project ${projectId}`);
    return entry;
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

export class GeneratedAppRuntimeService {
  private readonly requiredPaths = [
    "app.manifest.json",
    "package.json",
    "frontend/",
    "backend/",
    "prisma/",
    "openapi/",
    "tests/",
    "README.md"
  ];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly publish: PublishService
  ) {}

  getRuntimeOverview(actor: PlatformUser, projectId: string): GeneratedRuntimeOverview {
    this.auth.requireRole(actor, ["admin"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const manifest = this.publish.getManifestForProject(actor, project.id);
    const deployment = this.publish.getLatestDeploymentForProject(actor, project.id);
    const slug = manifest.app.slug;
    const schemaName = manifest.database.schemaName;
    const dbUser = `app_user_${slug.replace(/[^a-z0-9]+/gi, "_")}`;
    const timestamp = deployment.publishedAt;

    return {
      projectId: project.id,
      appId: manifest.appId,
      deploymentId: deployment.id,
      artifactContract: {
        root: `generated-apps/${slug}`,
        requiredPaths: [...this.requiredPaths]
      },
      container: {
        status: "running",
        containerName: `evcp-app-${slug}-${deployment.id}`,
        imageTag: `${slug}:${manifest.manifestVersion}`,
        route: deployment.route,
        healthEndpoint: `/apps/${slug}/health`,
        readyEndpoint: `/apps/${slug}/ready`,
        metricsEndpoint: `/apps/${slug}/metrics`
      },
      schemaIsolation: {
        schemaName,
        dbUser,
        allowedSchemas: [schemaName],
        deniedSchemas: ["public", "platform", "app_payroll"]
      },
      health: {
        status: "healthy",
        appId: manifest.appId,
        deploymentId: deployment.id,
        dependencies: {
          database: "healthy",
          platformAuth: "ready",
          route: "ready"
        }
      },
      readiness: {
        ready: true,
        gates: ["artifact_contract_present", "migrations_applied", "schema_grant_active", "platform_auth_ready", "route_registered"]
      },
      logSample: {
        appId: manifest.appId,
        deploymentId: deployment.id,
        requestId: `req_${slug.replace(/[^a-z0-9]+/gi, "_")}_001`,
        severity: "info",
        message: "Generated app runtime accepted authenticated request",
        timestamp
      },
      metrics: {
        requestCount: 128,
        errorCount: 0,
        latencyP95Ms: 42,
        window: "last_15m"
      },
      openApi: {
        version: "1.0.0",
        openapiPath: `generated-apps/${slug}/openapi/openapi.json`,
        paths: ["/api/leave-requests", "/api/leave-requests/{id}", "/api/approval-steps", "/api/runtime/health"],
        pathCount: 4
      },
      migrationDryRun: {
        migrationId: `mig_${slug.replace(/[^a-z0-9]+/gi, "_")}_baseline`,
        deploymentId: deployment.id,
        status: "passed",
        destructiveChanges: [],
        requiredApprovals: []
      }
    };
  }

  checkSchemaAccess(
    actor: PlatformUser,
    projectId: string,
    input: { attemptedSchema: string; operation: string }
  ): GeneratedRuntimeSchemaAccessCheck {
    const runtime = this.getRuntimeOverview(actor, projectId);
    const attemptedSchema = input.attemptedSchema.trim();
    const operation = input.operation.trim() || "select";
    const allowed = runtime.schemaIsolation.allowedSchemas.includes(attemptedSchema);
    const result: GeneratedRuntimeSchemaAccessCheck = {
      projectId: runtime.projectId,
      attemptedSchema,
      operation,
      allowed,
      reason: allowed ? "assigned_schema_allowed" : "cross_schema_access_denied",
      evidence: allowed
        ? `${runtime.schemaIsolation.dbUser} may ${operation} within ${runtime.schemaIsolation.schemaName}`
        : `${runtime.schemaIsolation.dbUser} is scoped to ${runtime.schemaIsolation.schemaName} and cannot ${operation} ${attemptedSchema}`
    };

    this.audit.record({
      actorId: actor.id,
      action: allowed ? "generated_runtime.schema_access.allowed" : "generated_runtime.schema_access.denied",
      resourceType: "generated_app_runtime",
      resourceId: runtime.deploymentId,
      severity: allowed ? "info" : "warning",
      metadata: { projectId: runtime.projectId, attemptedSchema, operation }
    });

    return result;
  }

  runMigrationDryRun(
    actor: PlatformUser,
    projectId: string,
    input: { migrationId: string; destructiveChanges?: string[]; approvalId?: string }
  ): GeneratedRuntimeMigrationDryRun {
    const runtime = this.getRuntimeOverview(actor, projectId);
    const destructiveChanges = [...(input.destructiveChanges ?? [])];
    const hasDestructiveChange = destructiveChanges.length > 0;
    const approvalId = input.approvalId?.trim() || undefined;
    const blocked = hasDestructiveChange && !approvalId;
    const result: GeneratedRuntimeMigrationDryRun = {
      migrationId: input.migrationId.trim() || `mig_${runtime.deploymentId}`,
      deploymentId: runtime.deploymentId,
      status: blocked ? "blocked" : "passed",
      destructiveChanges,
      requiredApprovals: blocked ? ["Developer Reviewer", "Data Owner"] : [],
      approvalId
    };

    this.audit.record({
      actorId: actor.id,
      action: blocked ? "generated_runtime.migration_dry_run.blocked" : "generated_runtime.migration_dry_run.passed",
      resourceType: "generated_app_runtime",
      resourceId: runtime.deploymentId,
      severity: blocked ? "warning" : "info",
      metadata: { projectId: runtime.projectId, migrationId: result.migrationId, destructiveChanges }
    });

    return result;
  }
}

export class StorefrontService {
  private readonly notifications: InAppNotification[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly identity: IdentityService,
    private readonly projects: ProjectService,
    private readonly publish: PublishService,
    private readonly appAccess: AppUserAccessService
  ) {}

  listApps(actor: PlatformUser): StorefrontHome {
    this.auth.requireRole(actor, ["end_user"]);
    const cards = this.publish.listRegistry(actor).map((entry) => this.toCard(actor, entry));
    const notifications = this.ensureNotifications(actor, cards);

    return {
      profile: {
        userName: actor.name,
        email: actor.email
      },
      myApps: cards.filter((card) => card.accessStatus === "active"),
      availableApps: cards.filter((card) => card.accessStatus !== "active"),
      notifications
    };
  }

  getAppDetail(actor: PlatformUser, appSlug: string): StorefrontAppDetail {
    this.auth.requireRole(actor, ["end_user"]);
    const entry = this.requireRegistryEntry(actor, appSlug);
    const project = this.projects.getProjectById(entry.projectId);
    const card = this.toCard(actor, entry);
    const owner = this.identity.listUsers().find((user) => user.id === entry.ownerUserId);
    const active = card.accessStatus === "active";

    return {
      ...card,
      ownerUserId: entry.ownerUserId,
      ownerName: owner?.name ?? entry.ownerUserId,
      department: project.targetDepartment,
      accessMode: entry.accessMode,
      releaseNotes: ["Published from Sprint 6 manifest", "WFH leave type and manager approval preview are available"],
      supportContact: "Creator User",
      actions: active ? ["open", "submit_ticket", "send_feedback"] : ["request_access", "view_status"]
    };
  }

  requestAccess(
    actor: PlatformUser,
    appSlug: string,
    input: {
      requestedRoleKey: string;
      reason: string;
      department?: string;
    }
  ): StoreAccessRequestResult {
    this.auth.requireRole(actor, ["end_user"]);
    const entry = this.requireRegistryEntry(actor, appSlug);
    const project = this.projects.getProjectById(entry.projectId);
    return this.appAccess.createStoreAccessRequest(actor, project, input);
  }

  canSubmitTicket(actor: PlatformUser, appSlug: string): StorefrontAppDetail {
    const detail = this.getAppDetail(actor, appSlug);
    if (detail.accessStatus !== "active") {
      throw new PermissionError(`App ${appSlug} is not visible for ticket submission`);
    }
    return detail;
  }

  private requireRegistryEntry(actor: PlatformUser, appSlug: string): AppStoreRegistryEntry {
    const entry = this.publish.listRegistry(actor).find((candidate) => candidate.slug === appSlug);
    if (!entry) throw new PermissionError(`Unknown app or app is not visible: ${appSlug}`);
    return entry;
  }

  private toCard(actor: PlatformUser, entry: AppStoreRegistryEntry): StorefrontAppCard {
    const project = this.projects.getProjectById(entry.projectId);
    const member = this.appAccess.getMemberForEmail(project, actor.email);
    const pending = this.appAccess.getPendingRequestForEmail(project, actor.email);
    const accessStatus: StoreAppAccessStatus = member ? "active" : pending ? "pending" : "available";
    const owner = this.identity.listUsers().find((user) => user.id === entry.ownerUserId);

    return {
      id: entry.id,
      appId: entry.appId,
      projectId: entry.projectId,
      slug: entry.slug,
      name: entry.name,
      description: `${project.appType} for ${project.targetDepartment}`,
      ownerName: owner?.name ?? entry.ownerUserId,
      route: entry.route,
      accessStatus,
      myRole: member?.roleName,
      health: "healthy",
      version: `manifest v${entry.manifestVersion}`,
      lastUpdated: entry.publishedAt,
      primaryAction: accessStatus === "active" ? "open" : accessStatus === "pending" ? "view_status" : "request_access"
    };
  }

  private ensureNotifications(actor: PlatformUser, cards: StorefrontAppCard[]): InAppNotification[] {
    if (!this.notifications.some((notification) => notification.userId === actor.id)) {
      for (const card of cards) {
        this.notifications.push({
          id: `noti_${actor.id}_${card.slug}`,
          userId: actor.id,
          type: "app_published",
          title: `${card.name} is available`,
          body: card.accessStatus === "active" ? "You can open this app from My Apps." : "Request access from the app detail page.",
          read: false,
          createdAt: card.lastUpdated
        });
      }
    }

    return this.notifications.filter((notification) => notification.userId === actor.id);
  }
}

export class TicketService {
  private readonly tickets: SupportTicket[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly storefront: StorefrontService,
    private readonly projects: ProjectService
  ) {}

  createTicket(
    actor: PlatformUser,
    appSlug: string,
    input: {
      type: TicketType;
      priority: TicketPriority;
      title: string;
      description: string;
      deviceInfo: string;
      screenshotUrl?: string;
    }
  ): SupportTicket {
    this.auth.requireRole(actor, ["end_user"]);
    const detail = this.storefront.canSubmitTicket(actor, appSlug);
    if (!input.title.trim()) throw new ValidationError("Ticket title is required");
    if (!input.description.trim()) throw new ValidationError("Ticket description is required");

    const now = new Date().toISOString();
    const id = `ticket_${String(this.tickets.length + 1).padStart(4, "0")}`;
    const ticket: SupportTicket = {
      id,
      ticketNumber: `TKT-${String(this.tickets.length + 1).padStart(4, "0")}`,
      appId: detail.appId,
      appSlug,
      projectId: detail.projectId,
      submittedByUserId: actor.id,
      submittedByEmail: actor.email,
      type: input.type,
      priority: input.priority,
      title: input.title.trim(),
      description: input.description.trim(),
      deviceInfo: input.deviceInfo.trim() || "Unknown device",
      screenshotUrl: input.screenshotUrl,
      status: "submitted",
      assignedToUserId: detail.ownerUserId,
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          id: `${id}_tl_001`,
          ticketId: id,
          status: "submitted",
          label: "Ticket submitted",
          actorId: actor.id,
          occurredAt: now
        }
      ]
    };

    this.tickets.push(ticket);
    this.audit.record({
      actorId: actor.id,
      action: "ticket.created",
      resourceType: "support_ticket",
      resourceId: ticket.id,
      metadata: { appSlug, type: ticket.type, priority: ticket.priority, assignedToUserId: ticket.assignedToUserId }
    });

    return ticket;
  }

  getTicketStatus(actor: PlatformUser, ticketId: string): TicketStatusView {
    const ticket = this.requireTicket(ticketId);
    if (actor.role !== "creator" && actor.role !== "admin" && ticket.submittedByUserId !== actor.id) {
      throw new PermissionError(`User ${actor.email} cannot access ticket ${ticketId}`);
    }
    const detail = this.storefront.getAppDetail(
      actor.role === "end_user" ? actor : { ...actor, role: "end_user", email: ticket.submittedByEmail },
      ticket.appSlug
    );
    return { ...ticket, appName: detail.name };
  }

  listCreatorInbox(actor: PlatformUser, projectId: string): CreatorTicketInboxItem[] {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    return this.tickets
      .filter((ticket) => ticket.projectId === projectId)
      .map((ticket) => ({
        ...ticket,
        appName: this.storefront.getAppDetail({ ...actor, role: "end_user", email: ticket.submittedByEmail }, ticket.appSlug).name,
        actions: ["reply", "convert_to_prd_change", "convert_to_ai_prompt", "resolve"]
      }));
  }

  getTicketForProject(actor: PlatformUser, projectId: string, ticketId: string): SupportTicket {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const ticket = this.requireTicket(ticketId);
    if (ticket.projectId !== projectId) throw new PermissionError(`Ticket ${ticketId} does not belong to project ${projectId}`);
    return ticket;
  }

  listTickets(actor?: PlatformUser): SupportTicket[] {
    if (actor) this.auth.requireRole(actor, ["admin", "creator"]);
    if (!actor || actor.role === "admin") return [...this.tickets];
    return this.tickets.filter((ticket) => this.projects.getProjectById(ticket.projectId).ownerUserId === actor.id);
  }

  markTicketPlanned(ticketId: string): SupportTicket {
    const ticket = this.requireTicket(ticketId);
    ticket.status = "planned";
    ticket.updatedAt = new Date().toISOString();
    ticket.timeline.push({
      id: `${ticket.id}_tl_${String(ticket.timeline.length + 1).padStart(3, "0")}`,
      ticketId: ticket.id,
      status: "planned",
      label: "Converted to PRD change",
      actorId: ticket.assignedToUserId,
      occurredAt: ticket.updatedAt
    });
    return ticket;
  }

  private requireTicket(ticketId: string): SupportTicket {
    const ticket = this.tickets.find((candidate) => candidate.id === ticketId);
    if (!ticket) throw new ValidationError(`Unknown ticket: ${ticketId}`);
    return ticket;
  }

}

export class PrdChangeService {
  private readonly changes: PrdChangeRequest[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly tickets: TicketService,
    private readonly prds: PrdService
  ) {}

  convertTicketToChange(
    actor: PlatformUser,
    projectId: string,
    input: {
      ticketId: string;
      title: string;
      proposedRequirement: string;
      affectedSections: string[];
      acceptanceCriteria: string[];
      riskLevel: PrdChangeRiskLevel;
    }
  ): PrdChangeRequest {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const ticket = this.tickets.getTicketForProject(actor, project.id, input.ticketId);
    const existing = this.changes.find((change) => change.projectId === project.id && change.sourceTicketId === ticket.id);
    if (existing) return existing;
    if (!input.title.trim()) throw new ValidationError("PRD change title is required");
    if (!input.proposedRequirement.trim()) throw new ValidationError("Proposed requirement is required");
    if (input.affectedSections.length === 0) throw new ValidationError("At least one affected PRD section is required");
    if (input.acceptanceCriteria.length === 0) throw new ValidationError("At least one acceptance criterion is required");

    const now = new Date().toISOString();
    const change: PrdChangeRequest = {
      id: `prdchg_${project.slug}_${String(this.changes.length + 1).padStart(3, "0")}`,
      projectId: project.id,
      sourceType: "ticket",
      sourceTicketId: ticket.id,
      title: input.title.trim(),
      proposedRequirement: input.proposedRequirement.trim(),
      affectedSections: [...input.affectedSections],
      acceptanceCriteria: [...input.acceptanceCriteria],
      riskLevel: input.riskLevel,
      status: "pending_approval",
      requestedByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
      decisions: []
    };

    this.changes.push(change);
    this.tickets.markTicketPlanned(ticket.id);
    this.audit.record({
      actorId: actor.id,
      action: "ticket.converted_to_prd_change",
      resourceType: "support_ticket",
      resourceId: ticket.id,
      severity: "high",
      metadata: { projectId: project.id, prdChangeId: change.id, ticketNumber: ticket.ticketNumber }
    });
    this.audit.record({
      actorId: actor.id,
      action: "prd.change_requested",
      resourceType: "prd_change_request",
      resourceId: change.id,
      metadata: { projectId: project.id, sourceTicketId: ticket.id, riskLevel: change.riskLevel }
    });

    return change;
  }

  listChanges(actor: PlatformUser, projectId: string): PrdChangeRequest[] {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    return this.changes.filter((change) => change.projectId === project.id);
  }

  decideChange(
    actor: PlatformUser,
    projectId: string,
    input: {
      changeId: string;
      decision: ApprovalDecision;
      note: string;
    }
  ): PrdChangeDecisionResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const change = this.requireChange(project.id, input.changeId);
    if (change.status === "approved" || change.status === "rejected") {
      throw new ConflictError(`PRD change ${change.id} is already ${change.status}`);
    }

    const now = new Date().toISOString();
    const decision: PrdChangeDecision = {
      id: `prdchgdec_${change.id}_${String(change.decisions.length + 1).padStart(3, "0")}`,
      changeId: change.id,
      decision: input.decision,
      note: input.note.trim() || input.decision,
      decidedByUserId: actor.id,
      decidedAt: now
    };

    change.decisions.push(decision);
    change.status = input.decision;
    change.updatedAt = now;

    let prdVersion: PrdVersion | undefined;
    if (input.decision === "approved") {
      prdVersion = this.prds.createVersionFromChange(actor, project.id, change);
      change.approvedPrdVersionId = prdVersion.id;
    }

    this.audit.record({
      actorId: actor.id,
      action: input.decision === "approved" ? "prd.change.approved" : `prd.change.${input.decision}`,
      resourceType: "prd_change_request",
      resourceId: change.id,
      severity: input.decision === "approved" ? "high" : "warning",
      metadata: { projectId: project.id, approvedPrdVersionId: change.approvedPrdVersionId, decision: input.decision }
    });

    return { change, decision, prdVersion };
  }

  getLatestApprovedChange(actor: PlatformUser, projectId: string): PrdChangeRequest {
    const change = [...this.listChanges(actor, projectId)].reverse().find((candidate) => candidate.status === "approved");
    if (!change) throw new ValidationError(`No approved PRD change for project ${projectId}`);
    return change;
  }

  private requireChange(projectId: string, changeId: string): PrdChangeRequest {
    const change = this.changes.find((candidate) => candidate.id === changeId && candidate.projectId === projectId);
    if (!change) throw new ValidationError(`Unknown PRD change request: ${changeId}`);
    return change;
  }
}

export class DomainService {
  private readonly settings: DomainSetting[] = [];
  private readonly requests: DomainRequest[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService
  ) {}

  getSettings(actor: PlatformUser, projectId: string): DomainSetting {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    return this.ensureSetting(project);
  }

  requestPublicDomain(
    actor: PlatformUser,
    projectId: string,
    input: {
      domain: string;
      reason: string;
      intendedAudience: string;
      dataClassification: PlatformProject["dataSensitivity"];
      externalUserPolicy: string;
      checklistAccepted: boolean;
    }
  ): DomainRequest {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    this.ensureSetting(project);
    const domain = input.domain.trim().toLowerCase();
    if (!domain) throw new ValidationError("Domain is required");
    if (!input.checklistAccepted) throw new ValidationError("Security checklist acknowledgement is required for public domain request");

    const now = new Date().toISOString();
    const request: DomainRequest = {
      id: `domainreq_${project.slug}_public_${String(this.requests.length + 1).padStart(3, "0")}`,
      projectId: project.id,
      domain,
      reason: input.reason.trim(),
      intendedAudience: input.intendedAudience.trim(),
      dataClassification: input.dataClassification,
      externalUserPolicy: input.externalUserPolicy,
      checklistAccepted: input.checklistAccepted,
      status: "pending_approval",
      requestedByUserId: actor.id,
      createdAt: now
    };

    this.requests.push(request);
    this.audit.record({
      actorId: actor.id,
      action: "domain.request.created",
      resourceType: "domain_request",
      resourceId: request.id,
      severity: "warning",
      metadata: { projectId: project.id, domain: request.domain, dataClassification: request.dataClassification }
    });

    return request;
  }

  decideDomainRequest(actor: PlatformUser, requestId: string, input: { decision: "approved" | "rejected"; note: string }): DomainRequest {
    this.auth.requireRole(actor, ["admin"]);
    const request = this.requireRequest(requestId);
    if (request.status !== "pending_approval") throw new ConflictError(`Domain request ${requestId} is already ${request.status}`);
    const setting = this.ensureSetting(this.projects.getProjectById(request.projectId));
    request.status = input.decision;
    request.decidedByUserId = actor.id;
    request.decisionNote = input.note.trim() || input.decision;
    request.decidedAt = new Date().toISOString();

    if (input.decision === "approved") {
      setting.mode = "public";
      setting.publicDomain = request.domain;
      setting.updatedAt = request.decidedAt;
    }

    this.audit.record({
      actorId: actor.id,
      action: input.decision === "approved" ? "domain.request.approved" : "domain.request.rejected",
      resourceType: "domain_request",
      resourceId: request.id,
      severity: input.decision === "approved" ? "high" : "warning",
      metadata: { projectId: request.projectId, domain: request.domain }
    });

    return request;
  }

  listRequests(actor: PlatformUser): DomainRequest[] {
    this.auth.requireRole(actor, ["admin", "creator"]);
    if (actor.role === "admin") return [...this.requests];
    return this.requests.filter((request) => this.projects.getProjectById(request.projectId).ownerUserId === actor.id);
  }

  getLatestApprovedSetting(actor: PlatformUser, projectId: string): DomainSetting {
    const setting = this.getSettings(actor, projectId);
    if (!setting.publicDomain) return setting;
    return setting;
  }

  private ensureSetting(project: PlatformProject): DomainSetting {
    const existing = this.settings.find((setting) => setting.projectId === project.id);
    if (existing) return existing;
    const setting: DomainSetting = {
      id: `domain_${project.slug}`,
      projectId: project.id,
      internalPath: `/apps/${project.slug}`,
      mode: "internal",
      updatedAt: new Date().toISOString()
    };
    this.settings.push(setting);
    return setting;
  }

  private requireRequest(requestId: string): DomainRequest {
    const request = this.requests.find((candidate) => candidate.id === requestId);
    if (!request) throw new ValidationError(`Unknown domain request: ${requestId}`);
    return request;
  }
}

export class TraceabilityService {
  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly tickets: TicketService,
    private readonly prdChanges: PrdChangeService,
    private readonly prds: PrdService,
    private readonly frontendVersions: FrontendVersionService,
    private readonly publish: PublishService,
    private readonly domains: DomainService
  ) {}

  getProjectTrace(actor: PlatformUser, projectId: string): DeploymentTraceRecord {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const change = this.prdChanges.getLatestApprovedChange(actor, project.id);
    if (!change.sourceTicketId) throw new ValidationError(`PRD change ${change.id} is not linked to a ticket`);
    const ticket = this.tickets.getTicketForProject(actor, project.id, change.sourceTicketId);
    const prdVersion = this.prds.listVersions(actor, project.id).find((version) => version.id === change.approvedPrdVersionId);
    if (!prdVersion) throw new ValidationError(`No approved PRD version linked to change ${change.id}`);
    const frontend = this.frontendVersions.getTimeline(actor, project.id).activeCheckpoint;
    const manifest = this.publish.getManifestForProject(actor, project.id);
    const deployment = this.publish.getLatestDeploymentForProject(actor, project.id);
    const domain = this.domains.getLatestApprovedSetting(actor, project.id);
    const auditEventIds = this.audit
      .filter({ projectId: project.id })
      .filter((event) =>
        ["ticket.converted_to_prd_change", "prd.change.approved", "prd.version.created_from_change", "domain.request.approved", "app.publish.completed"].includes(
          event.action
        )
      )
      .map((event) => event.id);

    return {
      id: `trace_${project.slug}_mvp_001`,
      projectId: project.id,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        status: ticket.status
      },
      prdChange: {
        id: change.id,
        title: change.title,
        status: change.status,
        riskLevel: change.riskLevel
      },
      prdVersion: {
        id: prdVersion.id,
        version: prdVersion.version,
        changeSummary: prdVersion.changeSummary
      },
      frontend: {
        id: frontend.id,
        version: frontend.version,
        status: frontend.status
      },
      manifest: {
        id: manifest.id,
        manifestVersion: manifest.manifestVersion
      },
      deployment: {
        deploymentId: deployment.id,
        publishRequestId: deployment.publishRequestId,
        route: deployment.route,
        manifestVersion: deployment.manifestVersion,
        publishedAt: deployment.publishedAt
      },
      domain: {
        internalPath: domain.internalPath,
        customDomain: domain.customDomain,
        publicDomain: domain.publicDomain,
        mode: domain.mode
      },
      auditEventIds,
      generatedAt: new Date().toISOString()
    };
  }
}

export class MonitoringService {
  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly tickets: TicketService,
    private readonly domains: DomainService,
    private readonly publish: PublishService,
    private readonly generatedRuntime: GeneratedAppRuntimeService,
    private readonly aiGovernance: AiGovernanceService,
    private readonly guardrails: GuardrailService
  ) {}

  getDashboard(actor: PlatformUser): MonitoringDashboard {
    this.auth.requireRole(actor, ["admin"]);
    const tickets = this.tickets.listTickets(actor);
    const domainRequests = this.domains.listRequests(actor);
    const registry = this.publish.listRegistry(actor);

    const appHealth = registry.map((entry) => {
      try {
        const runtime = this.generatedRuntime.getRuntimeOverview(actor, entry.projectId);
        return { app: entry.name, status: runtime.health.status, route: runtime.container.route };
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return { app: entry.name, status: "degraded" as const, route: entry.route };
      }
    });

    return {
      serviceHealth: [
        { name: "Platform API", status: "healthy", detail: "NestJS request handlers active" },
        { name: "PostgreSQL", status: "healthy", detail: "Prisma schema validated" },
        { name: "Keycloak", status: "healthy", detail: "Mock SSO path ready for adapter" },
        { name: "MinIO", status: "healthy", detail: "Object storage placeholder ready" },
        { name: "Redis", status: "healthy", detail: "Queue dependency declared" },
        { name: "AI Gateway", status: "healthy", detail: "Provider adapter route configured" },
        { name: "Caddy", status: "healthy", detail: "Domain approval path ready" }
      ],
      appHealth,
      aiUsage: {
        providerCalls: this.aiGovernance.providerCallCount(),
        guardrailEvents: this.guardrails.listEvents().length
      },
      ticketCounts: {
        open: tickets.filter((ticket) => ["submitted", "in_review", "planned"].includes(ticket.status)).length,
        inReview: tickets.filter((ticket) => ticket.status === "in_review").length,
        resolved: tickets.filter((ticket) => ["resolved", "closed"].includes(ticket.status)).length
      },
      domainRequests: {
        pending: domainRequests.filter((request) => request.status === "pending_approval").length,
        approved: domainRequests.filter((request) => request.status === "approved").length,
        rejected: domainRequests.filter((request) => request.status === "rejected").length
      },
      recentAuditEvents: this.audit.list().slice(-10).reverse()
    };
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
    private readonly frontendVersions: FrontendVersionService,
    private readonly knowledge: KnowledgeGovernanceService,
    private readonly skills: SkillGovernanceService
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

    const skillSelection = this.resolveWorkspaceSkill(actor, project);
    const knowledgeRetrieval = this.knowledge.retrieve(actor, {
      projectId: project.id,
      appId: project.appId,
      department: project.targetDepartment,
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      query: prompt,
      requiredKnowledgeSourceIds: skillSelection.requiredKnowledgeSourceIds
    });
    const route = this.aiGovernance.resolveRoute("frontend_coding");
    const requestEstimate = 120;
    const quota = this.aiGovernance.checkQuota("creator", requestEstimate);
    if (!quota.allowed) {
      throw new QuotaExceededError(`Creator quota exceeded. Remaining today: ${quota.remainingToday}`);
    }

    this.aiGovernance.recordProviderCall();
    const task = this.createTask(project.id, actor.id, prompt, "ready", guardrail, now, "done", {
      knowledgeVersionIds: knowledgeRetrieval.matchedVersionIds,
      skillVersionId: skillSelection.skillVersionId === "none" ? undefined : skillSelection.skillVersionId
    });
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
      metadata: {
        projectId: project.id,
        previewVersion: preview.version,
        tokensUsed: usage.tokensUsed,
        skillVersionId: task.skillVersionId,
        knowledgeVersionIds: task.knowledgeVersionIds,
        retrievalLogId: knowledgeRetrieval.retrievalLogId
      }
    });
    this.audit.record({
      actorId: actor.id,
      action: "workspace.context.resolved",
      resourceType: "workspace_task",
      resourceId: task.id,
      metadata: {
        projectId: project.id,
        skillVersionId: task.skillVersionId,
        knowledgeVersionIds: task.knowledgeVersionIds,
        retrievalLogId: knowledgeRetrieval.retrievalLogId
      }
    });

    return {
      guardrail,
      task,
      preview,
      usage,
      knowledgeRetrieval,
      skillSelection,
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
    terminalStepStatus: WorkspaceStepStatus,
    context?: { knowledgeVersionIds?: string[]; skillVersionId?: string }
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
      knowledgeVersionIds: context?.knowledgeVersionIds,
      skillVersionId: context?.skillVersionId,
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

  private resolveWorkspaceSkill(actor: PlatformUser, project: PlatformProject): SkillResolveResult {
    try {
      return this.skills.resolve(actor, {
        projectId: project.id,
        appId: project.appId,
        department: project.targetDepartment,
        agentRole: "frontend_developer",
        scenario: "frontend_coding"
      });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      return {
        skillId: "none",
        skillVersionId: "none",
        assignmentId: "none",
        agentRole: "frontend_developer",
        scenario: "frontend_coding",
        allowedTools: [],
        requiredKnowledgeSourceIds: [],
        reason: error.message
      };
    }
  }
}

export interface PlatformApiServices {
  identity: IdentityService;
  auth: MockAuthService;
  audit: AuditService;
  projects: ProjectService;
  aiGovernance: AiGovernanceService;
  guardrails: GuardrailService;
  knowledge: KnowledgeGovernanceService;
  skills: SkillGovernanceService;
  prds: PrdService;
  workspace: WorkspaceService;
  databaseView: DatabaseViewService;
  frontendVersions: FrontendVersionService;
  appAccess: AppUserAccessService;
  publish: PublishService;
  generatedRuntime: GeneratedAppRuntimeService;
  storefront: StorefrontService;
  tickets: TicketService;
  prdChanges: PrdChangeService;
  domains: DomainService;
  traceability: TraceabilityService;
  monitoring: MonitoringService;
  authSso: PlatformAuthSsoService;
  breakGlass: BreakGlassService;
  policyTemplates: PolicyTemplateService;
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
  const knowledge = new KnowledgeGovernanceService(auth, audit, projects);
  const skills = new SkillGovernanceService(auth, audit, projects);
  const prds = new PrdService(auth, audit, projects, aiGovernance, guardrails);
  const databaseView = new DatabaseViewService(projects);
  const frontendVersions = new FrontendVersionService(audit, projects, prds, databaseView);
  const appAccess = new AppUserAccessService(auth, audit, projects, identity);
  const publish = new PublishService(auth, audit, projects, prds, frontendVersions, databaseView, appAccess);
  const generatedRuntime = new GeneratedAppRuntimeService(auth, audit, projects, publish);
  const storefront = new StorefrontService(auth, identity, projects, publish, appAccess);
  const tickets = new TicketService(auth, audit, storefront, projects);
  const prdChanges = new PrdChangeService(auth, audit, projects, tickets, prds);
  const domains = new DomainService(auth, audit, projects);
  const traceability = new TraceabilityService(auth, audit, projects, tickets, prdChanges, prds, frontendVersions, publish, domains);
  const monitoring = new MonitoringService(auth, audit, tickets, domains, publish, generatedRuntime, aiGovernance, guardrails);
  const authSso = new PlatformAuthSsoService(auth, audit);
  const breakGlass = new BreakGlassService(auth, audit);
  const policyTemplates = new PolicyTemplateService(auth);
  const workspace = new WorkspaceService(auth, audit, projects, prds, aiGovernance, guardrails, frontendVersions, knowledge, skills);

  return {
    identity,
    auth,
    audit,
    projects,
    aiGovernance,
    guardrails,
    knowledge,
    skills,
    prds,
    workspace,
    databaseView,
    frontendVersions,
    appAccess,
    publish,
    generatedRuntime,
    storefront,
    tickets,
    prdChanges,
    domains,
    traceability,
    monitoring,
    authSso,
    breakGlass,
    policyTemplates,
    envelope: { success, failure }
  };
}
