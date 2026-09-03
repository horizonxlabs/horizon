export type Surface = "admin" | "creator" | "store";

export type PlatformRole = "admin" | "creator" | "end_user";

export type Status =
  "healthy" | "warning" | "degraded" | "down" | "draft" | "published" | "pending";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export interface ProjectSummary {
  id: string;
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
  /** Icon key resolved by the shared AppShell to an inline glyph (see packages/ui nav-icons). */
  icon?: string;
  /** Renders the item non-interactive (e.g. requires a selected project first). */
  disabled?: boolean;
  /** Tooltip shown on a disabled item explaining why it can't be opened yet. */
  disabledReason?: string;
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
  lastError?: string;
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

export type WorkspaceAgentMode = "auto" | "plan" | "build";

export type ChatMessageRole = "user" | "assistant" | "system";

export interface WorkspaceChatAction {
  id: string;
  type: "read" | "list" | "file" | "edit" | "shell" | "migration" | "skill" | "image";
  label: string;
  ok: boolean;
}

/**
 * The bounded, ordered projection of a workspace turn used by history and
 * replay.  Parts intentionally contain display-safe strings only; callers
 * should redact and bound tool output before constructing them.
 */
export type WorkspaceChatTurnPart =
  | { id: string; type: "reasoning"; sequence: number; text: string }
  | { id: string; type: "text"; sequence: number; text: string }
  | { id: string; type: "tool"; sequence: number; tool: WorkspaceChatToolPart }
  | { id: string; type: "commit"; sequence: number; sha: string }
  | { id: string; type: "error"; sequence: number; message: string };

export type WorkspaceChatToolPart =
  | {
      callId: string;
      actionType: WorkspaceChatAction["type"];
      label: string;
      inputSummary: string;
      startedAt: string;
      status: "pending" | "running";
      progress?: string;
    }
  | {
      callId: string;
      actionType: WorkspaceChatAction["type"];
      label: string;
      inputSummary: string;
      startedAt: string;
      endedAt: string;
      status: "done";
      progress?: string;
      result?: string;
    }
  | {
      callId: string;
      actionType: WorkspaceChatAction["type"];
      label: string;
      inputSummary: string;
      startedAt: string;
      endedAt: string;
      status: "failed";
      progress?: string;
      error: string;
    };

export interface WorkspaceChatMessage {
  id: string;
  projectId: string;
  role: ChatMessageRole;
  agentMode?: WorkspaceAgentMode;
  content: string;
  artifactActionIds: string[];
  actions?: WorkspaceChatAction[];
  parts?: WorkspaceChatTurnPart[];
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
  imageDigest: string;
  containerId: string | null;
  containerName: string;
  revision: number;
  publishedByUserId: string;
  healthStatus: DeploymentHealthStatus;
  createdAt: string;
}

// --- Native platform auth: create user, login, change password ---

export interface CreatePlatformUserRequest {
  email: string;
  name: string;
  role?: string;
  tempPassword: string;
}

export interface PlatformUserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
}

export interface NativeLoginRequest {
  email: string;
  password: string;
}

export interface NativeLoginResponse {
  token: string;
  expiresAt: string;
  mustChangePassword: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
