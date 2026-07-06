export type Surface = "admin" | "creator" | "store";

export type PlatformRole = "admin" | "creator" | "end_user";

export type Status = "healthy" | "warning" | "degraded" | "down" | "draft" | "published" | "pending";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  appType: string;
  status: Status;
  owner: string;
  prdVersion: string;
  frontendVersion: string;
  tokenUsedThisMonth: number;
}

export interface AppStoreItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner: string;
  route?: string;
  myRole?: string;
  accessStatus: "active" | "available" | "pending";
  installStatus?: "installed" | "not_installed" | "disabled";
  primaryAction?: "open" | "install" | "request_access" | "view_status";
  health: Status;
}

export interface ServiceStatus {
  name: string;
  status: Status;
  detail: string;
}

export interface NavItem {
  label: string;
  route: string;
}

// --- MVP Plan 1: Workspace Foundation ---

export type WorkspaceState = "provisioning" | "running" | "idle" | "archived" | "failed";

export type EnvironmentName = "dev" | "staging" | "production";

export interface WorkspaceContainerRecord {
  id: string;
  projectId: string;
  slug: string;
  state: WorkspaceState;
  containerId: string | null;
  cpuCores: number;
  memoryMb: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectResourceType = "pg_schema" | "s3_bucket" | "llm_key";

export interface ProjectResourceRecord {
  id: string;
  projectId: string;
  type: ProjectResourceType;
  identifier: string;
  status: "active" | "released";
  createdAt: string;
}

export interface ProjectSecretRecord {
  id: string;
  projectId: string;
  name: string;
  encryptedValue: string;
  rotatedAt: string | null;
  createdAt: string;
}

export interface EnvironmentRecord {
  id: string;
  projectId: string;
  name: EnvironmentName;
  routePath: string;
  status: "active" | "disabled";
}

// --- MVP Plan 4: AI Generation Loop ---

export type ChatMessageRole = "user" | "assistant" | "system";

export interface WorkspaceChatMessage {
  id: string;
  projectId: string;
  role: ChatMessageRole;
  content: string;
  artifactActionIds: string[];
  commitSha: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number } | null;
  createdAt: string;
}

export interface WorkspaceChatSummary {
  projectId: string;
  summary: string;
  updatedAt: string;
}

export interface CodeCheckpoint {
  id: string;
  projectId: string;
  tag: string;
  commitSha: string;
  label: string;
  createdAt: string;
}

export interface MigrationRecord {
  id: string;
  projectId: string;
  name: string;
  sql: string;
  commitSha: string;
  appliedAt: string;
}

// --- MVP Plan 5: Publish-to-Production ---

export type DeploymentHealthStatus = "pending" | "healthy" | "failed";

export interface WorkspaceDeployment {
  id: string;
  projectId: string;
  slug: string;
  environment: EnvironmentName;
  commitSha: string;
  imageTag: string;
  containerId: string | null;
  publishedByUserId: string;
  healthStatus: DeploymentHealthStatus;
  createdAt: string;
}
