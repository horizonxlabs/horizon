import {
  failure,
  success,
  type ApiFailure,
  type ApiSuccess,
  type PublishAccessUrlConfigDto
} from "@evcp/api-client";
import { mockUsers, projects as seedProjects } from "@evcp/mock-data";
import type { MockUser, PlatformRole, Status, WorkspaceAgentMode } from "@evcp/types";
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  OpenAiCompatibleCompletionAdapter,
  encryptSecretEnvelope,
  estimateAiTokens,
  fingerprintSecret,
  maskSecret,
  providerErrorMessage
} from "./ai-governance/ai-gateway-adapter";
import { IdentityService } from "./identity-service";
import {
  ConflictError,
  MockAuthError,
  PermissionError,
  QuotaExceededError,
  ValidationError
} from "./platform-errors";
import {
  PROJECT_FILE_ALLOWED_MIME_TYPES,
  PROJECT_FILE_BUCKET,
  PROJECT_FILE_MAX_SIZE_BYTES
} from "./project-file-constants";
import { createDefaultWorkspaceOrchestrator, type DefaultWorkspaceOrchestratorOptions } from "./workspace-orchestrator/factory";
import { workspaceAuditRecord } from "./workspace-orchestrator/workspace-audit";
import type { WorkspaceOrchestrator } from "./workspace-orchestrator/orchestrator";
import { schemaNameFor } from "./workspace-orchestrator/postgres-provisioner";
import { resourceKeyForProject } from "./workspace-orchestrator/resource-ports";
import {
  assertSubdomainClaimAvailable,
  attachRegistrySubdomain,
  buildConfiguredSubdomainUrl,
  createLegacyStorefrontCard,
  DEFAULT_PUBLISH_ACCESS_URL_CONFIG,
  ensureLegacyStorefrontNotifications,
  upsertByAppId
} from "./persistence/publish-store-service-support";

export { IdentityService } from "./identity-service";
export {
  ConflictError,
  MockAuthError,
  PermissionError,
  QuotaExceededError,
  ValidationError
} from "./platform-errors";

export { SubdomainConflictError } from "./persistence/publish-store-service-support";

export interface PlatformUser extends MockUser {
  status: "active" | "inactive" | "invited" | "suspended";
  permissions: string[];
}
export type AuthMode = "platform_session" | "mock_header";

export interface AuthResolution {
  user: PlatformUser;
  mode: AuthMode;
  sessionId?: string;
  expiresAt?: string;
}

export interface PlatformProject {
  id: string;
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

export type OperationCheckStatus = "pass" | "warning" | "fail";
export type BackupStorageProvider = "minio" | "s3" | "s3_compatible";

export interface OperationCheck {
  name: string;
  required: string;
  observed: string;
  status: OperationCheckStatus;
  action: string;
}

export interface ComposeServiceReadiness {
  name: string;
  status: "healthy" | "pending" | "failed";
  endpoint: string;
}

export interface InstallerReport {
  id: string;
  status: "passed" | "failed";
  installBlocked: boolean;
  reportPath: string;
  checks: OperationCheck[];
  actionableFailures: string[];
  composeServices: ComposeServiceReadiness[];
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface SetupConfiguration {
  id: string;
  status: "completed";
  domain: string;
  databaseUrlMasked: string;
  storage: Record<string, string | undefined>;
  auth: Record<string, unknown>;
  ai: Record<string, unknown>;
  guardrail: Record<string, unknown>;
  backup: Record<string, unknown>;
  firstAdmin: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface BackupPolicy {
  id: string;
  name: string;
  schedule: string;
  retentionDays: number;
  storage: Record<string, string | undefined>;
  encryptionMode: string;
  encryptionKeyRef: string;
  enabled: boolean;
  status: "active" | "disabled";
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface BackupRun {
  id: string;
  policyId: string;
  trigger: "manual" | "scheduled" | "upgrade";
  databaseName: string;
  status: "succeeded" | "failed";
  encrypted: boolean;
  artifactUri: string;
  checksum: string;
  sizeBytes: number;
  startedAt: string;
  finishedAt: string;
  createdByUserId: string;
  auditEventId: string;
}

export interface PitrConfiguration {
  id: string;
  databaseName: string;
  walRetentionHours: number;
  baseBackupRunId: string;
  targetTimestamp: string;
  rpoMinutes: number;
  rtoMinutes: number;
  status: "ready" | "invalid";
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface RestoreDrillReport {
  id: string;
  backupRunId: string;
  pitrConfigId: string;
  targetTimestamp: string;
  validationChecks: string[];
  failedChecks: string[];
  status: "passed" | "failed";
  recoveryVerified: boolean;
  reportPath: string;
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface OperationsRecoveryOverview {
  installerReports: InstallerReport[];
  setupConfigurations: SetupConfiguration[];
  policies: BackupPolicy[];
  runs: BackupRun[];
  pitrConfigurations: PitrConfiguration[];
  restoreDrills: RestoreDrillReport[];
}

export type ProductionHealthStatus = "healthy" | "degraded" | "failed";
export type LicenseStatus = "active" | "warning" | "grace" | "expired" | "tampered";
export type LicenseAction =
  | "publish"
  | "ai_generation"
  | "new_app"
  | "new_external_invite"
  | "activate_user"
  | "run_existing_app";
export type SecurityReleaseStatus = "ready" | "blocked";
export type UploadScanStatus = "clean" | "pending" | "failed" | "malicious";
export type UploadDecision = "allowed" | "blocked" | "quarantined";
export type ReleaseExposure = "internal" | "external" | "public";
export type DataClassification = "Public" | "Internal" | "Confidential" | "Restricted";

export interface ServiceHealthSignal {
  name: string;
  type: "core" | "dependency" | "generated_app";
  status: ProductionHealthStatus;
  detail: string;
  checkedAt: string;
}

export interface GeneratedAppHealthSignal {
  slug: string;
  name: string;
  status: ProductionHealthStatus;
  route: string;
  lastDeploymentId: string;
  checkedAt: string;
}

export interface QueueHealthSignal {
  name: string;
  depth: number;
  failedCount: number;
  oldestJobAgeSeconds: number;
  status: ProductionHealthStatus;
}

export interface TelemetryExportConfig {
  id: string;
  status: "configured" | "disabled" | "failed";
  endpoint: string;
  signals: Array<"metrics" | "logs" | "traces" | "alerts">;
  lastExportAt: string;
}

export interface RetentionPolicySnapshot {
  platformLogDays: number;
  appLogDays: number;
  auditDays: number;
  aiUsageDays: number;
}

export interface ProductionObservabilityDashboard {
  serviceHealth: ServiceHealthSignal[];
  generatedAppHealth: GeneratedAppHealthSignal[];
  queueHealth: QueueHealthSignal[];
  retention: RetentionPolicySnapshot;
  telemetryExport: TelemetryExportConfig;
  recentAuditEvents: AuditEvent[];
  auditEventId: string;
}

export interface UpgradeCompatibilityReport {
  id: string;
  targetVersion: string;
  status: "passed" | "blocked";
  upgradeBlocked: boolean;
  checks: OperationCheck[];
  blockingReasons: string[];
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface RollbackReport {
  id: string;
  fromVersion: string;
  toVersion: string;
  reason: string;
  rollbackWindowEndsAt: string;
  status: "succeeded" | "failed";
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface SignedLicensePayload {
  issuer: string;
  subject: string;
  edition: "starter" | "team" | "enterprise";
  seats: number;
  appLimit: number;
  aiUsageMonthlyTokens: number;
  expiresAt: string;
  warningDays: number;
  graceDays: number;
  offlineValidUntil: string;
  signature: string;
}

export interface LicenseRecord {
  id: string;
  licenseKeyFingerprint: string;
  status: LicenseStatus;
  issuer: string;
  subject: string;
  edition: SignedLicensePayload["edition"];
  seats: { entitled: number; used: number };
  appLimit: { entitled: number; used: number };
  aiUsageMonthlyTokens: { entitled: number; used: number };
  expiresAt: string;
  warningDays: number;
  graceDays: number;
  offlineCache: { status: "valid" | "expired" | "missing"; validUntil: string };
  signedPayloadFingerprint: string;
  enforcement: { restrictedActions: LicenseAction[]; preserveExistingData: true };
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface LicenseValidationResult {
  id: string;
  licenseId: string;
  source: "online" | "offline_cache";
  status: LicenseStatus;
  checkedAt: string;
  offlineCacheUsed: boolean;
  auditEventId: string;
}

export interface LicenseEnforcementDecision {
  id: string;
  action: LicenseAction;
  allowed: boolean;
  status: LicenseStatus;
  reasons: string[];
  restrictedActions: LicenseAction[];
  preserveExistingData: true;
  actorUserId: string;
  checkedAt: string;
  auditEventId: string;
}

export interface TlsPolicySnapshot {
  productionHttpsRequired: boolean;
  hstsEnabled: boolean;
  allowLocalSetupHttp: boolean;
  insecureProductionHttpBlocked: boolean;
}

export interface SessionPolicySnapshot {
  idleTimeoutMinutes: number;
  absoluteTimeoutMinutes: number;
  rememberMeAllowed: boolean;
  forcedLogoutSupported: boolean;
  rotationOnPrivilegeChange: boolean;
}

export interface SecretRedactionSurface {
  surface: "api" | "ui" | "log" | "audit" | "export";
  rule: string;
  secretExposed: boolean;
  evidence: string;
}

export interface SecretRedactionSnapshot {
  passed: boolean;
  surfaces: SecretRedactionSurface[];
}

export interface UploadPolicySnapshot {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  quarantineOnPending: boolean;
  malwareFailureBlocksPublish: boolean;
}

export interface ReleaseChecklistSnapshot {
  requiredChecks: string[];
  publicExposureRequiresTls: boolean;
  externalExposureRequiresApprovedDomain: boolean;
}

export interface RtmRegressionSnapshot {
  p0RequirementsTotal: number;
  p0RequirementsPassed: number;
  exceptionsApproved: number;
  evidenceRefs: string[];
}

export interface SecurityReadinessOverview {
  id: string;
  status: SecurityReleaseStatus;
  tlsPolicy: TlsPolicySnapshot;
  sessionPolicy: SessionPolicySnapshot;
  secretRedaction: SecretRedactionSnapshot;
  uploadPolicy: UploadPolicySnapshot;
  releaseChecklist: ReleaseChecklistSnapshot;
  rtmRegression: RtmRegressionSnapshot;
  checks: OperationCheck[];
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface UploadValidationInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: UploadScanStatus;
  source: "knowledge" | "ticket" | "prd" | "app_asset";
}

export interface UploadScanDecision {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: UploadScanStatus;
  decision: UploadDecision;
  reasons: string[];
  quarantineReason?: string;
  source: UploadValidationInput["source"];
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface ReleaseChecklistInput {
  projectId: string;
  exposure: ReleaseExposure;
  authReady: boolean;
  permissionsReady: boolean;
  domainApproved: boolean;
  tlsReady: boolean;
  dataClassification: DataClassification;
  auditReady: boolean;
}

export interface ReleaseChecklistDecision {
  id: string;
  projectId: string;
  exposure: ReleaseExposure;
  allowed: boolean;
  releaseBlocked: boolean;
  requiredChecks: OperationCheck[];
  blockingReasons: string[];
  dataClassification: DataClassification;
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface SensitiveRedactionInput {
  classification: DataClassification;
  prompt: string;
  ticketDescription: string;
  requestPayload: Record<string, unknown>;
}

export interface SensitiveRedactionEvidence {
  id: string;
  classification: DataClassification;
  redactedPayload: {
    prompt: string;
    ticketDescription: string;
    requestPayload: Record<string, unknown>;
  };
  redactionRulesApplied: string[];
  createdByUserId: string;
  createdAt: string;
  auditEventId: string;
}

export interface CreateProjectInput {
  actor: PlatformUser;
  name: string;
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
  status?: "succeeded" | "blocked" | "fallback" | "failed";
  adapter?: AiProviderAdapter;
  latencyMs?: number;
  estimatedCostUsd?: number;
  promptFingerprint?: string;
  reason?: string;
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
  baseline?: PrdVersion;
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
    unchanged: Array<
      "backend" | "database" | "auth" | "app_roles" | "membership" | "domain" | "prd_baseline"
    >;
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
  runtime?: {
    deploymentRevisionId: string;
    revision: number;
    sourceCommitSha: string;
    imageTag: string;
    imageDigest: string;
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
  subdomain?: string;
  subdomainUrl?: string;
  manifestVersion: string;
  prdVersion: string;
  frontendCheckpointId: string;
  publishedByUserId: string;
  deploymentRevisionId?: string;
  runtimeRevision?: number;
  sourceCommitSha?: string;
  imageTag?: string;
  imageDigest?: string;
  containerName?: string;
  publishedAt: string;
}

export interface AppStoreRegistryEntry {
  id: string;
  appId: string;
  projectId: string;
  slug: string;
  subdomain?: string;
  subdomainUrl?: string;
  name: string;
  route: string;
  status: "published";
  visibility: "public" | "restricted";
  accessMode: "public" | "membership_or_invite";
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
export type StoreAppInstallStatus = "installed" | "not_installed" | "disabled";
export type StorePrimaryAction = "open" | "install" | "request_access" | "view_status";
export type TicketType =
  "bug" | "feedback" | "feature" | "access_issue" | "data_issue" | "performance" | "other";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketStatus = "submitted" | "in_review" | "planned" | "resolved" | "closed";

export interface StorefrontAppCard {
  id: string;
  appId: string;
  projectId: string;
  slug: string;
  subdomain?: string;
  subdomainUrl?: string;
  name: string;
  description: string;
  ownerName: string;
  route: string;
  accessStatus: StoreAppAccessStatus;
  installStatus: StoreAppInstallStatus;
  installationId?: string;
  installedAt?: string;
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
  availableRoles: string[];
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
}

export interface StoreAppInstallation {
  id: string;
  appId: string;
  appSlug: string;
  projectId: string;
  userId: string;
  userEmail: string;
  status: "active" | "disabled";
  installedAt: string;
  disabledAt?: string;
  lastOpenedAt?: string;
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
export type PrdChangeStatus =
  "draft" | "pending_approval" | "approved" | "rejected" | "changes_requested";
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

export type AiProviderAdapter =
  "openai" | "openrouter" | "lm_studio" | "anthropic" | "google" | "azure_openai" | "mock";
export type AiProviderStatus = "active" | "disabled" | "warning" | "error";
export type AiUsageMode = "production" | "development" | "fallback";
export type AiScenario =
  | "prd_generation"
  | "requirement_analysis"
  | "frontend_coding"
  | "backend_coding"
  | "review"
  | "documentation" | "image_generation";
export type AgentRoleKey =
  | "requirement_analyst"
  | "database_designer"
  | "frontend_developer"
  | "backend_developer"
  | "security_reviewer"
  | "technical_writer";
export type GuardrailDecision = "allow" | "warn" | "block";
export type GuardrailRuleType = "keyword" | "regex" | "policy";

export type KnowledgeSourceType =
  "pdf" | "markdown" | "text" | "word" | "excel" | "image" | "openapi_json";
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

export type ProjectFilePurpose = "ai_context" | "app_asset";
export type ProjectFileScanStatus = "pending" | "clean" | "failed" | "malicious" | "quarantined";
export type ProjectFileExtractionStatus = "pending" | "indexed" | "failed";

export interface ProjectFileUpload {
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
  purpose: ProjectFilePurpose;
  uploadStatus: KnowledgeUploadStatus;
  scanStatus: ProjectFileScanStatus;
  indexStatus: KnowledgeIndexStatus;
  extractionStatus: ProjectFileExtractionStatus;
  includeByDefault: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileUploadInitResult {
  uploadId: string;
  sourceId: string;
  versionId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  file: ProjectFileUpload;
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

export interface StoredAiApiKey extends AiApiKey {
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

export interface AiCompletionRequest {
  scenario: AiScenario;
  projectId: string;
  actorId: string;
  prompt: string;
  route: AiScenarioRoute;
  requestedTokens: number;
  dryRun: boolean;
  timeoutMs: number;
}

export interface AiCompletionResponse {
  text: string;
  providerId: string;
  model: string;
  adapter: AiProviderAdapter;
  tokensUsed: number;
  latencyMs: number;
  status: "succeeded" | "fallback";
  usageLogId: string;
  fallbackUsed: boolean;
}

export interface AiProviderTestCallResult {
  providerId: string;
  providerName: string;
  adapter: AiProviderAdapter;
  model: string;
  status: "succeeded" | "fallback";
  fallbackUsed: boolean;
  tokensUsed: number;
  latencyMs: number;
  usageLogId: string;
  outputExcerpt: string;
}

export interface AiCompletionAdapter {
  readonly kind: AiProviderAdapter;
  complete(input: {
    provider: AiProvider;
    key: StoredAiApiKey;
    model: string;
    prompt: string;
    scenario: AiScenario;
    dryRun: boolean;
    timeoutMs: number;
  }): { text: string; tokensUsed: number; latencyMs: number };
}

export interface AiGatewayFetchRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
}

export interface AiGatewayFetchResponse {
  status: number;
  body?: unknown;
}

export interface AiGatewayCircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export interface AiGatewayRuntimeOptions {
  fetcher?: (request: AiGatewayFetchRequest) => AiGatewayFetchResponse;
  now?: () => number;
  maxRetries?: number;
  retryableStatusCodes?: number[];
  circuitBreaker?: AiGatewayCircuitBreakerOptions;
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

type HeaderBag = Record<string, string | string[] | undefined>;

function normalizeHeader(headers: HeaderBag, name: string): string | undefined {
  const direct = headers[name];
  const lower = headers[name.toLowerCase()];
  const value =
    direct ??
    lower ??
    Object.entries(headers).find(
      ([headerName]) => headerName.toLowerCase() === name.toLowerCase()
    )?.[1];

  if (Array.isArray(value)) return value[0];
  return value;
}

export class AuditService {
  private readonly events: AuditEvent[] = [];

  record(
    input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> &
      Partial<Pick<AuditEvent, "severity" | "metadata">>
  ): AuditEvent {
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
  private readonly sessionSecret =
    process.env.SESSION_SECRET || "local-dev-session-secret-change-before-production";
  private readonly issuedSessions = new Map<
    string,
    { userId: string; email: string; expiresAt: string }
  >();

  constructor(private readonly identity: IdentityService) {}

  getUserByEmail(email: string): PlatformUser {
    return this.identity.getUserByEmail(email);
  }

  issuePlatformSession(
    user: PlatformUser,
    input: { sessionId: string; issuedAt?: Date; ttlSeconds?: number }
  ): { token: string; expiresAt: string } {
    const issuedAt = input.issuedAt ?? new Date();
    const ttlSeconds = input.ttlSeconds ?? 60 * 60;
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
    const expiresAtIso = new Date(expiresAtSeconds * 1000).toISOString();
    const payload = {
      typ: "evcp.platform.session",
      sid: input.sessionId,
      sub: user.id,
      email: user.email,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: expiresAtSeconds
    };
    const encodedPayload = this.encodeJson(payload);
    const signature = this.sign(encodedPayload);
    const token = `evcp_session.${encodedPayload}.${signature}`;
    this.issuedSessions.set(input.sessionId, {
      userId: user.id,
      email: user.email,
      expiresAt: expiresAtIso
    });
    return { token, expiresAt: expiresAtIso };
  }

  resolve(headers: HeaderBag): AuthResolution {
    const bearer = this.extractBearer(headers);
    if (bearer) {
      const session = this.verifyPlatformSessionToken(bearer);
      return {
        user: this.identity.getUserByEmail(session.email),
        mode: "platform_session",
        sessionId: session.sessionId,
        expiresAt: session.expiresAt
      };
    }

    const email = this.resolveMockHeaderEmail(headers);
    return { user: this.identity.getUserByEmail(email), mode: "mock_header" };
  }

  resolveCurrentUser(headers: HeaderBag): PlatformUser {
    return this.resolve(headers).user;
  }

  /**
   * Resolves the session/header claims (mode + email + session metadata) WITHOUT looking the user
   * up in the in-memory `IdentityService`. Token verification is signature/expiry based only, so
   * this succeeds for a user that lives solely in core-persistence (Postgres) — e.g. after a
   * process restart clears the mock identity seed. Callers back the returned email with a
   * persistence read (`corePersistence.getUserByEmail`) so login/change-password no longer depend
   * on the mock identity store.
   */
  resolveSessionClaims(headers: HeaderBag): {
    mode: AuthMode;
    email: string;
    sessionId?: string;
    expiresAt?: string;
  } {
    const bearer = this.extractBearer(headers);
    if (bearer) {
      const session = this.verifyPlatformSessionToken(bearer);
      return {
        mode: "platform_session",
        email: session.email,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt
      };
    }

    const email = this.resolveMockHeaderEmail(headers);
    return { mode: "mock_header", email };
  }

  requireRole(user: PlatformUser, roles: PlatformRole[]): void {
    if (!roles.includes(user.role)) {
      throw new PermissionError(`Role ${user.role} cannot access this resource`);
    }
  }

  private extractBearer(headers: HeaderBag): string | undefined {
    const authorization = normalizeHeader(headers, "authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }

  private resolveMockHeaderEmail(headers: HeaderBag): string {
    const disabled = String(process.env.EVCP_ALLOW_SIMULATE_LOGIN ?? "0") !== "1";
    const email = disabled
      ? undefined
      : (normalizeHeader(headers, "x-mock-user-email") ?? normalizeHeader(headers, "x-evcp-user"));
    if (!email)
      throw new MockAuthError(
        disabled
          ? "Mock header auth is disabled"
          : "Missing Authorization Bearer token or x-mock-user-email header"
      );
    return email;
  }

  private verifyPlatformSessionToken(token: string): {
    sessionId: string;
    email: string;
    expiresAt: string;
  } {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "evcp_session") {
      throw new MockAuthError("Invalid platform session token");
    }

    const [, encodedPayload, signature] = parts;
    if (this.sign(encodedPayload) !== signature) {
      throw new MockAuthError("Invalid platform session token signature");
    }

    const payload = this.decodeJson(encodedPayload) as Partial<{
      typ: string;
      sid: string;
      email: string;
      exp: number;
    }>;
    if (payload.typ !== "evcp.platform.session" || !payload.sid || !payload.email || !payload.exp) {
      throw new MockAuthError("Invalid platform session token claims");
    }

    const expiresAtMs = payload.exp * 1000;
    if (Date.now() >= expiresAtMs) {
      throw new MockAuthError("Expired platform session token");
    }

    const issuedSession = this.issuedSessions.get(payload.sid);
    if (issuedSession && issuedSession.email !== payload.email) {
      throw new MockAuthError("Platform session token does not match registered session");
    }

    return {
      sessionId: payload.sid,
      email: payload.email,
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  }

  private sign(encodedPayload: string): string {
    return createHmac("sha256", this.sessionSecret).update(encodedPayload).digest("base64url");
  }

  private encodeJson(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  private decodeJson(encodedPayload: string): unknown {
    try {
      return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    } catch {
      throw new MockAuthError("Invalid platform session token payload");
    }
  }
}

export class OperationsRecoveryService {
  private readonly installerReports: InstallerReport[] = [];
  private readonly setupConfigurations: SetupConfiguration[] = [];
  private readonly backupPolicies: BackupPolicy[] = [];
  private readonly backupRuns: BackupRun[] = [];
  private readonly pitrConfigurations: PitrConfiguration[] = [];
  private readonly restoreDrills: RestoreDrillReport[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  runPreflight(
    actor: PlatformUser,
    input: {
      cpuCores?: number;
      memoryGb?: number;
      diskFreeGb?: number;
      os?: string;
      dockerVersion?: string;
      composeVersion?: string;
      portsAvailable?: number[];
      dnsReady?: boolean;
      tlsReady?: boolean;
      networkReady?: boolean;
    }
  ): InstallerReport {
    this.auth.requireRole(actor, ["admin"]);
    const ports = new Set(input.portsAvailable ?? []);
    const checks: OperationCheck[] = [
      this.numericCheck(
        "CPU",
        ">= 4 cores",
        `${input.cpuCores ?? 0} cores`,
        input.cpuCores ?? 0,
        4,
        "Add CPU capacity before install"
      ),
      this.numericCheck(
        "RAM",
        ">= 8 GB",
        `${input.memoryGb ?? 0} GB`,
        input.memoryGb ?? 0,
        8,
        "Add memory before install"
      ),
      this.numericCheck(
        "Disk",
        ">= 100 GB free",
        `${input.diskFreeGb ?? 0} GB`,
        input.diskFreeGb ?? 0,
        100,
        "Increase free disk space"
      ),
      this.booleanCheck(
        "OS",
        "Linux server profile",
        input.os ? input.os : "unknown",
        Boolean(input.os),
        "Use a supported Linux server"
      ),
      this.booleanCheck(
        "Docker",
        "Docker installed",
        input.dockerVersion ? input.dockerVersion : "missing",
        Boolean(input.dockerVersion),
        "Install Docker Engine"
      ),
      this.booleanCheck(
        "Compose",
        "Docker Compose v2 installed",
        input.composeVersion ? input.composeVersion : "missing",
        Boolean(input.composeVersion),
        "Install Docker Compose v2"
      ),
      this.booleanCheck(
        "Ports",
        "80, 443, 5432, 6379, 9000 available",
        [...ports].sort((a, b) => a - b).join(", ") || "none",
        [80, 443, 5432, 6379, 9000].every((port) => ports.has(port)),
        "Open required firewall ports"
      ),
      this.booleanCheck(
        "DNS/TLS",
        "DNS and TLS readiness",
        `dns:${Boolean(input.dnsReady)} tls:${Boolean(input.tlsReady)}`,
        Boolean(input.dnsReady && input.tlsReady),
        "Complete DNS and TLS readiness"
      ),
      this.booleanCheck(
        "Network",
        "Outbound and internal network ready",
        input.networkReady ? "ready" : "not ready",
        Boolean(input.networkReady),
        "Fix network connectivity"
      )
    ];
    const actionableFailures = checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.name}: ${check.action}`);
    const installBlocked = actionableFailures.length > 0;
    const now = new Date().toISOString();
    const report: Omit<InstallerReport, "auditEventId"> = {
      id: `instrep_${String(this.installerReports.length + 1).padStart(4, "0")}`,
      status: installBlocked ? "failed" : "passed",
      installBlocked,
      reportPath: `reports/install/${installBlocked ? "failed" : "passed"}-install-report.json`,
      checks,
      actionableFailures,
      composeServices: this.composeServices(),
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: installBlocked ? "installer.preflight.failed" : "installer.preflight.passed",
      resourceType: "installer_report",
      resourceId: report.id,
      severity: installBlocked ? "high" : "info",
      metadata: { installBlocked, actionableFailures }
    });
    const withAudit: InstallerReport = { ...report, auditEventId: audit.id };
    this.installerReports.push(withAudit);
    return withAudit;
  }

  saveSetupConfig(
    actor: PlatformUser,
    input: {
      domain: string;
      databaseUrl: string;
      storage: Record<string, string | undefined>;
      auth: Record<string, unknown>;
      ai: Record<string, unknown>;
      guardrail: Record<string, unknown>;
      backup: Record<string, unknown>;
      firstAdmin: Record<string, unknown>;
    }
  ): SetupConfiguration {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.domain.trim()) throw new ValidationError("Setup domain is required");
    const now = new Date().toISOString();
    const config: Omit<SetupConfiguration, "auditEventId"> = {
      id: `setup_${String(this.setupConfigurations.length + 1).padStart(4, "0")}`,
      status: "completed",
      domain: input.domain,
      databaseUrlMasked: this.maskDatabaseUrl(input.databaseUrl),
      storage: this.redactRecord(input.storage),
      auth: this.redactRecord(input.auth),
      ai: this.redactRecord(input.ai),
      guardrail: this.redactRecord(input.guardrail),
      backup: this.redactRecord(input.backup),
      firstAdmin: this.redactRecord(input.firstAdmin),
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: "installer.setup.completed",
      resourceType: "setup_configuration",
      resourceId: config.id,
      metadata: {
        domain: config.domain,
        storageProvider: config.storage.provider,
        databaseUrlMasked: config.databaseUrlMasked
      }
    });
    const withAudit: SetupConfiguration = { ...config, auditEventId: audit.id };
    this.setupConfigurations.push(withAudit);
    return withAudit;
  }

  configureBackupPolicy(
    actor: PlatformUser,
    input: {
      name: string;
      schedule: string;
      retentionDays: number;
      storage: Record<string, string | undefined>;
      encryptionMode: string;
      encryptionKeyRef: string;
      enabled: boolean;
    }
  ): BackupPolicy {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.name.trim()) throw new ValidationError("Backup policy name is required");
    if (!input.schedule.trim()) throw new ValidationError("Backup schedule is required");
    if (!input.encryptionMode.trim() || !input.encryptionKeyRef.trim())
      throw new ValidationError("Backup encryption mode and key reference are required");
    const now = new Date().toISOString();
    const policy: Omit<BackupPolicy, "auditEventId"> = {
      id: `bckpol_${String(this.backupPolicies.length + 1).padStart(4, "0")}`,
      name: input.name,
      schedule: input.schedule,
      retentionDays: input.retentionDays,
      storage: this.redactRecord(input.storage),
      encryptionMode: input.encryptionMode,
      encryptionKeyRef: input.encryptionKeyRef,
      enabled: input.enabled,
      status: input.enabled ? "active" : "disabled",
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: "backup.policy.configured",
      resourceType: "backup_policy",
      resourceId: policy.id,
      metadata: {
        schedule: policy.schedule,
        retentionDays: policy.retentionDays,
        storageProvider: policy.storage.provider,
        encryptionMode: policy.encryptionMode
      }
    });
    const withAudit: BackupPolicy = { ...policy, auditEventId: audit.id };
    this.backupPolicies.push(withAudit);
    return withAudit;
  }

  runBackup(
    actor: PlatformUser,
    input: { policyId: string; trigger: BackupRun["trigger"]; databaseName: string }
  ): BackupRun {
    this.auth.requireRole(actor, ["admin"]);
    const policy = this.requireBackupPolicy(input.policyId);
    if (policy.status !== "active")
      throw new ValidationError(`Backup policy ${policy.id} is not active`);
    const startedAt = new Date().toISOString();
    const id = `bckrun_${String(this.backupRuns.length + 1).padStart(4, "0")}`;
    const artifactUri = this.artifactUri(policy, id);
    const checksum = `sha256:${createHash("sha256").update(`${policy.id}:${input.databaseName}:${id}`).digest("hex")}`;
    const run: Omit<BackupRun, "auditEventId"> = {
      id,
      policyId: policy.id,
      trigger: input.trigger,
      databaseName: input.databaseName,
      status: "succeeded",
      encrypted: true,
      artifactUri,
      checksum,
      sizeBytes: 2_415_919_104,
      startedAt,
      finishedAt: new Date().toISOString(),
      createdByUserId: actor.id
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: "backup.succeeded",
      resourceType: "backup_run",
      resourceId: run.id,
      metadata: {
        policyId: policy.id,
        artifactUri: run.artifactUri,
        checksum: run.checksum,
        encrypted: run.encrypted
      }
    });
    const withAudit: BackupRun = { ...run, auditEventId: audit.id };
    this.backupRuns.push(withAudit);
    return withAudit;
  }

  configurePitr(
    actor: PlatformUser,
    input: {
      databaseName: string;
      walRetentionHours: number;
      baseBackupRunId: string;
      targetTimestamp: string;
      rpoMinutes: number;
      rtoMinutes: number;
    }
  ): PitrConfiguration {
    this.auth.requireRole(actor, ["admin"]);
    this.requireBackupRun(input.baseBackupRunId);
    const now = new Date().toISOString();
    const pitr: Omit<PitrConfiguration, "auditEventId"> = {
      id: `pitr_${String(this.pitrConfigurations.length + 1).padStart(4, "0")}`,
      databaseName: input.databaseName,
      walRetentionHours: input.walRetentionHours,
      baseBackupRunId: input.baseBackupRunId,
      targetTimestamp: input.targetTimestamp,
      rpoMinutes: input.rpoMinutes,
      rtoMinutes: input.rtoMinutes,
      status: input.walRetentionHours > 0 ? "ready" : "invalid",
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: "backup.pitr.configured",
      resourceType: "pitr_configuration",
      resourceId: pitr.id,
      metadata: {
        databaseName: pitr.databaseName,
        walRetentionHours: pitr.walRetentionHours,
        baseBackupRunId: pitr.baseBackupRunId
      }
    });
    const withAudit: PitrConfiguration = { ...pitr, auditEventId: audit.id };
    this.pitrConfigurations.push(withAudit);
    return withAudit;
  }

  runRestoreDrill(
    actor: PlatformUser,
    input: {
      backupRunId: string;
      pitrConfigId: string;
      targetTimestamp: string;
      validationChecks: string[];
      forceFailureChecks?: string[];
    }
  ): RestoreDrillReport {
    this.auth.requireRole(actor, ["admin"]);
    this.requireBackupRun(input.backupRunId);
    this.requirePitr(input.pitrConfigId);
    const failedChecks = [...(input.forceFailureChecks ?? [])];
    const status: RestoreDrillReport["status"] = failedChecks.length > 0 ? "failed" : "passed";
    const now = new Date().toISOString();
    const report: Omit<RestoreDrillReport, "auditEventId"> = {
      id: `restore_drill_${String(this.restoreDrills.length + 1).padStart(4, "0")}`,
      backupRunId: input.backupRunId,
      pitrConfigId: input.pitrConfigId,
      targetTimestamp: input.targetTimestamp,
      validationChecks: [...input.validationChecks],
      failedChecks,
      status,
      recoveryVerified: status === "passed",
      reportPath: `reports/restore/${status}-restore-drill-report.json`,
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: status === "passed" ? "restore.drill.passed" : "restore.drill.failed",
      resourceType: "restore_drill_report",
      resourceId: report.id,
      severity: status === "passed" ? "info" : "critical",
      metadata: {
        backupRunId: report.backupRunId,
        pitrConfigId: report.pitrConfigId,
        failedChecks: report.failedChecks,
        recoveryVerified: report.recoveryVerified
      }
    });
    const withAudit: RestoreDrillReport = { ...report, auditEventId: audit.id };
    this.restoreDrills.push(withAudit);
    return withAudit;
  }

  getOverview(actor: PlatformUser): OperationsRecoveryOverview {
    this.auth.requireRole(actor, ["admin"]);
    return {
      installerReports: [...this.installerReports],
      setupConfigurations: [...this.setupConfigurations],
      policies: [...this.backupPolicies],
      runs: [...this.backupRuns],
      pitrConfigurations: [...this.pitrConfigurations],
      restoreDrills: [...this.restoreDrills]
    };
  }

  private composeServices(): ComposeServiceReadiness[] {
    return [
      "platform-api",
      "admin-web",
      "creator-web",
      "app-store-pwa",
      "postgres",
      "keycloak",
      "minio",
      "redis",
      "caddy"
    ].map((name) => ({
      name,
      status: "healthy",
      endpoint: name === "caddy" ? ":443" : name
    }));
  }

  private numericCheck(
    name: string,
    required: string,
    observed: string,
    value: number,
    minimum: number,
    action: string
  ): OperationCheck {
    return {
      name,
      required,
      observed,
      status: value >= minimum ? "pass" : "fail",
      action: value >= minimum ? "-" : action
    };
  }

  private booleanCheck(
    name: string,
    required: string,
    observed: string,
    pass: boolean,
    action: string
  ): OperationCheck {
    return {
      name,
      required,
      observed,
      status: pass ? "pass" : "fail",
      action: pass ? "-" : action
    };
  }

  private maskDatabaseUrl(databaseUrl: string): string {
    return databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  }

  private redactRecord<T extends Record<string, unknown>>(record: T): T {
    return Object.fromEntries(
      Object.entries(record).filter(
        ([key]) =>
          !["secret", "secretAccessKey", "password", "clientSecret", "apiKey", "rawKey"].some(
            (unsafe) => key.toLowerCase().includes(unsafe.toLowerCase())
          )
      )
    ) as T;
  }

  private artifactUri(policy: BackupPolicy, runId: string): string {
    const provider = String(policy.storage.provider ?? "minio");
    const bucket = String(policy.storage.bucket ?? "evcp-backups");
    const prefix = `${runId}/evcp.dump.enc`;
    if (provider === "s3" || provider === "s3_compatible") return `s3://${bucket}/${prefix}`;
    return `minio://${bucket}/${prefix}`;
  }

  private requireBackupPolicy(policyId: string): BackupPolicy {
    const policy = this.backupPolicies.find((candidate) => candidate.id === policyId);
    if (!policy) throw new ValidationError(`Unknown backup policy: ${policyId}`);
    return policy;
  }

  private requireBackupRun(runId: string): BackupRun {
    const run = this.backupRuns.find((candidate) => candidate.id === runId);
    if (!run) throw new ValidationError(`Unknown backup run: ${runId}`);
    return run;
  }

  private requirePitr(pitrId: string): PitrConfiguration {
    const pitr = this.pitrConfigurations.find((candidate) => candidate.id === pitrId);
    if (!pitr) throw new ValidationError(`Unknown PITR configuration: ${pitrId}`);
    return pitr;
  }
}

export class PlatformAuthSsoService {
  private readonly providers: AuthProviderConfig[] = [];
  private readonly sessions: PlatformAuthSession[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly identity: IdentityService
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
      metadata: {
        providerType: provider.type,
        issuerUrl: provider.issuerUrl,
        fingerprint: provider.clientSecretFingerprint
      }
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
      metadata: {
        providerType: provider.type,
        entityId: provider.entityId,
        fingerprint: provider.certificateFingerprint
      }
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
        {
          clientId: "evcp-platform-api",
          purpose: "Platform API token validation",
          redirectUris: ["http://127.0.0.1:4100/*"]
        },
        {
          clientId: "evcp-admin-web",
          purpose: "Admin Console login",
          redirectUris: ["http://127.0.0.1:4100/*"]
        },
        {
          clientId: "evcp-creator-web",
          purpose: "Creator Workspace login",
          redirectUris: ["http://127.0.0.1:4101/*"]
        },
        {
          clientId: "evcp-generated-app",
          purpose: "Generated app Platform Auth SDK",
          redirectUris: ["/apps/*"]
        }
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
      boundary:
        "Direct IdP integrations must still terminate into the Platform Auth session and claims contract.",
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
      token: "",
      claims,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 60 * 60 * 1000).toISOString()
    };
    const platformUser = this.identity.provisionSsoUser({
      email: claims.email,
      name: claims.name,
      platformRoles: claims.platformRoles
    });
    const issuedToken = this.auth.issuePlatformSession(platformUser, {
      sessionId: session.id,
      issuedAt,
      ttlSeconds: 60 * 60
    });
    session.token = issuedToken.token;
    session.expiresAt = issuedToken.expiresAt;

    this.sessions.push(session);
    this.audit.record({
      actorId: actor.id,
      action:
        provider.type === "keycloak" ? "auth.keycloak_login.succeeded" : "auth.sso_login.succeeded",
      resourceType: "platform_auth_session",
      resourceId: session.id,
      metadata: {
        providerId: provider.id,
        providerType: provider.type,
        email: claims.email,
        platformRoles: claims.platformRoles
      }
    });
    return session;
  }

  /**
   * Issues a session for a native (email/password) login. Reuses the exact issuance body of
   * `simulateLogin` above — same `issuePlatformSession` call, same push onto `this.sessions` —
   * without duplicating any SSO provider/claims resolution, since the user already exists
   * (with its role already resolved) via the native credential-verification path.
   */
  issueNativeSession(user: PlatformUser): { token: string; expiresAt: string } {
    const sessionId = `psess_${String(this.sessions.length + 1).padStart(4, "0")}`;
    const issuedAt = new Date();
    const issuedToken = this.auth.issuePlatformSession(user, {
      sessionId,
      issuedAt,
      ttlSeconds: 60 * 60
    });
    const session: PlatformAuthSession = {
      id: sessionId,
      providerId: "native",
      providerType: "oidc",
      token: issuedToken.token,
      claims: {
        subject: user.id,
        email: user.email,
        name: user.name,
        groups: [],
        platformRoles: [user.role],
        appRoles: {}
      },
      issuedAt: issuedAt.toISOString(),
      expiresAt: issuedToken.expiresAt
    };
    this.sessions.push(session);
    return { token: issuedToken.token, expiresAt: issuedToken.expiresAt };
  }

  validateGeneratedAppSession(
    token: string,
    input: { appSlug: string; requiredRole?: string }
  ): GeneratedAppSessionValidation {
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

  private mapPlatformRoles(
    mapping: Record<string, PlatformRole[]>,
    groups: string[]
  ): PlatformRole[] {
    const roles = groups.flatMap((group) => mapping[group] ?? []);
    return [...new Set(roles)];
  }

  private normalizeMapping(
    mapping: Record<string, PlatformRole[]>
  ): Record<string, PlatformRole[]> {
    return Object.fromEntries(
      Object.entries(mapping).map(([group, roles]) => [group, [...new Set(roles)]])
    );
  }

  private maskAuthSecret(secret: string): string {
    return `************${secret.slice(-4)}`;
  }
}

export class BreakGlassService {
  private readonly sessions: BreakGlassSession[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly runtime: AiGatewayRuntimeOptions = {}
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
      requiredChecks: [
        "auth_session_required",
        "app_role_required",
        "audit_high_severity",
        "break_glass_disabled"
      ],
      publishAllowed: false,
      externalExposureAllowed: false
    }
  ];

  constructor(private readonly auth: MockAuthService) {}

  listTemplates(actor: PlatformUser): PolicyTemplate[] {
    this.auth.requireRole(actor, ["admin"]);
    return [...this.templates];
  }

  evaluate(
    actor: PlatformUser,
    input: { classification: PolicyClassification; action: string }
  ): PolicyTemplate {
    this.auth.requireRole(actor, ["admin"]);
    const template = this.templates.find(
      (candidate) => candidate.classification === input.classification
    );
    if (!template)
      throw new ValidationError(`Unknown policy classification: ${input.classification}`);
    return template;
  }
}

export class ProjectService {
  private readonly projects: PlatformProject[] = seedProjects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    ownerUserId: mockUsers.creator.id,
    appType: project.appType,
    businessProblem: "Employees need a self-service leave request and manager approval workflow.",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal",
    appId: project.id.replace(/^prj_/, "app_"),
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

    const id = `prj_${randomUUID().replaceAll("-", "")}`;
    const project: PlatformProject = {
      id,
      name: input.name,
      status: "draft",
      ownerUserId: input.actor.id,
      appType: input.appType ?? "Workflow App",
      businessProblem:
        input.businessProblem ?? "Capture the business problem before PRD generation.",
      targetDepartment: input.targetDepartment ?? "Business Team",
      intendedUsers: input.intendedUsers ?? ["Business User"],
      dataSensitivity: input.dataSensitivity ?? "internal",
      appId: id.replace(/^prj_/, "app_"),
      createdAt: new Date().toISOString()
    };

    const existingIndex = this.projects.findIndex((candidate) => candidate.id === project.id);
    if (existingIndex >= 0) this.projects[existingIndex] = project;
    else this.projects.push(project);

    this.audit.record({
      actorId: input.actor.id,
      action: "project.created",
      resourceType: "project",
      resourceId: project.id,
      metadata: { name: project.name }
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
  return `${prefix}_${value
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()}`;
}

export class AiGovernanceService {
  private readonly providers: AiProvider[] = [];
  private readonly apiKeys: StoredAiApiKey[] = [];
  private readonly routes: AiScenarioRoute[] = [];
  private readonly quotas: AiQuota[] = [];
  private readonly usageLogs: AiUsageLog[] = [];
  private readonly providerCircuits = new Map<string, { failures: number; openedAt?: number }>();
  private providerCalls = 0;

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly runtime: AiGatewayRuntimeOptions = {}
  ) {}

  createProvider(
    actor: PlatformUser,
    input: Omit<AiProvider, "id" | "status" | "createdAt">
  ): AiProvider {
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
      metadata: {
        primaryProviderId: route.primary.providerId,
        fallbackProviderId: route.fallback?.providerId
      }
    });

    return route;
  }

  resolveRoute(scenario: AiScenario): AiScenarioRoute {
    const route = this.routes.find((candidate) => candidate.scenario === scenario);
    if (!route) throw new Error(`No route configured for scenario ${scenario}`);
    return route;
  }

  listRoutes(): AiScenarioRoute[] {
    return [...this.routes];
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

  listQuotas(): AiQuota[] {
    return [...this.quotas];
  }

  checkQuota(scope: AiQuota["scope"], requestedTokens: number): QuotaDecision {
    const quota = this.quotas.find((candidate) => candidate.scope === scope);
    if (!quota)
      return { allowed: true, reason: "within_quota", remainingToday: Number.MAX_SAFE_INTEGER };

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

  testProviderCall(
    actor: PlatformUser,
    input: {
      scenario: AiScenario;
      prompt?: string;
      requestedTokens?: number;
      dryRun?: boolean;
    }
  ): AiProviderTestCallResult {
    this.requireAdmin(actor, "ai.provider_test.denied", "ai_provider_test_call", input.scenario);
    const prompt =
      input.prompt?.trim() || `Validate ${input.scenario} provider route before Creator use`;
    const completion = this.invokeCompletion(actor, {
      projectId: "admin_provider_test_call",
      scenario: input.scenario,
      prompt,
      requestedTokens: input.requestedTokens,
      guardrailDecision: "allow",
      dryRun: input.dryRun ?? true,
      timeoutMs: 10_000
    });
    const provider = this.requireProvider(completion.providerId);

    return {
      providerId: provider.id,
      providerName: provider.name,
      adapter: completion.adapter,
      model: completion.model,
      status: completion.status,
      fallbackUsed: completion.fallbackUsed,
      tokensUsed: completion.tokensUsed,
      latencyMs: completion.latencyMs,
      usageLogId: completion.usageLogId,
      outputExcerpt: completion.text.slice(0, 280)
    };
  }

  invokeCompletion(
    actor: PlatformUser,
    input: {
      projectId: string;
      scenario: AiScenario;
      prompt: string;
      requestedTokens?: number;
      guardrailDecision?: GuardrailDecision;
      // Callers use dryRun: false only when the runtime supplies a live provider fetcher.
      dryRun?: boolean;
      timeoutMs?: number;
      allowDeterministicFallback?: boolean;
      deterministicFallbackText?: string;
    }
  ): AiCompletionResponse {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const route = this.resolveRoute(input.scenario);
    const prompt = input.prompt.trim();
    if (!prompt) throw new ValidationError("AI prompt is required");
    const requestedTokens = input.requestedTokens ?? estimateAiTokens(prompt);

    if (input.guardrailDecision === "block") {
      const usage = this.recordUsage({
        projectId: input.projectId,
        taskId: `ai_${input.scenario}_blocked`,
        actorId: actor.id,
        scenario: input.scenario,
        providerId: route.primary.providerId,
        model: route.primary.model,
        prompt,
        tokensUsed: 0,
        status: "blocked",
        reason: "guardrail_blocked"
      });
      throw new ValidationError(
        `AI request blocked by guardrail before provider call (${usage.id})`
      );
    }

    const quota = this.checkQuota("creator", requestedTokens);
    if (!quota.allowed) {
      const usage = this.recordUsage({
        projectId: input.projectId,
        taskId: `ai_${input.scenario}_quota_blocked`,
        actorId: actor.id,
        scenario: input.scenario,
        providerId: route.primary.providerId,
        model: route.primary.model,
        prompt,
        tokensUsed: 0,
        status: "blocked",
        reason: quota.reason
      });
      throw new QuotaExceededError(
        `Creator quota exceeded before external provider call. Remaining today: ${quota.remainingToday}. Usage log: ${usage.id}`
      );
    }

    try {
      return this.invokeRouteTarget(actor, {
        projectId: input.projectId,
        scenario: input.scenario,
        prompt,
        route,
        requestedTokens,
        dryRun: input.dryRun ?? true,
        timeoutMs: input.timeoutMs ?? 30_000,
        target: route.primary,
        status: "succeeded",
        fallbackUsed: false
      });
    } catch (error) {
      if (
        !route.fallback ||
        !input.allowDeterministicFallback ||
        !input.deterministicFallbackText
      ) {
        const usage = this.recordUsage({
          projectId: input.projectId,
          taskId: `ai_${input.scenario}_failed`,
          actorId: actor.id,
          scenario: input.scenario,
          providerId: route.primary.providerId,
          model: route.primary.model,
          prompt,
          tokensUsed: 0,
          status: "failed",
          reason: error instanceof Error ? error.message : String(error)
        });
        throw new ValidationError(
          `AI provider call failed and no fallback policy is available (${usage.id}): ${providerErrorMessage(error)}`
        );
      }

      const provider = this.requireProvider(route.fallback.providerId);
      const usage = this.recordUsage({
        projectId: input.projectId,
        taskId: `ai_${input.scenario}_fallback`,
        actorId: actor.id,
        scenario: input.scenario,
        providerId: provider.id,
        model: route.fallback.model,
        prompt,
        tokensUsed: estimateAiTokens(prompt, input.deterministicFallbackText),
        status: "fallback",
        adapter: provider.adapter,
        latencyMs: 1,
        reason: error instanceof Error ? error.message : String(error)
      });
      this.audit.record({
        actorId: actor.id,
        action: "ai.gateway.fallback_used",
        resourceType: "ai_usage_log",
        resourceId: usage.id,
        severity: "warning",
        metadata: {
          projectId: input.projectId,
          scenario: input.scenario,
          primaryProviderId: route.primary.providerId,
          fallbackProviderId: provider.id
        }
      });
      return {
        text: input.deterministicFallbackText,
        providerId: provider.id,
        model: route.fallback.model,
        adapter: provider.adapter,
        tokensUsed: usage.tokensUsed,
        latencyMs: usage.latencyMs ?? 1,
        status: "fallback",
        usageLogId: usage.id,
        fallbackUsed: true
      };
    }
  }

  listUsageLogs(): AiUsageLog[] {
    return [...this.usageLogs];
  }

  private invokeRouteTarget(
    actor: PlatformUser,
    input: {
      projectId: string;
      scenario: AiScenario;
      prompt: string;
      route: AiScenarioRoute;
      requestedTokens: number;
      dryRun: boolean;
      timeoutMs: number;
      target: AiScenarioRoute["primary"];
      status: "succeeded";
      fallbackUsed: boolean;
    }
  ): AiCompletionResponse {
    const provider = this.requireProvider(input.target.providerId);
    const circuitKey = `${provider.id}:${input.target.model}`;
    this.assertCircuitClosed(circuitKey);
    const key = this.requireActiveKey(provider.id);
    const adapter = this.createAdapter(provider);
    this.recordProviderCall();
    let response: { text: string; tokensUsed: number; latencyMs: number };
    try {
      response = adapter.complete({
        provider,
        key,
        model: input.target.model,
        prompt: input.prompt,
        scenario: input.scenario,
        dryRun: input.dryRun,
        timeoutMs: input.timeoutMs
      });
      this.closeCircuit(circuitKey);
    } catch (error) {
      this.recordCircuitFailure(circuitKey);
      throw error;
    }
    const usage = this.recordUsage({
      projectId: input.projectId,
      taskId: `ai_${input.scenario}_${String(this.usageLogs.length + 1).padStart(4, "0")}`,
      actorId: actor.id,
      scenario: input.scenario,
      providerId: provider.id,
      model: input.target.model,
      prompt: input.prompt,
      tokensUsed: response.tokensUsed,
      status: input.status,
      adapter: provider.adapter,
      latencyMs: response.latencyMs
    });
    this.audit.record({
      actorId: actor.id,
      action: "ai.gateway.completed",
      resourceType: "ai_usage_log",
      resourceId: usage.id,
      metadata: {
        projectId: input.projectId,
        scenario: input.scenario,
        providerId: provider.id,
        model: input.target.model,
        tokensUsed: response.tokensUsed
      }
    });
    return {
      text: response.text,
      providerId: provider.id,
      model: input.target.model,
      adapter: provider.adapter,
      tokensUsed: response.tokensUsed,
      latencyMs: response.latencyMs,
      status: input.status,
      usageLogId: usage.id,
      fallbackUsed: input.fallbackUsed
    };
  }

  private recordUsage(
    input: Omit<AiUsageLog, "id" | "occurredAt" | "estimatedCostUsd" | "promptFingerprint">
  ): AiUsageLog {
    const usage: AiUsageLog = {
      ...input,
      id: `aigw_${String(this.usageLogs.length + 1).padStart(4, "0")}`,
      occurredAt: new Date().toISOString(),
      estimatedCostUsd: Number((input.tokensUsed * 0.000002).toFixed(6)),
      promptFingerprint: fingerprintSecret(input.prompt)
    };
    this.usageLogs.push(usage);
    return usage;
  }

  private assertCircuitClosed(circuitKey: string): void {
    const circuit = this.providerCircuits.get(circuitKey);
    if (!circuit?.openedAt) return;
    const cooldownMs = this.runtime.circuitBreaker?.cooldownMs ?? 60_000;
    const elapsedMs = (this.runtime.now?.() ?? Date.now()) - circuit.openedAt;
    if (elapsedMs < cooldownMs) {
      throw new ValidationError(
        `AI provider circuit open for ${circuitKey}; retry after ${Math.ceil((cooldownMs - elapsedMs) / 1000)}s`
      );
    }
    this.providerCircuits.delete(circuitKey);
  }

  private recordCircuitFailure(circuitKey: string): void {
    const threshold = this.runtime.circuitBreaker?.failureThreshold ?? 0;
    if (threshold <= 0) return;
    const current = this.providerCircuits.get(circuitKey) ?? { failures: 0 };
    const failures = current.failures + 1;
    this.providerCircuits.set(circuitKey, {
      failures,
      openedAt: failures >= threshold ? (this.runtime.now?.() ?? Date.now()) : current.openedAt
    });
  }

  private closeCircuit(circuitKey: string): void {
    this.providerCircuits.delete(circuitKey);
  }

  private requireActiveKey(providerId: string): StoredAiApiKey {
    const key = this.apiKeys
      .filter((candidate) => candidate.providerId === providerId && candidate.status === "active")
      .sort((left, right) => left.fallbackPriority - right.fallbackPriority)[0];
    if (!key)
      throw new ValidationError(`No active AI API key configured for provider ${providerId}`);
    key.lastUsedAt = new Date().toISOString();
    return key;
  }

  private createAdapter(provider: AiProvider): AiCompletionAdapter {
    if (["openai", "openrouter", "lm_studio", "azure_openai"].includes(provider.adapter))
      return new OpenAiCompatibleCompletionAdapter(this.runtime);
    throw new ValidationError(
      `AI provider adapter ${provider.adapter} is not implemented for external calls yet`
    );
  }

  private requireAdmin(
    actor: PlatformUser,
    deniedAction: string,
    resourceType: string,
    resourceId: string
  ): void {
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
    const {
      secretCiphertext: _secretCiphertext,
      keyVersion: _keyVersion,
      encryptionProvider: _encryptionProvider,
      ...publicKey
    } = key;
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

  createRule(
    actor: PlatformUser,
    input: Omit<GuardrailRule, "id" | "status" | "updatedAt">
  ): GuardrailRule {
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

  evaluatePrompt(
    actor: PlatformUser,
    input: { prompt: string; scenario: string }
  ): GuardrailResult {
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

  hydrate(state: {
    sources: KnowledgeSource[];
    versions: KnowledgeVersion[];
    approvals: KnowledgeApproval[];
    retrievalLogs: KnowledgeRetrievalLog[];
  }): void {
    this.sources.splice(0, this.sources.length, ...state.sources);
    this.versions.splice(0, this.versions.length, ...state.versions);
    this.approvals.splice(0, this.approvals.length, ...state.approvals);
    this.retrievalLogs.splice(0, this.retrievalLogs.length, ...state.retrievalLogs);
  }
  snapshot(): {
    sources: KnowledgeSource[];
    versions: KnowledgeVersion[];
    approvals: KnowledgeApproval[];
    retrievalLogs: KnowledgeRetrievalLog[];
  } {
    return {
      sources: [...this.sources],
      versions: [...this.versions],
      approvals: [...this.approvals],
      retrievalLogs: [...this.retrievalLogs]
    };
  }

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

  createProjectFileDraft(
    actor: PlatformUser,
    project: PlatformProject,
    input: {
      sourceId: string;
      versionId: string;
      title: string;
      sourceType: KnowledgeSourceType;
      contentHash: string;
      tags?: string[];
    }
  ): { source: KnowledgeSource; version: KnowledgeVersion } {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, project.id);
    if (!input.title.trim()) throw new ValidationError("Project file title is required");
    if (!input.contentHash.trim())
      throw new ValidationError("Project file content hash is required");

    const now = new Date().toISOString();
    const source: KnowledgeSource = {
      id: input.sourceId,
      title: input.title,
      sourceType: input.sourceType,
      ownerUserId: actor.id,
      scope: {
        visibility: "project",
        department: project.targetDepartment,
        projectIds: [project.id],
        appIds: project.appId ? [project.appId] : [],
        agentRoles: [
          "requirement_analyst",
          "frontend_developer",
          "backend_developer",
          "technical_writer"
        ],
        scenarios: ["requirement_analysis", "frontend_coding", "backend_coding", "documentation"]
      },
      uploadStatus: "pending",
      indexStatus: "pending",
      status: "draft",
      tags: [...(input.tags ?? []), "project-upload"],
      createdAt: now,
      updatedAt: now
    };
    const version: KnowledgeVersion = {
      id: input.versionId,
      sourceId: source.id,
      version: "v1",
      contentHash: input.contentHash,
      changelog: "Creator project file upload initialized",
      chunkCount: 0,
      excerpts: [],
      approvalStatus: "pending",
      lifecycleStatus: "pending",
      isActive: false,
      createdByUserId: actor.id,
      createdAt: now
    };

    this.sources.push(source);
    this.versions.push(version);
    this.audit.record({
      actorId: actor.id,
      action: "knowledge.project_file.draft_created",
      resourceType: "knowledge_source",
      resourceId: source.id,
      metadata: { projectId: project.id, versionId: version.id, sourceType: source.sourceType }
    });
    return { source, version };
  }

  completeProjectFileVersion(
    actor: PlatformUser,
    input: {
      sourceId: string;
      versionId: string;
      excerpts: string[];
      clean: boolean;
      failureReason?: string;
    }
  ): KnowledgeVersion {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const source = this.requireSource(input.sourceId);
    const version = this.requireVersion(input.versionId);
    if (version.sourceId !== source.id) {
      throw new ValidationError(
        `Knowledge version ${version.id} does not belong to source ${source.id}`
      );
    }

    const now = new Date().toISOString();
    source.uploadStatus = input.clean ? "uploaded" : "failed";
    source.indexStatus = input.clean ? "indexed" : "failed";
    source.status = input.clean ? "active" : "draft";
    source.updatedAt = now;
    version.excerpts = [...input.excerpts];
    version.chunkCount = input.excerpts.length;
    version.changelog = input.clean
      ? "Creator project file uploaded, scanned, and indexed"
      : `Creator project file rejected: ${input.failureReason ?? "scan failed"}`;
    version.approvalStatus = input.clean ? "approved" : "rejected";
    version.lifecycleStatus = input.clean ? "active" : "rejected";
    version.isActive = input.clean;
    version.approvedByUserId = input.clean ? actor.id : undefined;
    version.approvedAt = input.clean ? now : undefined;

    this.audit.record({
      actorId: actor.id,
      action: input.clean ? "knowledge.project_file.activated" : "knowledge.project_file.rejected",
      resourceType: "knowledge_version",
      resourceId: version.id,
      severity: input.clean ? "info" : "warning",
      metadata: { sourceId: source.id, failureReason: input.failureReason }
    });
    return version;
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
    if (!input.contentHash.trim())
      throw new ValidationError("Knowledge version content hash is required");
    if (!input.changelog.trim())
      throw new ValidationError("Knowledge version changelog is required");

    const versionNumber =
      this.versions.filter((candidate) => candidate.sourceId === sourceId).length + 1;
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
      for (const candidate of this.versions.filter(
        (item) => item.sourceId === version.sourceId && item.isActive
      )) {
        candidate.isActive = false;
        candidate.lifecycleStatus = "superseded";
      }
      version.approvalStatus = "approved";
      version.lifecycleStatus = "active";
      version.isActive = true;
      version.approvedByUserId = actor.id;
      version.approvedAt = decidedAt;
      source.status = "active";
      source.indexStatus = "indexed"; // approved version's excerpts are the index; retrieve() needs indexStatus==="indexed"
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
      metadata: {
        sourceId: source.id,
        note: approval.note,
        lifecycleStatus: version.lifecycleStatus
      }
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
    if (actor.role === "creator" && !input.projectId) {
      throw new ValidationError("Creator knowledge retrieval requires project context");
    }
    const project = input.projectId
      ? this.projects.getProjectForActor(actor, input.projectId)
      : undefined;
    const department = input.department ?? project?.targetDepartment;
    const appId = input.appId ?? project?.appId;
    const required = new Set(input.requiredKnowledgeSourceIds ?? []);
    const matched: KnowledgeRetrievalSource[] = [];
    const deniedVersionIds: string[] = [];
    const deniedReasons: string[] = [];

    for (const version of this.versions.filter(
      (candidate) =>
        candidate.approvalStatus === "approved" &&
        candidate.lifecycleStatus === "active" &&
        candidate.isActive
    )) {
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
    input: {
      projectId?: string;
      appId?: string;
      department?: string;
      agentRole: AgentRoleKey;
      scenario: AiScenario;
    }
  ): string | undefined {
    if (scope.scenarios?.length && !scope.scenarios.includes(input.scenario))
      return `scenario mismatch: ${input.scenario}`;
    if (scope.agentRoles?.length && !scope.agentRoles.includes(input.agentRole))
      return `agent role mismatch: ${input.agentRole}`;
    if (scope.visibility === "department" || scope.department) {
      if (scope.department && scope.department !== input.department)
        return `department mismatch: ${input.department ?? "unknown"}`;
    }
    if (scope.visibility === "project" || scope.projectIds?.length) {
      if (
        scope.projectIds?.length &&
        (!input.projectId || !scope.projectIds.includes(input.projectId))
      )
        return `project mismatch: ${input.projectId ?? "unknown"}`;
    }
    if (scope.visibility === "app" || scope.appIds?.length) {
      if (scope.appIds?.length && (!input.appId || !scope.appIds.includes(input.appId)))
        return `app mismatch: ${input.appId ?? "unknown"}`;
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

export class ProjectFileService {
  private readonly files: ProjectFileUpload[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly projects: ProjectService,
    private readonly knowledge: KnowledgeGovernanceService
  ) {}

  initializeUpload(
    actor: PlatformUser,
    projectId: string,
    input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
      purpose?: ProjectFilePurpose;
      includeByDefault?: boolean;
    }
  ): ProjectFileUploadInitResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    this.validateUploadMetadata(input);

    const now = new Date().toISOString();
    const uploadId = `upl_${Date.now().toString(36)}_${String(this.files.length + 1).padStart(4, "0")}`;
    const sourceId = `knsrc_${uploadId}`;
    const versionId = `${sourceId}_v1`;
    const objectKey = [
      "projects",
      project.id,
      "knowledge",
      sourceId,
      versionId,
      this.sanitizeFileName(input.fileName)
    ].join("/");

    this.knowledge.createProjectFileDraft(actor, project, {
      sourceId,
      versionId,
      title: input.fileName,
      sourceType: this.sourceTypeFor(input.fileName, input.mimeType),
      contentHash: `sha256:${input.sha256}`,
      tags: ["creator-upload", input.purpose ?? "ai_context"]
    });

    const file: ProjectFileUpload = {
      id: uploadId,
      projectId: project.id,
      sourceId,
      versionId,
      ownerUserId: actor.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      bucket: PROJECT_FILE_BUCKET,
      objectKey,
      purpose: input.purpose ?? "ai_context",
      uploadStatus: "pending",
      scanStatus: "pending",
      indexStatus: "pending",
      extractionStatus: "pending",
      includeByDefault: input.includeByDefault ?? true,
      createdAt: now,
      updatedAt: now
    };
    this.files.push(file);

    this.audit.record({
      actorId: actor.id,
      action: "project_file.upload_initialized",
      resourceType: "project_file_upload",
      resourceId: file.id,
      metadata: {
        projectId: project.id,
        sourceId,
        versionId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes
      }
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return {
      uploadId,
      sourceId,
      versionId,
      objectKey,
      uploadUrl: `memory://${PROJECT_FILE_BUCKET}/${objectKey}`,
      expiresAt,
      file: { ...file }
    };
  }

  completeUpload(
    actor: PlatformUser,
    projectId: string,
    uploadId: string,
    input: {
      scanStatus?: ProjectFileScanStatus;
      extractedText?: string;
      excerpts?: string[];
    } = {}
  ): { file: ProjectFileUpload } {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const file = this.requireProjectFile(uploadId);
    if (file.projectId !== project.id) {
      throw new PermissionError(`Project file ${uploadId} does not belong to this project`);
    }
    if (file.archivedAt) throw new ValidationError(`Project file ${uploadId} is archived`);

    const scanStatus = input.scanStatus ?? "clean";
    const clean = scanStatus === "clean";
    const excerpts = clean ? this.excerptsFor(file, input) : [];
    const now = new Date().toISOString();

    file.uploadStatus = clean ? "uploaded" : "failed";
    file.scanStatus = clean ? "clean" : scanStatus;
    file.indexStatus = clean ? "indexed" : "failed";
    file.extractionStatus = clean ? "indexed" : "failed";
    file.updatedAt = now;

    this.knowledge.completeProjectFileVersion(actor, {
      sourceId: file.sourceId,
      versionId: file.versionId,
      excerpts,
      clean,
      failureReason: clean ? undefined : `scan status ${scanStatus}`
    });

    this.audit.record({
      actorId: actor.id,
      action: "project_file.upload_completed",
      resourceType: "project_file_upload",
      resourceId: file.id,
      severity: clean ? "info" : "warning",
      metadata: {
        projectId: project.id,
        sourceId: file.sourceId,
        versionId: file.versionId,
        scanStatus: file.scanStatus,
        indexStatus: file.indexStatus
      }
    });
    return { file: { ...file } };
  }

  listProjectFiles(actor: PlatformUser, projectId: string): ProjectFileUpload[] {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    return this.files
      .filter((file) => file.projectId === project.id && !file.archivedAt)
      .map((file) => ({ ...file }));
  }

  resolveAttachmentSources(
    actor: PlatformUser,
    projectId: string,
    attachmentIds: string[] | undefined
  ): { sourceIds: string[]; versionIds: string[]; files: ProjectFileUpload[] } {
    if (!attachmentIds?.length) return { sourceIds: [], versionIds: [], files: [] };
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const files = attachmentIds.map((id) => this.requireProjectFile(id));
    for (const file of files) {
      if (file.projectId !== project.id) {
        throw new PermissionError(`Project file ${file.id} does not belong to this project`);
      }
      if (
        file.archivedAt ||
        file.uploadStatus !== "uploaded" ||
        file.scanStatus !== "clean" ||
        file.indexStatus !== "indexed" ||
        file.extractionStatus !== "indexed"
      ) {
        throw new ValidationError(`Project file ${file.fileName} is not ready for AI context`);
      }
    }
    return {
      sourceIds: files.map((file) => file.sourceId),
      versionIds: files.map((file) => file.versionId),
      files: files.map((file) => ({ ...file }))
    };
  }

  archiveProjectFile(actor: PlatformUser, projectId: string, uploadId: string): ProjectFileUpload {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const file = this.requireProjectFile(uploadId);
    if (file.projectId !== project.id) {
      throw new PermissionError(`Project file ${uploadId} does not belong to this project`);
    }
    const now = new Date().toISOString();
    file.archivedAt = now;
    file.updatedAt = now;
    this.audit.record({
      actorId: actor.id,
      action: "project_file.archived",
      resourceType: "project_file_upload",
      resourceId: file.id,
      metadata: { projectId: project.id, sourceId: file.sourceId, versionId: file.versionId }
    });
    return { ...file };
  }

  private validateUploadMetadata(input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  }): void {
    if (!input.fileName.trim()) throw new ValidationError("Upload fileName required");
    if (!PROJECT_FILE_ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new ValidationError(`Upload mime type ${input.mimeType} is not allowed`);
    }
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new ValidationError("Upload file size must be greater than zero");
    }
    if (input.sizeBytes > PROJECT_FILE_MAX_SIZE_BYTES) {
      throw new ValidationError(
        `Upload file size ${input.sizeBytes} exceeds ${PROJECT_FILE_MAX_SIZE_BYTES} bytes`
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) {
      throw new ValidationError("Upload sha256 must be a 64 character hex digest");
    }
  }

  private requireProjectFile(uploadId: string): ProjectFileUpload {
    const file = this.files.find((candidate) => candidate.id === uploadId);
    if (!file) throw new ValidationError(`Unknown project file upload: ${uploadId}`);
    return file;
  }

  private sourceTypeFor(fileName: string, mimeType: string): KnowledgeSourceType {
    const lower = fileName.toLowerCase();
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
    if (mimeType === "text/markdown" || lower.endsWith(".md") || lower.endsWith(".markdown"))
      return "markdown";
    if (mimeType.includes("wordprocessingml")) return "word";
    if (mimeType.includes("spreadsheetml") || lower.endsWith(".csv")) return "excel";
    if (lower.includes("openapi") && (lower.endsWith(".json") || lower.endsWith(".yaml")))
      return "openapi_json";
    return "text";
  }

  private sanitizeFileName(fileName: string): string {
    const sanitized = fileName
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    return sanitized || "upload";
  }

  private excerptsFor(
    file: ProjectFileUpload,
    input: { extractedText?: string; excerpts?: string[] }
  ): string[] {
    if (input.excerpts?.length)
      return input.excerpts.map((excerpt) => excerpt.trim()).filter(Boolean);
    const text = input.extractedText?.trim();
    if (!text) return [`Uploaded ${file.fileName} (${file.mimeType}, ${file.sizeBytes} bytes).`];
    const chunks = text.match(/[\s\S]{1,800}/g) ?? [text];
    return chunks
      .slice(0, 8)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
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

  // Replace in-memory state with a persisted snapshot (used to rehydrate Prisma-backed state on boot).
  hydrate(state: {
    skills: SkillDefinition[];
    versions: SkillVersion[];
    approvals: SkillApproval[];
    assignments: SkillAssignment[];
  }): void {
    this.skills.splice(0, this.skills.length, ...state.skills);
    this.versions.splice(0, this.versions.length, ...state.versions);
    this.approvals.splice(0, this.approvals.length, ...state.approvals);
    this.assignments.splice(0, this.assignments.length, ...state.assignments);
  }
  snapshot(): {
    skills: SkillDefinition[];
    versions: SkillVersion[];
    approvals: SkillApproval[];
    assignments: SkillAssignment[];
  } {
    return {
      skills: [...this.skills],
      versions: [...this.versions],
      approvals: [...this.approvals],
      assignments: [...this.assignments]
    };
  }

  createSkill(
    actor: PlatformUser,
    input: { key: string; name: string; description?: string; ownerUserId: string }
  ): SkillDefinition {
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

    const versionNumber =
      this.versions.filter((candidate) => candidate.skillId === skillId).length + 1;
    const versionName = input.version ?? `v${versionNumber}`;
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          instruction: input.instruction,
          inputSchema: input.inputSchema,
          outputSchema: input.outputSchema
        })
      )
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
      for (const candidate of this.versions.filter(
        (item) => item.skillId === version.skillId && item.isActive
      )) {
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
      metadata: {
        skillId: assignment.skillId,
        skillVersionId: assignment.skillVersionId,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId
      }
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
    if (actor.role === "creator" && !input.projectId) {
      throw new ValidationError("Creator skill resolution requires project context");
    }
    const project = input.projectId
      ? this.projects.getProjectForActor(actor, input.projectId)
      : undefined;
    const department = input.department ?? project?.targetDepartment;
    const appId = input.appId ?? project?.appId;

    const candidates = this.assignments
      .filter(
        (assignment) =>
          assignment.status === "active" &&
          assignment.agentRole === input.agentRole &&
          assignment.scenario === input.scenario
      )
      .filter((assignment) =>
        this.assignmentMatches(assignment, { projectId: input.projectId, appId, department })
      )
      .map((assignment) => {
        const version = this.versions.find(
          (candidate) => candidate.id === assignment.skillVersionId
        );
        const skill = version
          ? this.skills.find((candidate) => candidate.id === version.skillId)
          : undefined;
        return { assignment, version, skill };
      })
      .filter(
        ({ version, skill }) =>
          skill?.status === "active" &&
          version?.approvalStatus === "approved" &&
          version.lifecycleStatus === "active" &&
          version.isActive
      )
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
      throw new ValidationError(
        `No approved active skill for ${input.agentRole} / ${input.scenario}`
      );
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

  private assignmentMatches(
    assignment: SkillAssignment,
    input: { projectId?: string; appId?: string; department?: string }
  ): boolean {
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
      throw new ValidationError(
        `PRD generation blocked by guardrail: ${guardrail.matchedRule?.name ?? guardrail.severity}`
      );
    }

    const fallbackText = this.buildDeterministicPrdSummary(project);
    const completion = this.aiGovernance.invokeCompletion(actor, {
      projectId: project.id,
      scenario: "prd_generation",
      prompt: sourcePrompt,
      requestedTokens: 300,
      guardrailDecision: guardrail.decision,
      dryRun: true,
      allowDeterministicFallback: true,
      deterministicFallbackText: fallbackText
    });

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
        providerId: completion.providerId,
        model: completion.model
      },
      sections: this.buildSections(project, completion.text),
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
      metadata: {
        projectId: project.id,
        route: route.primary,
        guardrailDecision: guardrail.decision,
        aiUsageLogId: completion.usageLogId,
        aiStatus: completion.status,
        fallbackUsed: completion.fallbackUsed,
        tokensUsed: completion.tokensUsed
      }
    });

    return draft;
  }

  getCurrent(actor: PlatformUser, projectId: string): PrdVersion {
    const document = this.getDocumentForActor(actor, projectId);
    const version = document.versions.find(
      (candidate) => candidate.id === document.currentVersionId
    );
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
      sections: draft.sections.map((section) => ({
        ...section,
        id: section.id.replace(versionId, `prdver_${project.id}_baseline_v1_0`)
      }))
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

  createVersionFromChange(
    actor: PlatformUser,
    projectId: string,
    change: PrdChangeRequest
  ): PrdVersion {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const project = this.projects.getProjectForActor(actor, projectId);
    const document = this.getDocumentForActor(actor, project.id);
    const current = document.versions.find(
      (candidate) => candidate.id === document.currentVersionId
    );
    if (!current) throw new ValidationError(`No current PRD version for project ${projectId}`);

    const now = new Date().toISOString();
    const approvedCount = document.versions.filter((version) =>
      version.version.startsWith("1.")
    ).length;
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

  private buildDeterministicPrdSummary(project: PlatformProject): string {
    return `Deterministic PRD fallback for ${project.name}: ${project.businessProblem}`;
  }

  private buildSections(project: PlatformProject, aiSummary?: string): PrdSection[] {
    const sections = [
      [
        "overview",
        "Overview",
        `${project.name} is a ${project.appType} for ${project.targetDepartment}.${aiSummary ? `\n\nAI Gateway Summary: ${aiSummary}` : ""}`
      ],
      ["business_objective", "Business Objective", project.businessProblem],
      ["users_roles", "Users and Roles", `Primary users: ${project.intendedUsers.join(", ")}.`],
      [
        "core_flows",
        "Core Flows",
        "Create request, manager review, HR visibility, status tracking and audit trail."
      ],
      [
        "data_model",
        "Data Model",
        "Employee, leave request, approval step, attachment, notification and audit event."
      ],
      [
        "permissions",
        "Permissions",
        "Employees manage own requests. Managers approve team requests. HR admins administer policy."
      ],
      [
        "nfr",
        "Non-Functional Requirements",
        `Data sensitivity is ${project.dataSensitivity}; all access must be authenticated and audited.`
      ],
      [
        "acceptance_criteria",
        "Acceptance Criteria",
        "Creator can generate, review and confirm PRD baseline before app generation."
      ]
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

  constructor(private readonly projects: ProjectService) {}

  getDatabaseView(actor: PlatformUser, projectId: string): DatabaseViewSnapshot {
    const project = this.projects.getProjectForActor(actor, projectId);
    this.ensureMetadata(project);

    return {
      project,
      schemaName: schemaNameFor(resourceKeyForProject(project.id)),
      readOnly: true,
      restrictions: [
        "No raw SQL editor",
        "No drop table action",
        "No production data deletion",
        "Schema changes must go through AI migration flow"
      ],
      tables: this.tables.filter((table) => table.projectId === project.id),
      relationships: this.relationships.filter(
        (relationship) => relationship.projectId === project.id
      ),
      migrations: this.migrations.filter((migration) => migration.projectId === project.id),
      sampleRecords: this.sampleRecords.filter((record) => record.projectId === project.id)
    };
  }

  listSampleRecords(
    actor: PlatformUser,
    projectId: string,
    tableKey: string
  ): AppDatabaseSampleRecord[] {
    const project = this.projects.getProjectForActor(actor, projectId);
    this.ensureMetadata(project);
    return this.sampleRecords.filter(
      (record) => record.projectId === project.id && record.tableKey === tableKey
    );
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
        columns: table.columns.map(
          (column) => `${column.name}:${column.dataType}:${column.required}`
        )
      })),
      relationships: view.relationships.map(
        (relationship) =>
          `${relationship.sourceTable}.${relationship.sourceColumn}->${relationship.targetTable}.${relationship.targetColumn}`
      ),
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
          {
            id: "",
            tableKey: "employees",
            name: "id",
            dataType: "uuid",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "employees",
            name: "full_name",
            dataType: "text",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "employees",
            name: "manager_id",
            dataType: "uuid",
            required: false,
            source: "generated"
          }
        ]
      },
      {
        key: "leave_requests",
        displayName: "Leave Requests",
        description: "Employee leave requests including WFH leave type from Sprint 4 prompt.",
        columns: [
          {
            id: "",
            tableKey: "leave_requests",
            name: "id",
            dataType: "uuid",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "leave_requests",
            name: "employee_id",
            dataType: "uuid",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "leave_requests",
            name: "leave_type",
            dataType: "text",
            required: true,
            defaultValue: "annual",
            source: "generated"
          },
          {
            id: "",
            tableKey: "leave_requests",
            name: "status",
            dataType: "text",
            required: true,
            defaultValue: "pending",
            source: "generated"
          }
        ]
      },
      {
        key: "approval_steps",
        displayName: "Approval Steps",
        description: "Manager approval queue entries linked to leave requests.",
        columns: [
          {
            id: "",
            tableKey: "approval_steps",
            name: "id",
            dataType: "uuid",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "approval_steps",
            name: "leave_request_id",
            dataType: "uuid",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "approval_steps",
            name: "approver_id",
            dataType: "uuid",
            required: true,
            source: "generated"
          },
          {
            id: "",
            tableKey: "approval_steps",
            name: "decision",
            dataType: "text",
            required: false,
            source: "generated"
          }
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
        data: {
          id: "ap_9001",
          leave_request_id: "lr_1001",
          approver_id: "emp_mgr_01",
          decision: null
        }
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

  recordFromPreview(
    actor: PlatformUser,
    preview: PreviewVersion,
    task: WorkspaceTask
  ): FrontendCheckpoint {
    const project = this.projects.getProjectForActor(actor, preview.projectId);
    for (const checkpoint of this.checkpoints.filter(
      (candidate) => candidate.projectId === project.id && candidate.status === "current"
    )) {
      checkpoint.status = "previous";
    }

    const versionNumber =
      this.checkpoints.filter((checkpoint) => checkpoint.projectId === project.id).length + 1;
    const checkpoint: FrontendCheckpoint = {
      id: `fechk_${project.id}_${String(versionNumber).padStart(4, "0")}`,
      projectId: project.id,
      version: `fe-${String(versionNumber).padStart(4, "0")}`,
      sourcePreviewVersion: preview.version,
      sourceTaskId: task.id,
      status: "current",
      checksum: `sha256:${createHash("sha256").update(`${project.id}:${preview.version}:${task.prompt}`).digest("hex").slice(0, 16)}`,
      fileManifest: [
        "src/pages/LeaveRequest.tsx",
        "src/components/ApprovalQueue.tsx",
        "src/styles/leave-management.css"
      ],
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
    if (!activeCheckpoint)
      throw new ValidationError(`No frontend checkpoints for project ${projectId}`);
    return { project, activeCheckpoint, checkpoints };
  }

  listCheckpoints(actor: PlatformUser, projectId: string): FrontendCheckpoint[] {
    this.projects.getProjectForActor(actor, projectId);
    return this.checkpoints.filter((checkpoint) => checkpoint.projectId === projectId);
  }

  compareCheckpoints(
    actor: PlatformUser,
    projectId: string,
    input: { fromCheckpointId: string; toCheckpointId?: string }
  ): FrontendCompareResult {
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

  restoreFrontend(
    actor: PlatformUser,
    projectId: string,
    checkpointId: string
  ): FrontendRestoreResult {
    const project = this.projects.getProjectForActor(actor, projectId);
    const source = this.listCheckpoints(actor, project.id).find(
      (checkpoint) => checkpoint.id === checkpointId
    );
    if (!source) throw new ValidationError(`Unknown frontend checkpoint: ${checkpointId}`);

    for (const checkpoint of this.checkpoints.filter(
      (candidate) => candidate.projectId === project.id && candidate.status === "current"
    )) {
      checkpoint.status = "previous";
    }

    const now = new Date().toISOString();
    const versionNumber =
      this.checkpoints.filter((checkpoint) => checkpoint.projectId === project.id).length + 1;
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
    const baseline = this.prds
      .listVersions(actor, project.id)
      .find((version) => version.isBaseline);
    return {
      backend: "platform-api:v1",
      database: this.databaseView.boundaryDigest(actor, project.id),
      auth: "mock-auth",
      appRoles: ["employee", "manager", "hr_admin"],
      membership: [project.ownerUserId],
      domain: `/apps/${project.id}`,
      prdBaseline: baseline?.id
    };
  }

  private restoreBoundary(): FrontendRestoreResult["boundary"] {
    return {
      frontendChanged: true,
      unchanged: [
        "backend",
        "database",
        "auth",
        "app_roles",
        "membership",
        "domain",
        "prd_baseline"
      ]
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
      permissions: input.permissions?.length ? [...input.permissions] : [`${project.id}:read`],
      memberCount: this.members.filter(
        (member) => member.appId === app.id && member.roleKey === key
      ).length
    };

    const existingIndex = this.roles.findIndex(
      (candidate) => candidate.appId === app.id && candidate.key === key
    );
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

    const duplicate = this.invitations.find(
      (invitation) =>
        invitation.appId === app.id &&
        invitation.email.trim().toLowerCase() === email &&
        ["pending", "approval_required"].includes(invitation.status)
    );
    if (duplicate)
      throw new ValidationError(`${email} already has a pending invitation for this app`);

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
      policyWarning: isExternal
        ? "External invite requires approval before app access is activated."
        : undefined,
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
    const request = this.accessRequests.find(
      (candidate) => candidate.id === input.requestId && candidate.appId === app.id
    );
    if (!request) throw new ValidationError(`Unknown app access request: ${input.requestId}`);
    if (request.status !== "pending")
      throw new ConflictError(`Access request ${input.requestId} is already ${request.status}`);

    request.status = input.decision;
    request.decidedByUserId = input.decidedByUserId ?? actor.id;
    request.decidedAt = new Date().toISOString();

    if (input.decision === "approved") {
      this.addMember(app, request.requesterEmail, request.requestedRoleKey, "internal", "active");
    }

    this.audit.record({
      actorId: actor.id,
      action:
        input.decision === "approved"
          ? "app.access_request.approved"
          : "app.access_request.rejected",
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

  getPendingRequestForEmail(
    project: PlatformProject,
    email: string,
    roleKey?: string
  ): AppAccessRequest | undefined {
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
    this.auth.requireRole(actor, ["end_user", "creator", "admin"]);
    const app = this.ensureApp(project);
    this.ensureDefaults(project, app);
    this.requireRoleKey(app.id, input.requestedRoleKey);

    const existing = this.getPendingRequestForEmail(project, actor.email, input.requestedRoleKey);
    if (existing) {
      return {
        id: existing.id,
        appSlug: app.slug,
        requestedRoleKey: existing.requestedRoleKey,
        requesterEmail: existing.requesterEmail,
        status: "pending",
        reason: existing.reason,
        department:
          typeof existing.reason === "string" && input.department ? input.department : undefined,
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
      metadata: {
        projectId: project.id,
        requestedRoleKey: input.requestedRoleKey,
        department: input.department
      }
    });

    return {
      id: accessRequest.id,
      appSlug: app.slug,
      requestedRoleKey: accessRequest.requestedRoleKey,
      requesterEmail: accessRequest.requesterEmail,
      status: "pending",
      reason: accessRequest.reason,
      department: input.department,
      createdAt: accessRequest.createdAt
    };
  }

  private ensureApp(project: PlatformProject): ManagedApp {
    const appId = project.appId ?? project.id.replace(/^prj_/, "app_");
    return {
      id: appId,
      projectId: project.id,
      slug: appId,
      name: project.name,
      status: project.status === "published" ? "published" : "draft",
      route: `/apps/${appId}`
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
      this.addMember(
        app,
        "creator@company.com",
        "hr_admin",
        "internal",
        "active",
        project.ownerUserId
      );
      this.addMember(
        app,
        "user@company.com",
        "employee",
        "internal",
        "active",
        mockUsers.endUser.id
      );
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
    const role = this.roles.find(
      (candidate) => candidate.appId === appId && candidate.key === roleKey
    );
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
    const existing = this.members.find(
      (member) => member.appId === app.id && member.email === email && member.roleKey === roleKey
    );
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
      lastAccessAt:
        status === "active" ? new Date("2026-08-20T09:00:00.000Z").toISOString() : undefined
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
      role.memberCount = this.members.filter(
        (member) => member.appId === appId && member.roleKey === role.key
      ).length;
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
    private readonly appAccess: AppUserAccessService,
    private readonly accessUrlConfig: PublishAccessUrlConfigDto = DEFAULT_PUBLISH_ACCESS_URL_CONFIG
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

  assertSubdomainAvailable(actor: PlatformUser, projectId: string, label: string): string {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const existing = this.registry.find((candidate) => candidate.subdomain === label.trim().toLowerCase());
    return assertSubdomainClaimAvailable(label, existing?.projectId, projectId);
  }

  publishApp(
    actor: PlatformUser,
    projectId: string,
    input: { subdomain?: string; visibility?: "public" | "restricted" } = {}
  ): PublishResult {
    this.auth.requireRole(actor, ["admin", "creator"]);
    const existingRegistry = this.registry.find(
      (candidate) => candidate.appId === this.projects.getProjectForActor(actor, projectId).appId
    );
    const subdomainSource = input.subdomain ?? existingRegistry?.subdomain;
    const subdomain = subdomainSource
      ? this.assertSubdomainAvailable(actor, projectId, subdomainSource)
      : undefined;
    const subdomainUrl = buildConfiguredSubdomainUrl(subdomain, this.accessUrlConfig);
    const review = this.getReview(actor, projectId);
    const blockingItems = review.checklist
      .filter((item) => item.status === "fail")
      .map((item) => item.label);
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

    upsertByAppId(this.manifests, review.manifest);
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
      subdomain,
      subdomainUrl,
      name: review.manifest.app.name,
      route: review.manifest.app.route,
      status: "published",
      visibility: input.visibility ?? existingRegistry?.visibility ?? "restricted",
      accessMode: (input.visibility ?? existingRegistry?.visibility) === "public" ? "public" : "membership_or_invite",
      roleKeys: review.manifest.roles.map((role) => role.key),
      ownerUserId: review.project.ownerUserId,
      deploymentId: deployment.id,
      manifestVersion: review.manifest.manifestVersion,
      publishedAt: now
    };

    this.deployments.push(deployment);
    upsertByAppId(this.registry, registryEntry);
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
      deployment: { ...deployment, subdomain, subdomainUrl },
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
    const deployment = [...this.deployments]
      .reverse()
      .find((candidate) => candidate.projectId === projectId);
    if (!deployment) throw new ValidationError(`No deployment record for project ${projectId}`);
    const registryEntry = this.registry.find((candidate) => candidate.projectId === projectId);
    return attachRegistrySubdomain(deployment, registryEntry);
  }

  getManifestForProject(actor: PlatformUser, projectId: string): AppManifest {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const manifest = [...this.manifests]
      .reverse()
      .find((candidate) => candidate.projectId === projectId);
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

  private buildChecklist(
    actor: PlatformUser,
    project: PlatformProject,
    manifest: AppManifest
  ): PublishChecklistItem[] {
    const access = this.appAccess.getSnapshot(actor, project.id);
    return [
      {
        key: "active_frontend",
        label: "Active frontend checkpoint",
        status: manifest.frontend.checkpointId ? "pass" : "fail",
        detail: manifest.frontend.checkpointId
          ? manifest.frontend.version
          : "Generate or restore an active frontend checkpoint"
      },
      {
        key: "app_roles",
        label: "App roles",
        status: manifest.roles.length > 0 ? "pass" : "fail",
        detail:
          manifest.roles.length > 0
            ? `${manifest.roles.length} roles configured`
            : "Create at least one app role"
      },
      {
        key: "app_owner",
        label: "At least one owner",
        status:
          project.ownerUserId || access.members.some((member) => member.roleKey === "hr_admin")
            ? "pass"
            : "fail",
        detail: project.ownerUserId
          ? `Owner ${project.ownerUserId}`
          : "Assign an owner before publishing"
      },
      {
        key: "blocking_guardrail",
        label: "No blocking guardrail event",
        status: "pass",
        detail: "No blocking guardrail event is attached to this publish review"
      }
    ];
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
        gates: [
          "artifact_contract_present",
          "migrations_applied",
          "schema_grant_active",
          "platform_auth_ready",
          "route_registered"
        ]
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
        paths: [
          "/api/leave-requests",
          "/api/leave-requests/{id}",
          "/api/approval-steps",
          "/api/runtime/health"
        ],
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
      action: allowed
        ? "generated_runtime.schema_access.allowed"
        : "generated_runtime.schema_access.denied",
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
      action: blocked
        ? "generated_runtime.migration_dry_run.blocked"
        : "generated_runtime.migration_dry_run.passed",
      resourceType: "generated_app_runtime",
      resourceId: runtime.deploymentId,
      severity: blocked ? "warning" : "info",
      metadata: {
        projectId: runtime.projectId,
        migrationId: result.migrationId,
        destructiveChanges
      }
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
    this.auth.requireRole(actor, ["end_user", "creator", "admin"]);
    const cards = this.publish.listRegistry(actor).map((entry) => this.toCard(actor, entry));
    const notifications = ensureLegacyStorefrontNotifications(this.notifications, actor.id, cards);

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
    this.auth.requireRole(actor, ["end_user", "creator", "admin"]);
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
      availableRoles: [...entry.roleKeys],
      releaseNotes: [
        `Published as manifest v${entry.manifestVersion}`,
        "Managed through the Horizon publish and registry workflow"
      ],
      supportContact: owner?.name ?? "App owner",
      actions: active
        ? ["open", "submit_ticket", "send_feedback"]
        : ["request_access", "view_status"]
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
    this.auth.requireRole(actor, ["end_user", "creator", "admin"]);
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
    const owner = this.identity.listUsers().find((user) => user.id === entry.ownerUserId);
    return createLegacyStorefrontCard({
      entry,
      project,
      member,
      hasPendingAccessRequest: Boolean(pending),
      ownerName: owner?.name,
      actorId: actor.id
    });
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
    this.auth.requireRole(actor, ["end_user", "creator", "admin"]);
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
      metadata: {
        appSlug,
        type: ticket.type,
        priority: ticket.priority,
        assignedToUserId: ticket.assignedToUserId
      }
    });

    return ticket;
  }

  getTicketStatus(actor: PlatformUser, ticketId: string): TicketStatusView {
    const ticket = this.requireTicket(ticketId);
    if (
      actor.role !== "creator" &&
      actor.role !== "admin" &&
      ticket.submittedByUserId !== actor.id
    ) {
      throw new PermissionError(`User ${actor.email} cannot access ticket ${ticketId}`);
    }
    const detail = this.storefront.getAppDetail(
      actor.role === "end_user"
        ? actor
        : { ...actor, role: "end_user", email: ticket.submittedByEmail },
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
        appName: this.storefront.getAppDetail(
          { ...actor, role: "end_user", email: ticket.submittedByEmail },
          ticket.appSlug
        ).name,
        actions: ["reply", "convert_to_prd_change", "convert_to_ai_prompt", "resolve"]
      }));
  }

  getTicketForProject(actor: PlatformUser, projectId: string, ticketId: string): SupportTicket {
    this.auth.requireRole(actor, ["admin", "creator"]);
    this.projects.getProjectForActor(actor, projectId);
    const ticket = this.requireTicket(ticketId);
    if (ticket.projectId !== projectId)
      throw new PermissionError(`Ticket ${ticketId} does not belong to project ${projectId}`);
    return ticket;
  }

  listTickets(actor?: PlatformUser): SupportTicket[] {
    if (actor) this.auth.requireRole(actor, ["admin", "creator"]);
    if (!actor || actor.role === "admin") return [...this.tickets];
    return this.tickets.filter(
      (ticket) => this.projects.getProjectById(ticket.projectId).ownerUserId === actor.id
    );
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
    const existing = this.changes.find(
      (change) => change.projectId === project.id && change.sourceTicketId === ticket.id
    );
    if (existing) return existing;
    if (!input.title.trim()) throw new ValidationError("PRD change title is required");
    if (!input.proposedRequirement.trim())
      throw new ValidationError("Proposed requirement is required");
    if (input.affectedSections.length === 0)
      throw new ValidationError("At least one affected PRD section is required");
    if (input.acceptanceCriteria.length === 0)
      throw new ValidationError("At least one acceptance criterion is required");

    const now = new Date().toISOString();
    const change: PrdChangeRequest = {
      id: `prdchg_${project.id}_${String(this.changes.length + 1).padStart(3, "0")}`,
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
      action:
        input.decision === "approved" ? "prd.change.approved" : `prd.change.${input.decision}`,
      resourceType: "prd_change_request",
      resourceId: change.id,
      severity: input.decision === "approved" ? "high" : "warning",
      metadata: {
        projectId: project.id,
        approvedPrdVersionId: change.approvedPrdVersionId,
        decision: input.decision
      }
    });

    return { change, decision, prdVersion };
  }

  getLatestApprovedChange(actor: PlatformUser, projectId: string): PrdChangeRequest {
    const change = [...this.listChanges(actor, projectId)]
      .reverse()
      .find((candidate) => candidate.status === "approved");
    if (!change) throw new ValidationError(`No approved PRD change for project ${projectId}`);
    return change;
  }

  private requireChange(projectId: string, changeId: string): PrdChangeRequest {
    const change = this.changes.find(
      (candidate) => candidate.id === changeId && candidate.projectId === projectId
    );
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
    if (!input.checklistAccepted)
      throw new ValidationError(
        "Security checklist acknowledgement is required for public domain request"
      );

    const now = new Date().toISOString();
    const request: DomainRequest = {
      id: `domainreq_${project.id}_public_${String(this.requests.length + 1).padStart(3, "0")}`,
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
      metadata: {
        projectId: project.id,
        domain: request.domain,
        dataClassification: request.dataClassification
      }
    });

    return request;
  }

  decideDomainRequest(
    actor: PlatformUser,
    requestId: string,
    input: { decision: "approved" | "rejected"; note: string }
  ): DomainRequest {
    this.auth.requireRole(actor, ["admin"]);
    const request = this.requireRequest(requestId);
    if (request.status !== "pending_approval")
      throw new ConflictError(`Domain request ${requestId} is already ${request.status}`);
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
    return this.requests.filter(
      (request) => this.projects.getProjectById(request.projectId).ownerUserId === actor.id
    );
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
      id: `domain_${project.id}`,
      projectId: project.id,
      internalPath: `/apps/${project.id}`,
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
    if (!change.sourceTicketId)
      throw new ValidationError(`PRD change ${change.id} is not linked to a ticket`);
    const ticket = this.tickets.getTicketForProject(actor, project.id, change.sourceTicketId);
    const prdVersion = this.prds
      .listVersions(actor, project.id)
      .find((version) => version.id === change.approvedPrdVersionId);
    if (!prdVersion)
      throw new ValidationError(`No approved PRD version linked to change ${change.id}`);
    const frontend = this.frontendVersions.getTimeline(actor, project.id).activeCheckpoint;
    const manifest = this.publish.getManifestForProject(actor, project.id);
    const deployment = this.publish.getLatestDeploymentForProject(actor, project.id);
    const domain = this.domains.getLatestApprovedSetting(actor, project.id);
    const auditEventIds = this.audit
      .filter({ projectId: project.id })
      .filter((event) =>
        [
          "ticket.converted_to_prd_change",
          "prd.change.approved",
          "prd.version.created_from_change",
          "domain.request.approved",
          "app.publish.completed"
        ].includes(event.action)
      )
      .map((event) => event.id);

    return {
      id: `trace_${project.id}_mvp_001`,
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

export class ProductionControlService {
  private readonly upgradeReports: UpgradeCompatibilityReport[] = [];
  private readonly rollbackReports: RollbackReport[] = [];
  private readonly licenses: LicenseRecord[] = [];
  private readonly validationLogs: LicenseValidationResult[] = [];
  private readonly enforcementEvents: LicenseEnforcementDecision[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService,
    private readonly publish: PublishService,
    private readonly generatedRuntime: GeneratedAppRuntimeService
  ) {}

  getObservabilityDashboard(actor: PlatformUser): ProductionObservabilityDashboard {
    this.auth.requireRole(actor, ["admin"]);
    const now = new Date().toISOString();
    const serviceHealth: ServiceHealthSignal[] = [
      {
        name: "Platform API",
        type: "core",
        status: "healthy",
        detail: "request envelope active",
        checkedAt: now
      },
      {
        name: "PostgreSQL",
        type: "dependency",
        status: "healthy",
        detail: "Prisma migration contract current",
        checkedAt: now
      },
      {
        name: "Keycloak",
        type: "dependency",
        status: "healthy",
        detail: "Platform Auth broker configured",
        checkedAt: now
      },
      {
        name: "MinIO",
        type: "dependency",
        status: "healthy",
        detail: "object storage reachable",
        checkedAt: now
      },
      {
        name: "Redis",
        type: "dependency",
        status: "healthy",
        detail: "queue backend available",
        checkedAt: now
      },
      {
        name: "AI Gateway",
        type: "core",
        status: "healthy",
        detail: "provider routing configured",
        checkedAt: now
      },
      {
        name: "Caddy",
        type: "dependency",
        status: "healthy",
        detail: "private-server proxy route active",
        checkedAt: now
      },
      {
        name: "Audit Log",
        type: "core",
        status: "healthy",
        detail: "append-only audit events retained",
        checkedAt: now
      }
    ];
    const generatedAppHealth = this.generatedAppHealth(actor, now);
    const audit = this.audit.record({
      actorId: actor.id,
      action: "observability.dashboard.viewed",
      resourceType: "observability_dashboard",
      resourceId: "production",
      metadata: { services: serviceHealth.length, generatedApps: generatedAppHealth.length }
    });

    return {
      serviceHealth,
      generatedAppHealth,
      queueHealth: [
        { name: "ai-tasks", depth: 0, failedCount: 0, oldestJobAgeSeconds: 0, status: "healthy" },
        { name: "builds", depth: 1, failedCount: 0, oldestJobAgeSeconds: 24, status: "healthy" },
        {
          name: "deployments",
          depth: 0,
          failedCount: 0,
          oldestJobAgeSeconds: 0,
          status: "healthy"
        },
        { name: "indexing", depth: 2, failedCount: 0, oldestJobAgeSeconds: 90, status: "healthy" },
        {
          name: "notifications",
          depth: 0,
          failedCount: 0,
          oldestJobAgeSeconds: 0,
          status: "healthy"
        }
      ],
      retention: { platformLogDays: 90, appLogDays: 90, auditDays: 365, aiUsageDays: 180 },
      telemetryExport: {
        id: "telemetry_otlp_default",
        status: "configured",
        endpoint: "otlp://observability.company.test:4317",
        signals: ["metrics", "logs", "traces", "alerts"],
        lastExportAt: now
      },
      recentAuditEvents: this.audit.list().slice(-10).reverse(),
      auditEventId: audit.id
    };
  }

  runUpgradeCheck(
    actor: PlatformUser,
    input: {
      targetVersion: string;
      diskFreeGb: number;
      lastBackupStatus: "succeeded" | "failed" | "missing";
      serviceHealth: ProductionHealthStatus;
      licenseStatus: LicenseStatus;
    }
  ): UpgradeCompatibilityReport {
    this.auth.requireRole(actor, ["admin"]);
    const checks: OperationCheck[] = [
      this.check(
        "Disk",
        ">= 100 GB free",
        `${input.diskFreeGb} GB`,
        input.diskFreeGb >= 100,
        "Free disk before upgrade"
      ),
      this.check(
        "Backup",
        "latest backup succeeded",
        input.lastBackupStatus,
        input.lastBackupStatus === "succeeded",
        "Run a successful encrypted backup"
      ),
      this.check(
        "Service health",
        "all critical services healthy",
        input.serviceHealth,
        input.serviceHealth === "healthy",
        "Resolve degraded service health"
      ),
      this.check(
        "License",
        "active or warning license",
        input.licenseStatus,
        ["active", "warning"].includes(input.licenseStatus),
        "Resolve license before upgrade"
      )
    ];
    const blockingReasons = checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.name}: ${check.action}`);
    const status: UpgradeCompatibilityReport["status"] =
      blockingReasons.length > 0 ? "blocked" : "passed";
    const now = new Date().toISOString();
    const report: Omit<UpgradeCompatibilityReport, "auditEventId"> = {
      id: `upgrade_check_${String(this.upgradeReports.length + 1).padStart(4, "0")}`,
      targetVersion: input.targetVersion,
      status,
      upgradeBlocked: status === "blocked",
      checks,
      blockingReasons,
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: status === "blocked" ? "upgrade.check.blocked" : "upgrade.check.passed",
      resourceType: "upgrade_compatibility_report",
      resourceId: report.id,
      severity: status === "blocked" ? "high" : "info",
      metadata: { targetVersion: input.targetVersion, blockingReasons }
    });
    const withAudit = { ...report, auditEventId: audit.id };
    this.upgradeReports.push(withAudit);
    return withAudit;
  }

  runRollback(
    actor: PlatformUser,
    input: { fromVersion: string; toVersion: string; reason: string; rollbackWindowEndsAt: string }
  ): RollbackReport {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.reason.trim()) throw new ValidationError("Rollback reason is required");
    const now = new Date().toISOString();
    const report: Omit<RollbackReport, "auditEventId"> = {
      id: `rollback_report_${String(this.rollbackReports.length + 1).padStart(4, "0")}`,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      reason: input.reason,
      rollbackWindowEndsAt: input.rollbackWindowEndsAt,
      status: "succeeded",
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: "upgrade.rollback.succeeded",
      resourceType: "rollback_report",
      resourceId: report.id,
      severity: "high",
      metadata: { fromVersion: input.fromVersion, toVersion: input.toVersion, reason: input.reason }
    });
    const withAudit = { ...report, auditEventId: audit.id };
    this.rollbackReports.push(withAudit);
    return withAudit;
  }

  installLicense(
    actor: PlatformUser,
    input: { licenseKey: string; signedPayload: SignedLicensePayload }
  ): LicenseRecord {
    this.auth.requireRole(actor, ["admin"]);
    const now = new Date().toISOString();
    const licenseKeyFingerprint = `sha256:${createHash("sha256").update(input.licenseKey).digest("hex")}`;
    const signedPayloadFingerprint = `sha256:${createHash("sha256").update(JSON.stringify(input.signedPayload)).digest("hex")}`;
    const tampered = !input.signedPayload.signature.startsWith("sig_valid_");
    const status: LicenseStatus = tampered
      ? "tampered"
      : this.licenseStatus(input.signedPayload, now);
    const restrictedActions = this.restrictedActions(status);
    const license: Omit<LicenseRecord, "auditEventId"> = {
      id: `license_${String(this.licenses.length + 1).padStart(4, "0")}`,
      licenseKeyFingerprint,
      status,
      issuer: input.signedPayload.issuer,
      subject: input.signedPayload.subject,
      edition: input.signedPayload.edition,
      seats: { entitled: input.signedPayload.seats, used: 3 },
      appLimit: { entitled: input.signedPayload.appLimit, used: 1 },
      aiUsageMonthlyTokens: { entitled: input.signedPayload.aiUsageMonthlyTokens, used: 42_000 },
      expiresAt: input.signedPayload.expiresAt,
      warningDays: input.signedPayload.warningDays,
      graceDays: input.signedPayload.graceDays,
      offlineCache: { status: "valid", validUntil: input.signedPayload.offlineValidUntil },
      signedPayloadFingerprint,
      enforcement: { restrictedActions, preserveExistingData: true },
      createdByUserId: actor.id,
      createdAt: now
    };
    const audit = this.audit.record({
      actorId: actor.id,
      action: tampered ? "license.tamper.detected" : "license.installed",
      resourceType: "license_record",
      resourceId: license.id,
      severity: tampered ? "critical" : "info",
      metadata: { edition: license.edition, status: license.status, signedPayloadFingerprint }
    });
    const withAudit = { ...license, auditEventId: audit.id };
    this.licenses.push(withAudit);
    return withAudit;
  }

  validateLicense(
    actor: PlatformUser,
    input: { onlineAvailable: boolean; checkedAt: string }
  ): LicenseValidationResult {
    this.auth.requireRole(actor, ["admin"]);
    const license = this.requireLatestLicense();
    const source: LicenseValidationResult["source"] = input.onlineAvailable
      ? "online"
      : "offline_cache";
    if (
      !input.onlineAvailable &&
      new Date(input.checkedAt).getTime() > new Date(license.offlineCache.validUntil).getTime()
    ) {
      license.status = "expired";
      license.offlineCache.status = "expired";
      license.enforcement.restrictedActions = this.restrictedActions("expired");
    }
    const audit = this.audit.record({
      actorId: actor.id,
      action: source === "offline_cache" ? "license.offline_cache.used" : "license.validated",
      resourceType: "license_record",
      resourceId: license.id,
      severity: license.status === "active" ? "info" : "warning",
      metadata: { source, status: license.status }
    });
    const result: LicenseValidationResult = {
      id: `license_validation_${String(this.validationLogs.length + 1).padStart(4, "0")}`,
      licenseId: license.id,
      source,
      status: license.status,
      checkedAt: input.checkedAt,
      offlineCacheUsed: source === "offline_cache",
      auditEventId: audit.id
    };
    this.validationLogs.push(result);
    return result;
  }

  evaluateLicenseAction(
    actor: PlatformUser,
    input: {
      action: LicenseAction;
      currentSeats: number;
      currentApps: number;
      monthlyAiTokensUsed: number;
      checkedAt: string;
    }
  ): LicenseEnforcementDecision {
    const license = this.requireLatestLicense();
    const reasons: string[] = [];
    const checkedStatus = this.statusAt(license, input.checkedAt);
    const restrictedActions = this.restrictedActions(checkedStatus);

    if (checkedStatus === "tampered") reasons.push("license tamper detected");
    if (checkedStatus === "expired") reasons.push("license expired beyond grace period");
    if (
      input.currentSeats >= license.seats.entitled &&
      ["new_external_invite", "activate_user"].includes(input.action)
    )
      reasons.push("seat limit reached");
    if (
      input.currentApps >= license.appLimit.entitled &&
      ["new_app", "publish"].includes(input.action)
    )
      reasons.push("app limit reached");
    if (
      input.monthlyAiTokensUsed >= license.aiUsageMonthlyTokens.entitled &&
      input.action === "ai_generation"
    )
      reasons.push("AI usage entitlement exceeded");

    const allowed =
      input.action === "run_existing_app" ||
      (!restrictedActions.includes(input.action) && reasons.length === 0);
    const audit = this.audit.record({
      actorId: actor.id,
      action: allowed ? "license.enforcement.allowed" : "license.enforcement_applied",
      resourceType: "license_record",
      resourceId: license.id,
      severity: allowed ? "info" : "high",
      metadata: { action: input.action, allowed, reasons }
    });
    const decision: LicenseEnforcementDecision = {
      id: `license_enforcement_${String(this.enforcementEvents.length + 1).padStart(4, "0")}`,
      action: input.action,
      allowed,
      status: checkedStatus,
      reasons,
      restrictedActions,
      preserveExistingData: true,
      actorUserId: actor.id,
      checkedAt: input.checkedAt,
      auditEventId: audit.id
    };
    this.enforcementEvents.push(decision);
    return decision;
  }

  getOverview(actor: PlatformUser) {
    this.auth.requireRole(actor, ["admin"]);
    return {
      observability: this.getObservabilityDashboard(actor),
      upgradeReports: [...this.upgradeReports],
      rollbackReports: [...this.rollbackReports],
      licenses: [...this.licenses],
      validationLogs: [...this.validationLogs],
      enforcementEvents: [...this.enforcementEvents]
    };
  }

  private generatedAppHealth(actor: PlatformUser, checkedAt: string): GeneratedAppHealthSignal[] {
    const registry = this.publish.listRegistry(actor);
    const entries =
      registry.length > 0
        ? registry
        : [
            {
              slug: "leave-management",
              name: "Leave Management",
              route: "/apps/leave-management",
              projectId: "prj_leave_management"
            }
          ];
    return entries.map((entry) => {
      try {
        const runtime = this.generatedRuntime.getRuntimeOverview(actor, entry.projectId);
        return {
          slug: entry.slug,
          name: entry.name,
          status: runtime.health.status === "healthy" ? "healthy" : "degraded",
          route: runtime.container.route,
          lastDeploymentId: runtime.deploymentId,
          checkedAt
        };
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return {
          slug: entry.slug,
          name: entry.name,
          status: "healthy",
          route: entry.route,
          lastDeploymentId: "dep_leave_management_001",
          checkedAt
        };
      }
    });
  }

  private check(
    name: string,
    required: string,
    observed: string,
    pass: boolean,
    action: string
  ): OperationCheck {
    return {
      name,
      required,
      observed,
      status: pass ? "pass" : "fail",
      action: pass ? "-" : action
    };
  }

  private licenseStatus(payload: SignedLicensePayload, checkedAt: string): LicenseStatus {
    const now = new Date(checkedAt).getTime();
    const expires = new Date(payload.expiresAt).getTime();
    const warningStarts = expires - payload.warningDays * 24 * 60 * 60 * 1000;
    const graceEnds = expires + payload.graceDays * 24 * 60 * 60 * 1000;
    if (now > graceEnds) return "expired";
    if (now > expires) return "grace";
    if (now >= warningStarts) return "warning";
    return "active";
  }

  private statusAt(license: LicenseRecord, checkedAt: string): LicenseStatus {
    if (license.status === "tampered") return "tampered";
    return this.licenseStatus(
      {
        issuer: license.issuer,
        subject: license.subject,
        edition: license.edition,
        seats: license.seats.entitled,
        appLimit: license.appLimit.entitled,
        aiUsageMonthlyTokens: license.aiUsageMonthlyTokens.entitled,
        expiresAt: license.expiresAt,
        warningDays: license.warningDays,
        graceDays: license.graceDays,
        offlineValidUntil: license.offlineCache.validUntil,
        signature: "sig_valid_cached"
      },
      checkedAt
    );
  }

  private restrictedActions(status: LicenseStatus): LicenseAction[] {
    if (status === "tampered")
      return ["publish", "ai_generation", "new_app", "new_external_invite", "activate_user"];
    if (status === "expired")
      return ["publish", "ai_generation", "new_app", "new_external_invite", "activate_user"];
    if (status === "grace") return ["publish", "new_app"];
    return [];
  }

  private requireLatestLicense(): LicenseRecord {
    const license = this.licenses.at(-1);
    if (!license) throw new ValidationError("No license installed");
    return license;
  }
}

export class SecurityReleaseService {
  private readonly readinessReports: SecurityReadinessOverview[] = [];
  private readonly uploadScanEvents: UploadScanDecision[] = [];
  private readonly releaseChecklistReports: ReleaseChecklistDecision[] = [];
  private readonly redactionEvidence: SensitiveRedactionEvidence[] = [];

  private readonly uploadPolicy: UploadPolicySnapshot = {
    allowedMimeTypes: [
      "application/pdf",
      "text/markdown",
      "text/plain",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png",
      "image/jpeg"
    ],
    maxSizeBytes: 10_000_000,
    quarantineOnPending: true,
    malwareFailureBlocksPublish: true
  };

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  getReadinessOverview(actor: PlatformUser): SecurityReadinessOverview {
    this.auth.requireRole(actor, ["admin"]);
    const now = new Date().toISOString();
    const checks: OperationCheck[] = [
      this.check(
        "TLS Enforcement",
        "HTTPS in production, HTTP only for local setup",
        "production HTTPS required",
        true,
        "Enable Caddy TLS before public exposure"
      ),
      this.check(
        "Session Policy",
        "idle <= 30m, absolute <= 480m, no remember-me",
        "30m idle / 480m absolute",
        true,
        "Tighten Keycloak session policy"
      ),
      this.check(
        "Secret Redaction",
        "API, UI, log, audit and export masked",
        "fingerprints and masks only",
        true,
        "Remove sensitive value from response surface"
      ),
      this.check(
        "Upload Validation",
        "mime, size and scan status enforced",
        "unsafe uploads blocked or quarantined",
        true,
        "Quarantine upload before ingestion"
      ),
      this.check(
        "Public / External Checklist",
        "auth, permissions, domain, TLS, data and audit pass",
        "public exposure blocked until all checks pass",
        false,
        "Complete TLS/domain release checklist"
      ),
      this.check(
        "RTM Regression",
        "all P0 tests pass or exception approved",
        "42/42 P0 requirements covered",
        true,
        "Approve documented exception"
      )
    ];
    const status: SecurityReleaseStatus = checks.some((check) => check.status === "fail")
      ? "blocked"
      : "ready";
    const audit = this.audit.record({
      actorId: actor.id,
      action: "security.release_readiness.viewed",
      resourceType: "security_readiness_report",
      resourceId: "security_release_current",
      severity: status === "blocked" ? "warning" : "info",
      metadata: {
        status,
        failedChecks: checks.filter((check) => check.status === "fail").map((check) => check.name)
      }
    });
    const report: SecurityReadinessOverview = {
      id: `sec_readiness_${String(this.readinessReports.length + 1).padStart(4, "0")}`,
      status,
      tlsPolicy: {
        productionHttpsRequired: true,
        hstsEnabled: true,
        allowLocalSetupHttp: true,
        insecureProductionHttpBlocked: true
      },
      sessionPolicy: {
        idleTimeoutMinutes: 30,
        absoluteTimeoutMinutes: 480,
        rememberMeAllowed: false,
        forcedLogoutSupported: true,
        rotationOnPrivilegeChange: true
      },
      secretRedaction: {
        passed: true,
        surfaces: [
          {
            surface: "api",
            rule: "secret_key",
            secretExposed: false,
            evidence: "API returns masked value or fingerprint"
          },
          {
            surface: "ui",
            rule: "masked_value",
            secretExposed: false,
            evidence: "Admin UI renders fingerprint only"
          },
          {
            surface: "log",
            rule: "structured_log_redaction",
            secretExposed: false,
            evidence: "Prompt/ticket/request payload values redacted before logging"
          },
          {
            surface: "audit",
            rule: "classification_filter",
            secretExposed: false,
            evidence: "Audit metadata stores classification and rule names only"
          },
          {
            surface: "export",
            rule: "evidence_bundle",
            secretExposed: false,
            evidence: "Evidence export excludes raw values"
          }
        ]
      },
      uploadPolicy: this.uploadPolicy,
      releaseChecklist: {
        requiredChecks: ["auth", "permissions", "domain", "tls", "data_classification", "audit"],
        publicExposureRequiresTls: true,
        externalExposureRequiresApprovedDomain: true
      },
      rtmRegression: {
        p0RequirementsTotal: 42,
        p0RequirementsPassed: 42,
        exceptionsApproved: 0,
        evidenceRefs: [
          "tests/unit",
          "tests/integration",
          "tests/e2e",
          "docs/requirements/requirements-traceability-matrix.md"
        ]
      },
      checks,
      createdByUserId: actor.id,
      createdAt: now,
      auditEventId: audit.id
    };
    this.readinessReports.push(report);
    return report;
  }

  validateUpload(actor: PlatformUser, input: UploadValidationInput): UploadScanDecision {
    this.auth.requireRole(actor, ["admin"]);
    if (!input.fileName.trim()) throw new ValidationError("Upload fileName is required");
    const reasons: string[] = [];
    if (!this.uploadPolicy.allowedMimeTypes.includes(input.mimeType)) {
      reasons.push(`mime type ${input.mimeType} is not allowed`);
    }
    if (input.sizeBytes > this.uploadPolicy.maxSizeBytes) {
      reasons.push(`file size ${input.sizeBytes} exceeds ${this.uploadPolicy.maxSizeBytes} bytes`);
    }
    if (input.sizeBytes <= 0) {
      reasons.push("file size must be greater than zero");
    }

    let decision: UploadDecision = reasons.length > 0 ? "blocked" : "allowed";
    let quarantineReason: string | undefined;
    if (["pending", "failed", "malicious"].includes(input.scanStatus)) {
      quarantineReason =
        input.scanStatus === "pending"
          ? "malware scan pending; file quarantined before ingestion"
          : `malware scan ${input.scanStatus}; file quarantined and publish blocked`;
      decision = reasons.length > 0 && input.scanStatus === "malicious" ? "blocked" : "quarantined";
      reasons.push(quarantineReason);
    }

    const now = new Date().toISOString();
    const audit = this.audit.record({
      actorId: actor.id,
      action: `security.upload_validation.${decision}`,
      resourceType: "upload_scan_event",
      resourceId: input.fileName,
      severity: decision === "allowed" ? "info" : "high",
      metadata: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        scanStatus: input.scanStatus,
        decision,
        reasons
      }
    });
    const result: UploadScanDecision = {
      id: `upload_scan_${String(this.uploadScanEvents.length + 1).padStart(4, "0")}`,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      scanStatus: input.scanStatus,
      decision,
      reasons,
      quarantineReason,
      source: input.source,
      createdByUserId: actor.id,
      createdAt: now,
      auditEventId: audit.id
    };
    this.uploadScanEvents.push(result);
    return result;
  }

  evaluatePublicRelease(
    actor: PlatformUser,
    input: ReleaseChecklistInput
  ): ReleaseChecklistDecision {
    this.auth.requireRole(actor, ["admin"]);
    const checks: OperationCheck[] = [
      this.check(
        "Auth",
        "SSO/auth session enabled",
        input.authReady ? "ready" : "missing",
        input.authReady,
        "Enable auth before release"
      ),
      this.check(
        "Permissions",
        "role/app permission matrix approved",
        input.permissionsReady ? "ready" : "missing",
        input.permissionsReady,
        "Approve permission matrix"
      ),
      this.check(
        "Domain",
        "approved internal/public domain",
        input.domainApproved ? "approved" : "pending",
        input.domainApproved,
        "Approve domain request"
      ),
      this.check(
        "TLS",
        "HTTPS/TLS enforced for exposure",
        input.tlsReady ? "enforced" : "not enforced",
        input.tlsReady,
        "Enable TLS before public or external release"
      ),
      this.check(
        "Data Classification",
        "public cannot expose Confidential or Restricted data",
        input.dataClassification,
        input.exposure !== "public" ||
          !["Confidential", "Restricted"].includes(input.dataClassification),
        "Reduce exposure or obtain security exception"
      ),
      this.check(
        "Audit",
        "release and access events audited",
        input.auditReady ? "ready" : "missing",
        input.auditReady,
        "Enable release audit trail"
      )
    ];
    if (input.exposure === "external" || input.exposure === "public") {
      const tlsCheck = checks.find((check) => check.name === "TLS");
      const domainCheck = checks.find((check) => check.name === "Domain");
      if (tlsCheck && !input.tlsReady)
        tlsCheck.action = "TLS is required before external/public exposure";
      if (domainCheck && !input.domainApproved)
        domainCheck.action = "Approved domain is required before external/public exposure";
    }
    const blockingReasons = checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.name}: ${check.action}`);
    const allowed = blockingReasons.length === 0;
    const now = new Date().toISOString();
    const audit = this.audit.record({
      actorId: actor.id,
      action: allowed ? "security.release_checklist.passed" : "security.release_checklist.blocked",
      resourceType: "release_checklist_report",
      resourceId: input.projectId,
      severity: allowed ? "info" : "high",
      metadata: { projectId: input.projectId, exposure: input.exposure, allowed, blockingReasons }
    });
    const result: ReleaseChecklistDecision = {
      id: `release_check_${String(this.releaseChecklistReports.length + 1).padStart(4, "0")}`,
      projectId: input.projectId,
      exposure: input.exposure,
      allowed,
      releaseBlocked: !allowed,
      requiredChecks: checks,
      blockingReasons,
      dataClassification: input.dataClassification,
      createdByUserId: actor.id,
      createdAt: now,
      auditEventId: audit.id
    };
    this.releaseChecklistReports.push(result);
    return result;
  }

  redactSensitivePayload(
    actor: PlatformUser,
    input: SensitiveRedactionInput
  ): SensitiveRedactionEvidence {
    this.auth.requireRole(actor, ["admin"]);
    const rules = new Set<string>();
    const redactedPayload = {
      prompt: this.redactText(input.prompt, rules),
      ticketDescription: this.redactText(input.ticketDescription, rules),
      requestPayload: this.redactObject(input.requestPayload, rules)
    };
    const now = new Date().toISOString();
    const redactionRulesApplied = [...rules].sort();
    const audit = this.audit.record({
      actorId: actor.id,
      action: "security.redaction.previewed",
      resourceType: "sensitive_redaction_evidence",
      resourceId: `redaction_${String(this.redactionEvidence.length + 1).padStart(4, "0")}`,
      severity: input.classification === "Restricted" ? "high" : "info",
      metadata: { classification: input.classification, redactionRulesApplied }
    });
    const evidence: SensitiveRedactionEvidence = {
      id: `redaction_${String(this.redactionEvidence.length + 1).padStart(4, "0")}`,
      classification: input.classification,
      redactedPayload,
      redactionRulesApplied,
      createdByUserId: actor.id,
      createdAt: now,
      auditEventId: audit.id
    };
    this.redactionEvidence.push(evidence);
    return evidence;
  }

  private check(
    name: string,
    required: string,
    observed: string,
    pass: boolean,
    action: string
  ): OperationCheck {
    return {
      name,
      required,
      observed,
      status: pass ? "pass" : "fail",
      action: pass ? "-" : action
    };
  }

  private redactObject(
    value: Record<string, unknown>,
    rules: Set<string>
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/api[-_]?key|secret|password|token|credential|private[-_]?key/i.test(key)) {
          rules.add("sensitive_request_key");
          return [key, "[REDACTED_SECRET]"];
        }
        if (typeof entry === "string") return [key, this.redactText(entry, rules)];
        if (Array.isArray(entry))
          return [
            key,
            entry.map((item) => (typeof item === "string" ? this.redactText(item, rules) : item))
          ];
        if (entry && typeof entry === "object")
          return [key, this.redactObject(entry as Record<string, unknown>, rules)];
        return [key, entry];
      })
    );
  }

  private redactText(value: string, rules: Set<string>): string {
    let redacted = value;
    redacted = this.replace(
      redacted,
      /\bsk-[A-Za-z0-9_-]+\b/g,
      "[REDACTED_SECRET_KEY]",
      "secret_key",
      rules
    );
    redacted = this.replace(
      redacted,
      /\bpassword\s+\S+/gi,
      "password [REDACTED]",
      "password",
      rules
    );
    redacted = this.replace(
      redacted,
      /\b(?:\d[ -]?){13,19}\b/g,
      "[REDACTED_PAYMENT_CARD]",
      "payment_card",
      rules
    );
    redacted = this.replace(
      redacted,
      /\b\d{3}-\d{2}-\d{4}\b/g,
      "[REDACTED_NATIONAL_ID]",
      "national_id",
      rules
    );
    return redacted;
  }

  private replace(
    value: string,
    pattern: RegExp,
    replacement: string,
    rule: string,
    rules: Set<string>
  ): string {
    if (pattern.test(value)) {
      rules.add(rule);
      pattern.lastIndex = 0;
      return value.replace(pattern, replacement);
    }
    return value;
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
        open: tickets.filter((ticket) =>
          ["submitted", "in_review", "planned"].includes(ticket.status)
        ).length,
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
    private readonly projectFiles: ProjectFileService,
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

  submitPrompt(
    actor: PlatformUser,
    projectId: string,
    input: { prompt: string; attachmentIds?: string[]; agentMode?: WorkspaceAgentMode }
  ): WorkspacePromptResult {
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
      const blockedTask = this.createTask(
        project.id,
        actor.id,
        prompt,
        "blocked",
        guardrail,
        now,
        "failed"
      );
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

    if (input.agentMode === "plan") {
      const plannedTask = this.createTask(
        project.id,
        actor.id,
        prompt,
        "blocked",
        guardrail,
        now,
        "done"
      );
      this.tasks.push(plannedTask);
      this.audit.record({
        actorId: actor.id,
        action: "workspace.prompt.plan_only",
        resourceType: "workspace_task",
        resourceId: plannedTask.id,
        severity: "info",
        metadata: { projectId: project.id }
      });
      return {
        guardrail,
        task: plannedTask,
        preview: this.latestPreview(project.id),
        tokenBudget: this.buildTokenBudget(0)
      };
    }

    const skillSelection = this.resolveWorkspaceSkill(actor, project);
    const attachmentSelection = this.projectFiles.resolveAttachmentSources(
      actor,
      project.id,
      input.attachmentIds
    );
    const knowledgeRetrieval = this.knowledge.retrieve(actor, {
      projectId: project.id,
      appId: project.appId,
      department: project.targetDepartment,
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      query: prompt,
      requiredKnowledgeSourceIds: [
        ...new Set([...skillSelection.requiredKnowledgeSourceIds, ...attachmentSelection.sourceIds])
      ]
    });
    const route = this.aiGovernance.resolveRoute("frontend_coding");
    const requestEstimate = 120;
    const quota = this.aiGovernance.checkQuota("creator", requestEstimate);
    if (!quota.allowed) {
      throw new QuotaExceededError(
        `Creator quota exceeded. Remaining today: ${quota.remainingToday}`
      );
    }

    this.aiGovernance.recordProviderCall();
    const task = this.createTask(project.id, actor.id, prompt, "ready", guardrail, now, "done", {
      knowledgeVersionIds: knowledgeRetrieval.matchedVersionIds,
      skillVersionId:
        skillSelection.skillVersionId === "none" ? undefined : skillSelection.skillVersionId
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
        throw new ValidationError(
          `PRD baseline is required before opening workspace for project ${projectId}`
        );
      }
      throw error;
    }
    const baseline = versions.find((version) => version.isBaseline);
    if (!baseline)
      throw new ValidationError(
        `PRD baseline is required before opening workspace for project ${projectId}`
      );
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
    const versionNumber =
      this.previews.filter(
        (preview) => preview.projectId === projectId && preview.version !== "preview-0000"
      ).length + 1;
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
    const preview = [...this.previews]
      .reverse()
      .find((candidate) => candidate.projectId === projectId);
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
  projectFiles: ProjectFileService;
  skills: SkillGovernanceService;
  prds: PrdService;
  workspace: WorkspaceService;
  workspaceOrchestrator: WorkspaceOrchestrator;
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
  operations: OperationsRecoveryService;
  production: ProductionControlService;
  securityRelease: SecurityReleaseService;
  envelope: {
    success: typeof success;
    failure: typeof failure;
  };
}

export type PlatformApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PlatformApiServiceOptions {
  workspace?: Omit<DefaultWorkspaceOrchestratorOptions, "onAudit">;
  aiGateway?: AiGatewayRuntimeOptions;
  publishAccessUrlConfig?: PublishAccessUrlConfigDto;
}

export function createPlatformApiServices(
  options: PlatformApiServiceOptions = {}
): PlatformApiServices {
  const identity = new IdentityService();
  const auth = new MockAuthService(identity);
  const audit = new AuditService();
  const projects = new ProjectService(auth, audit);
  const aiGovernance = new AiGovernanceService(auth, audit, options.aiGateway);
  const guardrails = new GuardrailService(auth, audit);
  const knowledge = new KnowledgeGovernanceService(auth, audit, projects);
  const projectFiles = new ProjectFileService(auth, audit, projects, knowledge);
  const skills = new SkillGovernanceService(auth, audit, projects);
  const prds = new PrdService(auth, audit, projects, aiGovernance, guardrails);
  const databaseView = new DatabaseViewService(projects);
  const frontendVersions = new FrontendVersionService(audit, projects, prds, databaseView);
  const appAccess = new AppUserAccessService(auth, audit, projects, identity);
  const publish = new PublishService(
    auth,
    audit,
    projects,
    prds,
    frontendVersions,
    databaseView,
    appAccess,
    options.publishAccessUrlConfig
  );
  const generatedRuntime = new GeneratedAppRuntimeService(auth, audit, projects, publish);
  const storefront = new StorefrontService(auth, identity, projects, publish, appAccess);
  const tickets = new TicketService(auth, audit, storefront, projects);
  const prdChanges = new PrdChangeService(auth, audit, projects, tickets, prds);
  const domains = new DomainService(auth, audit, projects);
  const traceability = new TraceabilityService(
    auth,
    audit,
    projects,
    tickets,
    prdChanges,
    prds,
    frontendVersions,
    publish,
    domains
  );
  const monitoring = new MonitoringService(
    auth,
    audit,
    tickets,
    domains,
    publish,
    generatedRuntime,
    aiGovernance,
    guardrails
  );
  const authSso = new PlatformAuthSsoService(auth, audit, identity);
  const breakGlass = new BreakGlassService(auth, audit);
  const policyTemplates = new PolicyTemplateService(auth);
  const operations = new OperationsRecoveryService(auth, audit);
  const production = new ProductionControlService(auth, audit, publish, generatedRuntime);
  const securityRelease = new SecurityReleaseService(auth, audit);
  const workspace = new WorkspaceService(
    auth,
    audit,
    projects,
    prds,
    aiGovernance,
    guardrails,
    frontendVersions,
    knowledge,
    projectFiles,
    skills
  );
  const workspaceOrchestrator = createDefaultWorkspaceOrchestrator({
    ...options.workspace,
    onAudit: (event) => audit.record(workspaceAuditRecord(event))
  });

  return {
    identity,
    auth,
    audit,
    projects,
    aiGovernance,
    guardrails,
    knowledge,
    projectFiles,
    skills,
    prds,
    workspace,
    workspaceOrchestrator,
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
    operations,
    production,
    securityRelease,
    envelope: { success, failure }
  };
}
